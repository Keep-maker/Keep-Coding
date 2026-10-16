export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface OpenFile {
  path: string;
  name: string;
  language: string;
  content: string;
  /** Last content known to the server, used to compute the dirty state. */
  savedContent: string;
  loading?: boolean;
  error?: string;
}

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface ToolCallItem {
  kind: 'tool';
  id: string;
  callId: string;
  name: string;
  summary: string;
  args: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
  at: number;
  meta?: Record<string, any>;
  content?: string;
}

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string; at: number }
  | { kind: 'assistant'; id: string; text: string; at: number; streaming?: boolean }
  | ToolCallItem
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string; at: number };

export interface AgentSession {
  id: string;
  title: string;
  root: string;
  mode: string;
  status: 'idle' | 'running' | 'done' | 'error' | 'aborted';
  createdAt: number;
  updatedAt: number;
  items: TranscriptItem[];
  pendingSteps: number;
  error?: string;
}

export type WindowMode = 'editor' | 'agents';

/** Every file the running agents touched, so the diff view can list them. */
export interface ChangedFile {
  path: string;
  before: string;
  after: string;
  created?: boolean;
  at: number;
}
