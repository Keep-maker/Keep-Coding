import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// Final acceptance pass on the production single-port build.
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('text=src'); await page.waitForTimeout(400);
await page.click('text=index.js'); await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/final-1-editor.png' });

// switch to Agents window and run a task
await page.click('button[title="Agents Window"]');
await page.waitForTimeout(600);
await page.click('.agentsbar__header .icon-btn');
await page.waitForTimeout(500);
await page.fill('.composer__textarea', 'Review the formatter and verify the test suite.');
await page.keyboard.press('Enter');
await page.waitForTimeout(16000);
await page.screenshot({ path: 'shots/final-2-agents.png' });

await page.click('text=Changes');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/final-3-changes.png' });

// back to the editor to confirm the shared state carried over
await page.click('text=Open Editor');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/final-4-back-to-editor.png' });

console.log('errors:', errs.length ? errs.slice(0,10) : 'none');
await browser.close();
