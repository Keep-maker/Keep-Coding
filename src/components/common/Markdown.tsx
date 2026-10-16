import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { store, useApp } from '../../state/store';
import { IconCheck, IconFile } from './Icons';

/** Flattens rendered React children back to plain text (used for copy-to-clipboard). */
function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  const withProps = node as { props?: { children?: ReactNode } };
  return withProps.props?.children !== undefined ? extractText(withProps.props.children) : '';
}

/** Collects every file path in the workspace tree so inline code can be linked. */
function collectPaths(node: { type: string; path: string; children?: unknown[] } | null, out: Set<string>): Set<string> {
  if (!node) return out;
  if (node.type === 'file') out.add(node.path);
  for (const child of (node.children ?? []) as { type: string; path: string; children?: unknown[] }[]) {
    collectPaths(child, out);
  }
  return out;
}

/** Heuristic: does this inline code span look like a workspace-relative file path? */
function looksLikePath(text: string): boolean {
  if (!text || text.length > 200 || /[\s]/.test(text)) return false;
  if (/^https?:\/\//i.test(text) || text.startsWith('@') || text.startsWith('-')) return false;
  // Require a separator or a source-file extension so plain identifiers stay unlinked.
  return /[/\\]/.test(text) || /\.[a-z]{1,4}$/i.test(text);
}

const LANGUAGE_LABELS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JSX',
  javascript: 'JavaScript',
  json: 'JSON',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  ps1: 'PowerShell',
  powershell: 'PowerShell',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  md: 'Markdown',
  markdown: 'Markdown',
  py: 'Python',
  python: 'Python',
  yml: 'YAML',
  yaml: 'YAML',
  sql: 'SQL',
  diff: 'Diff',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
};

function CodeBlock({ children, className, raw }: { children?: ReactNode; className?: string; raw: string }) {
  const [copied, setCopied] = useState(false);
  const language = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? '';

  const copy = useCallback(() => {
    const write = navigator.clipboard?.writeText(raw);
    void write?.then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }, [raw]);

  return (
    <div className="codeblock">
      <div className="codeblock__bar">
        <span className="codeblock__lang">{LANGUAGE_LABELS[language] ?? language ?? 'text'}</span>
        <button className="codeblock__copy" onClick={copy} title="Copy code">
          {copied && <IconCheck size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="codeblock__pre">{children}</pre>
    </div>
  );
}

interface MarkdownProps {
  children: string;
  /** Applies the streaming shimmer to the block currently being written. */
  streaming?: boolean;
}

/**
 * Renders agent output as GitHub-flavoured markdown: headings, lists, tables,
 * task lists, blockquotes, syntax-highlighted code blocks with copy buttons, and
 * inline code that opens workspace files directly in the editor.
 */
export const Markdown = memo(function Markdown({ children, streaming }: MarkdownProps) {
  const state = useApp();
  const paths = useMemo(() => collectPaths(state.tree, new Set<string>()), [state.tree]);

  const components = useMemo(
    () => ({
      // Block code: wrap with a language bar + copy button.
      pre: ({ children: preChildren }: { children?: ReactNode }) => {
        const inner = Array.isArray(preChildren) ? preChildren[0] : preChildren;
        const className = (inner as { props?: { className?: string } })?.props?.className;
        return (
          <CodeBlock className={className} raw={extractText(preChildren)}>
            {preChildren}
          </CodeBlock>
        );
      },
      code: ({ className, children: codeChildren, ...rest }: any) => {
        const isBlock = Boolean(className?.includes('language-')) || Boolean(className?.includes('hljs'));
        if (isBlock) {
          return (
            <code className={className} {...rest}>
              {codeChildren}
            </code>
          );
        }
        const text = String(codeChildren ?? '');
        if (looksLikePath(text) && paths.has(text)) {
          return (
            <button className="md-filepath" title={`Open ${text}`} onClick={() => void store.openFile(text)}>
              <IconFile size={11} />
              {text}
            </button>
          );
        }
        return (
          <code className="md-code" {...rest}>
            {codeChildren}
          </code>
        );
      },
      a: ({ href, children: linkChildren }: { href?: string; children?: ReactNode }) => {
        const external = Boolean(href && /^https?:\/\//i.test(href));
        return (
          <a
            className="md-link"
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer noopener' : undefined}
          >
            {linkChildren}
          </a>
        );
      },
      // Tables need a scroll container so wide tables cannot break the layout.
      table: ({ children: tableChildren }: { children?: ReactNode }) => (
        <div className="md-table-wrap">
          <table>{tableChildren}</table>
        </div>
      ),
    }),
    [paths],
  );

  return (
    <div className={streaming ? 'md md--streaming' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={components as never}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

