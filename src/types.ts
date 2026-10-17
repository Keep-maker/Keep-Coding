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

export interface AskQuestion {
  question: string;
  options: { id: string; label: string; description?: string }[];
  allowMultiple?: boolean;
}

export interface AskAnswer {
  selected: string[];
  note?: string;
}

export interface TodoEntry {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string; at: number; editedAt?: number }
  | { kind: 'assistant'; id: string; text: string; at: number; streaming?: boolean; model?: string }
  | ToolCallItem
  | {
      kind: 'question';
      id: string;
      callId: string;
      question: AskQuestion;
      at: number;
      answer?: AskAnswer;
    }
  | {
      kind: 'subagent';
      id: string;
      description: string;
      at: number;
      status: 'running' | 'done';
      steps?: number;
      report?: string;
    }
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string; at: number };

export interface AgentSession {
  id: string;
  title: string;
  root: string;
  mode: string;
  status: 'idle' | 'running' | 'done' | 'error' | 'aborted' | 'waiting';
  createdAt: number;
  updatedAt: number;
  items: TranscriptItem[];
  pendingSteps?: number;
  forkedFrom?: SessionForkOrigin;
  error?: string;
}

export interface SessionForkOrigin {
  sessionId: string;
  itemId: string | null;
  title: string;
}

export interface CheckpointSummary {
  id: string;
  sessionId: string;
  label: string;
  messageId: string | null;
  createdAt: number;
  /** Workspace-relative paths this turn mutated. */
  files: string[];
  restoredAt?: number;
}

export interface CheckpointDiffEntry {
  path: string;
  /** null when the file did not exist on that side of the comparison. */
  before: string | null;
  after: string | null;
  existedBefore: boolean;
  existsNow: boolean;
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
