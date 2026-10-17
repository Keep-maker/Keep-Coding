import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeResolve, toPosix } from '../services/workspace.js';

/** A single file captured before an agent turn mutated it. */
export interface CheckpointFile {
  path: string;
  /** false when the file did not exist, so restore deletes it. */
  existed: boolean;
  content: string | null;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  /** Transcript item that opened this checkpoint (the user message). */
  messageId: string | null;
  files: Map<string, CheckpointFile>;
  restoredAt?: number;
}

/** Shape sent to the UI; file contents are withheld until a preview is asked for. */
export interface CheckpointSummary {
  id: string;
  sessionId: string;
  label: string;
  createdAt: number;
  messageId: string | null;
  files: string[];
  restoredAt?: number;
}

export interface CheckpointDiff {
  path: string;
  before: string | null;
  after: string | null;
  existedBefore: boolean;
  existsNow: boolean;
}

export interface RestoreResult {
  restored: string[];
  deleted: string[];
  skipped: string[];
}

function readText(abs: string): string | null {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Snapshot store backing the rewind / restore feature.
 *
 * Cursor snapshots a file the first time an agent turn is about to modify it, so
 * a checkpoint holds exactly the pre-turn state of everything that turn touched.
 * Recording lazily on first write keeps this cheap even in large repositories,
 * and restoring rewrites those files (deleting any that did not exist before)
 * without touching the conversation.
 */
class CheckpointManager {
  private readonly bySession = new Map<string, Checkpoint[]>();
  private readonly open = new Map<string, Checkpoint>();

  /** Opens a checkpoint for a new agent turn. */
  begin(sessionId: string, label: string, messageId: string | null): Checkpoint {
    const checkpoint: Checkpoint = {
      id: randomUUID(),
      sessionId,
      label,
      createdAt: Date.now(),
      messageId,
      files: new Map(),
    };
    const list = this.bySession.get(sessionId) ?? [];
    list.push(checkpoint);
    this.bySession.set(sessionId, list);
    this.open.set(sessionId, checkpoint);
    return checkpoint;
  }

  /** Closes the open checkpoint; an empty one is discarded so the timeline stays meaningful. */
  end(sessionId: string): void {
    const checkpoint = this.open.get(sessionId);
    this.open.delete(sessionId);
    if (!checkpoint || checkpoint.files.size > 0) return;
    const list = this.bySession.get(sessionId) ?? [];
    const index = list.findIndex((c) => c.id === checkpoint.id);
    if (index >= 0) list.splice(index, 1);
  }

  /**
   * Records the current on-disk state of a file, once, before it is mutated.
   * Must be called before every write so restore can undo it.
   */
  recordOriginal(root: string, sessionId: string, relative: string): void {
    const checkpoint = this.open.get(sessionId);
    if (!checkpoint) return;
    const rel = toPosix(relative);
    if (checkpoint.files.has(rel)) return;

    const abs = safeResolve(root, rel);
    const existed = fs.existsSync(abs);
    checkpoint.files.set(rel, {
      path: rel,
      existed,
      content: existed && fs.statSync(abs).isFile() ? readText(abs) : null,
    });
  }

  list(sessionId: string): CheckpointSummary[] {
    return (this.bySession.get(sessionId) ?? []).map((c) => ({
      id: c.id,
      sessionId: c.sessionId,
      label: c.label,
      createdAt: c.createdAt,
      messageId: c.messageId,
      files: [...c.files.keys()],
      restoredAt: c.restoredAt,
    }));
  }

  get(sessionId: string, id: string): Checkpoint | undefined {
    return (this.bySession.get(sessionId) ?? []).find((c) => c.id === id);
  }

  /** Diffs the snapshot against what is on disk right now. */
  preview(root: string, sessionId: string, id: string): CheckpointDiff[] {
    const checkpoint = this.get(sessionId, id);
    if (!checkpoint) throw new Error(`Unknown checkpoint: ${id}`);
    return [...checkpoint.files.values()].map((file) => {
      const abs = safeResolve(root, file.path);
      const existsNow = fs.existsSync(abs);
      return {
        path: file.path,
        before: file.content,
        after: existsNow ? readText(abs) : null,
        existedBefore: file.existed,
        existsNow,
      };
    });
  }

  /** Rewrites the snapshotted files. Restoring twice is a no-op. */
  restore(root: string, sessionId: string, id: string): RestoreResult {
    const checkpoint = this.get(sessionId, id);
    if (!checkpoint) throw new Error(`Unknown checkpoint: ${id}`);

    const result: RestoreResult = { restored: [], deleted: [], skipped: [] };
    for (const file of checkpoint.files.values()) {
      const abs = safeResolve(root, file.path);
      try {
        if (file.existed && typeof file.content === 'string') {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, file.content, 'utf8');
          result.restored.push(file.path);
        } else if (!file.existed) {
          if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
          result.deleted.push(file.path);
        } else {
          // Existed but unreadable (binary): we cannot faithfully restore it.
          result.skipped.push(file.path);
        }
      } catch {
        result.skipped.push(file.path);
      }
    }
    checkpoint.restoredAt = Date.now();
    return result;
  }

  dropSession(sessionId: string): void {
    this.bySession.delete(sessionId);
    this.open.delete(sessionId);
  }
}

export const checkpoints = new CheckpointManager();
