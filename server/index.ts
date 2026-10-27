import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { config, publicProviderInfo } from './config.js';
import { createRouter } from './routes.js';
import { sessions } from './agent/sessions.js';
import { checkpoints } from './agent/checkpoints.js';
import { discoverHooks } from './agent/hooks.js';
import { discoverRules } from './agent/rules.js';
import { discoverSkills } from './agent/skills.js';
import { TOKEN_HEADER, authDisabled, isAuthorizedUpgrade, requireAuth } from './auth.js';
import os from 'node:os';

const app = express();
app.use(express.json({ limit: '12mb' }));

/**
 * CORS. The UI is normally served from Cloudflare Pages on a different origin,
 * so only the origins named in CURSOR_FORK_ALLOWED_ORIGINS are echoed back.
 * Requests without an Origin header (same-origin, curl, probes) always pass.
 */
app.use((req, res, next) => {
  const origin = req.get('origin');
  const allowed = Boolean(origin) && config.allowedOrigins.includes(origin as string);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin as string);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ' + TOKEN_HEADER);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(allowed || !origin ? 204 : 403);
    return;
  }
  next();
});

/** Unauthenticated liveness probe: lets the login screen check reachability. */
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, authRequired: !authDisabled(), name: 'keep-coding' });
});

app.use('/api', requireAuth, createRouter());

/** Sessions ------------------------------------------------------------------ */

app.get('/api/agents/sessions', (_req, res) => {
  res.json({ sessions: sessions.list() });
});

app.post('/api/agents/sessions', (req, res) => {
  const { root, title, mode } = req.body ?? {};
  const session = sessions.create(root ?? config.defaultWorkspace, title, mode);
  res.json({ session: sessions.get(session.id) });
});

app.get('/api/agents/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ session });
});

app.post('/api/agents/sessions/:id/fork', (req, res) => {
  const { itemId, title } = req.body ?? {};
  const fork = sessions.fork(req.params.id, itemId ?? null, title);
  if (!fork) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ session: sessions.get(fork.id) });
});

app.post('/api/agents/sessions/:id/truncate', (req, res) => {
  const { itemId } = req.body ?? {};
  const session = sessions.truncateAfter(req.params.id, String(itemId));
  if (!session) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ session });
});

app.post('/api/agents/sessions/:id/messages/:itemId', (req, res) => {
  const { text } = req.body ?? {};
  const session = sessions.editUserMessage(req.params.id, req.params.itemId, String(text ?? ''));
  if (!session) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  res.json({ session });
});

app.post('/api/agents/sessions/:id/answer', (req, res) => {
  const { callId, selected, note } = req.body ?? {};
  const ok = sessions.answer(req.params.id, String(callId), {
    selected: Array.isArray(selected) ? selected.map(String) : [],
    note: note ? String(note) : undefined,
  });
  res.json({ ok });
});

app.delete('/api/agents/sessions/:id/items/:itemId', (req, res) => {
  const session = sessions.deleteItem(req.params.id, req.params.itemId);
  if (!session) return res.status(404).json({ error: 'Unknown session or item' });
  res.json({ session });
});

app.delete('/api/agents/sessions/:id', (req, res) => {
  res.json({ deleted: sessions.delete(req.params.id) });
});

app.post('/api/agents/sessions/:id/abort', (req, res) => {
  res.json({ aborted: sessions.abort(req.params.id) });
});

/** Checkpoints --------------------------------------------------------------- */

app.get('/api/agents/sessions/:id/checkpoints', (req, res) => {
  res.json({ checkpoints: checkpoints.list(req.params.id) });
});

