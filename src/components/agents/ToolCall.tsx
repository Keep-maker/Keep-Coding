import { useState } from 'react';
import { store } from '../../state/store';
import type { ToolCallItem } from '../../types';
import {
  IconCheck, IconChevronDown, IconChevronRight, IconFile, IconSearch, IconTerminal, IconWarning,
} from '../common/Icons';

function lineDiff(before: string, after: string) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  // Tiny LCS-free diff: trim common prefix/suffix, then show the changed block.
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
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  return { prefix, removed, added };
}

function DiffPreview({ before, after }: { before: string; after: string }) {
  const { removed, added } = lineDiff(before, after);
  const rows: { type: 'add' | 'del'; text: string }[] = [
    ...removed.map((text) => ({ type: 'del' as const, text })),
    ...added.map((text) => ({ type: 'add' as const, text })),
  ];
  const trimmed = rows.slice(0, 40);
  return (
    <div className="diffpreview">
      {trimmed.map((row, i) => (
        <div key={i} className={`diffpreview__row diffpreview__row--${row.type}`}>
          <span className="diffpreview__sign">{row.type === 'add' ? '+' : '-'}</span>
          <span className="diffpreview__text">{row.text || ' '}</span>
        </div>
      ))}
      {rows.length > trimmed.length && (
        <div className="diffpreview__more">+{rows.length - trimmed.length} more line(s)</div>
      )}
      {rows.length === 0 && <div className="diffpreview__more">No textual change</div>}
    </div>
  );
}

function TerminalOutput({ meta }: { meta: Record<string, any> }) {
  return (
    <div className="terminal">
      <div className="terminal__command">
        <span className="terminal__prompt">$</span>
        <span>{meta.command}</span>
      </div>
      {meta.stdout ? <pre className="terminal__out">{meta.stdout}</pre> : null}
      {meta.stderr ? <pre className="terminal__err">{meta.stderr}</pre> : null}
      <div className="terminal__footer">
        <span className={meta.exitCode === 0 ? 'badge badge--ok' : 'badge badge--err'}>
          exit {String(meta.exitCode)}
        </span>
        <span className="terminal__duration">{meta.durationMs}ms</span>
        {meta.timedOut && <span className="badge badge--warn">timed out</span>}
      </div>
    </div>
  );
}

export function ToolCall({ item }: { item: ToolCallItem }) {
  const [open, setOpen] = useState(item.name === 'run_command');
  const meta = item.meta ?? {};
  const isEdit = (item.name === 'edit_file' || item.name === 'write_file') && typeof meta.after === 'string';

  const glyph = (() => {
    if (item.status === 'running') return <span className="toolcall__spinner" />;
    if (item.status === 'error') return <IconWarning size={13} />;
    switch (item.name) {
      case 'search_code':
        return <IconSearch size={13} />;
      case 'run_command':
        return <IconTerminal size={13} />;
      case 'edit_file':
      case 'write_file':
      case 'read_file':
      case 'list_files':
        return <IconFile size={13} />;
      default:
        return <IconCheck size={13} />;
    }
  })();

  return (
    <div className={`toolcall toolcall--${item.status}`}>
      <div className="toolcall__header" onClick={() => setOpen((v) => !v)}>
        <span className="toolcall__chevron">
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
        <span className="toolcall__glyph">{glyph}</span>
        <span className="toolcall__summary">{item.summary}</span>
        <span className="toolcall__name">{item.name}</span>
      </div>

      {open && (
        <div className="toolcall__body">
          {isEdit && <DiffPreview before={String(meta.before ?? '')} after={String(meta.after ?? '')} />}
          {item.name === 'run_command' && item.status !== 'running' && <TerminalOutput meta={meta} />}
          {item.name === 'read_file' && typeof meta.totalLines === 'number' && (
            <div className="toolcall__note">
              Read lines {String(meta.start)}-{String(meta.end)} of {String(meta.totalLines)}
              <button className="btn btn--ghost" onClick={() => void store.openFile(String(meta.path))}>
                Open file
              </button>
            </div>
          )}
          {item.name === 'search_code' && typeof meta.hits === 'number' && (
            <div className="toolcall__note">{String(meta.hits)} match(es)</div>
          )}
          {!isEdit && item.name !== 'run_command' && (
            <pre className="toolcall__content">{(item.content ?? '').slice(0, 4000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
