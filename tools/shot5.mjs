import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

// 1. Terminal in the editor window
await page.click('text=Terminal');
await page.waitForTimeout(700);
await page.fill('.terminalpanel__input input', 'node -e "console.log(process.version)"');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/07-terminal.png' });

// 2. Settings dialog
await page.click('button[title="Model settings"]');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/08-settings.png' });
await page.click('text=Test connection');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/09-settings-test.png' });
await page.keyboard.press('Escape');
await page.click('.dialog__header .icon-btn');
await page.waitForTimeout(400);

// 3. Quick open palette
await page.keyboard.press('Control+p');
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/10-quickopen.png' });
await page.keyboard.press('Escape');

console.log('errors:', errs.length ? errs.slice(0,10) : 'none');
await browser.close();
