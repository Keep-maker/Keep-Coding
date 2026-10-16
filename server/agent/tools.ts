import fs from 'node:fs';
import type { ToolSchema } from '../services/llm.js';
import { listDir, readFile, writeFile, safeResolve, toPosix } from '../services/workspace.js';
import { listFiles, searchContent } from '../services/search.js';
import { runCommand } from '../services/shell.js';

export interface ToolContext {
  root: string;
  /** Text shown to the user in the chat transcript for this tool call. */
  onOutput?: (text: string) => void;
}

export interface ToolResult {
  /** Payload handed back to the model as the tool message content. */
  content: string;
  /** Structured detail used by the UI to render rich diff/terminal widgets. */
  meta?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDefinition {
  schema: ToolSchema;
  run(input: any, ctx: ToolContext): Promise<ToolResult>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const readFileTool: ToolDefinition = {
  schema: {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the workspace. Always read a file before editing it. Line numbers are prefixed in the output for reference only and must NOT be included when writing.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path, e.g. src/app.ts' },
        start_line: { type: 'integer', description: 'Optional 1-based first line to include.' },
        end_line: { type: 'integer', description: 'Optional 1-based last line to include.' },
      },
      required: ['path'],
    },
  },
  async run(input, ctx) {
    try {
      const result = readFile(ctx.root, asString(input.path));
      let lines = result.content.split(/\r?\n/);
      const start = Number.isFinite(input.start_line) ? Math.max(1, input.start_line) : 1;
      const end = Number.isFinite(input.end_line) ? Math.min(lines.length, input.end_line) : lines.length;
      const sliced = lines.slice(start - 1, end);
      const numbered = sliced
        .map((line, i) => `${String(start + i).padStart(5, ' ')}\t${line}`)
        .join('\n');
      ctx.onOutput?.(`Read ${result.path} (${sliced.length} lines)`);
      return {
        content: `File: ${result.path} (lines ${start}-${end} of ${lines.length})\n${numbered}`,
        meta: { path: result.path, start, end, totalLines: lines.length },
      };
    } catch (err) {
      return { content: `Error reading file: ${(err as Error).message}`, isError: true, meta: { path: input.path } };
    }
  },
};

export const listFilesTool: ToolDefinition = {
  schema: {
    name: 'list_files',
    description: 'List files in the workspace, optionally under a subdirectory. Use this to explore an unfamiliar project.',
    parameters: {
      type: 'object',
      properties: { directory: { type: 'string', description: 'Workspace-relative directory, default is the workspace root.' } },
    },
  },
  async run(input, ctx) {
    try {
      const directory = asString(input.directory);
      if (directory) {
        const entries = listDir(ctx.root, directory);
        const text = entries.map((e) => `${e.type === 'directory' ? 'd' : 'f'} ${e.path}`).join('\n');
        ctx.onOutput?.(`Listed ${entries.length} entries in ${directory}`);
        return { content: text || '(empty directory)', meta: { directory, entries: entries.length } };
      }
      const files = listFiles(ctx.root, 1500);
      ctx.onOutput?.(`Listed ${files.length} files`);
      return { content: files.join('\n') || '(empty workspace)', meta: { files: files.length } };
    } catch (err) {
      return { content: `Error listing files: ${(err as Error).message}`, isError: true };
    }
  },
};

export const searchTool: ToolDefinition = {
  schema: {
    name: 'search_code',
    description:
      'Search file contents across the workspace with a plain string or regular expression. Returns matching file paths with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or regex to find.' },
        is_regex: { type: 'boolean', description: 'Treat query as a regular expression.' },
        include: { type: 'string', description: 'Optional glob filter, e.g. src/**/*.ts' },
        max_results: { type: 'integer', description: 'Maximum matches, default 80.' },
      },
      required: ['query'],
    },
  },
  async run(input, ctx) {
    const query = asString(input.query);
    const hits = searchContent(ctx.root, {
      query,
      isRegex: Boolean(input.is_regex),
      include: asString(input.include) || undefined,
      maxResults: Number.isFinite(input.max_results) ? input.max_results : 80,
    });
    ctx.onOutput?.(`Searched "${query}" - ${hits.length} match(es)`);
    if (!hits.length) return { content: `No matches for "${query}".`, meta: { query, hits: 0 } };
    const text = hits.map((h) => `${h.path}:${h.line}:${h.column}: ${h.preview}`).join('\n');
    return { content: text, meta: { query, hits: hits.length } };
  },
};

/**
 * Replaces a literal block of text. The old text must be unique in the file so
 * the edit is unambiguous; this mirrors how Cursor applies surgical edits.
 */
