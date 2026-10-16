import { useEffect, useRef, useState } from 'react';
import { store, useApp } from '../../state/store';
import { IconClose, IconTerminal } from '../common/Icons';

interface Entry {
  id: number;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  running: boolean;
  durationMs?: number;
}

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length]);

  const run = async () => {
    const command = value.trim();
    if (!command || busy) return;
    const id = Date.now();
    setEntries((prev) => [...prev, { id, command, stdout: '', stderr: '', exitCode: null, running: true }]);
    setValue('');
    setBusy(true);
    try {
      const response = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: state.root, command }),
      });
      const result = await response.json();
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                stdout: result.stdout ?? '',
                stderr: result.stderr ?? '',
                exitCode: result.exitCode ?? null,
                durationMs: result.durationMs,
                running: false,
              }
            : entry,
        ),
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, stderr: (err as Error).message, running: false, exitCode: -1 } : entry,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="terminalpanel">
      <div className="panel__header">
        <span>
          <IconTerminal size={12} /> Terminal
        </span>
        <button className="icon-btn" onClick={onClose} title="Close terminal">
          <IconClose size={13} />
        </button>
      </div>
      <div className="terminalpanel__body" ref={scrollRef}>
        {entries.length === 0 && (
          <div className="terminalpanel__hint">
            Run shell commands in <span className="mono">{state.root}</span>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="terminalpanel__entry">
            <div className="terminal__command">
              <span className="terminal__prompt">$</span>
              <span>{entry.command}</span>
            </div>
            {entry.stdout && <pre className="terminal__out">{entry.stdout}</pre>}
            {entry.stderr && <pre className="terminal__err">{entry.stderr}</pre>}
            {entry.running ? (
              <span className="badge badge--info">running...</span>
            ) : (
              <span className={entry.exitCode === 0 ? 'badge badge--ok' : 'badge badge--err'}>
                exit {String(entry.exitCode)}
                {entry.durationMs !== undefined ? ` - ${entry.durationMs}ms` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="terminalpanel__input">
        <span className="terminal__prompt">$</span>
        <input
          value={value}
          placeholder="Type a command and press Enter"
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run();
          }}
        />
      </div>
    </div>
  );
}
