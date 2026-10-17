/**
 * Markdown renderer verification. Points the app at mock-markdown.mjs and checks
 * that every markdown construct renders and that raw HTML is escaped, not executed.
 *
 * Usage:
 *   node tools/mock-markdown.mjs 9912      # terminal 1
 *   node tools/md-verify.mjs               # terminal 2
 */
import { chromium } from 'playwright';

const api = process.argv[2] ?? 'http://127.0.0.1:8787';
const ui = process.argv[3] ?? 'http://127.0.0.1:5173';

// Point the app at the markdown-only mock provider.
const previous = await (await fetch(`${api}/api/settings`)).json();
await fetch(`${api}/api/settings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseUrl: 'http://127.0.0.1:9912/v1', model: 'md-torture', apiKey: 'sk-mock-key' }),
});

const browser = await chromium.launch();
try {
const page = await browser.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 1.6 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(ui, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('button[title="Agents Window"]');
await page.waitForTimeout(600);
await page.click('.agentsbar__header .icon-btn');
await page.waitForTimeout(500);
await page.fill('.composer__textarea', 'Render the markdown torture test.');
await page.keyboard.press('Enter');
await page.waitForTimeout(7000);
await page.screenshot({ path: 'shots/md-torture.png' });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const count = (sel) => page.locator(sel).count();
check('h1/h2/h3 headings', (await count('.md h1')) === 1 && (await count('.md h2')) === 1 && (await count('.md h3')) === 1);
check('bold + italic', (await count('.md strong')) >= 1 && (await count('.md em')) >= 1);
check('strikethrough', (await count('.md del')) >= 1);
check('ordered + nested lists', (await count('.md ol li')) >= 3 && (await count('.md ul li')) >= 2);
check('GFM table', (await count('.md-table-wrap table')) === 1 && (await count('.md-table-wrap tbody tr')) === 1);
check('GFM task list', (await count('.md li input[type=checkbox]')) === 2);
check('blockquote', (await count('.md blockquote')) === 1);
check('syntax-highlighted code block', (await count('.codeblock .hljs-keyword')) >= 1);
check('copy button present', (await count('.codeblock__copy')) === 1);

// Security: raw HTML in the model output must be escaped, never executed.
const xss = await page.evaluate(() => ({
  a: window.__xss,
  b: window.__xss2,
  scripts: document.querySelectorAll('.md script').length,
  imgs: document.querySelectorAll('.md img').length,
}));
check('raw <script> not executed', !xss.a && xss.scripts === 0, JSON.stringify(xss));
check('onerror handler not injected', !xss.b);
check('no page errors', pageErrors.length === 0, pageErrors.join('; '));

} finally {
  await browser.close();
  await fetch(`${api}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: previous.baseUrl, model: previous.model }),
  });
}
console.log(`\n${pass}/${pass + fail} markdown checks passed`);
process.exit(fail ? 1 : 0);
