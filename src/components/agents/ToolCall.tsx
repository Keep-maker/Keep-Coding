import { useMemo, useState } from 'react';
import { store } from '../../state/store';
import type { ToolCallItem } from '../../types';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconCopy,
  IconFile,
  IconFolder,
  IconGrid,
  IconImage,
  IconList,
  IconLoader,
  IconRobot,
  IconSearch,
  IconSparkle,
  IconTerminal,
  IconWarning,
  IconWrench,
} from '../common/Icons';
import { Markdown } from '../common/Markdown';

/** Clickable workspace path that opens the file in the editor. */
function FileLink({ path, line, icon = true }: { path: string; line?: number; icon?: boolean }) {
  if (!path) return null;
  return (
    <button
      className="filelink"
      title={line ? `Open ${path}:${line}` : `Open ${path}`}
      onClick={(event) => {
        event.stopPropagation();
        void store.openFile(path, line);
      }}
    >
      {icon && <IconFile size={11} />}
      <span className="filelink__path">{path}</span>
      {typeof line === 'number' && <span className="filelink__line">{line}</span>}
    </button>
  );
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      className="toolcall__copy"
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        void store.copyText(text, 'Copied');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
    </button>
  );
}

interface DiffFile {
  path: string;
  before: string;
  after: string;
  replacements?: number;
  created?: boolean;
  deleted?: boolean;
  movedFrom?: string;
}

function diffRows(before: string, after: string) {
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
  const rows: { type: 'add' | 'del' | 'ctx'; text: string; number: number | null }[] = [];
  beforeLines.slice(Math.max(0, prefix - 2), prefix).forEach((text, i) => {
    rows.push({ type: 'ctx', text, number: Math.max(0, prefix - 2) + i + 1 });
  });
  beforeLines.slice(prefix, beforeLines.length - suffix).forEach((text, i) => {
    rows.push({ type: 'del', text, number: prefix + i + 1 });
  });
  afterLines.slice(prefix, afterLines.length - suffix).forEach((text, i) => {
    rows.push({ type: 'add', text, number: prefix + i + 1 });
  });
  afterLines.slice(afterLines.length - suffix, afterLines.length - suffix + 2).forEach((text, i) => {
    rows.push({ type: 'ctx', text, number: afterLines.length - suffix + i + 1 });
  });
  return rows;
}

function DiffBlock({ file, limit = 120 }: { file: DiffFile; limit?: number }) {
  const rows = useMemo(() => diffRows(file.before, file.after), [file.before, file.after]);
  const added = rows.filter((row) => row.type === 'add').length;
  const removed = rows.filter((row) => row.type === 'del').length;
  const shown = rows.slice(0, limit);

  return (
    <div className="diffblock">
      <div className="diffblock__head">
        <FileLink path={file.path} />
        {file.movedFrom && <span className="diffblock__from">from {file.movedFrom}</span>}
        <span className="toolcall__spacer" />
        {file.created && !file.before ? (
          <span className="diffstat diffstat--add">new file</span>
        ) : file.deleted ? (
          <span className="diffstat diffstat--del">deleted</span>
        ) : (
          <>
            {added > 0 && <span className="diffstat diffstat--add">+{added}</span>}
            {removed > 0 && <span className="diffstat diffstat--del">-{removed}</span>}
            {file.replacements != null && file.replacements > 0 && (
              <span className="diffstat diffstat--muted">{file.replacements} replacement(s)</span>
            )}
          </>
        )}
        <CopyButton text={file.after} label="Copy resulting content" />
      </div>
      <div className="diffblock__body">
        {shown.map((row, i) => (
          <div key={i} className={`diffline diffline--${row.type}`}>
            <span className="diffline__num">{row.number ?? ''}</span>
            <span className="diffline__sign">{row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}</span>
            <span className="diffline__text">{row.text || ' '}</span>
          </div>
        ))}
        {rows.length > shown.length && (
          <div className="diffblock__more">+{rows.length - shown.length} more line(s) in this change</div>
        )}
        {!rows.length && <div className="diffblock__more">No textual change.</div>}
      </div>
    </div>
  );
}

