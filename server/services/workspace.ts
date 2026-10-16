import fs from 'node:fs';
import path from 'node:path';

export interface FileNode {
  name: string;
  /** Workspace-relative POSIX path. Empty string for the root. */
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface ReadFileResult {
  path: string;
  content: string;
  language: string;
  size: number;
  truncated: boolean;
  modified: number;
}

const MAX_READ_BYTES = 2 * 1024 * 1024;

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'out', 'build', '.next', '.nuxt', 'coverage',
  '__pycache__', '.venv', 'venv', '.idea', '.cache', '.turbo', 'target',
  'vendor', '.gradle', '.mypy_cache', '.pytest_cache', '.ruff_cache',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.pdf', '.zip', '.gz', '.tar',
  '.7z', '.rar', '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.wav', '.ogg', '.class', '.jar', '.wasm', '.bin',
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json', '.jsonc': 'json', '.md': 'markdown', '.markdown': 'markdown',
  '.css': 'css', '.scss': 'scss', '.less': 'less', '.html': 'html', '.htm': 'html',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
  '.php': 'php', '.swift': 'swift', '.kt': 'kotlin', '.sh': 'shell', '.bash': 'shell',
  '.ps1': 'powershell', '.sql': 'sql', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml',
  '.ini': 'ini', '.xml': 'xml', '.svg': 'xml', '.vue': 'html', '.svelte': 'html',
  '.dockerfile': 'dockerfile', '.env': 'ini', '.gitignore': 'ini', '.txt': 'plaintext',
};

export function languageFor(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = path.extname(base);
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext';
}

export function isBinary(filePath: string): boolean {
  return BINARY_EXT.has(path.extname(filePath).toLowerCase());
}

/**
 * Resolves a workspace-relative path and guarantees the result stays inside the
 * workspace root. Agents must never be able to read or write outside it.
 */
export function safeResolve(root: string, relative: string): string {
  const cleaned = (relative ?? '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, cleaned);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace root: ${relative}`);
  }
  return resolved;
}

export function toPosix(relative: string): string {
  return relative.split(path.sep).join('/');
}

export function buildTree(root: string, maxEntries = 6000): FileNode {
  let budget = maxEntries;

  function walk(absDir: string, relDir: string): FileNode[] {
    if (budget <= 0) return [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: FileNode[] = [];
    for (const entry of entries) {
      if (budget <= 0) break;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        budget -= 1;
        const children = walk(path.join(absDir, entry.name), rel);
        nodes.push({ name: entry.name, path: rel, type: 'directory', children });
      } else if (entry.isFile()) {
        budget -= 1;
        nodes.push({ name: entry.name, path: rel, type: 'file' });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  return { name: path.basename(root), path: '', type: 'directory', children: walk(root, '') };
}

export function readFile(root: string, relative: string): ReadFileResult {
  const abs = safeResolve(root, relative);
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error(`Not a file: ${relative}`);
  if (isBinary(relative)) throw new Error(`Binary file cannot be opened as text: ${relative}`);
  const truncated = stat.size > MAX_READ_BYTES;
  const content = truncated
    ? fs.readFileSync(abs, 'utf8').slice(0, MAX_READ_BYTES)
    : fs.readFileSync(abs, 'utf8');
  return {
    path: toPosix(relative),
    content,
    language: languageFor(relative),
    size: stat.size,
    truncated,
    modified: stat.mtimeMs,
  };
}

export function ensureParent(absFile: string): void {
  fs.mkdirSync(path.dirname(absFile), { recursive: true });
}

export function writeFile(root: string, relative: string, content: string): { path: string; bytes: number } {
  const abs = safeResolve(root, relative);
  ensureParent(abs);
  fs.writeFileSync(abs, content, 'utf8');
  return { path: toPosix(relative), bytes: Buffer.byteLength(content, 'utf8') };
}

export interface ListEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

export function listDir(root: string, relative = ''): ListEntry[] {
  const abs = safeResolve(root, relative);
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${relative}`);
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
    .map((e) => {
      const childRel = relative ? `${toPosix(relative)}/${e.name}` : e.name;
      let size = 0;
      try {
        size = e.isFile() ? fs.statSync(path.join(abs, e.name)).size : 0;
      } catch {
        size = 0;
      }
      return {
        name: e.name,
        path: childRel,
        type: e.isDirectory() ? ('directory' as const) : ('file' as const),
        size,
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Very small fuzzy matcher used by the Cmd+P style quick-open. */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return -1;
    streak = idx === ti ? streak + 1 : 0;
    score += 10 - Math.min(9, idx - ti) + streak * 5;
    if (idx === 0 || t[idx - 1] === '/' || t[idx - 1] === '-' || t[idx - 1] === '_') score += 8;
    ti = idx + 1;
  }
  return score - target.length * 0.05;
}

export function flattenFiles(node: FileNode, out: string[] = []): string[] {
  if (node.type === 'file') out.push(node.path);
  for (const child of node.children ?? []) flattenFiles(child, out);
  return out;
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
