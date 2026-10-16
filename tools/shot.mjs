/**
 * Visual verification pass. Drives the app in a real browser, captures
 * screenshots into shots/, and reports any console errors.
 *
 * Usage:
 *   node tools/shot.mjs                    # both windows against the dev server
 *   node tools/shot.mjs http://127.0.0.1:8787
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const outDir = 'shots';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`captured ${outDir}/${name}.png`);
};

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await shot('01-editor-empty');

// Open nested files to exercise the tree, tabs, and Monaco highlighting.
await page.click('text=src').catch(() => {});
await page.waitForTimeout(400);
await page.click('text=index.js').catch(() => {});
await page.waitForTimeout(2800);
await shot('02-editor-file');

// Workspace search
await page.click('[title="Search"]').catch(() => {});
await page.waitForTimeout(500);
await page.fill('.searchpanel__input-wrap input', 'task').catch(() => {});
await page.waitForTimeout(1500);
await shot('03-search');
await page.click('[title="Explorer"]').catch(() => {});
await page.waitForTimeout(400);

// Integrated terminal
await page.click('text=Terminal').catch(() => {});
await page.waitForTimeout(600);
await page.fill('.terminalpanel__input input', 'node -e "console.log(process.version)"').catch(() => {});
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);
await shot('04-terminal');
await page.click('.terminalpanel .icon-btn').catch(() => {});
await page.waitForTimeout(400);

// Quick open
await page.keyboard.press('Control+p');
await page.waitForTimeout(900);
await shot('05-quickopen');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Settings
await page.click('button[title="Model settings"]').catch(() => {});
await page.waitForTimeout(600);
await shot('06-settings');
await page.click('.dialog__header .icon-btn').catch(() => {});
await page.waitForTimeout(400);

// Agents window
await page.click('button[title="Agents Window"]').catch(() => {});
await page.waitForTimeout(900);
await shot('07-agents-empty');

await page.click('.agentsbar__header .icon-btn').catch(() => {});
await page.waitForTimeout(500);
await page.fill('.composer__textarea', 'Explain the structure of this project.').catch(() => {});
await page.keyboard.press('Enter');
await page.waitForTimeout(16000);
await shot('08-agents-run');

await page.click('text=Changes').catch(() => {});
await page.waitForTimeout(1200);
await shot('09-agents-changes');

// Round trip back to the editor, confirming shared state survives the switch
await page.click('text=Open Editor').catch(() => {});
await page.waitForTimeout(1500);
await shot('10-back-to-editor');

console.log(errors.length ? `\nCONSOLE ERRORS (${errors.length}):\n${errors.slice(0, 12).join('\n')}` : '\nno console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
