import type { FileNode } from '../types';

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
};

export function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/api/agents/socket`;
}
