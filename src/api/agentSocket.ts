import type { AgentSession } from '../types';
import { socketUrl } from './client';

export type AgentSocketEvent =
  | { type: 'hello'; provider: unknown; defaultWorkspace: string }
  | { type: 'session'; session: AgentSession }
  | { type: 'event'; sessionId: string; event: any; session: AgentSession }
  | { type: 'error'; message: string };

type Handler = (event: AgentSocketEvent) => void;

/**
 * Thin reconnecting wrapper over the agent WebSocket. One socket per browser tab
 * multiplexes every session; we re-attach to the active session after a
 * reconnect so a dropped connection does not lose the transcript.
 */
export class AgentSocket {
  private socket: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: number | null = null;
  private activeSessionId: string | null = null;
  private closedByUser = false;

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closedByUser = false;
    const socket = new WebSocket(socketUrl());
    this.socket = socket;

    socket.onopen = () => {
      if (this.activeSessionId) this.send({ type: 'attach', sessionId: this.activeSessionId });
    };
    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data as string) as AgentSocketEvent;
        for (const handler of this.handlers) handler(parsed);
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onclose = () => {
      this.socket = null;
      if (this.closedByUser) return;
      this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
    };
    socket.onerror = () => socket.close();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private send(payload: Record<string, unknown>): void {
    this.connect();
    const raw = JSON.stringify(payload);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
      return;
    }
    // Queue until the socket finishes connecting.
    this.socket?.addEventListener('open', () => this.socket?.send(raw), { once: true });
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  attach(sessionId: string): void {
    this.activeSessionId = sessionId;
    this.send({ type: 'attach', sessionId });
  }

  start(
    sessionId: string,
    prompt: string,
    options?: { instructions?: string; mode?: string; skills?: string[] },
  ): void {
    this.activeSessionId = sessionId;
    this.send({
      type: 'start',
      sessionId,
      prompt,
      instructions: options?.instructions,
      mode: options?.mode,
      skills: options?.skills,
    });
  }

  abort(sessionId: string): void {
    this.send({ type: 'abort', sessionId });
  }
}

export const agentSocket = new AgentSocket();
