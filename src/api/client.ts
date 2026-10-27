import type { AgentSession, CheckpointDiffEntry, CheckpointSummary, FileNode } from '../types';

export interface ProviderPublicInfo {
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  apiKeyConfigured: boolean;
}

/**
 * When the UI is served from a static host (Cloudflare Pages) the Express API
 * lives on another origin. VITE_API_BASE points at it, e.g.
 *   VITE_API_BASE=https://keep-coding-api.example.com
 * Leave it unset for local development, where Vite proxies /api.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

const TOKEN_STORAGE_KEY = 'keep-coding.token';

/** The shared access token. Never bundled - the user pastes it at login. */
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* private mode - the session simply will not persist */
  }
}

/** Raised when the server rejects the token so the UI can show the login screen. */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_BASE + url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (response.status === 401) {
    const body = await response.text().catch(() => '');
    let message = 'Unauthorized';
    try {
      message = JSON.parse(body)?.error ?? message;
    } catch {
      /* keep the default */
    }
    throw new UnauthorizedError(message);
  }
  const text = await response.text();
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(json?.error ?? `Request failed: ${response.status} ${response.statusText}`);
  }
  return json as T;
}

export const api = {
  /** Unauthenticated liveness probe used before the token is known. */
  ping: () => request<{ ok: boolean; authRequired: boolean; name: string }>('/api/ping'),

  health: () =>
    request<{ ok: boolean; defaultWorkspace: string; provider: ProviderPublicInfo; platform: string }>('/api/health'),

  settings: () => request<ProviderPublicInfo & { stored: Record<string, unknown> }>('/api/settings'),
  saveSettings: (patch: { apiKey?: string; baseUrl?: string; model?: string }) =>
    request<ProviderPublicInfo>('/api/settings', { method: 'POST', body: JSON.stringify(patch) }),
  testSettings: () =>
    request<{ ok: boolean; latencyMs: number; sample: string }>('/api/settings/test', { method: 'POST' }),

  tree: (root: string) => request<{ root: string; tree: FileNode }>(`/api/workspace/tree?root=${encodeURIComponent(root)}`),
  search: (root: string, body: Record<string, unknown>) =>
    request<{ hits: { path: string; line: number; column: number; preview: string }[]; total: number }>(
      `/api/workspace/search?root=${encodeURIComponent(root)}`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  file: (root: string, path: string) =>
    request<{ path: string; content: string; language: string; size: number; truncated: boolean; modified: number }>(
      `/api/workspace/file?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
    ),
  saveFile: (root: string, path: string, content: string) =>
    request<{ path: string; bytes: number; savedAt: number }>('/api/workspace/file', {
      method: 'PUT',
      body: JSON.stringify({ root, path, content }),
    }),
  quickOpen: (root: string, q: string) =>
    request<{ files: { path: string; score: number }[] }>(
      `/api/workspace/files?root=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}`,
    ),
  createEntry: (root: string, path: string, type: 'file' | 'directory') =>
    request<{ path: string }>('/api/workspace/create', { method: 'POST', body: JSON.stringify({ root, path, type }) }),
  deleteEntry: (root: string, path: string) =>
    request<{ deleted: boolean }>('/api/workspace/delete', { method: 'POST', body: JSON.stringify({ root, path }) }),

  /** Agents ---------------------------------------------------------------- */
  sessions: () => request<{ sessions: AgentSession[] }>('/api/agents/sessions'),
  session: (id: string) => request<{ session: AgentSession }>(`/api/agents/sessions/${id}`),
  createSession: (root: string, title?: string) =>
    request<{ session: AgentSession }>('/api/agents/sessions', {
      method: 'POST',
      body: JSON.stringify({ root, title }),
    }),
  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/api/agents/sessions/${id}`, { method: 'DELETE' }),

  /** Branch a session at (and including) a transcript item. */
  forkSession: (id: string, itemId: string | null, title?: string) =>
    request<{ session: AgentSession }>(`/api/agents/sessions/${id}/fork`, {
      method: 'POST',
      body: JSON.stringify({ itemId, title }),
    }),
  /** Drop the item with this id and everything after it. */
  truncateSession: (id: string, itemId: string) =>
    request<{ session: AgentSession }>(`/api/agents/sessions/${id}/truncate`, {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    }),
  /** Rewrite a user message and drop the rest of the conversation. */
  editMessage: (id: string, itemId: string, text: string) =>
    request<{ session: AgentSession }>(`/api/agents/sessions/${id}/messages/${itemId}`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  /** Removes one transcript item without touching the rest of the conversation. */
  deleteMessage: (id: string, itemId: string) =>
    request<{ session: AgentSession }>(`/api/agents/sessions/${id}/items/${itemId}`, { method: 'DELETE' }),
  answerQuestion: (id: string, callId: string, selected: string[], note?: string) =>
    request<{ ok: boolean }>(`/api/agents/sessions/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ callId, selected, note }),
    }),

  checkpoints: (id: string) =>
    request<{ checkpoints: CheckpointSummary[] }>(`/api/agents/sessions/${id}/checkpoints`),
  checkpointDiff: (id: string, checkpointId: string) =>
    request<{ diff: CheckpointDiffEntry[] }>(`/api/agents/sessions/${id}/checkpoints/${checkpointId}`),
  restoreCheckpoint: (id: string, checkpointId: string) =>
    request<{ result: { restored: string[]; deleted: string[]; skipped: string[] } }>(
      `/api/agents/sessions/${id}/checkpoints/${checkpointId}/restore`,
      { method: 'POST' },
    ),

  customize: (root: string) => request<CustomizeCatalog>(`/api/customize?root=${encodeURIComponent(root)}`),
};

export interface CustomizeCatalog {
  skills: { name: string; description?: string; source: string; file: string }[];
  rules: { name: string; description?: string; globs: string[]; activation?: string; source: string; file: string }[];
  hooks: { stage: string; command: string; matcher?: string }[];
  tools: { name: string; group: string; description: string }[];
}

export function socketUrl(): string {
  const base = API_BASE || `${location.protocol}//${location.host}`;
  const url = new URL('/api/agents/socket', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  if (token) url.searchParams.set('token', token);
  return url.toString();
}
