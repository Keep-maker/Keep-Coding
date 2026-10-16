import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('button[title="Agents Window"]');
await page.waitForTimeout(600);
await page.fill('.composer__textarea', 'Add an overdue flag to the task formatter and verify the tests pass.');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
// wait for the scripted 4-step run to finish
await page.waitForTimeout(14000);
await page.screenshot({ path: 'shots/05-agents-run.png' });
// also capture with the changes panel open
await page.click('text=Changes');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/06-agents-changes.png' });
console.log('errors:', errs.length ? errs.slice(0,10) : 'none');
console.log('status text:', await page.textContent('body').then(t => t.slice(0,0) || 'ok'));
await browser.close();
