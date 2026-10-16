import { useEffect, useRef } from 'react';
import { useApp } from '../../state/store';
import type { TranscriptItem } from '../../types';
import { IconSparkle, IconWarning } from '../common/Icons';
import { ToolCall } from './ToolCall';

function UserMessage({ item }: { item: Extract<TranscriptItem, { kind: 'user' }> }) {
  return (
    <div className="msg msg--user">
      <div className="msg__bubble">{item.text}</div>
    </div>
  );
}

function AssistantMessage({ item }: { item: Extract<TranscriptItem, { kind: 'assistant' }> }) {
  return (
    <div className="msg msg--assistant">
      <div className="msg__avatar">
        <IconSparkle size={13} />
      </div>
      <div className="msg__content">
        {item.text}
        {item.streaming && <span className="msg__caret" />}
      </div>
    </div>
  );
}

function Notice({ item }: { item: Extract<TranscriptItem, { kind: 'notice' }> }) {
  return (
    <div className={`notice notice--${item.level}`}>
      <IconWarning size={13} />
      <span>{item.text}</span>
    </div>
  );
}

const EXAMPLES = [
  'Explain the structure of this project',
  'Add a README with setup instructions',
  'Find and fix the failing build',
  'Create a REST endpoint with tests',
];

function EmptyState() {
  return (
    <div className="agents__empty">
      <div className="agents__empty-badge">
        <IconSparkle size={22} />
      </div>
      <h2>Start building with an agent</h2>
      <p className="agents__empty-sub">
        Describe a task in natural language. The agent reads your files, edits code, and runs commands to
        complete it - then you review the diff.
      </p>
      <div className="agents__examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            className="agents__example"
            onClick={() => window.dispatchEvent(new CustomEvent('composer:prefill', { detail: example }))}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Transcript() {
  const state = useApp();
  const session = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
  const bottomRef = useRef<HTMLDivElement>(null);
  const itemCount = session?.items.length ?? 0;
  const lastTextLength = session?.items.at(-1)?.kind === 'assistant' ? (session.items.at(-1) as any).text.length : 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [itemCount, session?.status, lastTextLength]);

  if (!session) {
    return (
      <div className="transcript">
        <div className="transcript__inner">
          <EmptyState />
        </div>
      </div>
    );
  }

  const statusBadge =
    session.status === 'running' ? 'badge--info' : session.status === 'error' ? 'badge--err' : 'badge--ok';

  return (
    <div className="transcript">
      <div className="transcript__inner">
        <div className="transcript__title">
          <h1>{session.title}</h1>
          <div className="transcript__meta">
            <span className={`badge ${statusBadge}`}>{session.status}</span>
            <span className="transcript__root" title={session.root}>
              {session.root}
            </span>
          </div>
        </div>

        {session.items.length === 0 && <EmptyState />}

        {session.items.map((item) => {
          if (item.kind === 'user') return <UserMessage key={item.id} item={item} />;
          if (item.kind === 'assistant') return <AssistantMessage key={item.id} item={item} />;
          if (item.kind === 'tool') return <ToolCall key={item.id} item={item} />;
          return <Notice key={item.id} item={item} />;
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}


