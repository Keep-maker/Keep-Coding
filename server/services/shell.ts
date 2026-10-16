import { spawn } from 'node:child_process';
import { config } from '../config.js';

export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

const MAX_OUTPUT = 40_000;

function clamp(text: string): string {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n... [output truncated]` : text;
}

/**
 * Runs a shell command inside the workspace. Commands are executed with the
 * workspace as cwd and are killed after the configured timeout.
 */
export function runCommand(cwd: string, command: string, timeoutMs = config.provider.commandTimeoutMs): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/bash';
    const args = isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command];

    const child = spawn(shell, args, {
      cwd,
      env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill(isWindows ? undefined : 'SIGKILL');
      if (isWindows) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: -1,
        stdout: clamp(stdout),
        stderr: clamp(`${stderr}\n${err.message}`),
        durationMs: Date.now() - started,
        timedOut,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: code,
        stdout: clamp(stdout),
        stderr: clamp(stderr),
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}
