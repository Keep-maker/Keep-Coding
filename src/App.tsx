import { useEffect, useState } from 'react';
import { store, useApp } from './state/store';
import { EditorWindow } from './components/editor/EditorWindow';
import { AgentsWindow } from './components/agents/AgentsWindow';
import { CustomizePanel } from './components/agents/CustomizePanel';
import { SettingsDialog, ToastLayer } from './components/common/SettingsDialog';
import { QuickOpen } from './components/common/QuickOpen';
import { IconFileCode, IconLayers, IconSearch, IconSettings, IconSliders } from './components/common/Icons';

function Titlebar({ onQuickOpen }: { onQuickOpen: () => void }) {
  const state = useApp();
  const workspaceName = state.root.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace';

  return (
    <div className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__brand-mark">C</span>
        <span>Keep Coding</span>
      </div>

      <div className="mode-switch">
        <button aria-pressed={state.mode === 'editor'} onClick={() => store.setMode('editor')} title="Editor Window">
          <IconFileCode size={13} />
          Editor
        </button>
        <button aria-pressed={state.mode === 'agents'} onClick={() => store.setMode('agents')} title="Agents Window">
          <span className="mode-switch__dot" />
          <IconLayers size={13} />
          Agents
          {state.sessions.some((s) => s.status === 'running') && <span className="titlebar__pulse" />}
        </button>
      </div>

      <div className="titlebar__center">
        <button className="titlebar__search" onClick={onQuickOpen}>
          <IconSearch size={13} />
          <span>Search files</span>
          <kbd>Ctrl</kbd>
          <kbd>P</kbd>
        </button>
      </div>

      <div className="titlebar__actions">
        <span className="workspace-pill" title={state.root}>
          <IconLayers size={12} />
          <span>{workspaceName}</span>
        </span>
        <button
          className={`icon-btn ${state.customizeOpen ? 'icon-btn--active' : ''}`}
          title="Customize (skills, rules, hooks, tools)"
          onClick={() => store.toggleCustomize()}
        >
          <IconSliders size={15} />
        </button>
        <button className="icon-btn" title="Model settings" onClick={() => store.toggleSettings(true)}>
          <IconSettings size={15} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const state = useApp();
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    void store.bootstrap();
  }, []);

  // Global shortcuts, matching common IDE muscle memory.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setQuickOpen(true);
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        store.toggleSettings(true);
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        store.toggleCustomize();
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        store.setMode('agents');
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        store.setMode('editor');
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (state.activePath) void store.saveFile(state.activePath);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.activePath]);

  if (!state.ready) {
    return (
      <div className="app">
        <div className="placeholder" style={{ height: '100vh' }}>
          Starting Cursor Fork...
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Titlebar onQuickOpen={() => setQuickOpen(true)} />
      {state.mode === 'editor' ? <EditorWindow /> : <AgentsWindow />}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      <CustomizePanel />
      <SettingsDialog />
      <ToastLayer />
    </div>
  );
}

