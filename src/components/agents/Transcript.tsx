import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { itemText, sessionOf, store, useApp } from '../../state/store';
import type { CheckpointSummary, TranscriptItem } from '../../types';
import {
  IconArrowDown,
  IconCheck,
  IconCopy,
  IconGitFork,
  IconMore,
  IconPencil,
  IconRefresh,
  IconRewind,
  IconTrash,
  IconWarning,
} from '../common/Icons';
import { Markdown } from '../common/Markdown';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ToolCall } from './ToolCall';
import { QuestionCard, SubagentCard } from './AskCard';
import { CheckpointDialog } from './CheckpointDialog';

type UserItem = Extract<TranscriptItem, { kind: 'user' }>;
type AssistantItem = Extract<TranscriptItem, { kind: 'assistant' }>;

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fullStamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

/** Human label for the checkpoint that this user message opened. */
function checkpointLabel(checkpoint: CheckpointSummary): string {
  if (checkpoint.restoredAt) return 'Restored';
  return checkpoint.files.length === 1 ? '1 file' : `${checkpoint.files.length} files`;
}

interface ActionsProps {
  item: TranscriptItem;
  isUser: boolean;
  streaming: boolean;
  checkpoint: CheckpointSummary | null;
  onEdit: () => void;
  onRestore: () => void;
}

function MoreActions({ item, isUser, streaming }: { item: TranscriptItem; isUser: boolean; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="msgactions__more" ref={ref}>
      <button
        className="msgactions__btn"
        title="More message actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore size={12} />
      </button>
      {open && (
        <div className="msgactions__menu">
          <button
            className="msgactions__menu-item"
            onClick={() => {
              setOpen(false);
              void store.prefillMessage(item.id);
            }}
          >
            <IconPencil size={12} />
            Edit in composer
          </button>
          {!isUser && !streaming && (
            <button
              className="msgactions__menu-item"
              onClick={() => {
                setOpen(false);
                void store.regenerate();
              }}
            >
              <IconRefresh size={12} />
              Regenerate
            </button>
          )}
          <button
            className="msgactions__menu-item"
            onClick={() => {
              setOpen(false);
              void store.truncateAfter(item.id);
            }}
          >
            <IconRewind size={12} />
            Keep up to here
          </button>
          <div className="msgactions__menu-sep" />
          <button
            className="msgactions__menu-item msgactions__menu-item--danger"
            onClick={() => {
              setOpen(false);
              void store.deleteMessage(item.id);
            }}
          >
            <IconTrash size={12} />
            Delete message
          </button>
        </div>
      )}
    </div>
  );
}

function MessageActions({ item, isUser, streaming, checkpoint, onEdit, onRestore }: ActionsProps) {
  const state = useApp();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void store.copyText(itemText(item), 'Message copied');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="msgactions">
      {checkpoint && (
        <button
          className={`msgactions__checkpoint ${checkpoint.restoredAt ? 'is-restored' : ''}`}
          onClick={onRestore}
          title={`Checkpoint: ${checkpoint.files.join(', ') || 'no files touched'}`}
        >
          <IconRewind size={11} />
          {checkpointLabel(checkpoint)}
        </button>
      )}
      <div className="msgactions__bar">
        <button className="msgactions__btn" onClick={copy} title="Copy message">
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
        </button>
        {isUser && (
          <button className="msgactions__btn" onClick={onEdit} title="Edit and re-run from here">
            <IconPencil size={12} />
          </button>
        )}
        {isUser && (
          <button
            className="msgactions__btn"
            onClick={() => void store.truncateTo(item.id)}
            title="Rewind conversation to just before this message"
          >
            <IconRewind size={12} />
          </button>
        )}
        <button className="msgactions__btn" onClick={() => void store.forkFrom(item.id)} title="Fork into a new agent">
          <IconGitFork size={12} />
        </button>
        {!isUser && !streaming && (
          <button className="msgactions__btn" onClick={() => void store.regenerate()} title="Regenerate this answer">
            <IconRefresh size={12} />
          </button>
        )}
        <MoreActions item={item} isUser={isUser} streaming={streaming} />
      </div>
      <span className="msgactions__time" title={fullStamp(item.at)}>
        {clock(item.at)}
        {item.kind === 'user' && item.editedAt ? ' - edited' : ''}
        {state.mode === 'agents' && item.kind === 'assistant' && item.model ? ` - ${item.model}` : ''}
      </span>
    </div>
  );
}

