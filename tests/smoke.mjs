// End-to-end smoke test: drives the running app (npm run dev) in headless Edge/Chrome.
// Usage: node tests/smoke.mjs [baseUrl]   (default http://localhost:5173)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = path.resolve('tests/screens');
fs.mkdirSync(OUT, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--window-size=1440,1000'], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const text = () => page.evaluate(() => document.body.innerText);
const go = async (hash) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading question bank'), { timeout: 20000 });
};
const clickText = async (t, sel = 'button, a') => {
  const ok = await page.evaluate(
    (t, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    t,
    sel,
  );
  await new Promise((r) => setTimeout(r, 350));
  return ok;
};
const has = (t, s) => t.toLowerCase().includes(s.toLowerCase());
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: false });

try {
  // Dashboard
  await go('/');
  let t = await text();
  check('dashboard renders', has(t, 'Study Dashboard') && has(t, 'Original CEH assessment'));
  check('dashboard shows real counts', /Unique questions\s*\n?\s*1\d{3}/i.test(t), t.match(/Unique questions\s*\n?\s*(\d+)/i)?.[1]);
  await shot('01-dashboard');

  // Chapters
  await go('/chapters');
  t = await text();
  check('20 chapter cards', (t.match(/CHAPTER \d\d/g) ?? []).length === 20);
  await shot('02-chapters');

  // Objective detail: incorrect tab hides answers
  await go('/chapters/chapter-1/chapter-1-objective-1');
  t = await text();
  check('objective page renders', has(t, 'Information Security Overview') && has(t, 'Incorrect Answers'));
  const hiddenOk = await page.evaluate(() => {
    const card = document.querySelector('article');
    return card && !card.innerText.includes('My original answer') && !card.innerText.includes('Correct ·') && !card.innerText.match(/\bCorrect\b(?! Answers)/);
  });
  check('incorrect tab hides answers by default', !!hiddenOk);
  await clickText('Reveal Answer', 'button');
  t = await page.evaluate(() => document.querySelector('article').innerText);
  check('reveal shows correct + my wrong answer', has(t, 'Correct') && has(t, 'My original answer'));
  await clickText('Hide Answer', 'button');
  t = await page.evaluate(() => document.querySelector('article').innerText);
  check('hide restores unrevealed state', !has(t, 'My original answer'));
  await shot('03-objective');

  // Source screenshot endpoint
  const qs = JSON.parse(fs.readFileSync('public/data/questions.json', 'utf8'));
  const res = await page.evaluate(async (p) => (await fetch('./source/' + encodeURI(p))).status, qs[0].sourceScreenshotPaths[0]);
  check('original screenshot served read-only', res === 200, String(res));

  // Objective quiz
  await clickText('Start Learning Objective Quiz');
  t = await text();
  check('launch dialog shows question count', /Questions\s*\n?\s*10/.test(t) || has(t, 'Only'));
  await clickText('Start', 'div[role=dialog] button');
  await page.waitForFunction(() => location.hash.includes('/exam/run'));
  await new Promise((r) => setTimeout(r, 600));
  t = await text();
  check('exam runner shows question 1 and timer', has(t, 'Question 1') && /00:1[45]:\d\d/.test(t));
  check('exam does not reveal answers', !has(t, 'Correct answer') && !has(t, 'Explanation'));
  await page.keyboard.press('1');
  await page.keyboard.press('n');
  await page.keyboard.press('2');
  await page.keyboard.press('m');
  await new Promise((r) => setTimeout(r, 1500));
  await shot('04-exam');
  // reload: session must persist with same deadline
  const before = (await text()).match(/(\d\d:\d\d:\d\d)/)?.[1];
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('question navigator'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1200));
  t = await text();
  const after = t.match(/(\d\d:\d\d:\d\d)/)?.[1];
  check('session survives reload (timer not reset)', !!before && !!after && after <= before, `${before} -> ${after}`);
  check('answers preserved after reload', /answered 2/.test(t), t.match(/answered \d+/)?.[0]);
  check('marked-for-review preserved', has(t, 'Marked for review (1)'));
  // submit
  await clickText('Submit Exam');
  t = await text();
  check('submit confirmation lists unanswered', has(t, 'unanswered question'));
  await clickText('Submit now', 'div[role=dialog] button');
  await page.waitForFunction(() => location.hash.includes('/results/'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  t = await text();
  check('results page renders', has(t, 'Retry Incorrect Questions') && has(t, 'Unanswered'));
  check('results show correct/incorrect review', has(t, 'Correct answer'));
  await shot('05-results');

  // History, Radar, Exam Center, Bookmarks, Settings
  await go('/history');
  t = await text();
  check('history lists attempt', has(t, 'LO 1.1 Quiz'));
  await go('/weakness');
  t = await text();
  check('weakness radar renders', has(t, 'Prioritized study queue') && has(t, 'Weakest chapters'));
  await shot('06-radar');
  await go('/exam-center');
  await clickText('Start', '.panel-glow button');
  t = await text();
  check('mock exam dialog: 125 questions, 4h', /Questions\s*\n?\s*125/i.test(t) && has(t, '4h 00m'));
  await clickText('Cancel', 'div[role=dialog] button');
  await go('/settings');
  t = await text();
  check('settings + review queue render', has(t, 'Manual question review queue') && has(t, 'Extraction report'));
  await shot('07-settings');
  await go('/bookmarks');
  check('bookmarks page renders', (await text()).includes('Bookmarked Questions'));
} catch (e) {
  check('unexpected exception', false, String(e));
} finally {
  const real = errors.filter((e) => !/favicon|fonts\.g/.test(e));
  check('no console/page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
