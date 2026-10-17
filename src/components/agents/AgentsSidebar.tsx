import { store, useApp } from '../../state/store';
import { IconBranch, IconChevronRight, IconClock, IconPlus, IconSparkle, IconTrash } from '../common/Icons';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusClass(status: string): string {
  switch (status) {
    case 'running':
      return 'sessionitem--running';
    case 'error':
      return 'sessionitem--error';
    case 'done':
      return 'sessionitem--done';
    default:
      return '';
  }
}

export function AgentsSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const state = useApp();

  return (
    <div className={`agentsbar ${collapsed ? 'agentsbar--collapsed' : ''}`}>
      <div className="agentsbar__header">
        {!collapsed && <span>Agents</span>}
        <div className="agentsbar__header-actions">
          {!collapsed && (
            <button className="icon-btn" title="New agent" onClick={() => void store.newSession()}>
              <IconPlus size={14} />
            </button>
          )}
          <button
            className="icon-btn agentsbar__toggle"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggle}
          >
            <IconChevronRight size={14} style={collapsed ? undefined : { transform: 'rotate(180deg)' }} />
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="agentsbar__rail">
          <button className="icon-btn" title="New agent" onClick={() => void store.newSession()}>
            <IconPlus size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="agentsbar__list">
            {state.sessions.map((session) => (
              <div
                key={session.id}
                className={`sessionitem ${session.id === state.activeSessionId ? 'is-active' : ''} ${statusClass(session.status)}`}
                onClick={() => store.setActiveSession(session.id)}
              >
                <div className="sessionitem__top">
                  <span className="sessionitem__status" />
                  <span className="sessionitem__title" title={session.title}>
                    {session.title}
                  </span>
                  <button
                    className="sessionitem__delete"
                    title="Delete agent"
                    onClick={(e) => {
                      e.stopPropagation();
                      void store.deleteSession(session.id);
                    }}
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
                <div className="sessionitem__meta">
                  <span className="sessionitem__branch" title={session.root}>
                    <IconBranch size={11} />
                    {session.root.split(/[\\/]/).filter(Boolean).pop() ?? session.root}
                  </span>
                  <span className="sessionitem__time">
                    <IconClock size={11} />
                    {relativeTime(session.updatedAt)}
                  </span>
                </div>
                {session.status === 'running' && (
                  <div className="sessionitem__progress">
                    <span />
                  </div>
                )}
              </div>
            ))}

            {state.sessions.length === 0 && (
              <div className="agentsbar__empty">
                <IconSparkle size={20} />
                <p>No agents yet</p>
                <button className="btn btn--primary" onClick={() => void store.newSession()}>
                  <IconPlus size={13} />
                  Start an agent
                </button>
              </div>
            )}
          </div>

          <div className="agentsbar__footer">
            <span className="agentsbar__root" title={state.root}>
              {state.root}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
