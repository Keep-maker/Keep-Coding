import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { store, useApp } from '../../state/store';
import type { SearchHit } from '../../types';
import { IconChevronDown, IconChevronRight, IconFile, IconSearch } from '../common/Icons';

export function SearchPanel() {
  const state = useApp();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const result = await api.search(state.root, { query, isRegex, caseSensitive, maxResults: 200 });
        setHits(result.hits);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, isRegex, caseSensitive, state.root]);

  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, hit) => {
    (acc[hit.path] ??= []).push(hit);
    return acc;
  }, {});

  return (
    <div className="searchpanel">
      <div className="panel__header">
        <span>Search</span>
      </div>
      <div className="searchpanel__form">
        <div className="searchpanel__input-wrap">
          <IconSearch size={13} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search in workspace"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="searchpanel__toggles">
          <button
            className={`searchpanel__toggle ${isRegex ? 'is-on' : ''}`}
            title="Use regular expression"
            onClick={() => setIsRegex((v) => !v)}
          >
            .*
          </button>
          <button
            className={`searchpanel__toggle ${caseSensitive ? 'is-on' : ''}`}
            title="Match case"
            onClick={() => setCaseSensitive((v) => !v)}
          >
            Aa
          </button>
        </div>
      </div>
      <div className="searchpanel__meta">
        {busy ? 'Searching...' : query ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'Type to search'}
      </div>
      <div className="searchpanel__results">
        {Object.entries(grouped).map(([file, fileHits]) => {
          const isCollapsed = collapsed[file];
          return (
            <div key={file} className="searchpanel__file">
              <div
                className="searchpanel__file-header"
                onClick={() => setCollapsed((c) => ({ ...c, [file]: !c[file] }))}
              >
                {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                <IconFile size={12} />
                <span className="searchpanel__file-path" title={file}>
                  {file}
                </span>
                <span className="searchpanel__file-count">{fileHits.length}</span>
              </div>
              {!isCollapsed &&
                fileHits.map((hit) => (
                  <div
                    key={`${hit.line}:${hit.column}`}
                    className="searchpanel__hit"
                    onClick={() => void store.openFile(hit.path)}
                    title={hit.preview}
                  >
                    <span className="searchpanel__hit-line">{hit.line}</span>
                    <span className="searchpanel__hit-text">{hit.preview || '(empty line)'}</span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

