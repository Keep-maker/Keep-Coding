import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Stages of the agent loop a hook can attach to. */
export type HookStage =
  | 'session_start'
  | 'before_tool'
  | 'after_tool'
  | 'before_submit'
  | 'after_edit';

export interface HookDefinition {
  stage: HookStage;
  command: string;
  /** Optional matcher applied to the tool name. */
  matcher?: string;
  timeoutMs?: number;
}

export interface HookPayload {
  hook: HookStage;
  sessionId: string;
  root: string;
  tool?: { name: string; args: Record<string, unknown> };
  result?: { content: string; isError: boolean };
  timestamp: number;
}

export interface HookOutcome {
  /** When set, the tool call is refused and this text becomes the tool result. */
  block?: string;
  /** Text appended to the tool result (or injected as context). */
  additionalContext?: string;
  /** Replacement arguments, letting a hook rewrite a tool call. */
  modifiedArgs?: Record<string, unknown>;
  /** Raw stdout for debugging. */
  stdout?: string;
  failed?: boolean;
}

const FILE_NAMES = ['hooks.json', path.join('.cursor', 'hooks.json')];

function parseHooks(raw: string): HookDefinition[] {
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.hooks ?? []);
    return list
      .filter((hook: any) => hook && typeof hook.command === 'string' && typeof hook.stage === 'string')
      .map((hook: any) => ({
        stage: hook.stage as HookStage,
        command: hook.command,
        matcher: typeof hook.matcher === 'string' ? hook.matcher : undefined,
        timeoutMs: Number.isFinite(hook.timeoutMs) ? Number(hook.timeoutMs) : 10_000,
      }));
  } catch {
    return [];
  }
}

/**
 * Loads hooks from `.cursor/hooks.json`. Cursor also reads a user-level file and
 * installs hooks through plugins; the project file covers the common case.
 */
export function discoverHooks(root: string): HookDefinition[] {
  const out: HookDefinition[] = [];
  for (const relative of FILE_NAMES) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    try {
      out.push(...parseHooks(fs.readFileSync(file, 'utf8')));
    } catch {
      /* ignore unreadable hook config */
    }
  }
  return out;
}

function matches(hook: HookDefinition, toolName?: string): boolean {
  if (!hook.matcher) return true;
  if (!toolName) return false;
  if (hook.matcher === '*' || hook.matcher === toolName) return true;
  try {
    return new RegExp(hook.matcher).test(toolName);
  } catch {
    return false;
  }
}

/**
 * Runs a hook as a spawned process exchanging JSON over stdio: the payload goes
 * in on stdin, and the process may reply on stdout with
 * `{ "block": ..., "additionalContext": ..., "modifiedArgs": ... }`.
 *
 * A failing or timing-out hook never blocks the run - it degrades to a warning,
 * so a broken hook cannot wedge the agent.
 */
export function runHook(hook: HookDefinition, payload: HookPayload): Promise<HookOutcome> {
  return new Promise((resolve) => {
    const child = spawn(hook.command, {
      shell: true,
      cwd: payload.root,
      windowsHide: true,
    });

    let stdout = '';
    let settled = false;
    const finish = (outcome: HookOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ failed: true, stdout, additionalContext: `Hook timed out after ${hook.timeoutMs}ms.` });
    }, hook.timeoutMs ?? 10_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => finish({ failed: true }));
    child.on('close', (code) => {
      if (code !== 0) {
        finish({ failed: true, stdout });
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        finish({ stdout });
        return;
      }
      // Accept either a single JSON object or NDJSON, using the last object.
      const lines = trimmed.split(/\r?\n/).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          const parsed = JSON.parse(lines[i]);
          finish({
            block: typeof parsed.block === 'string' ? parsed.block : undefined,
            additionalContext:
              typeof parsed.additionalContext === 'string'
                ? parsed.additionalContext
                : typeof parsed.additional_context === 'string'
                  ? parsed.additional_context
                  : undefined,
            modifiedArgs: parsed.modifiedArgs ?? parsed.modified_args,
            stdout,
          });
          return;
        } catch {
          /* try the previous line */
        }
      }
      finish({ stdout });
    });

    try {
      child.stdin?.end(JSON.stringify(payload));
    } catch {
      finish({ failed: true });
    }
  });
}

/** Runs every hook for a stage, in order, stopping at the first that blocks. */
export async function runStage(
  hooks: HookDefinition[],
  stage: HookStage,
  payload: Omit<HookPayload, 'hook' | 'timestamp'>,
): Promise<HookOutcome> {
  const combined: HookOutcome = {};
  for (const hook of hooks) {
    if (hook.stage !== stage) continue;
    if (!matches(hook, payload.tool?.name)) continue;
    const outcome = await runHook(hook, { ...payload, hook: stage, timestamp: Date.now() });
    if (outcome.additionalContext) {
      combined.additionalContext = [combined.additionalContext, outcome.additionalContext].filter(Boolean).join('\n');
    }
    if (outcome.modifiedArgs) combined.modifiedArgs = { ...combined.modifiedArgs, ...outcome.modifiedArgs };
    combined.stdout = outcome.stdout ?? combined.stdout;
    if (outcome.block) {
      combined.block = outcome.block;
      return combined;
    }
  }
  return combined;
}
