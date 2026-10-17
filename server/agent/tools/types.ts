import type { ToolSchema } from '../../services/llm.js';

export interface ToolContext {
  root: string;
  sessionId: string;
  /** Records the pre-mutation state of a file so checkpoints can restore it. */
  snapshot: (relativePath: string) => void;
  /** Progress line surfaced to the UI (and used for tool-call summaries). */
  onOutput?: (text: string) => void;
  /** Pauses the run to ask the user a question; resolves with their answer. */
  ask?: (question: AskQuestion, toolCallId?: string) => Promise<AskAnswer | null>;
  /** Identifier of the tool call currently executing. */
  toolCallId?: string;
}

export interface AskAnswer {
  selected: string[];
  note?: string;
}

export interface AskQuestion {
  question: string;
  options: { id: string; label: string; description?: string }[];
  allowMultiple?: boolean;
}

export interface ToolResult {
  /** Payload handed back to the model as the tool message content. */
  content: string;
  /** Structured detail used by the UI to render rich diff/terminal/todo widgets. */
  meta?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDefinition {
  schema: ToolSchema;
  /** True when the tool can modify the workspace, gating snapshot + approval. */
  mutates?: boolean;
  run(input: any, ctx: ToolContext): Promise<ToolResult>;
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