app.get('/api/agents/sessions/:id/checkpoints/:checkpointId', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  try {
    res.json({ diff: checkpoints.preview(session.root, req.params.id, req.params.checkpointId) });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.post('/api/agents/sessions/:id/checkpoints/:checkpointId/restore', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  try {
    res.json({ result: checkpoints.restore(session.root, req.params.id, req.params.checkpointId) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Customization (skills / rules / hooks) ------------------------------------ */

app.get('/api/customize', (req, res) => {
  const root = typeof req.query.root === 'string' && req.query.root ? req.query.root : config.defaultWorkspace;
  const skills = discoverSkills(root, os.homedir()).map((skill) => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
    file: path.relative(root, skill.file) || skill.file,
  }));
  const rules = discoverRules(root, os.homedir()).map((rule) => ({
    name: rule.name,
    description: rule.description,
    globs: rule.globs,
    activation: rule.activation,
    source: rule.source,
    file: path.relative(root, rule.file) || rule.file,
  }));
  const hooks = discoverHooks(root).map((hook) => ({ stage: hook.stage, command: hook.command, matcher: hook.matcher }));
  res.json({ skills, rules, hooks, tools: TOOL_PREVIEW });
});

/** Static list kept in sync with server/agent/tools/index.ts. */
const TOOL_PREVIEW = [
  { name: 'list_files', group: 'explore', description: 'List files or a directory' },
  { name: 'directory_tree', group: 'explore', description: 'Nested project tree' },
  { name: 'glob_file_search', group: 'explore', description: 'Find files by glob' },
  { name: 'grep_search', group: 'explore', description: 'Regex search with context' },
  { name: 'read_file', group: 'explore', description: 'Read a file by line range' },
  { name: 'file_info', group: 'explore', description: 'Size, lines, language' },
  { name: 'read_image', group: 'explore', description: 'Attach an image for vision' },
  { name: 'edit_file', group: 'edit', description: 'Surgical text replacement' },
  { name: 'multi_edit', group: 'edit', description: 'Many edits across files' },
  { name: 'write_file', group: 'edit', description: 'Create or overwrite a file' },
  { name: 'move_file', group: 'edit', description: 'Rename or move' },
  { name: 'delete_file', group: 'edit', description: 'Remove a file or folder' },
  { name: 'run_command', group: 'run', description: 'Shell command in workspace' },
  { name: 'todo_write', group: 'run', description: 'Maintain the task list' },
  { name: 'ask_question', group: 'run', description: 'Pause and ask the user' },
  { name: 'task', group: 'run', description: 'Delegate to a sub-agent' },
];

/** Static SPA hosting in production. */
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
const wss = new WebSocketServer({
  server,
  path: '/api/agents/socket',
  /**
   * Browsers cannot attach custom headers to a WebSocket handshake, so the UI
   * passes the shared token as a query parameter. Reject anything else before
   * the connection is established - this socket can start agent runs.
   */
  verifyClient: (info: { req: { url?: string } }) => isAuthorizedUpgrade(info.req.url),
});

interface ClientMessage {
  type: string;
  sessionId?: string;
  prompt?: string;
  instructions?: string;
  mode?: string;
  skills?: string[];
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
    send({ type: 'session', session });
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
          sessions.start(message.sessionId, message.prompt.trim(), {
            instructions: message.instructions,
            mode: message.mode,
            skills: message.skills,
          });
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

server.listen(config.port, config.host, () => {
  const p = publicProviderInfo();
  console.log(`[cursor-fork] API listening on http://127.0.0.1:${config.port}`);
  console.log(`[cursor-fork] workspace: ${config.defaultWorkspace}`);
  console.log(
    `[cursor-fork] model: ${p.model} @ ${p.baseUrl} (key ${p.apiKeyConfigured ? 'configured' : 'MISSING - set CURSOR_FORK_API_KEY or use Settings'})`,
  );
  const skills = discoverSkills(config.defaultWorkspace, os.homedir());
  const rules = discoverRules(config.defaultWorkspace, os.homedir());
  const hooks = discoverHooks(config.defaultWorkspace);
  console.log(`[cursor-fork] customize: ${skills.length} skill(s), ${rules.length} rule(s), ${hooks.length} hook(s)`);
});
