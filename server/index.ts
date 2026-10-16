import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { config, publicProviderInfo } from './config.js';
import { createRouter } from './routes.js';
import { sessions } from './agent/sessions.js';

const app = express();
app.use(express.json({ limit: '12mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use('/api', createRouter());

app.get('/api/agents/sessions', (_req, res) => {
  res.json({ sessions: sessions.list().map((s) => publicSession(s)) });
});

app.post('/api/agents/sessions', (req, res) => {
  const { root, title, mode } = req.body ?? {};
  const session = sessions.create(root ?? config.defaultWorkspace, title, mode);
  res.json({ session: publicSession(session) });
});

app.get('/api/agents/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ session: publicSession(session) });
});

app.delete('/api/agents/sessions/:id', (req, res) => {
  res.json({ deleted: sessions.delete(req.params.id) });
});

app.post('/api/agents/sessions/:id/abort', (req, res) => {
  res.json({ aborted: sessions.abort(req.params.id) });
});

function publicSession(session: ReturnType<typeof sessions.get>) {
  if (!session) return null;
  // History is model-facing only; the transcript is what the UI renders.
  const { history, ...rest } = session;
  return rest;
}

/**
 * In production the built SPA is served from the same origin as the API, so
 * `npm run build && npm start` gives a single-port deployment.
 */
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log('[cursor-fork] serving built client from dist/');
} else {
  console.log('[cursor-fork] no dist/ build found - run the Vite dev server on :5173 for the UI');
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/agents/socket' });

interface ClientMessage {
  type: string;
  sessionId?: string;
  prompt?: string;
  instructions?: string;
}

wss.on('connection', (socket: WebSocket) => {
  let unsubscribe: (() => void) | null = null;
  let attachedId: string | null = null;

  const send = (payload: unknown) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  const attach = (sessionId: string) => {
    if (attachedId === sessionId) return;
    unsubscribe?.();
    attachedId = sessionId;
    const session = sessions.get(sessionId);
    if (!session) {
      send({ type: 'error', message: `Unknown session ${sessionId}` });
      return;
    }
    send({ type: 'session', session: publicSession(session) });
    unsubscribe = sessions.subscribe(sessionId, (payload) => send(payload));
  };

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send({ type: 'error', message: 'Malformed message' });
      return;
    }

    if (message.sessionId) attach(message.sessionId);

    switch (message.type) {
      case 'attach':
        break;
      case 'start':
        if (!message.sessionId || typeof message.prompt !== 'string' || !message.prompt.trim()) {
          send({ type: 'error', message: 'start requires sessionId and prompt' });
          return;
        }
        try {
          sessions.start(message.sessionId, message.prompt.trim(), message.instructions);
        } catch (err) {
          send({ type: 'error', message: (err as Error).message });
        }
        break;
      case 'abort':
        if (message.sessionId) sessions.abort(message.sessionId);
        break;
      default:
        send({ type: 'error', message: `Unknown message type: ${message.type}` });
    }
  });

  socket.on('close', () => unsubscribe?.());
  send({ type: 'hello', provider: publicProviderInfo(), defaultWorkspace: config.defaultWorkspace });
});

server.listen(config.port, () => {
  const p = publicProviderInfo();
  console.log(`[cursor-fork] API listening on http://127.0.0.1:${config.port}`);
  console.log(`[cursor-fork] workspace: ${config.defaultWorkspace}`);
  console.log(
    `[cursor-fork] model: ${p.model} @ ${p.baseUrl} (key ${p.apiKeyConfigured ? 'configured' : 'MISSING - set CURSOR_FORK_API_KEY or use Settings'})`,
  );
});

