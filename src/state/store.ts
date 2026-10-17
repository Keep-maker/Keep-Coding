import { useSyncExternalStore } from 'react';
import { api, type ProviderPublicInfo } from '../api/client';
import { agentSocket, type AgentSocketEvent } from '../api/agentSocket';
import type {
  AgentSession,
  ChangedFile,
  CheckpointSummary,
  FileNode,
  OpenFile,
  TranscriptItem,
  WindowMode,
} from '../types';

export interface RunOptions {
  instructions?: string;
  mode?: string;
  skills?: string[];
}

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
  customizeOpen: boolean;
  /** Checkpoints per session id, newest last. */
  checkpoints: Record<string, CheckpointSummary[]>;
  /** Item id the user is editing inline. */
  editingItemId: string | null;
  /** Set when a file should be scrolled to a specific line after opening. */
  pendingReveal: { path: string; line: number; at: number } | null;
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
  customizeOpen: false,
  checkpoints: {},
  editingItemId: null,
  pendingReveal: null,
};

type Listener = () => void;

class AppStore {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();
  private saveTimers = new Map<string, number>();
  private socketBound = false;
  private lastSettledSession: string | null = null;
  /** Remembers the run options per session so edit-and-rerun keeps the mode. */
  private runOptions = new Map<string, RunOptions>();

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
      const { sessions } = await api.sessions();
      const list = (sessions ?? []) as unknown as AgentSession[];
      this.set({ sessions: list });
      if (list.length) this.setActiveSession(list[0].id);
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
    this.syncOpenFileWithAgent(changed);
    const settled = ['done', 'error', 'aborted'].includes(session.status);
    if (settled && Boolean(session.items.length)) {
      const key = `${session.id}:${session.updatedAt}`;
      if (this.lastSettledSession !== key) {
        this.lastSettledSession = key;
        void this.refreshTree();
        void this.refreshCheckpoints(session.id);
      }
    }
  }

  private collectChanges(sessions: AgentSession[]): ChangedFile[] {
    const byPath = new Map<string, ChangedFile>();
    for (const session of sessions) {
      for (const item of session.items) {
        if (item.kind !== 'tool' || item.status === 'running') continue;
        const meta = item.meta;
        if (!meta) continue;
        // multi_edit reports one meta entry per file.
        const files = Array.isArray(meta.files) ? (meta.files as Record<string, unknown>[]) : [];
        if (files.length) {
          for (const file of files) {
            if (typeof file.path !== 'string' || typeof file.after !== 'string') continue;
            byPath.set(file.path, {
              path: file.path,
              before: typeof file.before === 'string' ? file.before : '',
              after: file.after,
              created: Boolean(file.created),
              at: item.at,
            });
          }
          continue;
        }
        if (typeof meta.path !== 'string') continue;
        // move_file: the destination holds the content, the source is gone.
        if (meta.moved && typeof meta.previousPath === 'string') {
          byPath.set(meta.previousPath, {
            path: meta.previousPath,
            before: typeof meta.before === 'string' ? meta.before : '',
            after: '',
            at: item.at,
          });
        }
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
    let touched = false;
    const openFiles = this.state.openFiles.map((file) => {
      const change = changes.find((c) => c.path === file.path);
      if (!change) return file;
      const isPristine = file.content === file.savedContent && !file.loading;
      if (!isPristine) return file;
      if (file.content === change.after) return file;
      touched = true;
      return { ...file, content: change.after, savedContent: change.after };
    });
    if (touched) this.set({ openFiles });
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

  toggleCustomize(open?: boolean): void {
    this.set({ customizeOpen: open ?? !this.state.customizeOpen });
  }

  toggleDiff(open?: boolean): void {
    this.set({ diffOpen: open ?? !this.state.diffOpen });
  }

  setEditingItem(itemId: string | null): void {
    this.set({ editingItemId: itemId });
  }

  /** Called by the editor once it has scrolled to the requested line. */
  clearPendingReveal(): void {
    if (this.state.pendingReveal) this.set({ pendingReveal: null });
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

  async openFile(path: string, line?: number): Promise<void> {
    this.set({ pendingReveal: line ? { path, line, at: Date.now() } : this.state.pendingReveal });
    if (this.state.openFiles.some((f) => f.path === path)) {
      const existing = this.state.openFiles.find((f) => f.path === path)!;
      if (existing.error) {
        await this.reloadFile(path, existing);
      } else {
        this.set({ activePath: path, mode: 'editor' });
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
    this.set({ openFiles: [...this.state.openFiles, placeholder], activePath: path, mode: 'editor' });
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

  /** Re-reads every open file from disk; used after a checkpoint restore. */
  async reloadOpenFiles(): Promise<void> {
    const files = [...this.state.openFiles];
    for (const file of files) {
      try {
        const fresh = await api.file(this.state.root, file.path);
        const openFiles = this.state.openFiles.map((f) =>
          f.path === file.path ? { ...f, content: fresh.content, savedContent: fresh.content, error: undefined } : f,
        );
        this.set({ openFiles });
      } catch {
        const openFiles = this.state.openFiles.filter((f) => f.path !== file.path);
        this.set({ openFiles });
      }
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
    void this.refreshCheckpoints(id);
  }

  get activeSession(): AgentSession | null {
    return this.state.sessions.find((s) => s.id === this.state.activeSessionId) ?? null;
  }

  async newSession(root?: string): Promise<AgentSession> {
    const { session } = await api.createSession(root ?? this.state.root);
    this.upsertSession(session);
    this.setActiveSession(session.id);
    this.set({ checkpoints: { ...this.state.checkpoints, [session.id]: [] } });
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await api.deleteSession(id);
    const sessions = this.state.sessions.filter((s) => s.id !== id);
    const activeSessionId = this.state.activeSessionId === id ? (sessions[0]?.id ?? null) : this.state.activeSessionId;
    this.set({ sessions, activeSessionId });
    if (activeSessionId) agentSocket.attach(activeSessionId);
  }

  sendPrompt(prompt: string, options?: RunOptions): void {
    const id = this.state.activeSessionId;
    if (!id) return;
    if (options) this.runOptions.set(id, options);
    const effective = options ?? this.runOptions.get(id);
    agentSocket.start(id, prompt, effective);
  }

  abortActive(): void {
    const id = this.state.activeSessionId;
    if (id) agentSocket.abort(id);
  }

  /** Removes a single transcript item. */
  async deleteMessage(itemId: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      const { session } = await api.deleteMessage(id, itemId);
      this.upsertSession(session);
    } catch (err) {
      this.setToast('error', `Could not delete the message: ${(err as Error).message}`);
    }
  }

  /** Copies the whole visible conversation as markdown. */
  async copyConversation(): Promise<void> {
    const session = this.activeSession;
    if (!session) return;
    const speaker = (item: TranscriptItem): string => {
      if (item.kind === 'user') return 'You';
      if (item.kind === 'assistant') return 'Agent';
      if (item.kind === 'subagent') return 'Sub-agent';
      if (item.kind === 'question') return 'Agent';
      return 'Tool';
    };
    const body = (session.items ?? [])
      .map((item) => `### ${speaker(item)}\n\n${itemText(item)}`)
      .join('\n\n');
    await this.copyText(`# ${session.title}\n\n${body}`, 'Conversation copied as Markdown');
  }

  /** Rewrites a user message, drops the tail, and immediately re-runs it. */
  async editAndRerun(itemId: string, text: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      const { session } = await api.editMessage(id, itemId, text);
      this.upsertSession(session);
      this.set({ editingItemId: null });
      const options = this.runOptions.get(id);
      agentSocket.start(id, text, options);
    } catch (err) {
      this.setToast('error', `Could not edit message: ${(err as Error).message}`);
    }
  }

  /** Drops this item and everything after it, leaving the files untouched. */
  async truncateTo(itemId: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      const { session } = await api.truncateSession(id, itemId);
      this.upsertSession(session);
      this.setToast('info', 'Rewound the conversation. Files on disk were left as they are.');
    } catch (err) {
      this.setToast('error', `Could not rewind: ${(err as Error).message}`);
    }
  }

  /** Drops this item and everything after it, then re-runs the previous user turn. */
  async regenerate(): Promise<void> {
    const session = this.activeSession;
    if (!session) return;
    const lastUser = [...session.items].reverse().find((i) => i.kind === 'user');
    if (!lastUser || lastUser.kind !== 'user') return;
    try {
      const { session: truncated } = await api.truncateSession(session.id, lastUser.id);
      this.upsertSession(truncated);
      const options = this.runOptions.get(session.id);
      agentSocket.start(session.id, lastUser.text, options);
    } catch (err) {
      this.setToast('error', `Could not regenerate: ${(err as Error).message}`);
    }
  }

  async forkFrom(itemId: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      const { session } = await api.forkSession(id, itemId);
      this.upsertSession(session);
      this.setActiveSession(session.id);
      this.setToast('info', 'Forked into a new agent. The original conversation is untouched.');
    } catch (err) {
      this.setToast('error', `Could not fork: ${(err as Error).message}`);
    }
  }

  async answerQuestion(callId: string, selected: string[], note?: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      await api.answerQuestion(id, callId, selected, note);
    } catch (err) {
      this.setToast('error', `Could not send the answer: ${(err as Error).message}`);
    }
  }

  async refreshCheckpoints(sessionId: string): Promise<void> {
    try {
      const { checkpoints } = await api.checkpoints(sessionId);
      this.set({ checkpoints: { ...this.state.checkpoints, [sessionId]: checkpoints } });
    } catch {
      /* a session with no checkpoints yet is not an error */
    }
  }

  checkpointFor(sessionId: string, itemId: string): CheckpointSummary | null {
    const list = this.state.checkpoints[sessionId] ?? [];
    return list.find((c) => c.messageId === itemId) ?? null;
  }

  async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    try {
      const { result } = await api.restoreCheckpoint(sessionId, checkpointId);
      await this.reloadOpenFiles();
      await this.refreshTree();
      await this.refreshCheckpoints(sessionId);
      const parts = [
        result.restored.length ? `${result.restored.length} file(s) restored` : '',
        result.deleted.length ? `${result.deleted.length} file(s) removed` : '',
        result.skipped.length ? `${result.skipped.length} skipped` : '',
      ].filter(Boolean);
      this.setToast('info', parts.join(', ') || 'Nothing to restore.');
    } catch (err) {
      this.setToast('error', `Restore failed: ${(err as Error).message}`);
    }
  }

  /** Reopens a message in the composer without destroying history. */
  async prefillMessage(itemId: string): Promise<void> {
    const session = this.activeSession;
    if (!session) return;
    const item = session.items.find((i) => i.id === itemId);
    if (!item) return;
    const text = itemText(item);
    this.set({ mode: 'agents', activeSessionId: session.id });
    window.dispatchEvent(new CustomEvent('composer:prefill', { detail: text }));
  }

  /** Removes every transcript after this item while keeping the item itself. */
  async truncateAfter(itemId: string): Promise<void> {
    const id = this.state.activeSessionId;
    if (!id) return;
    try {
      const { session } = await api.truncateSession(id, itemId);
      this.upsertSession(session);
      this.setToast('info', 'Trimmed the conversation after this message.');
    } catch (err) {
      this.setToast('error', `Could not trim the conversation: ${(err as Error).message}`);
    }
  }

  async copyText(text: string, label = 'Copied to clipboard'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.setToast('info', label);
    } catch {
      this.setToast('error', 'The browser blocked clipboard access.');
    }
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

export function sessionOf(state: AppState): AgentSession | null {
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
}

export function itemText(item: TranscriptItem): string {
  if (item.kind === 'user' || item.kind === 'assistant' || item.kind === 'notice') return item.text;
  if (item.kind === 'tool') return `${item.summary}\n\n${item.content ?? ''}`;
  if (item.kind === 'subagent') return item.report ?? item.description;
  return item.question.question;
}
