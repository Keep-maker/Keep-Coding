import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Sampling temperature for the agent loop. */
  temperature: number;
  maxTokens: number;
  /** Maximum number of agent loop steps before we stop (tool-call rounds). */
  maxSteps: number;
  /** Milliseconds before a shell command is killed. */
  commandTimeoutMs: number;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  /** Default workspace opened by the web UI when none is given. */
  defaultWorkspace: string;
  provider: ProviderConfig;
}

const ROOT = process.cwd();
const DATA_DIR = process.env.CURSOR_FORK_DATA_DIR ?? path.join(ROOT, '.data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const dotenv = readDotEnv();

/** Settings the user can edit at runtime from the web UI. */
export interface StoredSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function readStoredSettings(): StoredSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as StoredSettings;
  } catch {
    return {};
  }
}

export function writeStoredSettings(patch: StoredSettings): StoredSettings {
  const next = { ...readStoredSettings(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function envOr(name: string, fallback: string): string {
  return process.env[name] ?? dotenv[name] ?? fallback;
}

function defaultWorkspace(): string {
  const configured = envOr('CURSOR_FORK_WORKSPACE', '');
  if (configured) return path.resolve(configured);
  // Ships with the repo so a fresh clone opens a working project instead of an
  // empty folder. `workspaces/` stays gitignored for user-created checkouts.
  const bundled = path.join(ROOT, 'examples', 'demo-project');
  if (fs.existsSync(bundled)) return bundled;
  const dir = path.join(ROOT, 'workspaces', 'demo-project');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadProvider(): ProviderConfig {
  const stored = readStoredSettings();
  return {
    baseUrl: stored.baseUrl ?? envOr('CURSOR_FORK_BASE_URL', 'https://api.deepseek.com/v1'),
    // NOTE: placeholder on purpose - set CURSOR_FORK_API_KEY, .env, or the in-app Settings dialog.
    apiKey: stored.apiKey ?? envOr('CURSOR_FORK_API_KEY', 'sk-xxx'),
    model: stored.model ?? envOr('CURSOR_FORK_MODEL', 'deepseek-flash'),
    temperature: Number(envOr('CURSOR_FORK_TEMPERATURE', '0.1')),
    maxTokens: Number(envOr('CURSOR_FORK_MAX_TOKENS', '8000')),
    maxSteps: Number(envOr('CURSOR_FORK_MAX_STEPS', '40')),
    commandTimeoutMs: Number(envOr('CURSOR_FORK_COMMAND_TIMEOUT_MS', String(120_000))),
  };
}

export const config: AppConfig = {
  port: Number(envOr('CURSOR_FORK_PORT', '8787')),
  dataDir: DATA_DIR,
  defaultWorkspace: defaultWorkspace(),
  provider: loadProvider(),
};

/** Provider settings are re-read on every request so UI edits apply immediately. */
export function providerConfig(): ProviderConfig {
  config.provider = loadProvider();
  return config.provider;
}

export function publicProviderInfo() {
  const p = providerConfig();
  const key = p.apiKey;
  const masked =
    !key || key === 'sk-xxx'
      ? null
      : key.length <= 10
        ? `${key.slice(0, 3)}***`
        : `${key.slice(0, 6)}***${key.slice(-4)}`;
  return {
    baseUrl: p.baseUrl,
    model: p.model,
    apiKeyMasked: masked,
    apiKeyConfigured: Boolean(masked),
  };
}

export const appPaths = {
  root: ROOT,
  dataDir: DATA_DIR,
  settingsFile: SETTINGS_FILE,
  home: os.homedir(),
};

