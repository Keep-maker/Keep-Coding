import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('button[title="Agents Window"]');
await page.waitForTimeout(700);

// Start two agents back to back in the UI (parallel execution).
await page.click('.agentsbar__header .icon-btn');
await page.waitForTimeout(500);
await page.fill('.composer__textarea', 'First parallel task: inspect the project structure.');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await page.click('.agentsbar__header .icon-btn');
await page.waitForTimeout(500);
await page.fill('.composer__textarea', 'Second parallel task: check the formatter.');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/12-parallel-agents.png' });

// Both should reach a settled state; confirm via the API.
const res = await fetch('http://127.0.0.1:8787/api/agents/sessions');
const data = await res.json();
const running = data.sessions.filter(s => s.status === 'running').length;
console.log('sessions:', data.sessions.length, 'running now:', running);
await page.waitForTimeout(12000);
const res2 = await fetch('http://127.0.0.1:8787/api/agents/sessions');
const data2 = await res2.json();
console.log('statuses:', data2.sessions.map(s => s.status).join(', '));
await page.screenshot({ path: 'shots/13-parallel-done.png' });
console.log('errors:', errs.length ? errs.slice(0,8) : 'none');
await browser.close();
