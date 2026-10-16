import { useState } from 'react';
import { store, useApp } from '../../state/store';
import { ActivityBar, type EditorView } from './ActivityBar';
import { EditorPane } from './EditorPane';
import { EditorTabs, Breadcrumbs } from './EditorTabs';
import { FileTree } from './FileTree';
import { SearchPanel } from './SearchPanel';
import { ChangesPanel } from '../agents/ChangesPanel';
import { TerminalPanel } from './TerminalPanel';

export function EditorWindow() {
  const state = useApp();
  const [view, setView] = useState<EditorView>('files');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const activeFile = state.openFiles.find((f) => f.path === state.activePath) ?? null;

  return (
    <div className="app__body">
      <ActivityBar
        view={view}
        onChange={setView}
        changeCount={state.changedFiles.length}
        onOpenAgents={() => store.setMode('agents')}
      />
      <div className="sidebar">
        {view === 'files' && <FileTree />}
        {view === 'search' && <SearchPanel />}
        {view === 'changes' && <ChangesPanel />}
      </div>
      <div className="workspace">
        <div className="workspace__main">
          <EditorTabs />
          <Breadcrumbs />
          <div className="workspace__editor">
            <EditorPane file={activeFile} />
          </div>
        </div>
        {terminalOpen && (
          <div className="workspace__terminal">
            <TerminalPanel onClose={() => setTerminalOpen(false)} />
          </div>
        )}
        <div className="statusbar">
          <div className="statusbar__left">
            <button
              className={`statusbar__btn ${terminalOpen ? 'is-active' : ''}`}
              onClick={() => setTerminalOpen((v) => !v)}
              title="Toggle terminal"
            >
              Terminal
            </button>
            <span className="statusbar__item">{state.changedFiles.length} agent change(s)</span>
          </div>
          <div className="statusbar__right">
            {activeFile && (
              <>
                <span className="statusbar__item">{activeFile.language}</span>
                <span className="statusbar__item">Ln {activeFile.content.split('\n').length}</span>
                <span className="statusbar__item">UTF-8</span>
              </>
            )}
            <span className="statusbar__item">{state.root}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