function PathList({ content, empty = 'No results.' }: { content: string; empty?: string }) {
  const entries = useMemo(() => {
    const out: { key: string; path: string; line?: number; detail: string }[] = [];
    const seen = new Set<string>();
    for (const raw of content.split(String.fromCharCode(10))) {
      const line = raw.trimEnd();
      if (!line) continue;
      const match = /^([\w./@-]+\.[A-Za-z0-9]+)(?::(\d+)(?::\d+)?)?(?::\s*(.*))?$/.exec(line.trim());
      if (!match) continue;
      const key = `${match[1]}:${match[2] ?? ''}:${match[3] ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        path: match[1],
        line: match[2] ? Number(match[2]) : undefined,
        detail: (match[3] ?? '').trim().slice(0, 200),
      });
      if (out.length >= 60) break;
    }
    return out;
  }, [content]);

  if (!entries.length) return <div className="toolcall__empty">{empty}</div>;

  return (
    <div className="pathlist">
      {entries.map((entry) => (
        <div className="pathlist__row" key={entry.key}>
          <FileLink path={entry.path} line={entry.line} />
          {entry.detail && <span className="pathlist__detail">{entry.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function TerminalOutput({ meta }: { meta: Record<string, any> }) {
  const failed = meta.exitCode !== 0 || meta.timedOut;
  return (
    <div className={`terminal ${failed ? 'terminal--failed' : ''}`}>
      <div className="terminal__command">
        <span className="terminal__prompt">$</span>
        <span className="terminal__cmd">{meta.command}</span>
        <CopyButton text={String(meta.command ?? '')} label="Copy command" />
      </div>
      {meta.stdout ? <pre className="terminal__out">{meta.stdout}</pre> : null}
      {meta.stderr ? <pre className="terminal__err">{meta.stderr}</pre> : null}
      {!meta.stdout && !meta.stderr && <div className="toolcall__empty">No output.</div>}
      <div className="terminal__footer">
        <span className={meta.exitCode === 0 ? 'badge badge--ok' : 'badge badge--err'}>
          exit {String(meta.exitCode ?? 'null')}
        </span>
        {typeof meta.durationMs === 'number' && <span className="terminal__duration">{meta.durationMs}ms</span>}
        {meta.timedOut && <span className="badge badge--warn">timed out</span>}
      </div>
    </div>
  );
}

function TodoList({ todos }: { todos: { content: string; status: string }[] }) {
  const done = todos.filter((todo) => todo.status === 'completed').length;
  return (
    <div className="todolist">
      <div className="todolist__head">
        <IconList size={12} />
        <span>
          {done}/{todos.length} complete
        </span>
        <span className="todolist__bar">
          <span style={{ width: `${todos.length ? (done / todos.length) * 100 : 0}%` }} />
        </span>
      </div>
      {todos.map((todo, i) => (
        <div key={i} className={`todoitem todoitem--${todo.status}`}>
          <span className="todoitem__mark">
            {todo.status === 'completed' ? (
              <IconCheck size={11} />
            ) : todo.status === 'in_progress' ? (
              <IconLoader size={11} />
            ) : (
              <IconCircle size={11} />
            )}
          </span>
          <span className="todoitem__text">{todo.content}</span>
        </div>
      ))}
    </div>
  );
}

function ImagePreview({ meta }: { meta: Record<string, any> }) {
  return (
    <div className="imagepreview">
      <div className="imagepreview__frame">
        <img src={String(meta.dataUrl)} alt={String(meta.path ?? 'image')} />
      </div>
      <div className="imagepreview__meta">
        <IconImage size={11} />
        <FileLink path={String(meta.path ?? '')} />
        <span className="imagepreview__dim">
          {String(meta.mime ?? '')} / {Math.round(Number(meta.bytes ?? 0) / 1024)}KB
        </span>
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  read_file: 'Read file',
  list_files: 'List files',
  glob_file_search: 'Find files',
  grep_search: 'Search content',
  directory_tree: 'Directory tree',
  read_image: 'Read image',
  file_info: 'File info',
  edit_file: 'Edit file',
  multi_edit: 'Multi-edit',
  write_file: 'Write file',
  move_file: 'Move file',
  delete_file: 'Delete file',
  run_command: 'Run command',
  todo_write: 'Task list',
  ask_question: 'Question',
  task: 'Sub-agent',
};

const DEFAULT_OPEN = new Set(['run_command', 'todo_write', 'ask_question', 'task']);

function glyphFor(name: string, status: ToolCallItem['status']) {
  if (status === 'running') return <IconLoader size={12} />;
  if (status === 'error') return <IconWarning size={12} />;
  switch (name) {
    case 'grep_search':
    case 'glob_file_search':
      return <IconSearch size={12} />;
    case 'list_files':
    case 'directory_tree':
      return <IconFolder size={12} />;
    case 'read_file':
    case 'file_info':
    case 'read_image':
      return <IconFile size={12} />;
    case 'run_command':
      return <IconTerminal size={12} />;
    case 'todo_write':
      return <IconList size={12} />;
    case 'task':
      return <IconRobot size={12} />;
    case 'ask_question':
      return <IconSparkle size={12} />;
    case 'edit_file':
    case 'multi_edit':
    case 'write_file':
    case 'move_file':
    case 'delete_file':
      return <IconWrench size={12} />;
    default:
      return <IconGrid size={12} />;
  }
}

export function ToolCall({ item }: { item: ToolCallItem }) {
  const [open, setOpen] = useState(DEFAULT_OPEN.has(item.name));
  const meta = item.meta ?? {};
  const running = item.status === 'running';
  const label = LABELS[item.name] ?? item.name;

  const body = () => {
    if (running) {
      return (
        <div className="toolcall__running">
          <span className="toolcall__shimmer" />
          {meta.command ? <code className="toolcall__code">{String(meta.command)}</code> : null}
        </div>
      );
    }

    switch (item.name) {
      case 'read_file':
        return (
          <div className="toolcall__row">
            <FileLink path={String(meta.path ?? '')} line={Number(meta.start) || undefined} />
            {typeof meta.totalLines === 'number' && (
              <span className="toolcall__dim">
                lines {String(meta.start)}-{String(meta.end)} of {String(meta.totalLines)}
              </span>
            )}
            <span className="toolcall__spacer" />
            <CopyButton text={item.content ?? ''} />
          </div>
        );

      case 'list_files': {
        const count = typeof meta.files === 'number' ? meta.files : Number(meta.entries) || 0;
        return (
          <div className="toolcall__stack">
            <div className="toolcall__row">
              {meta.directory ? (
                <FileLink path={String(meta.directory)} icon={false} />
              ) : (
                <span className="toolcall__dim">workspace root</span>
              )}
              <span className="toolcall__dim">
                {count} {count === 1 ? 'entry' : 'entries'}
              </span>
              <span className="toolcall__spacer" />
              <CopyButton text={item.content ?? ''} />
            </div>
            <PathList content={item.content ?? ''} empty="(empty)" />
          </div>
        );
      }

      case 'glob_file_search':
      case 'grep_search': {
        const hits = Number(meta.hits ?? meta.matches ?? meta.files ?? 0);
        return (
          <div className="toolcall__stack">
            <div className="toolcall__row">
              <code className="toolcall__code">{String(meta.pattern ?? '')}</code>
              <span className="toolcall__dim">
                {hits} {item.name === 'grep_search' ? 'match(es)' : 'file(s)'}
                {meta.mode && meta.mode !== 'content' ? ` / ${String(meta.mode)}` : ''}
              </span>
              <span className="toolcall__spacer" />
              <CopyButton text={item.content ?? ''} />
            </div>
            <PathList content={item.content ?? ''} empty="No matches." />
          </div>
        );
      }

      case 'directory_tree':
        return (
          <div className="toolcall__stack">
            <div className="toolcall__row">
              <span className="toolcall__dim">{String(meta.directory ?? '.')}</span>
              <span className="toolcall__dim">{String(meta.entries ?? 0)} entries</span>
              <span className="toolcall__spacer" />
              <CopyButton text={item.content ?? ''} />
            </div>
            <pre className="toolcall__content toolcall__content--tree">{item.content ?? ''}</pre>
          </div>
        );

      case 'read_image':
        return meta.dataUrl ? <ImagePreview meta={meta} /> : <div className="toolcall__empty">{item.content}</div>;

      case 'file_info':
        return (
          <div className="toolcall__row">
            <FileLink path={String(meta.path ?? '')} />
            <span className="toolcall__dim">
              {String(meta.size ?? 0)} bytes / {String(meta.lines ?? 0)} lines
            </span>
          </div>
        );

      case 'edit_file':
        return (
          <DiffBlock
            file={{
              path: String(meta.path ?? ''),
              before: String(meta.before ?? ''),
              after: String(meta.after ?? ''),
              replacements: Number(meta.replacements) || undefined,
            }}
          />
        );

      case 'multi_edit': {
        const files = Array.isArray(meta.files) ? (meta.files as Record<string, unknown>[]) : [];
        if (!files.length) return <div className="toolcall__empty">{item.content}</div>;
        return (
          <div className="toolcall__stack">
            <div className="toolcall__row">
              <span className="toolcall__dim">
                {String(meta.edits ?? files.length)} edit(s) across {files.length} file(s)
              </span>
            </div>
            {files.map((file, i) => (
              <DiffBlock
                key={i}
                file={{
                  path: String(file.path ?? ''),
                  before: String(file.before ?? ''),
                  after: String(file.after ?? ''),
                  created: Boolean(file.created),
                }}
                limit={80}
              />
            ))}
          </div>
        );
      }

      case 'write_file':
        return (
          <DiffBlock
            file={{
              path: String(meta.path ?? ''),
              before: String(meta.before ?? ''),
              after: String(meta.after ?? ''),
              created: Boolean(meta.created),
            }}
            limit={160}
          />
        );

      case 'delete_file':
        return (
          <div className="toolcall__row">
            <span className="toolcall__dim">removed</span>
            <FileLink path={String(meta.path ?? '')} />
            <span className="toolcall__spacer" />
            <CopyButton text={String(meta.before ?? '')} label="Copy deleted content" />
          </div>
        );

      case 'move_file':
        return (
          <div className="toolcall__row">
            <FileLink path={String(meta.previousPath ?? '')} />
            <span className="toolcall__dim">to</span>
            <FileLink path={String(meta.path ?? '')} />
          </div>
        );

      case 'run_command':
        return <TerminalOutput meta={meta} />;

      case 'todo_write': {
        const todos = Array.isArray(meta.todos) ? (meta.todos as { content: string; status: string }[]) : [];
        return todos.length ? <TodoList todos={todos} /> : <div className="toolcall__empty">{item.content}</div>;
      }

      case 'ask_question': {
        const selected: string[] = Array.isArray(meta.selected) ? (meta.selected as string[]) : [];
        return (
          <div className="toolcall__stack">
            <div className="toolcall__question">{String(meta.question ?? item.summary)}</div>
            <div className="toolcall__row">
              {selected.map((choice) => (
                <span className="chip chip--answer" key={choice}>
                  <IconCheck size={10} />
                  {choice}
                </span>
              ))}
              {!selected.length && (
                <span className="toolcall__dim">{meta.unanswered ? 'Unanswered' : 'Answered'}</span>
              )}
            </div>
            {meta.note && <div className="toolcall__note-block">{String(meta.note)}</div>}
          </div>
        );
      }

      case 'task': {
        const report = String(meta.report ?? '');
        return (
          <div className="toolcall__stack">
            <div className="toolcall__row">
              <IconRobot size={12} />
              <span className="subagent__desc">{String(meta.description ?? 'subtask')}</span>
              <span className="toolcall__dim">
                {String(meta.steps ?? 0)} step(s) / {String(meta.toolCalls ?? 0)} tool call(s)
              </span>
            </div>
            {report && (
              <div className="toolcall__report">
                <Markdown>{report}</Markdown>
              </div>
            )}
          </div>
        );
      }

      default:
        return <pre className="toolcall__content">{(item.content ?? '').slice(0, 4000)}</pre>;
    }
  };

  return (
    <div className={`toolcall toolcall--${item.status}`} data-tool={item.name}>
      <div className="toolcall__header" onClick={() => setOpen((v) => !v)}>
        <span className="toolcall__chevron">
          {open ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
        </span>
        <span className={`toolcall__glyph ${running ? 'is-running' : ''}`}>{glyphFor(item.name, item.status)}</span>
        <span className="toolcall__label">{label}</span>
        <span className="toolcall__summary">{item.summary}</span>
        <span className="toolcall__spacer" />
        {item.status === 'error' && <span className="badge badge--err">failed</span>}
        <CopyButton text={item.content ?? ''} label="Copy tool output" />
      </div>
      {open && <div className="toolcall__body">{body()}</div>}
    </div>
  );
}
