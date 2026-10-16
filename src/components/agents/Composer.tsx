import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '../../state/store';
import { IconSend, IconSparkle, IconStop } from '../common/Icons';

/** Modes mirror Cursor's Agent / Plan / Ask behaviour at a high level. */
const MODES = [
  { id: 'agent', label: 'Agent', hint: 'Read, edit, and run commands autonomously' },
  { id: 'plan', label: 'Plan', hint: 'Research first and propose a plan before editing' },
  { id: 'ask', label: 'Ask', hint: 'Answer questions without changing files' },
] as const;

type ModeId = (typeof MODES)[number]['id'];

function instructionsFor(mode: ModeId): string | undefined {
  if (mode === 'plan') {
    return 'MODE: PLAN. Do not modify any files. Investigate with read/search/list tools, then produce a detailed, ordered implementation plan with the exact files to change. Wait for the user to approve before making edits.';
  }
  if (mode === 'ask') {
    return 'MODE: ASK. Answer questions about the codebase. Do not modify files or run mutating commands; read-only exploration is allowed.';
  }
  return undefined;
}

export function Composer() {
  const state = useApp();
  const session = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<ModeId>('agent');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const running = session?.status === 'running';

  // The empty-state suggestion chips dispatch this event so they can prefill the input.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        setValue(detail);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('composer:prefill', handler);
    return () => window.removeEventListener('composer:prefill', handler);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const submit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    if (!session) {
      void store.newSession().then((created) => {
        store.sendPrompt(prompt, instructionsFor(mode));
      });
      setValue('');
      return;
    }
    if (running) return;
    store.sendPrompt(prompt, instructionsFor(mode));
    setValue('');
  };

  return (
    <div className="composer">
      <div className="composer__box">
        <textarea
          ref={textareaRef}
          className="composer__textarea"
          placeholder={
            session ? 'Ask the agent to build, fix, or explain something...' : 'Describe a task to start a new agent'
          }
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer__toolbar">
          <div className="composer__modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`composer__mode ${mode === m.id ? 'is-active' : ''}`}
                title={m.hint}
                onClick={() => setMode(m.id)}
              >
                {m.id === 'agent' && <IconSparkle size={12} />}
                {m.label}
              </button>
            ))}
          </div>
          <div className="composer__actions">
            <span className="composer__model">{state.provider?.model ?? 'model'}</span>
            {running ? (
              <button className="composer__send composer__send--stop" title="Stop agent" onClick={() => store.abortActive()}>
                <IconStop size={14} />
              </button>
            ) : (
              <button className="composer__send" title="Send (Enter)" disabled={!value.trim()} onClick={submit}>
                <IconSend size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer__hint">
        <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
      </div>
    </div>
  );
}
