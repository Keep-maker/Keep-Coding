import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../services/llm.js';
import { runAgent, type AgentEvent } from './loop.js';
import { checkpoints, type CheckpointSummary } from './checkpoints.js';
import type { AskAnswer, AskQuestion } from './tools/types.js';

export type SessionStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted' | 'waiting';

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string; at: number; editedAt?: number }
  | { kind: 'assistant'; id: string; text: string; at: number; streaming?: boolean; model?: string }
  | {
      kind: 'tool';
      id: string;
      callId: string;
      name: string;
      summary: string;
      args: any;
      status: 'running' | 'ok' | 'error';
      at: number;
      meta?: Record<string, unknown>;
      content?: string;
    }
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string; at: number }
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
    };

export interface AgentSession {
  id: string;
  title: string;
  root: string;
  mode: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  items: TranscriptItem[];
  history: ChatMessage[];
  /** Set when forked from another session, for lineage display. */
  forkedFrom?: { sessionId: string; itemId: string | null; title: string };
  error?: string;
}

interface SessionRuntime {
  session: AgentSession;
  controller: AbortController | null;
  listeners: Set<(event: any) => void>;
  /** Pending ask_question promises keyed by tool call id. */
  pendingQuestions: Map<string, (answer: AskAnswer | null) => void>;
}

export interface SessionSummary {
  id: string;
  title: string;
  root: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  forkedFrom?: AgentSession['forkedFrom'];
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, SessionRuntime>();

