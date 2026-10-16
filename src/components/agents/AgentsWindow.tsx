import { useState } from 'react';
import { store, useApp } from '../../state/store';
import { AgentsSidebar } from './AgentsSidebar';
import { Composer } from './Composer';
import { Transcript } from './Transcript';
import { ChangesPanel } from './ChangesPanel';
import { IconDiff, IconFileCode, IconLayers } from '../common/Icons';

export function AgentsWindow() {
  const state = useApp();
  const [sidePanel, setSidePanel] = useState<'none' | 'changes'>('none');
  const session = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;

  return (
    <div className="app__body app__body--agents">
      <AgentsSidebar />
      <div className="agents__main">
        <div className="agents__topbar">
          <div className="agents__topbar-left">
            <button className="btn btn--ghost" onClick={() => store.setMode('editor')} title="Open Editor Window">
              <IconFileCode size={14} />
              Open Editor
            </button>
            {session && (
              <span className="agents__crumb">
                <IconLayers size={12} />
                {session.title}
              </span>
            )}
          </div>
          <div className="agents__topbar-right">
            <button
              className={`btn btn--ghost ${sidePanel === 'changes' ? 'is-active' : ''}`}
              onClick={() => setSidePanel((v) => (v === 'changes' ? 'none' : 'changes'))}
              title="Review agent changes"
            >
              <IconDiff size={14} />
              Changes
              {state.changedFiles.length > 0 && <span className="agents__count">{state.changedFiles.length}</span>}
            </button>
          </div>
        </div>

        <div className="agents__body">
          <div className="agents__chat">
            <Transcript />
            <Composer />
          </div>
          {sidePanel === 'changes' && (
            <div className="agents__sidepanel">
              <ChangesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
