import type { AgentSession, CheckpointDiffEntry, CheckpointSummary, FileNode } from '../types';

export interface ProviderPublicInfo {
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  apiKeyConfigured: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
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
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/agents/socket`;
}