export const editFileTool: ToolDefinition = {
  schema: {
    name: 'edit_file',
    description:
      'Apply an edit to an existing file by replacing an exact block of text. `old_string` must appear exactly once unless `replace_all` is true. Include enough surrounding context to stay unique. Do not include the line-number prefixes shown by read_file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path.' },
        old_string: { type: 'string', description: 'Exact existing text to replace.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence instead of requiring uniqueness.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async run(input, ctx) {
    const filePath = asString(input.path);
    const newString = asString(input.new_string);
    try {
      const before = readFile(ctx.root, filePath).content;
      // Models emit LF even when the file on disk uses CRLF. Normalise both the
      // needle and the haystack to LF so edits still match, then restore the
      // file's original line ending when writing back.
      const usesCrlf = before.includes('\r\n');
      const normalized = usesCrlf ? before.replace(/\r\n/g, '\n') : before;
      const oldString = usesCrlf ? asString(input.old_string).replace(/\r\n/g, '\n') : asString(input.old_string);
      const occurrences = oldString ? normalized.split(oldString).length - 1 : 0;
      if (!oldString) {
        return { content: 'Error: old_string must not be empty. Use write_file to create or replace a whole file.', isError: true };
      }
      if (occurrences === 0) {
        return { content: `Error: old_string was not found in ${filePath}. Read the file again and copy the exact text.`, isError: true, meta: { path: filePath } };
      }
      if (occurrences > 1 && !input.replace_all) {
        return {
          content: `Error: old_string appears ${occurrences} times in ${filePath}. Add more context or set replace_all.`,
          isError: true,
          meta: { path: filePath, occurrences },
        };
      }
      const newStringNormalized = usesCrlf ? newString.replace(/\r\n/g, '\n') : newString;
      const edited = input.replace_all
        ? normalized.split(oldString).join(newStringNormalized)
        : normalized.replace(oldString, newStringNormalized);
      const after = usesCrlf ? edited.replace(/\n/g, '\r\n') : edited;
      writeFile(ctx.root, filePath, after);
      ctx.onOutput?.(`Edited ${filePath}`);
      return {
        content: `Applied edit to ${filePath} (${occurrences} replacement${occurrences === 1 ? '' : 's'}).`,
        meta: { path: filePath, before, after, replacements: occurrences },
      };
    } catch (err) {
      return { content: `Error editing file: ${(err as Error).message}`, isError: true, meta: { path: filePath } };
    }
  },
};

export const writeFileTool: ToolDefinition = {
  schema: {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file with complete contents. Prefer edit_file for small changes.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path.' },
        content: { type: 'string', description: 'Full file contents.' },
      },
      required: ['path', 'content'],
    },
  },
  async run(input, ctx) {
    const filePath = asString(input.path);
    const content = asString(input.content);
    try {
      const abs = safeResolve(ctx.root, filePath);
      const existed = fs.existsSync(abs);
      const before = existed ? readFile(ctx.root, filePath).content : '';
      const payload = before.includes('\r\n') && !content.includes('\r\n') ? content.replace(/\n/g, '\r\n') : content;
      writeFile(ctx.root, filePath, payload);
      ctx.onOutput?.(`${existed ? 'Overwrote' : 'Created'} ${toPosix(filePath)}`);
      return {
        content: `${existed ? 'Overwrote' : 'Created'} ${toPosix(filePath)} (${content.split(/\r?\n/).length} lines).`,
        meta: { path: toPosix(filePath), before, after: content, created: !existed },
      };
    } catch (err) {
      return { content: `Error writing file: ${(err as Error).message}`, isError: true, meta: { path: filePath } };
    }
  },
};

export const runCommandTool: ToolDefinition = {
  schema: {
    name: 'run_command',
    description:
      'Execute a shell command in the workspace root and return stdout/stderr. Use this to install dependencies, run builds, tests, git, or inspect the environment.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        purpose: { type: 'string', description: 'Short reason for running this command, shown to the user.' },
      },
      required: ['command'],
    },
  },
  async run(input, ctx) {
    const command = asString(input.command);
    if (!command.trim()) return { content: 'Error: command must not be empty.', isError: true };
    const result = await runCommand(ctx.root, command);
    ctx.onOutput?.(`$ ${command}  (exit ${result.exitCode ?? 'null'})`);
    const parts = [
      `Command: ${command}`,
      `Exit code: ${result.exitCode ?? 'null'}${result.timedOut ? ' (timed out)' : ''}`,
      `Duration: ${result.durationMs}ms`,
      result.stdout ? `stdout:\n${result.stdout}` : 'stdout: (empty)',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ].filter(Boolean);
    return {
      content: parts.join('\n'),
      isError: result.exitCode !== 0,
      meta: { ...result },
    };
  },
};

export const ALL_TOOLS: ToolDefinition[] = [
  readFileTool,
  listFilesTool,
  searchTool,
  editFileTool,
  writeFileTool,
  runCommandTool,
];

export const TOOL_SCHEMAS: ToolSchema[] = ALL_TOOLS.map((t) => t.schema);

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.schema.name === name);
}



