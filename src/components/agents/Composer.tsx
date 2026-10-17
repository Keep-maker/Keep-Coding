import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type CustomizeCatalog } from '../../api/client';
import { store, useApp } from '../../state/store';
import {
  IconAt,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconCommand,
  IconPaperclip,
  IconSend,
  IconSparkle,
  IconSparkleSmall,
  IconStop,
  IconWrench,
} from '../common/Icons';

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

interface SkillEntry {
  name: string;
  description?: string;
}

/**
 * Composer, Cursor style: a borderless input that grows, a mode switcher, a
 * context/skill row, and a `/` palette that inserts a skill into the next run.
 */
export function Composer() {
  const state = useApp();
  const session = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<ModeId>('agent');
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [picked, setPicked] = useState<SkillEntry[]>([]);
  const [menu, setMenu] = useState<{ open: boolean; query: string; index: number }>({ open: false, query: '', index: 0 });
  const [modesOpen, setModesOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const running = session?.status === 'running';

  // Skills come from .cursor/skills folders in the workspace.
  useEffect(() => {
    let cancelled = false;
    if (!state.root) return;
    api
      .customize(state.root)
      .then((catalog: CustomizeCatalog) => {
        if (!cancelled) {
          setSkills(catalog.skills ?? []);
          setCatalogError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setCatalogError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [state.root]);

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

  // Closing the picker when the user clicks outside keeps it feeling like a
  // lightweight IDE completion popup instead of a modal.
  useEffect(() => {
    if (!skillsOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest('.skillpicker') || target.closest('[title="Agent skills"]')) return;
      setSkillsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [skillsOpen]);

  const filtered = useMemo(() => {
    const q = menu.query.toLowerCase();
    return skills.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [skills, menu.query]);

  useEffect(() => {
    if (!menu.open) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu((m) => ({ ...m, open: false }));
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu.open]);

  const changeValue = (next: string) => {
    setValue(next);
    // A `/` typed at the start of a word opens the skill palette.
    const caret = textareaRef.current?.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const match = /(?:^|\s)\/([\w.-]*)$/.exec(before);
    if (match && skills.length) {
      setMenu({ open: true, query: match[1], index: 0 });
    } else if (menu.open) {
      setMenu((m) => ({ ...m, open: false }));
    }
  };

  const applySkill = (skill: SkillEntry) => {
    setPicked((prev) => (prev.some((s) => s.name === skill.name) ? prev : [...prev, skill]));
    // Drop the `/query` fragment that opened the palette.
    setValue((prev) => prev.replace(/(?:^|\s)\/[\w.-]*$/, ' ').replace(/\s{2,}/g, ' ').replace(/^\s/, ''));
    setMenu({ open: false, query: '', index: 0 });
    textareaRef.current?.focus();
  };

  const submit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    const options = {
      instructions: instructionsFor(mode),
      mode,
      skills: picked.length ? picked.map((s) => s.name) : undefined,
    };
    const reset = () => {
      setValue('');
      setPicked([]);
    };
    if (!session) {
      void store.newSession().then(() => {
        store.sendPrompt(prompt, options);
      });
      reset();
      return;
    }
    if (running) return;
    store.sendPrompt(prompt, options);
    reset();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu.open && filtered.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMenu((m) => ({ ...m, index: (m.index + 1) % filtered.length }));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMenu((m) => ({ ...m, index: (m.index - 1 + filtered.length) % filtered.length }));
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        applySkill(filtered[menu.index] ?? filtered[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu((m) => ({ ...m, open: false }));
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className="composer">
      {menu.open && (
        <div className="slashmenu" ref={menuRef}>
          <div className="slashmenu__head">
            <IconSparkleSmall size={12} />
            Skills
            <span className="slashmenu__hint">{filtered.length} available</span>
          </div>
          <div className="slashmenu__list">
            {filtered.map((skill, i) => (
              <button
                key={skill.name}
                className={`slashmenu__item ${i === menu.index ? 'is-active' : ''}`}
                onMouseEnter={() => setMenu((m) => ({ ...m, index: i }))}
                onClick={() => applySkill(skill)}
              >
                <span className="slashmenu__name">/{skill.name}</span>
                {skill.description && <span className="slashmenu__desc">{skill.description}</span>}
              </button>
            ))}
            {!filtered.length && <div className="slashmenu__empty">No skill matches "{menu.query}".</div>}
          </div>
        </div>
      )}

      {skillsOpen && (
        <div className="skillpicker">
          <div className="skillpicker__head">
            <span className="skillpicker__title">Agent skills</span>
            <button className="skillpicker__close" title="Close" onClick={() => setSkillsOpen(false)}>
              <IconClose size={12} />
            </button>
          </div>
          <div className="skillpicker__meta">
            <span><span className="mono">.cursor/skills</span> / workspace</span>
            <span>{skills.length} available</span>
          </div>
          <div className="skillpicker__list">
            {skills.map((skill) => {
              const selected = picked.some((entry) => entry.name === skill.name);
              return (
                <button
                  key={skill.name}
                  className={`skillpicker__item ${selected ? 'is-selected' : ''}`}
                  title={skill.description || skill.name}
                  onClick={() =>
                    setPicked((prev) =>
                      prev.some((entry) => entry.name === skill.name)
                        ? prev.filter((entry) => entry.name !== skill.name)
                        : [...prev, skill],
                    )
                  }
                >
                  <span className="skillpicker__mark">
                    {selected ? <IconCheck size={12} /> : <IconSparkleSmall size={12} />}
                  </span>
                  <span className="skillpicker__body">
                    <span className="skillpicker__name">/{skill.name}</span>
                    </span>
                </button>
              );
            })}
            {!skills.length && (
              <div className="skillpicker__empty">
                {catalogError ?? 'No skills found. Add .cursor/skills/<name>/SKILL.md to this workspace.'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`composer__box ${running ? 'is-running' : ''}`}>
        {(picked.length > 0 || session) && (
          <div className="composer__chips">
            {picked.map((skill) => (
              <span key={skill.name} className="chip chip--skill">
                <IconSparkleSmall size={11} />
                {skill.name}
                <button
                  className="chip__remove"
                  title="Remove skill"
                  onClick={() => setPicked((prev) => prev.filter((s) => s.name !== skill.name))}
                >
                  <IconClose size={10} />
                </button>
              </span>
            ))}
            {session && (
              <span className="chip chip--context" title={session.root}>
                <IconAt size={11} />
                {session.root.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace'}
              </span>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="composer__textarea"
          placeholder={
            session ? 'Ask the agent to build, fix, or explain something...' : 'Describe a task to start a new agent'
          }
          value={value}
          rows={1}
          onChange={(e) => changeValue(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="composer__toolbar">
          <div className="composer__left">
            <div className="modepicker">
              <button className="composer__mode" onClick={() => setModesOpen((v) => !v)} title={activeMode.hint}>
                {mode === 'agent' ? <IconSparkle size={12} /> : mode === 'plan' ? <IconCommand size={12} /> : <IconAt size={12} />}
                {activeMode.label}
                <IconChevronDown size={11} />
              </button>
              {modesOpen && (
                <div className="modepicker__menu" onMouseLeave={() => setModesOpen(false)}>
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      className={`modepicker__item ${m.id === mode ? 'is-active' : ''}`}
                      onClick={() => {
                        setMode(m.id);
                        setModesOpen(false);
                      }}
                    >
                      <span className="modepicker__label">{m.label}</span>
                      <span className="modepicker__hint">{m.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="composer__tool"
              title="Agent skills"
              onClick={() => setSkillsOpen((value) => !value)}
            >
              <IconWrench size={13} />
            </button>
            <button className="composer__tool" title="Reference files with @" disabled>
              <IconAt size={13} />
            </button>
            <button className="composer__tool" title="Attach context" disabled>
              <IconPaperclip size={13} />
            </button>
          </div>
          <div className="composer__actions">
            <span className="composer__model" title="Configured model">
              {state.provider?.model ?? 'model'}
            </span>
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
        <span>
          <kbd>Enter</kbd> send
        </span>
        <span>
          <kbd>Shift</kbd>+<kbd>Enter</kbd> new line
        </span>
        <span>
          <kbd>/</kbd> skills
        </span>
      </div>
    </div>
  );
}
