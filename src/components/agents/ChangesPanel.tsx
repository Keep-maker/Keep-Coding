import { useState } from 'react';
import { store, useApp } from '../../state/store';
import { IconCheck, IconDiff, IconFile } from '../common/Icons';

/** Unified diff rendered from the before/after snapshots captured by the tools. */
function UnifiedDiff({ before, after }: { before: string; after: string }) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const ctxStart = Math.max(0, prefix - 3);
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  const contextBefore = beforeLines.slice(ctxStart, prefix);
  const contextAfter = afterLines.slice(beforeLines.length - suffix, beforeLines.length - suffix + 3);

  return (
    <div className="unified">
      {contextBefore.map((text, i) => (
        <div key={`cb-${i}`} className="unified__row">
          <span className="unified__gutter">{ctxStart + i + 1}</span>
          <span className="unified__text"> {text}</span>
        </div>
      ))}
      {removed.map((text, i) => (
        <div key={`r-${i}`} className="unified__row unified__row--del">
          <span className="unified__gutter">{prefix + i + 1}</span>
          <span className="unified__text">-{text}</span>
        </div>
      ))}
      {added.map((text, i) => (
        <div key={`a-${i}`} className="unified__row unified__row--add">
          <span className="unified__gutter">{prefix + i + 1}</span>
          <span className="unified__text">+{text}</span>
        </div>
      ))}
      {contextAfter.map((text, i) => (
        <div key={`ca-${i}`} className="unified__row">
          <span className="unified__gutter">{beforeLines.length - suffix + i + 1}</span>
          <span className="unified__text"> {text}</span>
        </div>
      ))}
    </div>
  );
}

export function ChangesPanel() {
  const state = useApp();
  const [active, setActive] = useState<string | null>(state.changedFiles[0]?.path ?? null);
  const change = state.changedFiles.find((c) => c.path === active) ?? state.changedFiles[0] ?? null;

  if (!state.changedFiles.length) {
    return (
      <div className="changes">
        <div className="panel__header">
          <span>Agent Changes</span>
        </div>
        <div className="changes__empty">
          <IconDiff size={20} />
          <p>No changes yet</p>
          <span>Files an agent edits will show up here for review.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="changes">
      <div className="panel__header">
        <span>Agent Changes</span>
        <span className="badge badge--info">{state.changedFiles.length}</span>
      </div>
      <div className="changes__files">
        {state.changedFiles.map((file) => (
          <div
            key={file.path}
            className={`changes__file ${file.path === change?.path ? 'is-active' : ''}`}
            onClick={() => setActive(file.path)}
            title={file.path}
          >
            <span className={`fileicon ${file.created ? 'fileicon--new' : ''}`}>
              {file.created ? <IconCheck size={12} /> : <IconFile size={12} />}
            </span>
            <span className="changes__file-path">{file.path}</span>
            {file.created && <span className="badge badge--ok">new</span>}
          </div>
        ))}
      </div>
      {change && (
        <div className="changes__diff">
          <div className="changes__diff-header">
            <span className="mono">{change.path}</span>
            <button className="btn btn--ghost" onClick={() => void store.openFile(change.path)}>
              Open in editor
            </button>
          </div>
          <UnifiedDiff before={change.before} after={change.after} />
        </div>
      )}
    </div>
  );
}


