/**
 * Verifies the core build requirements end to end against a running dev server:
 *   1. workspace tree + file read
 *   2. search + quick open
 *   3. agent loop with real tool execution (against the mock provider)
 *   4. parallel agents running at the same time
 *
 * The checks discover files from the live workspace tree, so they stay valid
 * whatever the open project contains.
 *
 * Usage: node tools/verify.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
}

const health = await (await fetch(`${base}/api/health`)).json();
check('health endpoint', health.ok === true, health.defaultWorkspace);
const root = health.defaultWorkspace;

const tree = await (await fetch(`${base}/api/workspace/tree`)).json();
const topLevel = tree.tree.children ?? [];
check('workspace tree', topLevel.length > 0, `${topLevel.length} top-level entries`);

// Pick a real source file from the tree instead of assuming a fixed layout.
function firstFileWithExtension(node, exts) {
  if (node.type === 'file' && exts.some((e) => node.path.endsWith(e))) return node.path;
  for (const child of node.children ?? []) {
    const found = firstFileWithExtension(child, exts);
    if (found) return found;
  }
  return null;
}

const sampleFile = firstFileWithExtension(tree.tree, ['.js', '.ts', '.tsx', '.py', '.md']);
if (!sampleFile) {
  console.log('SKIP  read file - workspace has no readable source file');
} else {
  const file = await (await fetch(`${base}/api/workspace/file?path=${encodeURIComponent(sampleFile)}`)).json();
  check('read file', typeof file.content === 'string' && file.content.length > 0, `${sampleFile} (${file.size} bytes, lang=${file.language})`);

  // Search for a token that is guaranteed to exist: an identifier from the file.
  const token = (file.content.match(/[A-Za-z_][A-Za-z0-9_]{3,}/) ?? ['function'])[0];
  const search = await (
    await fetch(`${base}/api/workspace/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: token }),
    })
  ).json();
  check('content search', search.hits.length >= 1, `"${token}" -> ${search.hits.length} hit(s)`);

  const stem = sampleFile.split('/').pop().replace(/\.[^.]+$/, '');
  const quick = await (await fetch(`${base}/api/workspace/files?q=${encodeURIComponent(stem.slice(0, 4))}`)).json();
  check('quick open fuzzy match', quick.files.length > 0, quick.files[0]?.path ?? 'none');
}

// --- agent session ---
const created = await (
  await fetch(`${base}/api/agents/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, title: 'verify-run' }),
  })
).json();
const sessionId = created.session.id;
check('create agent session', Boolean(sessionId), sessionId);

const { WebSocket } = await import('ws');
const events = [];
await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${base.split(':')[2]}/api/agents/socket`);
  const timer = setTimeout(() => reject(new Error('agent run timed out')), 90000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'start', sessionId, prompt: 'Create a scratch helper and verify it runs.' })));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    events.push(msg);
    if (msg.type === 'session' && ['done', 'error', 'aborted'].includes(msg.session?.status)) {
      clearTimeout(timer);
      ws.close();
      resolve();
    }
  });
  ws.on('error', reject);
});

const finalSession = events.filter((e) => e.type === 'session').at(-1)?.session;
const toolNames = (finalSession?.items ?? []).filter((i) => i.kind === 'tool').map((i) => i.name);
check('agent ran tools', toolNames.length >= 3, toolNames.join(', '));
check('agent finished', finalSession?.status === 'done', finalSession?.status);
check('agent answered with markdown', (finalSession?.items ?? []).some((i) => i.kind === 'assistant' && i.text.includes('##')), 'heading present');

// --- parallel agents ---
const mk = async (title) =>
  (
    await (
      await fetch(`${base}/api/agents/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, title }),
      })
    ).json()
  ).session.id;

const [a, b] = await Promise.all([mk('parallel-a'), mk('parallel-b')]);
const runOne = (id) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${base.split(':')[2]}/api/agents/socket`);
    const timer = setTimeout(() => reject(new Error('parallel run timed out')), 90000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'start', sessionId: id, prompt: 'Inspect the project.' })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'session' && msg.session?.id === id && ['done', 'error'].includes(msg.session.status)) {
        clearTimeout(timer);
        ws.close();
        resolve(msg.session.status);
      }
    });
    ws.on('error', reject);
  });

const parallel = await Promise.all([runOne(a), runOne(b)]);
check('parallel agents', parallel.every((s) => s === 'done'), parallel.join(' + '));

const list = await (await fetch(`${base}/api/agents/sessions`)).json();
check('session list', list.sessions.length >= 3, `${list.sessions.length} sessions retained`);

// cleanup sessions and any scratch file the mock agent created
for (const s of list.sessions) await fetch(`${base}/api/agents/sessions/${s.id}`, { method: 'DELETE' });
await fetch(`${base}/api/workspace/delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ root, path: '.mock-agent-check.js' }),
}).catch(() => {});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
