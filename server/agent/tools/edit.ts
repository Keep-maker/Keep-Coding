import fs from 'node:fs';
import path from 'node:path';
import { readFile, safeResolve, toPosix, writeFile } from '../../services/workspace.js';
import { asString, type ToolDefinition } from './types.js';

interface EditOutcome {
  path: string;
  before: string;
  after: string;
  replacements: number;
  created?: boolean;
}

/**
 * Applies a literal replacement, tolerating CRLF/LF differences between what the
 * model emits and what is on disk, then restoring the file's original ending.
 */
function applyEdit(
  root: string,
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): { ok: true; outcome: EditOutcome } | { ok: false; error: string; occurrences?: number } {
  const abs = safeResolve(root, filePath);
  const existed = fs.existsSync(abs);
  if (!existed) return { ok: false, error: `File does not exist: ${filePath}` };

  const before = readFile(root, filePath).content;
  const usesCrlf = before.includes('\r\n');
  const normalized = usesCrlf ? before.replace(/\r\n/g, '\n') : before;
  const needle = usesCrlf ? oldString.replace(/\r\n/g, '\n') : oldString;
  if (!needle) return { ok: false, error: 'old_string must not be empty.' };

  const occurrences = normalized.split(needle).length - 1;
  if (occurrences === 0) {
    return { ok: false, error: `old_string was not found in ${filePath}. Read the file again and copy the exact text.` };
  }
  if (occurrences > 1 && !replaceAll) {
    return {
      ok: false,
      error: `old_string appears ${occurrences} times in ${filePath}. Add more surrounding context, or set replace_all.`,
      occurrences,
    };
  }

  const replacement = usesCrlf ? newString.replace(/\r\n/g, '\n') : newString;
  const edited = replaceAll ? normalized.split(needle).join(replacement) : normalized.replace(needle, replacement);
  const after = usesCrlf ? edited.replace(/\n/g, '\r\n') : edited;
  writeFile(root, filePath, after);
  return { ok: true, outcome: { path: toPosix(filePath), before, after, replacements: occurrences } };
}

export const editFileTool: ToolDefinition = {
  mutates: true,
  schema: {
    name: 'edit_file',
    description:
      'Replace an exact block of text in a file. old_string must appear exactly once unless replace_all is true, so include enough surrounding context to be unique. Do not include the line-number prefixes shown by read_file.',
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
    try {
      ctx.snapshot(filePath);
      const result = applyEdit(ctx.root, filePath, asString(input.old_string), asString(input.new_string), Boolean(input.replace_all));
      if (!result.ok) {
        return { content: `Error: ${result.error}`, isError: true, meta: { path: filePath, occurrences: result.occurrences } };
      }
      ctx.onOutput?.(`Edited ${result.outcome.path}`);
      return {
        content: `Applied edit to ${result.outcome.path} (${result.outcome.replacements} replacement${result.outcome.replacements === 1 ? '' : 's'}).`,
        meta: { ...result.outcome },
      };
    } catch (err) {
      return { content: `Error editing file: ${(err as Error).message}`, isError: true, meta: { path: filePath } };
    }
  },
};

/**
 * Batch edit: many replacements across many files in one tool call. Cursor
 * exposes this as MultiEdit; it saves a full round-trip per file.
 */
export const multiEditTool: ToolDefinition = {
  mutates: true,
  schema: {
    name: 'multi_edit',
    description:
      'Apply several literal edits across one or more files in a single call. Each edit is validated before anything is written, so a bad edit aborts the whole batch rather than leaving a half-applied change.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'List of edits to apply.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Workspace-relative file path.' },
              old_string: { type: 'string', description: 'Exact text to replace.' },
              new_string: { type: 'string', description: 'Replacement text.' },
              replace_all: { type: 'boolean', description: 'Replace every occurrence.' },
            },
            required: ['path', 'old_string', 'new_string'],
          },
        },
      },
      required: ['edits'],
    },
  },
  async run(input, ctx) {
    const edits = Array.isArray(input?.edits) ? input.edits : [];
    if (!edits.length) return { content: 'Error: edits must be a non-empty array.', isError: true };

    // Validate every edit against the current on-disk state first.
    const planned = edits.map((edit: any) => ({
      path: asString(edit.path),
      oldString: asString(edit.old_string),
      newString: asString(edit.new_string),
      replaceAll: Boolean(edit.replace_all),
    }));

    for (const edit of planned) {
      try {
        const abs = safeResolve(ctx.root, edit.path);
        if (!fs.existsSync(abs)) {
          return { content: `Error: file does not exist: ${edit.path}. Nothing was written.`, isError: true, meta: { path: edit.path } };
        }
        const before = readFile(ctx.root, edit.path).content;
        const needle = before.includes('\r\n') ? edit.oldString.replace(/\r\n/g, '\n') : edit.oldString;
        const haystack = before.includes('\r\n') ? before.replace(/\r\n/g, '\n') : before;
        const occurrences = needle ? haystack.split(needle).length - 1 : 0;
        if (occurrences === 0) {
          return { content: `Error: old_string not found in ${edit.path}. Nothing was written.`, isError: true, meta: { path: edit.path } };
        }
        if (occurrences > 1 && !edit.replaceAll) {
          return {
            content: `Error: old_string appears ${occurrences} times in ${edit.path}. Nothing was written.`,
            isError: true,
            meta: { path: edit.path, occurrences },
          };
        }
      } catch (err) {
        return { content: `Error validating ${edit.path}: ${(err as Error).message}. Nothing was written.`, isError: true };
      }
    }

    const outcomes: EditOutcome[] = [];
    for (const edit of planned) {
      ctx.snapshot(edit.path);
    }
    for (const edit of planned) {
      const result = applyEdit(ctx.root, edit.path, edit.oldString, edit.newString, edit.replaceAll);
      if (result.ok) outcomes.push(result.outcome);
    }

    const byFile = new Map<string, EditOutcome>();
    for (const outcome of outcomes) {
      const previous = byFile.get(outcome.path);
      byFile.set(outcome.path, previous ? { ...outcome, before: previous.before } : outcome);
    }
    ctx.onOutput?.(`Applied ${outcomes.length} edit(s) across ${byFile.size} file(s)`);
    return {
      content: `Applied ${outcomes.length} edit(s) across ${byFile.size} file(s):\n${outcomes.map((o) => `- ${o.path} (${o.replacements})`).join('\n')}`,
      meta: {
        files: [...byFile.values()].map((o) => ({ path: o.path, before: o.before, after: o.after })),
        edits: outcomes.length,
      },
    };
  },
};

