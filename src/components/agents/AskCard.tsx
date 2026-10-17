import { useState } from 'react';
import { store } from '../../state/store';
import type { TranscriptItem } from '../../types';
import {
  IconCheck,
  IconCheckCircle,
  IconCircle,
  IconLoader,
  IconRobot,
  IconSparkle,
} from '../common/Icons';
import { Markdown } from '../common/Markdown';

type QuestionItem = Extract<TranscriptItem, { kind: 'question' }>;
type SubagentItem = Extract<TranscriptItem, { kind: 'subagent' }>;

/**
 * The agent paused to ask something. Answering resolves the tool call that is
 * still parked on the server, so the run resumes from exactly where it stopped.
 */
export function QuestionCard({ item }: { item: QuestionItem }) {
  const [selected, setSelected] = useState<string[]>(item.answer?.selected ?? []);
  const [note, setNote] = useState(item.answer?.note ?? '');
  const [busy, setBusy] = useState(false);
  const allowMultiple = Boolean(item.question.allowMultiple);
  const answered = Boolean(item.answer);

  const toggle = (id: string) => {
    if (answered) return;
    setSelected((prev) => {
      if (allowMultiple) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return prev.includes(id) ? [] : [id];
    });
  };

  const submit = async () => {
    if (busy || (!selected.length && !note.trim())) return;
    setBusy(true);
    await store.answerQuestion(item.callId, selected, note.trim() || undefined);
    setBusy(false);
  };

  return (
    <div className="askcard">
      <div className="askcard__head">
        <span className="askcard__avatar">
          <IconSparkle size={12} />
        </span>
        <span className="askcard__label">{answered ? 'Answered' : 'The agent needs your input'}</span>
      </div>
      <p className="askcard__question">{item.question.question}</p>

      <div className="askcard__options">
        {item.question.options.map((option) => {
          const isSelected = selected.includes(option.id);
          const wasChosen = answered && item.answer?.selected.includes(option.id);
          return (
            <button
              key={option.id}
              className={`askoption ${isSelected ? 'is-selected' : ''} ${wasChosen ? 'is-chosen' : ''}`}
              onClick={() => toggle(option.id)}
              disabled={answered}
            >
              <span className="askoption__mark">
                {isSelected || wasChosen ? <IconCheckCircle size={13} /> : <IconCircle size={13} />}
              </span>
              <span className="askoption__body">
                <span className="askoption__label">{option.label}</span>
                {option.description && <span className="askoption__desc">{option.description}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {answered ? (
        item.answer?.note ? (
          <div className="askcard__note">Note: {item.answer.note}</div>
        ) : null
      ) : (
        <div className="askcard__foot">
          <input
            className="askcard__note-input"
            placeholder="Optional note for the agent..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <button className="btn btn--primary" onClick={() => void submit()} disabled={busy || (!selected.length && !note.trim())}>
            {busy ? <IconLoader size={12} /> : <IconCheck size={12} />}
            {busy ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}

/** A delegated sub-agent: its own context window, only a report comes back. */
export function SubagentCard({ item }: { item: SubagentItem }) {
  const [open, setOpen] = useState(false);
  const running = item.status === 'running';
  const steps = item.steps ?? 0;

  return (
    <div className={`subagent ${running ? 'is-running' : ''}`}>
      <div className="subagent__head" onClick={() => setOpen((v) => !v)}>
        <span className="subagent__glyph">
          {running ? <IconLoader size={13} /> : <IconRobot size={13} />}
        </span>
        <span className="subagent__title">
          Sub-agent
          <span className="subagent__desc">{item.description}</span>
        </span>
        <span className="subagent__meta">
          {running ? 'running' : steps ? `${steps} step${steps === 1 ? '' : 's'}` : 'done'}
        </span>
        <span className="subagent__chevron">{open ? 'Hide' : 'Show'}</span>
      </div>
      {open && item.report && (
        <div className="subagent__body">
          <Markdown>{item.report}</Markdown>
        </div>
      )}
    </div>
  );
}
