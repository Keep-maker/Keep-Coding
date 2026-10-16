import { useSyncExternalStore } from 'react';
import { api, type ProviderPublicInfo } from '../api/client';
import { agentSocket, type AgentSocketEvent } from '../api/agentSocket';
import type { AgentSession, ChangedFile, FileNode, OpenFile, WindowMode } from '../types';

export interface AppState {
  ready: boolean;
  mode: WindowMode;
  root: string;
  tree: FileNode | null;
  openFiles: OpenFile[];
  activePath: string | null;
  expanded: Record<string, boolean>;
  changedFiles: ChangedFile[];
  sessions: AgentSession[];
  activeSessionId: string | null;
  provider: ProviderPublicInfo | null;
  toast: { level: 'info' | 'error'; text: string } | null;
  settingsOpen: boolean;
  diffOpen: boolean;
}

const initialState: AppState = {
  ready: false,
  mode: 'editor',
  root: '',
  tree: null,
  openFiles: [],
  activePath: null,
  expanded: {},
  changedFiles: [],
  sessions: [],
  activeSessionId: null,
  provider: null,
  toast: null,
  settingsOpen: false,
  diffOpen: false,
};

type Listener = () => void;

class AppStore {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();
  private saveTimers = new Map<string, number>();
  private socketBound = false;
  private lastSettledSession: string | null = null;

  getSnapshot = (): AppState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  async bootstrap(): Promise<void> {
    this.bindSocket();
    try {
      const health = await api.health();
      this.set({ root: health.defaultWorkspace, provider: health.provider });
      await this.refreshTree();
      const { sessions } = await fetch('/api/agents/sessions').then((r) => r.json());
      const list = (sessions ?? []) as AgentSession[];
      this.set({ sessions: list });
      if (list.length) {
        this.setActiveSession(list[0].id);
      }
      this.set({ ready: true });
    } catch (err) {
      this.set({ ready: true, toast: { level: 'error', text: `Startup failed: ${(err as Error).message}` } });
    }
  }

  private bindSocket(): void {
    if (this.socketBound) return;
    this.socketBound = true;
    agentSocket.connect();
    agentSocket.on((event: AgentSocketEvent) => {
      if (event.type === 'session' || event.type === 'event') {
        if (!event.session) return;
        this.upsertSession(event.session);
      } else if (event.type === 'error') {
        this.set({ toast: { level: 'error', text: event.message } });
      }
    });
  }

  private upsertSession(session: AgentSession): void {
    const sessions = [...this.state.sessions];
    const index = sessions.findIndex((s) => s.id === session.id);
    if (index >= 0) sessions[index] = session;
    else sessions.unshift(session);
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    const changed = this.collectChanges(sessions);
    this.set({ sessions, changedFiles: changed });
    // If an agent edited the file currently open, reflect it in the editor.
    this.syncOpenFileWithAgent(changed);
    // Agents create and delete files, so refresh the explorer once a run settles.
    const settled = ['done', 'error', 'aborted'].includes(session.status);
    if (settled && Boolean(session.items.length) && this.lastSettledSession !== session.id + session.updatedAt) {
      this.lastSettledSession = session.id + session.updatedAt;
      void this.refreshTree();
    }
  }

  private collectChanges(sessions: AgentSession[]): ChangedFile[] {
    const byPath = new Map<string, ChangedFile>();
    for (const session of sessions) {
      for (const item of session.items) {
        if (item.kind !== 'tool' || item.status === 'running') continue;
        const meta = item.meta;
        if (!meta || typeof meta.path !== 'string') continue;
        if (typeof meta.after !== 'string') continue;
        byPath.set(meta.path, {
          path: meta.path,
          before: typeof meta.before === 'string' ? meta.before : '',
          after: meta.after,
          created: Boolean(meta.created),
          at: item.at,
        });
      }
    }
    return [...byPath.values()].sort((a, b) => b.at - a.at);
  }

  /** Adopt agent edits for files the user has open and has not modified locally. */
  private syncOpenFileWithAgent(changes: ChangedFile[]): void {
    const openFiles = this.state.openFiles.map((file) => {
      const change = changes.find((c) => c.path === file.path);
      if (!change) return file;
      const isPristine = file.content === file.savedContent && !file.loading;
      if (!isPristine) return file;
      return { ...file, content: change.after, savedContent: change.after };
    });
    this.set({ openFiles });
  }

  dismissToast(): void {
    this.set({ toast: null });
  }

  setToast(level: 'info' | 'error', text: string): void {
    this.set({ toast: { level, text } });
    window.setTimeout(() => {
      if (this.state.toast?.text === text) this.set({ toast: null });
    }, 6000);
  }

  setMode(mode: WindowMode): void {
    this.set({ mode });
  }

  toggleSettings(open?: boolean): void {
    this.set({ settingsOpen: open ?? !this.state.settingsOpen });
  }

  toggleDiff(open?: boolean): void {
    this.set({ diffOpen: open ?? !this.state.diffOpen });
  }

  async saveProvider(patch: { apiKey?: string; baseUrl?: string; model?: string }): Promise<void> {
    const provider = await api.saveSettings(patch);
    this.set({ provider });
  }

