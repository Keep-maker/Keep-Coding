import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
// production build served by the API server on a single port
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('text=src');
await page.waitForTimeout(400);
await page.click('text=index.js');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/11-production-single-port.png' });
console.log('monaco rendered:', await page.locator('.monaco-editor').count());
console.log('errors:', errs.length ? errs.slice(0,6) : 'none');
await browser.close();
