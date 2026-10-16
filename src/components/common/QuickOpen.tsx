import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { store, useApp } from '../../state/store';
import { IconFile, IconSearch } from '../common/Icons';

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const state = useApp();
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<{ path: string; score: number }[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.quickOpen(state.root, query);
        if (!cancelled) {
          setFiles(result.files);
          setIndex(0);
        }
      } catch {
        if (!cancelled) setFiles([]);
      }
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, state.root]);

  const open = (path: string) => {
    void store.openFile(path);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog quickopen">
        <div className="quickopen__input">
          <IconSearch size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search files by name"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, files.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter' && files[index]) open(files[index].path);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="quickopen__list">
          {files.map((file, i) => {
            const name = file.path.split('/').pop();
            const dir = file.path.slice(0, file.path.length - (name?.length ?? 0)).replace(/\/$/, '');
            return (
              <div
                key={file.path}
                className={`quickopen__item ${i === index ? 'is-active' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => open(file.path)}
              >
                <IconFile size={13} />
                <span className="quickopen__name">{name}</span>
                {dir && <span className="quickopen__dir">{dir}</span>}
              </div>
            );
          })}
          {files.length === 0 && <div className="quickopen__empty">No matching files</div>}
        </div>
      </div>
    </div>
  );
}
