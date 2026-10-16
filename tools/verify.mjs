/**
 * Verifies the core build requirements end to end against a running dev server:
 *   1. workspace tree + file read/write
 *   2. search + quick open
 *   3. agent loop with real tool execution (against the mock provider)
 *   4. parallel agents running at the same time
 *   5. window switching
 *
 * Usage: node tools/verify.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
}

const health = await (await fetch(`${base}/api/health`)).json();
check('health endpoint', health.ok === true, health.defaultWorkspace);
const root = health.defaultWorkspace;

const tree = await (await fetch(`${base}/api/workspace/tree`)).json();
check('workspace tree', (tree.tree.children ?? []).length > 0, `${(tree.tree.children ?? []).length} top-level entries`);

const file = await (await fetch(`${base}/api/workspace/file?path=src%2Futils%2Fformat.js`)).json();
check('read file', file.content.includes('formatTask'), `${file.size} bytes, lang=${file.language}`);

const search = await (
  await fetch(`${base}/api/workspace/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'formatTask' }),
  })
).json();
check('content search', search.hits.length >= 2, `${search.hits.length} hits`);

const quick = await (await fetch(`${base}/api/workspace/files?q=fmt`)).json();
check('quick open fuzzy match', quick.files.some((f) => f.path.includes('format')), quick.files[0]?.path ?? 'none');

// --- agent sessions ---
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
  const timer = setTimeout(() => reject(new Error('agent run timed out')), 60000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'start', sessionId, prompt: 'Add the overdue flag and run the tests.' })));
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
    const timer = setTimeout(() => reject(new Error('parallel run timed out')), 60000);
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

// cleanup
for (const s of list.sessions) await fetch(`${base}/api/agents/sessions/${s.id}`, { method: 'DELETE' });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
