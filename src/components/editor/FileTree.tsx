import { useState } from 'react';
import { store } from '../../state/store';
import type { FileNode } from '../../types';
import { IconChevronDown, IconChevronRight, IconFile, IconFolder, IconPlus, IconTrash } from '../common/Icons';

interface RowProps {
  node: FileNode;
  depth: number;
  expanded: Record<string, boolean>;
  activePath: string | null;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
  onNew: (dir: string) => void;
  onDelete: (path: string) => void;
}

function fileIconClass(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx'].includes(ext)) return 'fileicon--ts';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'fileicon--js';
  if (['json'].includes(ext)) return 'fileicon--json';
  if (['css', 'scss', 'less'].includes(ext)) return 'fileicon--css';
  if (['md', 'markdown'].includes(ext)) return 'fileicon--md';
  if (['html', 'htm'].includes(ext)) return 'fileicon--html';
  if (['py'].includes(ext)) return 'fileicon--py';
  return 'fileicon--default';
}

function TreeRow({ node, depth, expanded, activePath, onOpen, onToggle, onNew, onDelete }: RowProps) {
  const isOpen = expanded[node.path] ?? false;
  const isActive = activePath === node.path;

  if (node.type === 'directory') {
    return (
      <div className="tree__group">
        <div
          className="tree__row tree__row--dir"
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => onToggle(node.path)}
          title={node.path}
        >
          <span className="tree__chevron">
            {isOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
          </span>
          <IconFolder size={13} />
          <span className="tree__label">{node.name}</span>
          <span className="tree__actions">
            <button
              className="tree__action"
              title="New file"
              onClick={(e) => {
                e.stopPropagation();
                onNew(node.path);
              }}
            >
              <IconPlus size={12} />
            </button>
            <button
              className="tree__action"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.path);
              }}
            >
              <IconTrash size={12} />
            </button>
          </span>
        </div>
        {isOpen &&
          (node.children ?? []).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              onOpen={onOpen}
              onToggle={onToggle}
              onNew={onNew}
              onDelete={onDelete}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      className={`tree__row ${isActive ? 'is-active' : ''}`}
      style={{ paddingLeft: 6 + depth * 12 }}
      onClick={() => onOpen(node.path)}
      title={node.path}
    >
      <span className="tree__chevron" />
      <span className={`fileicon ${fileIconClass(node.name)}`}>
        <IconFile size={13} />
      </span>
      <span className="tree__label">{node.name}</span>
      <span className="tree__actions">
        <button
          className="tree__action"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.path);
          }}
        >
          <IconTrash size={12} />
        </button>
      </span>
    </div>
  );
}

export function FileTree() {
  const [creating, setCreating] = useState<{ dir: string; type: 'file' | 'directory' } | null>(null);
  const [draft, setDraft] = useState('');

  const handleSubmit = () => {
    if (!creating || !draft.trim()) {
      setCreating(null);
      setDraft('');
      return;
    }
    void store.createEntry(creating.dir, draft.trim(), creating.type);
    setCreating(null);
    setDraft('');
  };

  return (
    <div className="explorer">
      <div className="panel__header">
        <span>Explorer</span>
        <span className="panel__header-actions">
          <button className="tree__action" title="New file" onClick={() => setCreating({ dir: '', type: 'file' })}>
            <IconPlus size={13} />
          </button>
        </span>
      </div>
      <FileTreeBody
        onNew={(dir) => setCreating({ dir, type: 'file' })}
        creating={creating}
        draft={draft}
        setDraft={setDraft}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

import { useApp } from '../../state/store';

interface BodyProps {
  onNew: (dir: string) => void;
  creating: { dir: string; type: 'file' | 'directory' } | null;
  draft: string;
  setDraft: (value: string) => void;
  onSubmit: () => void;
}

function FileTreeBody({ onNew, creating, draft, setDraft, onSubmit }: BodyProps) {
  const state = useApp();
  const tree = state.tree;

  if (!tree) return <div className="placeholder">Loading workspace...</div>;

  return (
    <div className="tree">
      {creating && creating.dir === '' && (
        <input
          className="tree__input"
          autoFocus
          placeholder="new file name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
            if (e.key === 'Escape') onSubmit();
          }}
          onBlur={onSubmit}
        />
      )}
      {(tree.children ?? []).map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={0}
          expanded={state.expanded}
          activePath={state.activePath}
          onOpen={(path) => void store.openFile(path)}
          onToggle={(path) => store.toggleDir(path)}
          onNew={onNew}
          onDelete={(path) => void store.deleteEntry(path)}
        />
      ))}
      {(tree.children ?? []).length === 0 && <div className="placeholder">Workspace is empty</div>}
    </div>
  );
}

