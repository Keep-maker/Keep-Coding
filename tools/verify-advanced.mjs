/**
 * Backend verification for the phase-2/3 capabilities: skills, rules, hooks,
 * checkpoints (rewind/restore), message edit, truncate, fork, and the expanded
 * tool set. Drives the real agent loop against the mock provider.
 *
 * Usage: node tools/verify-advanced.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const health = await (await fetch(`${base}/api/health`)).json();
const root = health.defaultWorkspace;

// Start from a clean slate so checkpoint assertions are deterministic.
await fetch(`${base}/api/workspace/delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ root, path: '.mock-agent-check.js' }),
}).catch(() => {});

// --- customization discovery ---
const customize = await (await fetch(`${base}/api/customize?root=${encodeURIComponent(root)}`)).json();
check('skills discovered', customize.skills.length >= 2, customize.skills.map((s) => s.name).join(', '));
check('rules discovered', customize.rules.length >= 2, customize.rules.map((r) => r.name).join(', '));
check('rule globs parsed', customize.rules.some((r) => r.globs.length > 0), 'glob-scoped rule present');
check('hooks discovered', customize.hooks.length >= 2, customize.hooks.map((h) => h.stage).join(', '));
check('tool count expanded', customize.tools.length >= 16, `${customize.tools.length} tools advertised`);

// --- hooks actually fire ---
const created = await (
  await fetch(`${base}/api/agents/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, title: 'advanced-verify' }),
  })
).json();
const sessionId = created.session.id;
check('session created', Boolean(sessionId), sessionId);

const { WebSocket } = await import('ws');
const runTurn = (prompt, instructions) =>
  new Promise((resolve, reject) => {
    const events = [];
    const ws = new WebSocket(`ws://127.0.0.1:${base.split(':')[2]}/api/agents/socket`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('run timed out'));
    }, 120000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'start', sessionId, prompt, instructions })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      events.push(msg);
      if (msg.type === 'session' && ['done', 'error', 'aborted'].includes(msg.session?.status)) {
        clearTimeout(timer);
        ws.close();
        resolve({ events, session: msg.session });
      }
    });
    ws.on('error', reject);
  });

const run1 = await runTurn('Create the scratch helper and verify it runs.');
const tools = (run1.session.items ?? []).filter((i) => i.kind === 'tool');
check('agent used tools', tools.length >= 3, tools.map((t) => t.name).join(', '));
check(
  'after_edit hook surfaced on a mutating tool',
  tools.some(
    (t) => ['write_file', 'edit_file', 'multi_edit'].includes(t.name) && String(t.content ?? '').includes('after_edit hook observed'),
  ),
  'hook context appended to the edit result',
);

// The mock provider ignores prompts, so drive the guard hook directly: spawn it
// the same way the loop does and assert it vetoes a destructive command.
const { runHook, discoverHooks } = await import('../server/agent/hooks.ts').catch(() => ({}));
const hooksOnDisk = (customize.hooks ?? []).filter((h) => h.stage === 'before_tool');
check('before_tool guard hook is registered', hooksOnDisk.length >= 1, hooksOnDisk.map((h) => h.command).join(', '));

const { spawnSync } = await import('node:child_process');
const hookPath = 'examples/demo-project/.cursor/hooks/guard-command.mjs';
const payload = JSON.stringify({
  hook: 'before_tool',
  sessionId,
  root,
  tool: { name: 'run_command', args: { command: 'rm -rf / --no-preserve-root' } },
  timestamp: Date.now(),
});
const guardRun = spawnSync('node', [hookPath], { input: payload, encoding: 'utf8', cwd: process.cwd() });
check(
  'guard hook vetoes a destructive command',
  guardRun.stdout.includes('block'),
  guardRun.stdout.trim().slice(0, 80) || guardRun.stderr.slice(0, 80),
);

const safePayload = JSON.stringify({
  hook: 'before_tool',
  sessionId,
  root,
  tool: { name: 'run_command', args: { command: 'npm test' } },
  timestamp: Date.now(),
});
const safeRun = spawnSync('node', [hookPath], { input: safePayload, encoding: 'utf8', cwd: process.cwd() });
check('guard hook allows a normal command', !safeRun.stdout.includes('block'), safeRun.stdout.trim() || 'no output');

// --- checkpoint: the turn modified files, so one must exist ---
const list = await (await fetch(`${base}/api/agents/sessions/${sessionId}/checkpoints`)).json();
check('checkpoint recorded for the turn', list.checkpoints.length >= 1, `${list.checkpoints.length} checkpoint(s)`);
const checkpoint = list.checkpoints[0];
check('checkpoint tracks the touched file', (checkpoint?.files ?? []).some((f) => f.includes('mock-agent-check')), (checkpoint?.files ?? []).join(', '));

// Capture the scratch file, then restore and confirm it is gone / reverted.
const scratchPath = '.mock-agent-check.js';
const beforeRestore = await (await fetch(`${base}/api/workspace/file?path=${encodeURIComponent(scratchPath)}`)).json();
check('scratch file exists after the run', typeof beforeRestore.content === 'string', `${beforeRestore.size} bytes`);

const preview = await (await fetch(`${base}/api/agents/sessions/${sessionId}/checkpoints/${checkpoint.id}`)).json();
check('checkpoint preview returns a diff', Array.isArray(preview.diff) && preview.diff.length >= 1, `${preview.diff?.length} file(s)`);
check('diff shows before/after', preview.diff[0].before === null, 'file was absent before the turn');

const restore = await (
  await fetch(`${base}/api/agents/sessions/${sessionId}/checkpoints/${checkpoint.id}/restore`, { method: 'POST' })
).json();
check('restore reports the deletion', (restore.result?.deleted ?? []).includes(scratchPath), JSON.stringify(restore.result));

const afterRestore = await fetch(`${base}/api/workspace/file?path=${encodeURIComponent(scratchPath)}`);
check('file is gone after restore', afterRestore.status >= 400, `HTTP ${afterRestore.status}`);

// --- transcript is untouched by a restore (Cursor semantics) ---
const afterRestoreSession = await (await fetch(`${base}/api/agents/sessions/${sessionId}`)).json();
check('restore does not remove messages', (afterRestoreSession.session.items ?? []).length > 0, `${afterRestoreSession.session.items.length} items kept`);

// --- message edit truncates the tail ---
const userItem = (afterRestoreSession.session.items ?? []).find((i) => i.kind === 'user');
const edited = await (
  await fetch(`${base}/api/agents/sessions/${sessionId}/messages/${userItem.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Edited prompt text.' }),
  })
).json();
check('edit rewrites the message', edited.session.items[0].text === 'Edited prompt text.', edited.session.items[0].text);
check('edit drops later messages', edited.session.items.length === 1, `${edited.session.items.length} item(s) remain`);

// --- truncate ---
const run2 = await runTurn('Second turn to create something worth truncating.');
const sessionAfter2 = await (await fetch(`${base}/api/agents/sessions/${sessionId}`)).json();
const lastUser = [...sessionAfter2.session.items].reverse().find((i) => i.kind === 'user');
const truncated = await (
  await fetch(`${base}/api/agents/sessions/${sessionId}/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: lastUser.id }),
  })
).json();
check('truncate removes the tail', truncated.session.items.length < sessionAfter2.session.items.length, `${sessionAfter2.session.items.length} -> ${truncated.session.items.length}`);

// --- fork ---
const forkRes = await (
  await fetch(`${base}/api/agents/sessions/${sessionId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: null, title: 'forked branch' }),
  })
).json();
check('fork creates a session', Boolean(forkRes.session?.id) && forkRes.session.id !== sessionId, forkRes.session?.id);
check('fork copies the transcript', (forkRes.session.items ?? []).length >= 1, `${forkRes.session.items.length} item(s)`);
check('fork records lineage', forkRes.session.forkedFrom?.sessionId === sessionId, JSON.stringify(forkRes.session.forkedFrom));

const all = await (await fetch(`${base}/api/agents/sessions`)).json();
check('session list includes the fork', all.sessions.some((s) => s.id === forkRes.session.id), `${all.sessions.length} sessions`);

// cleanup
await fetch(`${base}/api/agents/sessions/${sessionId}`, { method: 'DELETE' });
await fetch(`${base}/api/agents/sessions/${forkRes.session.id}`, { method: 'DELETE' });

console.log(`\n${pass}/${pass + fail} advanced checks passed`);
process.exit(fail ? 1 : 0);
