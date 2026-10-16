/**
 * Verifies the streaming affordance: a shimmer sweep instead of a blinking
 * cursor. Drives the slow-streaming mock and samples the DOM throughout a run.
 *
 * Usage:
 *   npm run mock:slow            # terminal 1
 *   npm run test:streaming       # terminal 2
 */
import { chromium } from 'playwright';

const api = process.argv[2] ?? 'http://127.0.0.1:8787';
const ui = process.argv[3] ?? 'http://127.0.0.1:5173';

await fetch(`${api}/api/settings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseUrl: 'http://127.0.0.1:9913/v1', model: 'slow-stream', apiKey: 'sk-mock-key' }),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(ui, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.click('button[title="Agents Window"]');
await page.waitForTimeout(600);
await page.click('.agentsbar__header .icon-btn');
await page.waitForTimeout(400);
await page.fill('.composer__textarea', 'Summarise the game module.');
await page.keyboard.press('Enter');

let sawThinking = false;
let sawShimmer = false;
let sawCaret = false;

for (let i = 0; i < 80; i += 1) {
  await page.waitForTimeout(250);
  if (await page.locator('.thinking').count()) sawThinking = true;
  if (await page.locator('.md--streaming').count()) sawShimmer = true;
  if (await page.locator('.msg__caret').count()) sawCaret = true;
  const status = await page.locator('.transcript__meta .badge').first().textContent().catch(() => '');
  if (status === 'done') break;
}
await page.waitForTimeout(1200);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

check('thinking state appears before the first token', sawThinking);
check('streaming shimmer appears while tokens arrive', sawShimmer);
check('no blinking caret element ever rendered', !sawCaret);
check('shimmer cleared once the run finished', (await page.locator('.md--streaming').count()) === 0);
check('thinking cleared once the run finished', (await page.locator('.thinking').count()) === 0);
check('final answer rendered as markdown', (await page.locator('.md h2').count()) >= 1);
check('final code block still highlighted', (await page.locator('.codeblock .hljs-keyword').count()) >= 1);
check('no page errors', errs.length === 0, errs.join('; '));

await page.screenshot({ path: 'shots/streaming-final.png' });
await browser.close();
console.log(`\n${pass}/${pass + fail} streaming checks passed`);
process.exit(fail ? 1 : 0);
