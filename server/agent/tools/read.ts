import fs from 'node:fs';
import path from 'node:path';
import { listDir, readFile, safeResolve, toPosix, languageFor } from '../../services/workspace.js';
import { globSearch, listFiles, searchContent } from '../../services/search.js';
import { asNumber, asString, type ToolDefinition } from './types.js';

export const readFileTool: ToolDefinition = {
  schema: {
    name: 'read_file',
    description:
      'Read a UTF-8 text file. Always read before editing. Line numbers are shown for reference and must NOT be included when writing. Use offset/limit for large files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path, e.g. src/app.ts' },
        offset: { type: 'integer', description: '1-based first line to include.' },
        limit: { type: 'integer', description: 'Maximum number of lines to return.' },
      },
      required: ['path'],
    },
  },
  async run(input, ctx) {
    const requested = asString(input.path);
    try {
      const result = readFile(ctx.root, requested);
      const lines = result.content.split(/\r?\n/);
      const start = Math.max(1, asNumber(input.offset, 1));
      const limit = asNumber(input.limit, lines.length);
      const end = Math.min(lines.length, start + limit - 1);
      const body = lines
        .slice(start - 1, end)
        .map((line, i) => `${String(start + i).padStart(5, ' ')}\t${line}`)
        .join('\n');
      ctx.onOutput?.(`Read ${result.path} (${end - start + 1} lines)`);
      return {
        content: `File: ${result.path} (lines ${start}-${end} of ${lines.length})\n${body}`,
        meta: { path: result.path, start, end, totalLines: lines.length },
      };
    } catch (err) {
      return { content: `Error reading file: ${(err as Error).message}`, isError: true, meta: { path: requested } };
    }
  },
};

export const listFilesTool: ToolDefinition = {
  schema: {
    name: 'list_files',
    description: 'List files in the workspace, or the entries of one directory. Use this to orient yourself in an unfamiliar project.',
    parameters: {
      type: 'object',
      properties: { directory: { type: 'string', description: 'Workspace-relative directory; omit for the whole workspace.' } },
    },
  },
  async run(input, ctx) {
    try {
      const directory = asString(input.directory);
      if (directory) {
        const entries = listDir(ctx.root, directory);
        ctx.onOutput?.(`Listed ${entries.length} entries in ${directory}`);
        return {
          content: entries.map((e) => `${e.type === 'directory' ? 'd' : 'f'} ${e.path}`).join('\n') || '(empty directory)',
          meta: { directory, entries: entries.length },
        };
      }
      const files = listFiles(ctx.root, 1500);
      ctx.onOutput?.(`Listed ${files.length} files`);
      return { content: files.join('\n') || '(empty workspace)', meta: { files: files.length } };
    } catch (err) {
      return { content: `Error listing files: ${(err as Error).message}`, isError: true };
    }
  },
};

/** Glob by path - the "find files by name" capability Cursor exposes. */
export const globTool: ToolDefinition = {
  schema: {
    name: 'glob_file_search',
    description:
      'Find files by path or name using a glob pattern, e.g. "**/*.test.ts" or "src/**/util?.js". Returns matching paths sorted by most recently modified.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, supports ** and *.' },
        limit: { type: 'integer', description: 'Maximum results, default 100.' },
      },
      required: ['pattern'],
    },
  },
  async run(input, ctx) {
    const pattern = asString(input.pattern);
    try {
      const matches = globSearch(ctx.root, pattern, asNumber(input.limit, 100));
      ctx.onOutput?.(`Glob "${pattern}" - ${matches.length} file(s)`);
      return {
        content: matches.length ? matches.map((m) => m.path).join('\n') : `No files matched "${pattern}".`,
        meta: { pattern, matches: matches.length },
      };
    } catch (err) {
      return { content: `Error globbing: ${(err as Error).message}`, isError: true };
    }
  },
};

/** Content search with the flags Cursor's grep exposes. */
export const grepTool: ToolDefinition = {
  schema: {
    name: 'grep_search',
    description:
      'Search file contents with a regular expression. Supports -A/-B/-C surrounding context lines, a file glob filter, case sensitivity, and output modes.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        glob: { type: 'string', description: 'Optional file filter, e.g. "src/**/*.ts".' },
        case_sensitive: { type: 'boolean', description: 'Match case. Default false.' },
        output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Default content.' },
        before_context: { type: 'integer', description: 'Lines of leading context (-B).' },
        after_context: { type: 'integer', description: 'Lines of trailing context (-A).' },
        max_results: { type: 'integer', description: 'Maximum matches, default 80.' },
      },
      required: ['pattern'],
    },
  },
  async run(input, ctx) {
    const pattern = asString(input.pattern);
    const mode = asString(input.output_mode) || 'content';
    try {
      const hits = searchContent(ctx.root, {
        query: pattern,
        isRegex: true,
        caseSensitive: Boolean(input.case_sensitive),
        include: asString(input.glob) || undefined,
        maxResults: asNumber(input.max_results, 80),
        beforeContext: asNumber(input.before_context, 0),
        afterContext: asNumber(input.after_context, 0),
      });
      ctx.onOutput?.(`Grep /${pattern}/ - ${hits.length} match(es)`);

      if (!hits.length) return { content: `No matches for /${pattern}/.`, meta: { pattern, hits: 0 } };

      if (mode === 'files_with_matches') {
        const files = [...new Set(hits.map((h) => h.path))];
        return { content: files.join('\n'), meta: { pattern, files: files.length, mode } };
      }
      if (mode === 'count') {
        const counts = new Map<string, number>();
        for (const hit of hits) counts.set(hit.path, (counts.get(hit.path) ?? 0) + 1);
        return {
          content: [...counts.entries()].map(([file, n]) => `${file}: ${n}`).join('\n'),
          meta: { pattern, files: counts.size, mode },
        };
      }

      const rendered = hits.map((h) => {
        const context = (h.context ?? []).map((line) => `  ${line}`).join('\n');
        return `${h.path}:${h.line}:${h.column}: ${h.preview}${context ? `\n${context}` : ''}`;
      });
      return { content: rendered.join('\n'), meta: { pattern, hits: hits.length, mode } };
    } catch (err) {
      return { content: `Error searching: ${(err as Error).message}`, isError: true };
    }
  },
};