export const writeFileTool: ToolDefinition = {
  mutates: true,
  schema: {
    name: 'write_file',
    description: 'Create a new file, or overwrite an existing one with complete contents. Prefer edit_file or multi_edit for small changes.',
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
      ctx.snapshot(filePath);
      const abs = safeResolve(ctx.root, filePath);
      const existed = fs.existsSync(abs);
      const before = existed ? readFile(ctx.root, filePath).content : '';
      // Preserve CRLF when overwriting a CRLF file with LF content.
      const payload = before.includes('\r\n') && !content.includes('\r\n') ? content.replace(/\n/g, '\r\n') : content;
      writeFile(ctx.root, filePath, payload);
      ctx.onOutput?.(`${existed ? 'Overwrote' : 'Created'} ${toPosix(filePath)}`);
      return {
        content: `${existed ? 'Overwrote' : 'Created'} ${toPosix(filePath)} (${payload.split(/\r?\n/).length} lines).`,
        meta: { path: toPosix(filePath), before, after: payload, created: !existed },
      };
    } catch (err) {
      return { content: `Error writing file: ${(err as Error).message}`, isError: true, meta: { path: filePath } };
    }
  },
};

export const deleteFileTool: ToolDefinition = {
  mutates: true,
  schema: {
    name: 'delete_file',
    description: 'Delete a file or directory (recursively) from the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Workspace-relative path to remove.' } },
      required: ['path'],
    },
  },
  async run(input, ctx) {
    const target = asString(input.path);
    if (!target) return { content: 'Error: path is required.', isError: true };
    try {
      const abs = safeResolve(ctx.root, target);
      if (!fs.existsSync(abs)) return { content: `Error: no such path: ${target}`, isError: true };
      const stat = fs.statSync(abs);
      const before = stat.isFile() ? readFile(ctx.root, target).content : '';
      ctx.snapshot(target);
      fs.rmSync(abs, { recursive: true, force: true });
      ctx.onOutput?.(`Deleted ${toPosix(target)}`);
      return {
        content: `Deleted ${toPosix(target)}${stat.isDirectory() ? ' (directory)' : ''}.`,
        meta: { path: toPosix(target), before, after: '', deleted: true },
      };
    } catch (err) {
      return { content: `Error deleting: ${(err as Error).message}`, isError: true, meta: { path: target } };
    }
  },
};

export const moveFileTool: ToolDefinition = {
  mutates: true,
  schema: {
    name: 'move_file',
    description: 'Move or rename a file or directory within the workspace.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Current workspace-relative path.' },
        to: { type: 'string', description: 'Destination workspace-relative path.' },
      },
      required: ['from', 'to'],
    },
  },
  async run(input, ctx) {
    const from = asString(input.from);
    const to = asString(input.to);
    try {
      const sourceAbs = safeResolve(ctx.root, from);
      const targetAbs = safeResolve(ctx.root, to);
      if (!fs.existsSync(sourceAbs)) return { content: `Error: no such path: ${from}`, isError: true };
      if (fs.existsSync(targetAbs)) return { content: `Error: destination already exists: ${to}`, isError: true };
      const stat = fs.statSync(sourceAbs);
      const before = stat.isFile() ? readFile(ctx.root, from).content : '';
      ctx.snapshot(from);
      ctx.snapshot(to);
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      fs.renameSync(sourceAbs, targetAbs);
      ctx.onOutput?.(`Moved ${toPosix(from)} -> ${toPosix(to)}`);
      return {
        content: `Moved ${toPosix(from)} to ${toPosix(to)}.`,
        meta: { path: toPosix(to), previousPath: toPosix(from), before, after: before, moved: true },
      };
    } catch (err) {
      return { content: `Error moving: ${(err as Error).message}`, isError: true, meta: { path: from } };
    }
  },
};

