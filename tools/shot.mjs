/**
 * Screenshot helper: renders the app in a real browser so the UI can be
 * visually verified during development.
 *
 * Usage: node tools/shot.mjs <url> <outfile> [waitMs] [clickSelector]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [, , url = 'http://127.0.0.1:5173', out = 'shots/shot.png', waitMs = '2500', clickSelector = ''] = process.argv;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));

if (clickSelector) {
  await page.click(clickSelector);
  await page.waitForTimeout(1200);
}

fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
await page.screenshot({ path: out, fullPage: false });

console.log(`screenshot: ${out}`);
if (consoleErrors.length) {
  console.log('--- console errors ---');
  for (const err of consoleErrors.slice(0, 12)) console.log(err);
} else {
  console.log('no console errors');
}

await browser.close();