/** Directory tree, for a quick structural overview. */
export const treeTool: ToolDefinition = {
  schema: {
    name: 'directory_tree',
    description: 'Show a nested directory tree of the workspace (ignoring build output and dependencies). Useful for understanding project shape.',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Subdirectory to start from; omit for the workspace root.' },
        depth: { type: 'integer', description: 'Maximum depth, default 3.' },
      },
    },
  },
  async run(input, ctx) {
    const directory = asString(input.directory);
    const maxDepth = asNumber(input.depth, 3);
    const startAbs = safeResolve(ctx.root, directory);
    const lines: string[] = [];

    const walk = (abs: string, rel: string, depth: number) => {
      if (depth > maxDepth) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        const pad = '  '.repeat(depth);
        if (entry.isDirectory()) {
          lines.push(`${pad}${entry.name}/`);
          walk(path.join(abs, entry.name), childRel, depth + 1);
        } else {
          let size = 0;
          try {
            size = fs.statSync(path.join(abs, entry.name)).size;
          } catch {
            size = 0;
          }
          lines.push(`${pad}${entry.name}  (${size}b)`);
        }
      }
    };

    walk(startAbs, directory ? toPosix(directory) : '', 0);
    ctx.onOutput?.(`Tree of ${directory || '.'} (${lines.length} entries)`);
    return {
      content: lines.slice(0, 600).join('\n') || '(empty)',
      meta: { directory: directory || '.', entries: lines.length },
    };
  },
};

/**
 * Reads an image so vision-capable models can analyse it. Returned as a
 * data URL because the OpenAI-compatible wire format carries images inline.
 */
export const readImageTool: ToolDefinition = {
  schema: {
    name: 'read_image',
    description:
      'Read an image file (png, jpg, gif, webp, svg) and attach it to the conversation so you can analyse its contents.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Workspace-relative image path.' } },
      required: ['path'],
    },
  },
  async run(input, ctx) {
    const requested = asString(input.path);
    try {
      const abs = safeResolve(ctx.root, requested);
      if (!fs.existsSync(abs)) return { content: `Error: no such file: ${requested}`, isError: true };
      const ext = path.extname(abs).toLowerCase().slice(1);
      const mime =
        ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
      const buffer = fs.readFileSync(abs);
      if (buffer.byteLength > 4_000_000) {
        return { content: `Error: image is ${Math.round(buffer.byteLength / 1024)}KB, over the 4MB limit.`, isError: true };
      }
      const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      ctx.onOutput?.(`Read image ${requested}`);
      return {
        content: `Image attached: ${requested} (${mime}, ${Math.round(buffer.byteLength / 1024)}KB).`,
        meta: { path: toPosix(requested), dataUrl, mime, bytes: buffer.byteLength, isImage: true },
      };
    } catch (err) {
      return { content: `Error reading image: ${(err as Error).message}`, isError: true };
    }
  },
};

/** Cheap file-stat helper used by the model before reading or editing. */
export const fileInfoTool: ToolDefinition = {
  schema: {
    name: 'file_info',
    description: 'Get metadata for a file: size, line count, language, and last modified time. Useful before deciding whether to read it fully.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Workspace-relative file path.' } },
      required: ['path'],
    },
  },
  async run(input, ctx) {
    const requested = asString(input.path);
    try {
      const abs = safeResolve(ctx.root, requested);
      const stat = fs.statSync(abs);
      const lines = stat.isFile() ? readFile(ctx.root, requested).content.split(/\r?\n/).length : 0;
      return {
        content: `${toPosix(requested)}\nsize: ${stat.size} bytes\nlines: ${lines}\nlanguage: ${languageFor(requested)}\nmodified: ${new Date(stat.mtimeMs).toISOString()}`,
        meta: { path: toPosix(requested), size: stat.size, lines },
      };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true, meta: { path: requested } };
    }
  },
};
