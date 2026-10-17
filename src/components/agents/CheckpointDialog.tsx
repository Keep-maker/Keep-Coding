import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { store } from '../../state/store';
import type { CheckpointDiffEntry, CheckpointSummary } from '../../types';
import {
  IconCheck,
  IconCopy,
  IconFile,
  IconHistory,
  IconLoader,
  IconRewind,
  IconWarning,
} from '../common/Icons';

/** Splits a unified diff into add/del/context rows for the preview. */
function diffRows(before: string | null, after: string | null) {
  const beforeLines = (before ?? '').split('\n');
  const afterLines = (after ?? '').split('\n');
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
  const rows: { type: 'add' | 'del' | 'ctx' | 'meta'; text: string }[] = [
    ...beforeLines.slice(Math.max(0, prefix - 2), prefix).map((text) => ({ type: 'ctx' as const, text })),
    ...beforeLines.slice(prefix, beforeLines.length - suffix).map((text) => ({ type: 'del' as const, text })),
    ...afterLines.slice(prefix, afterLines.length - suffix).map((text) => ({ type: 'add' as const, text })),
    ...afterLines.slice(afterLines.length - suffix, afterLines.length - suffix + 2).map((text) => ({
      type: 'ctx' as const,
      text,
    })),
  ];
  if (!rows.length) rows.push({ type: 'meta', text: 'No textual change' });
  return rows.slice(0, 160);
}

/**
 * Checkpoint preview: shows what the turn touched and what restoring it would
 * do to the workspace right now.
 */
export function CheckpointDialog({
  sessionId,
  checkpoint,
  onClose,
}: {
  sessionId: string;
  checkpoint: CheckpointSummary;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<CheckpointDiffEntry[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .checkpointDiff(sessionId, checkpoint.id)
      .then((result) => {
        if (cancelled) return;
        setDiff(result.diff);
        setActive(result.diff[0]?.path ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, checkpoint.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const entry = diff?.find((d) => d.path === active) ?? diff?.[0] ?? null;

  const restore = async () => {
    setBusy(true);
    await store.restoreCheckpoint(sessionId, checkpoint.id);
    setBusy(false);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog checkpoint">
        <div className="dialog__header">
          <span className="checkpoint__title">
            <IconHistory size={14} />
            <span className="mono">{checkpoint.label}</span>
            <span className="checkpoint__files">
              {checkpoint.files.length} file{checkpoint.files.length === 1 ? '' : 's'}
            </span>
          </span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconRewind size={14} />
          </button>
        </div>

        <div className="checkpoint__body">
          {error && (
            <div className="notice notice--error">
              <IconWarning size={13} />
              <span>{error}</span>
            </div>
          )}
          {!diff && !error && (
            <div className="checkpoint__loading">
              <IconLoader size={14} />
              Loading diff...
            </div>
          )}

          {diff && (
            <>
              <div className="checkpoint__files-col">
                <div className="checkpoint__col-title">Changed files</div>
                {diff.map((d) => (
                  <button
                    key={d.path}
                    className={`checkpoint__file ${d.path === entry?.path ? 'is-active' : ''}`}
                    onClick={() => setActive(d.path)}
                    title={d.path}
                  >
                    <IconFile size={12} />
                    <span className="checkpoint__file-path mono">{d.path}</span>
                    {!d.existsNow && <span className="badge badge--warn">deleted</span>}
                  </button>
                ))}
                {!diff.length && <div className="checkpoint__none">No files were touched.</div>}
              </div>

              <div className="checkpoint__diff-col">
                {entry ? (
                  <>
                    <div className="checkpoint__diff-head">
                      <span className="mono">{entry.path}</span>
                      <button
                        className="btn btn--ghost"
                        onClick={() => {
                          void store.openFile(entry.path);
                          onClose();
                        }}
                      >
                        Open in editor
                      </button>
                    </div>
                    <div className="checkpoint__diff">
                      {diffRows(entry.before, entry.after).map((row, i) => (
                        <div key={i} className={`checkpoint__row checkpoint__row--${row.type}`}>
                          <span className="checkpoint__sign">
                            {row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
                          </span>
                          <span className="checkpoint__text">{row.text || ' '}</span>
                        </div>
                      ))}
                    </div>
                    <div className="checkpoint__legend">
                      Restoring rewrites these files to the state they had before this turn. The conversation stays.
                    </div>
                  </>
                ) : (
                  <div className="checkpoint__none">Pick a file to preview the change.</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="dialog__footer">
          <button
            className="btn btn--ghost"
            onClick={() => void store.copyText(checkpoint.files.join('\n'), 'File list copied')}
          >
            <IconCopy size={12} />
            Copy file list
          </button>
          <span className="checkpoint__spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => void restore()} disabled={busy || !diff?.length}>
            {busy ? <IconLoader size={12} /> : <IconCheck size={12} />}
            {busy ? 'Restoring...' : 'Restore files'}
          </button>
        </div>
      </div>
    </div>
  );
}
