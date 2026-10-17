import { useEffect, useMemo, useState } from 'react';
import { api, type CustomizeCatalog } from '../../api/client';
import { store, useApp } from '../../state/store';
import {
  IconBook,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconGlobe,
  IconGrid,
  IconLoader,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSparkleSmall,
  IconTerminal,
  IconWrench,
} from '../common/Icons';

type TabId = 'skills' | 'rules' | 'hooks' | 'tools';

const TABS: { id: TabId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'rules', label: 'Rules' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'tools', label: 'Tools' },
];

const TOOL_GROUP_LABEL: Record<string, string> = {
  explore: 'Exploration',
  edit: 'Editing',
  execute: 'Execution',
};

const HOOK_LABEL: Record<string, string> = {
  session_start: 'Session start',
  before_tool: 'Before tool',
  after_tool: 'After tool',
  after_edit: 'After edit',
  before_submit: 'Before submit',
};

/**
 * Customize drawer - mirrors Cursor's "Customize" surface where skills, rules,
 * hooks and the tool catalogue are all visible from one place.
 */
export function CustomizePanel() {
  const state = useApp();
  const open = state.customizeOpen;
  const [catalog, setCatalog] = useState<CustomizeCatalog | null>(null);
  const [tab, setTab] = useState<TabId>('skills');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') store.toggleCustomize(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const [reloadKey, setReloadKey] = useState(0);

  const rescan = async () => {
    setCatalog(null);
    setReloadKey((key) => key + 1);
  };

  useEffect(() => {
    if (!open || !state.root) return;
    let cancelled = false;
    setError(null);
    api
      .customize(state.root)
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, state.root, reloadKey]);

  const q = query.trim().toLowerCase();
  const match = (text: string | undefined) => !q || (text ?? '').toLowerCase().includes(q);

  const skills = useMemo(
    () => (catalog?.skills ?? []).filter((s) => match(s.name) || match(s.description)),
    [catalog, q],
  );
  const rules = useMemo(
    () => (catalog?.rules ?? []).filter((r) => match(r.name) || match(r.description) || r.globs.join(' ').toLowerCase().includes(q)),
    [catalog, q],
  );
  const hooks = useMemo(
    () => (catalog?.hooks ?? []).filter((h) => match(h.stage) || match(h.command) || match(h.matcher)),
    [catalog, q],
  );
  const tools = useMemo(
    () => (catalog?.tools ?? []).filter((t) => match(t.name) || match(t.description) || match(t.group)),
    [catalog, q],
  );

  if (!open) return null;

  const counts: Record<TabId, number> = {
    skills: catalog?.skills.length ?? 0,
    rules: catalog?.rules.length ?? 0,
    hooks: catalog?.hooks.length ?? 0,
    tools: catalog?.tools.length ?? 0,
  };

  const sourceClass = (source?: string) => (source === 'user' ? 'customize__source--global' : 'customize__source--workspace');

  const body = () => {
    if (error) {
      return <div className="customize__empty">Could not load customization: {error}</div>;
    }
    if (!catalog) {
      return (
        <div className="customize__loading">
          <IconLoader size={14} />
          Reading .cursor/ ...
        </div>
      );
    }

    if (tab === 'skills') {
      if (!skills.length) return <div className="customize__empty">No skills match. Add one under .cursor/skills/&lt;name&gt;/SKILL.md.</div>;
      return (
        <div className="customize__list">
          {skills.map((skill) => {
            const expanded = expandedSkill === skill.name;
            return (
              <div className={`customize__item customize__item--expandable ${expanded ? 'is-expanded' : ''}`} key={skill.name}>
                <button
                  className="customize__item-toggle"
                  aria-expanded={expanded}
                  onClick={() => setExpandedSkill(expanded ? null : skill.name)}
                >
                  <span className="customize__item-icon customize__item-icon--skill">
                    <IconSparkleSmall size={13} />
                  </span>
                  <span className="customize__item-body">
                    <span className="customize__item-title">
                      <span className="customize__name">/{skill.name}</span>
                      <span className={`customize__source ${sourceClass(skill.source)}`}>
                        {skill.source === 'user' ? 'user' : 'workspace'}
                      </span>
                      <span className="customize__chevron">
                        {expanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
                      </span>
                    </span>
                    <span className="customize__desc">{skill.description || 'No description provided.'}</span>
                    <span className="customize__path mono">{skill.file}</span>
                  </span>
                </button>
                {expanded && (
                  <div className="customize__skill-detail">
                    <div className="customize__skill-actions">
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          void store.openFile(skill.file);
                          store.toggleCustomize(false);
                        }}
                      >
                        <IconBook size={12} />
                        Open SKILL.md
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('composer:prefill', { detail: `Use the /${skill.name} skill to ` }),
                          );
                          store.toggleCustomize(false);
                        }}
                      >
                        <IconSparkleSmall size={12} />
                        Use in new prompt
                      </button>
                    </div>
                    <div className="customize__skill-instruction">
                      Activated skills inject their SKILL.md instructions into the agent context. Use <code className="mono">/name</code> in
                      the composer to attach this skill to a run.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (tab === 'rules') {
      if (!rules.length) return <div className="customize__empty">No rules found. Add .mdc files under .cursor/rules.</div>;
      return (
        <div className="customize__list">
          {rules.map((rule) => (
            <div className="customize__item" key={rule.file}>
              <span className="customize__item-icon customize__item-icon--rule">
                <IconShield size={13} />
              </span>
              <div className="customize__item-body">
                <div className="customize__item-title">
                  <span className="customize__name">{rule.name}</span>
                  <span className="customize__source customize__source--workspace">{rule.activation || 'Always'}</span>
                  <span className={`customize__source ${sourceClass(rule.source)}`}>{rule.source === 'user' ? 'user' : 'workspace'}</span>
                </div>
                <div className="customize__desc">{rule.description || 'No description provided.'}</div>
                {rule.globs.length > 0 && (
                  <div className="customize__globs">
                    {rule.globs.map((glob) => (
                      <span className="chip chip--glob" key={glob}>
                        {glob}
                      </span>
                    ))}
                  </div>
                )}
                <div className="customize__path mono">{rule.file}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (tab === 'hooks') {
      if (!hooks.length) return <div className="customize__empty">No hooks configured. Add .cursor/hooks.json to run scripts around tool calls.</div>;
      return (
        <div className="customize__list">
          {hooks.map((hook, i) => (
            <div className="customize__item" key={`${hook.stage}-${i}`}>
              <span className="customize__item-icon customize__item-icon--hook">
                <IconTerminal size={13} />
              </span>
              <div className="customize__item-body">
                <div className="customize__item-title">
                  <span className="customize__name">{HOOK_LABEL[hook.stage] ?? hook.stage}</span>
                  <span className="customize__source customize__source--workspace">{hook.matcher ?? '*'}</span>
                </div>
                <div className="customize__command mono">{hook.command}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const grouped = ['explore', 'edit', 'execute'].map((group) => ({
      group,
      items: tools.filter((tool) => tool.group === group),
    }));
    const others = tools.filter((tool) => !['explore', 'edit', 'execute'].includes(tool.group));
    if (others.length) grouped.push({ group: 'other', items: others });

    if (!tools.length) return <div className="customize__empty">No tools match.</div>;
    return (
      <div className="customize__list">
        {grouped.map(({ group, items }) =>
          items.length ? (
            <div key={group}>
              <div className={`customize__group customize__group--${group}`}>{TOOL_GROUP_LABEL[group] ?? 'Other'}</div>
              {items.map((tool) => (
                <div className="customize__item" key={tool.name}>
                  <span className="customize__item-icon customize__item-icon--tool">
                    <IconGrid size={13} />
                  </span>
                  <div className="customize__item-body">
                    <div className="customize__item-title">
                      <span className="customize__name mono">{tool.name}</span>
                      <span className={`customize__source ${sourceClass('project')}`}>{group}</span>
                    </div>
                    <div className="customize__desc">{tool.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        )}
      </div>
    );
  };

  return (
    <div className="overlay overlay--right" onMouseDown={(event) => event.target === event.currentTarget && store.toggleCustomize(false)}>
      <aside className="customize" role="dialog" aria-label="Customize">
        <header className="customize__header">
          <span className="customize__title">
            <IconBook size={14} />
            Customize
          </span>
          <button className="icon-btn" title="Close" onClick={() => store.toggleCustomize(false)}>
            <IconClose size={14} />
          </button>
        </header>

        <div className="customize__root" title={state.root}>
          <IconGlobe size={11} />
          <span className="mono">{state.root}</span>
        </div>

        <div className="customize__tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`customize__tab ${tab === entry.id ? 'is-active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              <span className="customize__count">{counts[entry.id]}</span>
            </button>
          ))}
        </div>

        <div className="customize__toolbar">
          <label className="customize__search">
            <IconSearch size={12} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${tab}`}
              spellCheck={false}
            />
          </label>
          <IconWrench size={13} />
        </div>

        <div className="customize__body">{body()}</div>

        <footer className="customize__footer">
          <span className="customize__footer-note">
            Skills, rules and hooks come from <span className="mono">.cursor/</span> in this workspace plus your home
            directory. Changes apply on the next agent run.
          </span>
          <button className="btn btn--ghost" onClick={() => void rescan()}>
            <IconRefresh size={12} />
            Rescan
          </button>
        </footer>
      </aside>
    </div>
  );
}
