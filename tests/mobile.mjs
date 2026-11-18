// Phone layout check, sized for iPhone 18 Pro (402 x 874 CSS px, portrait and landscape).
// Reports horizontal overflow and form fields that would make iOS Safari zoom in, and saves screenshots.
// Usage: node tests/mobile.mjs [baseUrl]      (set CHROME_PATH to use a browser other than Chrome/Edge)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve('tests/screens');
fs.mkdirSync(OUT, { recursive: true });
const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(
  (p) => p && fs.existsSync(p),
);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SCREENS = [
  { tag: 'portrait', width: 402, height: 874 },
  { tag: 'landscape', width: 874, height: 402 },
];

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
let bad = 0;
for (const scr of SCREENS) {
  const page = await browser.newPage();
  await page.emulate({ userAgent: IPHONE_UA, viewport: { width: scr.width, height: scr.height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } });
  const check = async (name) => {
    await new Promise((r) => setTimeout(r, 500));
    const r = await page.evaluate((w) => {
      // A phone browser zooms the page out when content is too wide, which also widens innerWidth,
      // so compare against the real screen width rather than innerWidth.
      const overflow = Math.max(document.documentElement.scrollWidth, window.innerWidth) - w;
      // iOS Safari zooms in on focus when a field's text is smaller than 16px
      const zoom = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')].filter(
        (el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16,
      ).length;
      return { overflow, zoom };
    }, scr.width);
    const ok = r.overflow <= 0 && r.zoom === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${scr.tag} ${name}: horizontal overflow ${r.overflow}px, fields that zoom on focus ${r.zoom}`);
    if (!ok) bad++;
    await page.screenshot({ path: path.join(OUT, `m-${scr.tag}-${name}.png`) });
  };
  const visit = async (hash, name) => {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.body.innerText.includes('Loading question bank'), { timeout: 20000 });
    await check(name);
  };
  await visit('/', 'dashboard');
  await visit('/chapters', 'chapters');
  await visit('/chapters/chapter-20', 'chapter');
  await visit('/chapters/chapter-20/chapter-20-objective-2', 'objective');
  await visit('/exam-center', 'exam-center');
  await visit('/history', 'history');
  await visit('/weakness', 'radar');
  await visit('/bookmarks', 'bookmarks');
  await visit('/settings', 'settings');
  // start an objective quiz and look at the runner
  await page.goto(`${BASE}/#/chapters/chapter-20/chapter-20-objective-2`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start Learning Objective Quiz')).click());
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => [...document.querySelectorAll('div[role=dialog] button')].find((b) => b.textContent.trim() === 'Start').click());
  await new Promise((r) => setTimeout(r, 1000));
  await check('exam');
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
