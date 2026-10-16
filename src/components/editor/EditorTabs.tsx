import { store, useApp } from '../../state/store';
import { IconClose, IconWarning } from '../common/Icons';

function iconFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx'].includes(ext)) return 'fileicon--ts';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'fileicon--js';
  if (['json'].includes(ext)) return 'fileicon--json';
  if (['css', 'scss', 'less'].includes(ext)) return 'fileicon--css';
  if (['md', 'markdown'].includes(ext)) return 'fileicon--md';
  if (['py'].includes(ext)) return 'fileicon--py';
  return 'fileicon--default';
}

export function EditorTabs() {
  const state = useApp();

  if (!state.openFiles.length) return null;

  return (
    <div className="tabs">
      <div className="tabs__list">
        {state.openFiles.map((file) => {
          const dirty = file.content !== file.savedContent;
          const active = file.path === state.activePath;
          return (
            <div
              key={file.path}
              className={`tab ${active ? 'is-active' : ''}`}
              onClick={() => store.setActiveFile(file.path)}
              onAuxClick={(e) => {
                if (e.button === 1) store.closeFile(file.path);
              }}
              title={file.path}
            >
              <span className={`fileicon ${iconFor(file.name)}`} />
              <span className="tab__label">{file.name}</span>
              <button
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  store.closeFile(file.path);
                }}
                title="Close"
              >
                {dirty ? <span className="tab__dot" /> : <IconClose size={12} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Breadcrumbs() {
  const state = useApp();
  const file = state.openFiles.find((f) => f.path === state.activePath);
  if (!file) return null;
  const parts = file.path.split('/');
  return (
    <div className="breadcrumbs">
      {parts.map((part, i) => (
        <span key={`${part}-${i}`} className="breadcrumbs__part">
          {i > 0 && <span className="breadcrumbs__sep"> &rsaquo; </span>}
          {part}
        </span>
      ))}
      {file.content !== file.savedContent && (
        <span className="breadcrumbs__dirty" title="Unsaved changes">
          <IconWarning size={11} /> unsaved
        </span>
      )}
    </div>
  );
}