  list(): Omit<AgentSession, 'history'>[] {
    // Sessions are server-side only, so the transcript must be included in the
    // bootstrap response. Without items the UI cannot render an existing run
    // after a refresh - and treating summaries as sessions causes crashes.
    return [...this.sessions.values()]
      .map(({ session }) => this.public(session))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id)?.session;
  }

  create(root: string, title?: string, mode = 'agent'): AgentSession {
    const id = randomUUID();
    const now = Date.now();
    const session: AgentSession = {
      id,
      title: title?.trim() || 'New agent',
      root,
      mode,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      items: [],
      history: [],
    };
    this.sessions.set(id, { session, controller: null, listeners: new Set(), pendingQuestions: new Map() });
    return session;
  }

  /**
   * Forks a session at a message, copying the transcript and the model-facing
   * history up to and including it. The new session has its own checkpoints.
   */
  fork(sourceId: string, itemId: string | null, title?: string): AgentSession | undefined {
    const runtime = this.sessions.get(sourceId);
    if (!runtime) return undefined;
    const source = runtime.session;

    const at = itemId ? source.items.findIndex((item) => item.id === itemId) : source.items.length - 1;
    const cut = at < 0 ? source.items.length : at + 1;
    const items = source.items.slice(0, cut).map((item) => ({ ...item }));

    const fork = this.create(source.root, title || `${source.title} (fork)`, source.mode);
    fork.items = items;
    // Rebuild the model history from the copied transcript so the fork resumes
    // with exactly the context the user can see.
    fork.history = historyFromItems(items);
    fork.forkedFrom = { sessionId: sourceId, itemId, title: source.title };
    fork.status = 'idle';
    return fork;
  }

  /** Removes every item at or after the given one and rebuilds the history. */
  truncateAfter(id: string, itemId: string): AgentSession | undefined {
    const runtime = this.sessions.get(id);
    if (!runtime) return undefined;
    const { session } = runtime;
    const index = session.items.findIndex((item) => item.id === itemId);
    if (index < 0) return session;
    session.items = session.items.slice(0, index);
    session.history = historyFromItems(session.items);
    session.status = 'idle';
    session.error = undefined;
    session.updatedAt = Date.now();
    this.emit(id, { type: 'session', session: this.public(session) });
    return session;
  }

  /** Rewrites a user message in place and drops everything after it. */
  editUserMessage(id: string, itemId: string, text: string): AgentSession | undefined {
    const runtime = this.sessions.get(id);
    if (!runtime) return undefined;
    const { session } = runtime;
    const index = session.items.findIndex((item) => item.id === itemId);
    if (index < 0 || session.items[index].kind !== 'user') return undefined;

    const item = session.items[index] as Extract<TranscriptItem, { kind: 'user' }>;
    item.text = text;
    item.editedAt = Date.now();
    session.items = session.items.slice(0, index + 1);
    session.history = historyFromItems(session.items);
    session.status = 'idle';
    session.error = undefined;
    session.updatedAt = Date.now();
    this.emit(id, { type: 'session', session: this.public(session) });
    return session;
  }

  /** Removes a single transcript item without touching the rest of the conversation. */
  deleteItem(id: string, itemId: string): AgentSession | undefined {
    const runtime = this.sessions.get(id);
    if (!runtime) return undefined;
    const { session } = runtime;
    const index = session.items.findIndex((item) => item.id === itemId);
    if (index < 0) return session;
    session.items.splice(index, 1);
    session.history = historyFromItems(session.items);
    session.updatedAt = Date.now();
    this.emit(id, { type: 'session', session: this.public(session) });
    return session;
  }

  delete(id: string): boolean {
    const runtime = this.sessions.get(id);
    runtime?.controller?.abort();
    // Resolve any waiting question so the run can unwind.
    for (const resolve of runtime?.pendingQuestions.values() ?? []) resolve(null);
    checkpoints.dropSession(id);
    return this.sessions.delete(id);
  }

  /** Answers a pending ask_question tool call, resuming the paused run. */
  answer(id: string, callId: string, answer: AskAnswer): boolean {
    const runtime = this.sessions.get(id);
    const resolve = runtime?.pendingQuestions.get(callId);
    if (!runtime || !resolve) return false;
    runtime.pendingQuestions.delete(callId);
    const item = runtime.session.items.find(
      (i): i is Extract<TranscriptItem, { kind: 'question' }> => i.kind === 'question' && i.callId === callId,
    );
    if (item) item.answer = answer;
    runtime.session.status = 'running';
    runtime.session.updatedAt = Date.now();
    this.emit(id, { type: 'session', session: this.public(runtime.session) });
    resolve(answer);
    return true;
  }

  subscribe(id: string, listener: (event: any) => void): () => void {
    const runtime = this.sessions.get(id);
    if (!runtime) return () => {};
    runtime.listeners.add(listener);
    return () => runtime.listeners.delete(listener);
  }

  abort(id: string): boolean {
    const runtime = this.sessions.get(id);
    if (!runtime) return false;
    for (const resolve of runtime.pendingQuestions.values()) resolve(null);
    runtime.pendingQuestions.clear();
    if (!runtime.controller) return false;
    runtime.controller.abort();
    return true;
  }

  private emit(id: string, payload: any): void {
    const runtime = this.sessions.get(id);
    if (!runtime) return;
    for (const listener of runtime.listeners) {
      try {
        listener(payload);
      } catch {
        /* listener errors must not break the run */
      }
    }
  }

  /** Shape sent over the wire: model history is server-side only. */
  private public(session: AgentSession) {
    const { history, ...rest } = session;
    return rest;
  }

  start(id: string, prompt: string, options?: { instructions?: string; mode?: string; skills?: string[] }): void {
    const runtime = this.sessions.get(id);
    if (!runtime) throw new Error(`Unknown session: ${id}`);
    if (runtime.session.status === 'running') throw new Error('This agent is already running.');

    const { session } = runtime;
    session.items.push({ kind: 'user', id: randomUUID(), text: prompt, at: Date.now() });
    session.history.push({ role: 'user', content: prompt });
    session.status = 'running';
    session.updatedAt = Date.now();
    session.error = undefined;
    if (session.title === 'New agent') session.title = prompt.slice(0, 48);

    const controller = new AbortController();
    runtime.controller = controller;
    this.emit(id, { type: 'session', session: this.public(session) });
    void this.runLoop(id, options, controller);
  }

  private async runLoop(
    id: string,
    options: { instructions?: string; mode?: string; skills?: string[] } | undefined,
    controller: AbortController,
  ): Promise<void> {
    const runtime = this.sessions.get(id);
    if (!runtime) return;
    const { session } = runtime;

    // Snapshot the pre-turn state of every file this turn touches.
    const firstUser = [...session.items].reverse().find((i) => i.kind === 'user') as
      | Extract<TranscriptItem, { kind: 'user' }>
      | undefined;
    checkpoints.begin(id, firstUser?.text.slice(0, 60) ?? 'turn', firstUser?.id ?? null);

    try {
      for await (const event of runAgent({
        root: session.root,
        sessionId: id,
        history: session.history,
        extraInstructions: options?.instructions,
        mode: options?.mode,
        forcedSkills: options?.skills,
        signal: controller.signal,
        onQuestion: (callId, question) =>
          new Promise<AskAnswer | null>((resolve) => {
            runtime.pendingQuestions.set(callId, resolve);
            session.status = 'waiting';
            session.updatedAt = Date.now();
            this.emit(id, { type: 'session', session: this.public(session) });
          }),
      })) {
        this.applyEvent(session, event);
        session.updatedAt = Date.now();
        this.emit(id, { type: 'event', sessionId: id, event, session: this.public(session) });
      }

      const assistantText = session.items
        .filter((i): i is Extract<TranscriptItem, { kind: 'assistant' }> => i.kind === 'assistant')
        .map((i) => i.text)
        .join('');
      if (assistantText.trim()) session.history.push({ role: 'assistant', content: assistantText });
      session.status = controller.signal.aborted ? 'aborted' : 'done';
    } catch (err) {
      session.status = 'error';
      session.error = (err as Error).message;
      session.items.push({ kind: 'notice', id: randomUUID(), level: 'error', text: session.error, at: Date.now() });
    } finally {
      checkpoints.end(id);
      runtime.controller = null;
      session.updatedAt = Date.now();
      this.emit(id, { type: 'session', session: this.public(session) });
    }
  }

  private applyEvent(session: AgentSession, event: AgentEvent): void {
    switch (event.type) {
      case 'text': {
        const last = session.items[session.items.length - 1];
        if (last && last.kind === 'assistant' && last.streaming) {
          last.text += event.text;
        } else {
          session.items.push({ kind: 'assistant', id: randomUUID(), text: event.text, at: Date.now(), streaming: true });
        }
        break;
      }
      case 'tool_start': {
        for (const item of session.items) {
          if (item.kind === 'assistant' && item.streaming) item.streaming = false;
        }
        session.items.push({
          kind: 'tool',
          id: randomUUID(),
          callId: event.id,
          name: event.name,
          summary: event.summary,
          args: event.args,
          status: 'running',
          at: Date.now(),
        });
        break;
      }
      case 'tool_result': {
        const item = [...session.items]
          .reverse()
          .find((i): i is Extract<TranscriptItem, { kind: 'tool' }> => i.kind === 'tool' && i.callId === event.id);
        if (item) {
          item.status = event.isError ? 'error' : 'ok';
          item.meta = event.meta;
          item.content = event.content;
        }
        break;
      }
      case 'question': {
        session.items.push({
          kind: 'question',
          id: randomUUID(),
          callId: event.id,
          question: event.question,
          at: Date.now(),
        });
        break;
      }
      case 'subagent': {
        if (event.state === 'start') {
          session.items.push({
            kind: 'subagent',
            id: randomUUID(),
            description: event.description,
            at: Date.now(),
            status: 'running',
          });
        } else {
          const item = [...session.items]
            .reverse()
            .find((i): i is Extract<TranscriptItem, { kind: 'subagent' }> => i.kind === 'subagent' && i.status === 'running');
          if (item) {
            item.status = 'done';
            item.steps = event.steps;
          }
        }
        break;
      }
      case 'error':
        session.items.push({ kind: 'notice', id: randomUUID(), level: 'error', text: event.message, at: Date.now() });
        break;
      case 'done':
        for (const item of session.items) {
          if (item.kind === 'assistant') item.streaming = false;
        }
        break;
      default:
        break;
    }
  }
}

/** Rebuilds model-facing history from a transcript, skipping un-actionable items. */
function historyFromItems(items: TranscriptItem[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const item of items ?? []) {
    if (item.kind === 'user') history.push({ role: 'user', content: item.text });
    else if (item.kind === 'assistant' && item.text.trim()) history.push({ role: 'assistant', content: item.text });
  }
  return history;
}

export const sessions = new AgentSessionManager();
export type { CheckpointSummary };
