import { IconDiff, IconFileCode, IconSearch, IconSparkle } from '../common/Icons';

export type EditorView = 'files' | 'search' | 'changes';

interface Props {
  view: EditorView;
  onChange: (view: EditorView) => void;
  changeCount: number;
  onOpenAgents: () => void;
}

export function ActivityBar({ view, onChange, changeCount, onOpenAgents }: Props) {
  return (
    <div className="activitybar">
      <button
        className={`activitybar__btn ${view === 'files' ? 'is-active' : ''}`}
        title="Explorer"
        onClick={() => onChange('files')}
      >
        <IconFileCode size={17} />
      </button>
      <button
        className={`activitybar__btn ${view === 'search' ? 'is-active' : ''}`}
        title="Search"
        onClick={() => onChange('search')}
      >
        <IconSearch size={17} />
      </button>
      <button
        className={`activitybar__btn ${view === 'changes' ? 'is-active' : ''}`}
        title="Agent changes"
        onClick={() => onChange('changes')}
      >
        <IconDiff size={17} />
        {changeCount > 0 && <span className="activitybar__badge">{changeCount}</span>}
      </button>
      <div className="activitybar__spacer" />
      <button className="activitybar__btn" title="Open Agents Window" onClick={onOpenAgents}>
        <IconSparkle size={17} />
      </button>
    </div>
  );
}
