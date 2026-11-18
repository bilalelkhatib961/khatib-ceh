// Phone-width layout check: screenshots key pages at 390x844 and reports horizontal overflow.
// Usage: node tests/mobile.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve('tests/screens');
fs.mkdirSync(OUT, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
let bad = 0;
const visit = async (hash, name) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading question bank'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${overflow > 1 ? 'FAIL' : 'PASS'}  ${name} horizontal overflow ${overflow}px`);
  if (overflow > 1) bad++;
  await page.screenshot({ path: path.join(OUT, `m-${name}.png`) });
};
await visit('/', 'dashboard');
await visit('/chapters', 'chapters');
await visit('/chapters/chapter-20/chapter-20-objective-2', 'objective');
await visit('/history', 'history');
await visit('/weakness', 'radar');
await visit('/settings', 'settings');
// start an objective quiz and look at the runner
await page.goto(`${BASE}/#/chapters/chapter-20/chapter-20-objective-2`, { waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start Learning Objective Quiz')).click());
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => [...document.querySelectorAll('div[role=dialog] button')].find((b) => b.textContent.trim() === 'Start').click());
await new Promise((r) => setTimeout(r, 1000));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`${overflow > 1 ? 'FAIL' : 'PASS'}  exam horizontal overflow ${overflow}px`);
if (overflow > 1) bad++;
await page.screenshot({ path: path.join(OUT, 'm-exam.png') });
await browser.close();
process.exit(bad ? 1 : 0);