  async refreshTree(): Promise<void> {
    const { root } = this.state;
    if (!root) return;
    const { tree } = await api.tree(root);
    const expanded = { ...this.state.expanded };
    // Auto-expand top level so the tree is not an empty shell on first load.
    for (const child of tree.children ?? []) {
      if (child.type === 'directory' && expanded[child.path] === undefined) expanded[child.path] = false;
    }
    this.set({ tree, expanded });
  }

  toggleDir(path: string): void {
    this.set({ expanded: { ...this.state.expanded, [path]: !this.state.expanded[path] } });
  }

  setExpanded(path: string, value: boolean): void {
    this.set({ expanded: { ...this.state.expanded, [path]: value } });
  }

  async openFile(path: string): Promise<void> {
    if (this.state.openFiles.some((f) => f.path === path)) {
      const existing = this.state.openFiles.find((f) => f.path === path)!;
      if (existing.error) {
        await this.reloadFile(path, existing);
      } else {
        this.set({ activePath: path });
      }
      return;
    }

    const name = path.split('/').pop() ?? path;
    const placeholder: OpenFile = {
      path,
      name,
      language: 'plaintext',
      content: '',
      savedContent: '',
      loading: true,
    };
    this.set({ openFiles: [...this.state.openFiles, placeholder], activePath: path });
    await this.reloadFile(path, placeholder);
  }

  private async reloadFile(path: string, placeholder: OpenFile): Promise<void> {
    try {
      const file = await api.file(this.state.root, path);
      const settled: OpenFile = {
        path: file.path,
        name: path.split('/').pop() ?? path,
        language: file.language,
        content: file.content,
        savedContent: file.content,
      };
      const openFiles = this.state.openFiles.map((f) => (f.path === path ? settled : f));
      this.set({ openFiles, activePath: path });
    } catch (err) {
      const failed: OpenFile = { ...placeholder, loading: false, error: (err as Error).message };
      const openFiles = this.state.openFiles.map((f) => (f.path === path ? failed : f));
      this.set({ openFiles, activePath: path });
      this.setToast('error', (err as Error).message);
    }
  }

  setFileContent(path: string, content: string): void {
    const openFiles = this.state.openFiles.map((f) => (f.path === path ? { ...f, content } : f));
    this.set({ openFiles });
    this.queueSave(path);
  }

  private queueSave(path: string): void {
    const existing = this.saveTimers.get(path);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => void this.saveFile(path), 700);
    this.saveTimers.set(path, timer);
  }

  async saveFile(path: string): Promise<void> {
    const file = this.state.openFiles.find((f) => f.path === path);
    if (!file || file.content === file.savedContent) return;
    try {
      await api.saveFile(this.state.root, path, file.content);
      const savedContent = file.content;
      const openFiles = this.state.openFiles.map((f) => (f.path === path ? { ...f, savedContent } : f));
      this.set({ openFiles });
    } catch (err) {
      this.setToast('error', `Could not save ${path}: ${(err as Error).message}`);
    }
  }

  closeFile(path: string): void {
    const openFiles = this.state.openFiles.filter((f) => f.path !== path);
    let activePath = this.state.activePath;
    if (activePath === path) {
      const index = this.state.openFiles.findIndex((f) => f.path === path);
      const next = openFiles[Math.min(index, openFiles.length - 1)] ?? openFiles[openFiles.length - 1];
      activePath = next?.path ?? null;
    }
    this.set({ openFiles, activePath });
  }

  setActiveFile(path: string): void {
    this.set({ activePath: path });
  }

  async createEntry(parentDir: string, name: string, type: 'file' | 'directory'): Promise<void> {
    const rel = parentDir ? `${parentDir}/${name}` : name;
    try {
      await api.createEntry(this.state.root, rel, type);
      await this.refreshTree();
      if (type === 'file') await this.openFile(rel);
    } catch (err) {
      this.setToast('error', (err as Error).message);
    }
  }

  async deleteEntry(path: string): Promise<void> {
    try {
      await api.deleteEntry(this.state.root, path);
      const openFiles = this.state.openFiles.filter((f) => !f.path.startsWith(`${path}/`) && f.path !== path);
      this.set({ openFiles });
      await this.refreshTree();
    } catch (err) {
      this.setToast('error', (err as Error).message);
    }
  }

  setActiveSession(id: string): void {
    this.set({ activeSessionId: id });
    agentSocket.attach(id);
  }

  async newSession(root?: string): Promise<AgentSession> {
    const response = await fetch('/api/agents/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: root ?? this.state.root }),
    });
    const { session } = (await response.json()) as { session: AgentSession };
    this.upsertSession(session);
    this.setActiveSession(session.id);
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await fetch(`/api/agents/sessions/${id}`, { method: 'DELETE' });
    const sessions = this.state.sessions.filter((s) => s.id !== id);
    const activeSessionId = this.state.activeSessionId === id ? (sessions[0]?.id ?? null) : this.state.activeSessionId;
    this.set({ sessions, activeSessionId });
    if (activeSessionId) agentSocket.attach(activeSessionId);
  }

  sendPrompt(prompt: string, instructions?: string): void {
    const id = this.state.activeSessionId;
    if (!id) return;
    agentSocket.start(id, prompt, instructions);
  }

  abortActive(): void {
    const id = this.state.activeSessionId;
    if (id) agentSocket.abort(id);
  }

  /** Called after an agent run so newly created files appear in the tree. */
  async refreshAfterAgent(): Promise<void> {
    await this.refreshTree();
  }
}

export const store = new AppStore();

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