function InlineEditor({ item, onDone }: { item: UserItem; onDone: () => void }) {
  const [text, setText] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const save = async () => {
    const next = text.trim();
    if (!next || busy) return;
    setBusy(true);
    await store.editAndRerun(item.id, next);
    setBusy(false);
    onDone();
  };

  return (
    <div className="msg msg--user msg--editing">
      <div className="inlinedit">
        <textarea
          ref={ref}
          className="inlinedit__textarea"
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onDone();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="inlinedit__bar">
          <span className="inlinedit__hint">
            Re-running replaces this message and everything after it. Files on disk are untouched.
          </span>
          <button className="btn btn--ghost" onClick={onDone} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={busy || !text.trim()}>
            {busy ? 'Sending...' : 'Save & re-run'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserMessage({
  item,
  checkpoint,
  onRestore,
}: {
  item: UserItem;
  checkpoint: CheckpointSummary | null;
  onRestore: () => void;
}) {
  const state = useApp();
  const editing = state.editingItemId === item.id;

  if (editing) return <InlineEditor item={item} onDone={() => store.setEditingItem(null)} />;

  return (
    <div className="msg msg--user" data-testid="user-message">
      <div className="msg__user">
        <div className="msg__bubble">
          <Markdown>{item.text}</Markdown>
        </div>
        <MessageActions
          item={item}
          isUser
          streaming={false}
          checkpoint={checkpoint}
          onEdit={() => store.setEditingItem(item.id)}
          onRestore={onRestore}
        />
      </div>
    </div>
  );
}

function AssistantMessage({
  item,
  checkpoint,
  onRestore,
}: {
  item: AssistantItem;
  checkpoint: CheckpointSummary | null;
  onRestore: () => void;
}) {
  return (
    <div className="msg msg--assistant">
      <div className="msg__content">
        <Markdown streaming={item.streaming}>{item.text}</Markdown>
        {!item.streaming && (
          <MessageActions
            item={item}
            isUser={false}
            streaming={Boolean(item.streaming)}
            checkpoint={checkpoint}
            onEdit={() => {}}
            onRestore={onRestore}
          />
        )}
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

const EXAMPLES: { label: string; prompt: string }[] = [
  { label: 'Explain this codebase', prompt: 'Explain the structure of this project and how the main pieces fit together.' },
  { label: 'Add a feature', prompt: 'Add a small, well-tested feature to this project and verify it works.' },
  { label: 'Fix a bug', prompt: 'Find and fix a bug in this project. Verify the fix before finishing.' },
  { label: 'Write tests', prompt: 'Add tests for the most important logic in this project and run them.' },
  { label: 'Review my changes', prompt: 'Review my uncommitted changes and point out real problems.' },
  { label: 'Refactor safely', prompt: 'Refactor the most tangled part of this codebase without changing behaviour.' },
];

function EmptyState() {
  return (
    <div className="agents__empty">
      <h2>What should we build?</h2>
      <p className="agents__empty-sub">
        The agent reads your files, edits code, and runs commands to finish the task. You review the diff.
      </p>
      <div className="agents__examples">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            className="agents__example"
            onClick={() => window.dispatchEvent(new CustomEvent('composer:prefill', { detail: example.prompt }))}
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Transcript() {
  const state = useApp();
  const session = sessionOf(state);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState<CheckpointSummary | null>(null);

  const items = session?.items ?? [];
  const last = items.length ? items[items.length - 1] : undefined;
  const isRunning = session?.status === 'running';
  const waitingForFirstToken = Boolean(
    isRunning &&
      (!last ||
        last.kind === 'user' ||
        (last.kind === 'assistant' && !last.text.trim()) ||
        (last.kind === 'tool' && last.status !== 'running')),
  );
  const itemCount = items.length;
  const lastTextLength = last?.kind === 'assistant' ? last.text.length : 0;
  const status = session?.status;

  // Only follow the stream when the user is already parked at the bottom, so
  // scrolling up to read something is never yanked back. Re-pins on switch.
  useLayoutEffect(() => {
    setPinned(true);
  }, [session?.id]);

  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [itemCount, lastTextLength, status, waitingForFirstToken, pinned]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinned(distance < 48);
  }, []);

  const jumpToBottom = () => {
    setPinned(true);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const restore = (item: TranscriptItem) => {
    if (!session) return;
    const checkpoint = state.checkpoints[session.id]?.find((c) => c.messageId === item.id);
    if (checkpoint) setRestoreTarget(checkpoint);
  };

  if (!session) {
    return (
      <div className="transcript">
        <div className="transcript__inner transcript__inner--empty">
          <EmptyState />
        </div>
      </div>
    );
  }

  const checkpoints = state.checkpoints[session.id] ?? [];

  return (
    <div className="transcript" ref={scrollRef} onScroll={onScroll}>
      <div className="transcript__inner">
        <div className="transcript__meta">
          <span className="transcript__root" title={session.root}>
            {session.root}
          </span>
          {items.length > 0 && (
            <button
              className="transcript__copyall"
              onClick={() => void store.copyConversation()}
              title="Copy the whole conversation as Markdown"
            >
              <IconCopy size={11} />
              Copy all
            </button>
          )}
          {checkpoints.length > 0 && (
            <button
              className="transcript__copyall"
              onClick={() => {
                const latest = checkpoints[checkpoints.length - 1];
                if (latest) setRestoreTarget(latest);
              }}
              title="Preview and restore the latest checkpoint"
            >
              <IconRewind size={11} />
              Checkpoints ({checkpoints.length})
            </button>
          )}
        </div>

        {items.length === 0 && <EmptyState />}

        {items.map((item) => {
          const checkpoint = checkpoints.find((c) => c.messageId === item.id) ?? null;
          if (item.kind === 'user') {
            return (
              <UserMessage key={item.id} item={item} checkpoint={checkpoint} onRestore={() => restore(item)} />
            );
          }
          if (item.kind === 'assistant') {
            return (
              <AssistantMessage key={item.id} item={item} checkpoint={checkpoint} onRestore={() => restore(item)} />
            );
          }
          if (item.kind === 'tool') return <ToolCall key={item.id} item={item} />;
          if (item.kind === 'question') return <QuestionCard key={item.id} item={item} />;
          if (item.kind === 'subagent') return <SubagentCard key={item.id} item={item} />;
          return <Notice key={item.id} item={item} />;
        })}

        {waitingForFirstToken && <ThinkingIndicator />}
        <div className="transcript__spacer" />
      </div>

      {!pinned && (
        <button className="transcript__jump" onClick={jumpToBottom} title="Jump to the latest message">
          <IconArrowDown size={14} />
        </button>
      )}

      {restoreTarget && session && (
        <CheckpointDialog
          sessionId={session.id}
          checkpoint={restoreTarget}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
