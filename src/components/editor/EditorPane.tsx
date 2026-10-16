import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { store } from '../../state/store';
import type { OpenFile } from '../../types';
import { IconWarning } from '../common/Icons';

interface Props {
  file: OpenFile | null;
}

export function EditorPane({ file }: Props) {
  const editorRef = useRef<any>(null);
  const viewStateRef = useRef(new Map<string, any>());
  const pathRef = useRef<string | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('cursor-fork-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6f6f7e', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c792ea' },
        { token: 'string', foreground: 'c3e88d' },
        { token: 'number', foreground: 'f78c6c' },
        { token: 'type', foreground: '82aaff' },
        { token: 'function', foreground: '82aaff' },
      ],
      colors: {
        'editor.background': '#1b1b20',
        'editor.foreground': '#e6e6ea',
        'editorLineNumber.foreground': '#4b4b57',
        'editorLineNumber.activeForeground': '#a0a0af',
        'editor.lineHighlightBackground': '#232329',
        'editor.selectionBackground': '#3a3a56',
        'editorCursor.foreground': '#7c5cff',
        'editorIndentGuide.background1': '#26262e',
        'editorWidget.background': '#202027',
        'editorWidget.border': '#3a3a46',
        'scrollbarSlider.background': '#35353f80',
      },
    });
    monaco.editor.setTheme('cursor-fork-dark');
    editor.focus();
  };

  // Persist and restore per-file scroll position so tab switching feels native.
  useEffect(() => {
    const previous = pathRef.current;
    if (previous && editorRef.current) {
      viewStateRef.current.set(previous, editorRef.current.saveViewState());
    }
    pathRef.current = file?.path ?? null;
    const next = file?.path;
    if (next && editorRef.current) {
      const state = viewStateRef.current.get(next);
      if (state) editorRef.current.restoreViewState(state);
    }
  }, [file?.path]);

  if (!file) {
    return (
      <div className="editor__empty">
        <div className="editor__empty-inner">
          <h2>Cursor Fork</h2>
          <p>
            Select a file from the Explorer, or press <kbd>Ctrl</kbd>+<kbd>P</kbd> to search files.
          </p>
          <p className="editor__empty-hint">
            Switch to the <strong>Agents</strong> window to delegate work to an AI agent.
          </p>
        </div>
      </div>
    );
  }

  if (file.loading) return <div className="placeholder">Opening {file.path}...</div>;
  if (file.error) {
    return (
      <div className="editor__error">
        <IconWarning size={16} />
        <span>{file.error}</span>
      </div>
    );
  }

  return (
    <div className="editor__surface">
      <Editor
        key={file.path}
        language={file.language}
        value={file.content}
        onChange={(value) => store.setFileContent(file.path, value ?? '')}
        onMount={handleMount}
        options={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          fontLigatures: true,
          minimap: { enabled: true, maxColumn: 90, renderCharacters: false },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 10 },
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        }}
      />
    </div>
  );
}
