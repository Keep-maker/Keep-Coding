import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// expand src
await page.click('text=src');
await page.waitForTimeout(400);
await page.click('text=index.js');
await page.waitForTimeout(3500);
await page.screenshot({ path: 'shots/02-editor-file.png' });
// open search
await page.click('[title="Search"]');
await page.waitForTimeout(600);
await page.fill('.searchpanel__input-wrap input', 'task');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/03-search.png' });
console.log('errors:', errs.length ? errs.slice(0,8) : 'none');
await browser.close();
