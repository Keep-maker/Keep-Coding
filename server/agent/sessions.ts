import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../services/llm.js';
import { runAgent, type AgentEvent } from './loop.js';

export type SessionStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';

/** A single rendered entry in the agent conversation pane. */
export type TranscriptItem =
  | { kind: 'user'; id: string; text: string; at: number }
  | { kind: 'assistant'; id: string; text: string; at: number; streaming?: boolean }
  | { kind: 'tool'; id: string; callId: string; name: string; summary: string; args: any; status: 'running' | 'ok' | 'error'; at: number; meta?: Record<string, unknown>; content?: string }
  | { kind: 'notice'; id: string; level: 'info' | 'error'; text: string; at: number };

export interface AgentSession {
  id: string;
  title: string;
  root: string;
  mode: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  items: TranscriptItem[];
  /** Full model-facing history, including tool messages. */
  history: ChatMessage[];
  pendingSteps: number;
  error?: string;
}

interface SessionRuntime {
  session: AgentSession;
  controller: AbortController | null;
  listeners: Set<(event: any) => void>;
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, SessionRuntime>();

  list(): AgentSession[] {
    return [...this.sessions.values()]
      .map((r) => r.session)
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
      pendingSteps: 0,
    };
    this.sessions.set(id, { session, controller: null, listeners: new Set() });
    return session;
  }

  delete(id: string): boolean {
    const runtime = this.sessions.get(id);
    runtime?.controller?.abort();
    return this.sessions.delete(id);
  }

  subscribe(id: string, listener: (event: any) => void): () => void {
    const runtime = this.sessions.get(id);
    if (!runtime) return () => {};
    runtime.listeners.add(listener);
    return () => runtime.listeners.delete(listener);
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

  abort(id: string): boolean {
    const runtime = this.sessions.get(id);
    if (!runtime?.controller) return false;
    runtime.controller.abort();
    return true;
  }

  /**
   * Starts a new agent turn. Multiple sessions may run concurrently; each has
   * its own AbortController and streams events to its subscribers.
   */
  start(id: string, prompt: string, extraInstructions?: string): void {
    const runtime = this.sessions.get(id);
    if (!runtime) throw new Error(`Unknown session: ${id}`);
    if (runtime.session.status === 'running') throw new Error('This agent is already running.');

    const { session } = runtime;
    const userItem: TranscriptItem = { kind: 'user', id: randomUUID(), text: prompt, at: Date.now() };
    session.items.push(userItem);
    session.history.push({ role: 'user', content: prompt });
    session.status = 'running';
    session.updatedAt = Date.now();
    session.error = undefined;
    if (session.title === 'New agent') session.title = prompt.slice(0, 48);

    const controller = new AbortController();
    runtime.controller = controller;
    this.emit(id, { type: 'session', session });

    void this.runLoop(id, prompt, extraInstructions, controller);
  }

  private async runLoop(id: string, _prompt: string, extraInstructions: string | undefined, controller: AbortController): Promise<void> {
    const runtime = this.sessions.get(id);
    if (!runtime) return;
    const { session } = runtime;
    let assistantItem: TranscriptItem | null = null;

    try {
      for await (const event of runAgent({
        root: session.root,
        history: session.history,
        extraInstructions,
        signal: controller.signal,
      })) {
        this.applyEvent(session, event, (item) => {
          assistantItem = item;
        });
        session.updatedAt = Date.now();
        this.emit(id, { type: 'event', sessionId: id, event, session });
      }

      const assistantText = session.items
        .filter((i): i is Extract<TranscriptItem, { kind: 'assistant' }> => i.kind === 'assistant')
        .map((i) => i.text)
        .join('');

      if (assistantText.trim()) {
        session.history.push({ role: 'assistant', content: assistantText });
      }
      session.status = controller.signal.aborted ? 'aborted' : 'done';
    } catch (err) {
      session.status = 'error';
      session.error = (err as Error).message;
      session.items.push({ kind: 'notice', id: randomUUID(), level: 'error', text: session.error, at: Date.now() });
    } finally {
      runtime.controller = null;
      session.updatedAt = Date.now();
      this.emit(id, { type: 'session', session });
    }
  }

  private applyEvent(
    session: AgentSession,
    event: AgentEvent,
    setAssistant: (item: TranscriptItem) => void,
  ): void {
    switch (event.type) {
      case 'text': {
        const last = session.items[session.items.length - 1];
        if (last && last.kind === 'assistant' && last.streaming) {
          last.text += event.text;
          setAssistant(last);
        } else {
          const item: TranscriptItem = { kind: 'assistant', id: randomUUID(), text: event.text, at: Date.now(), streaming: true };
          session.items.push(item);
          setAssistant(item);
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
      case 'error': {
        session.items.push({ kind: 'notice', id: randomUUID(), level: 'error', text: event.message, at: Date.now() });
        break;
      }
      case 'done': {
        for (const item of session.items) {
          if (item.kind === 'assistant') item.streaming = false;
        }
        break;
      }
      default:
        break;
    }
  }
}

export const sessions = new AgentSessionManager();
