// Regression test for (1) badges reflecting current performance and (2) untimed all-question LO quizzes.
// Local mode only (no cloud writes). Usage: node tests/lo-quiz.mjs http://localhost:5198 [chapter-3] [chapter-3-objective-3]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const CH = process.argv[3] ?? 'chapter-3';
const LO = process.argv[4] ?? 'chapter-3-objective-3';
const qs = JSON.parse(fs.readFileSync('public/data/questions.json', 'utf8'));
const pool = qs.filter((q) => q.learningObjectiveId === LO && q.verificationStatus === 'verified');
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
let failed = 0;
const check = (n, ok, d = '') => (ok || failed++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: exe, headless: true, defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const txt = () => page.evaluate(() => document.body.innerText);
const badgeOf = (loNum) =>
  page.evaluate((loNum) => {
    const card = [...document.querySelectorAll('a.panel')].find((a) => a.innerText.includes(`LO ${loNum}`));
    return card?.querySelector('.chip')?.textContent.trim();
  }, loNum);
const loNum = `${CH.split('-')[1]}.${LO.split('-').pop()}`;

try {
  await page.goto(`${BASE}/#/chapters/${CH}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Objectives') || document.body.innerText.includes('OBJECTIVES'), { timeout: 20000 });
  const before = await badgeOf(loNum);
  console.log(`      LO ${loNum} badge before practice: ${before} (${pool.length} verified questions)`);

  await page.goto(`${BASE}/#/chapters/${CH}/${LO}`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start Learning Objective Quiz')).click());
  await sleep(400);
  let t = await txt();
  check('dialog: all questions in the objective', new RegExp(`Questions\\s*\\n?\\s*${pool.length}\\b`, 'i').test(t), `expected ${pool.length}`);
  check('dialog: no time limit', /No time limit/i.test(t));
  check('dialog: no "only N available" warning', !/verified unique questions are available/.test(t));
  await page.evaluate(() => [...document.querySelectorAll('div[role=dialog] button')].find((b) => b.textContent.trim() === 'Start').click());
  await page.waitForFunction(() => location.hash.includes('/exam/run'));
  await sleep(2500);
  t = await txt();
  const clock1 = t.match(/(\d\d:\d\d:\d\d)/)?.[1];
  check('runner: total matches pool', t.includes(`/ ${pool.length}`), t.match(/Question \d+ \/ \d+/)?.[0]);
  await sleep(2200);
  const clock2 = (await txt()).match(/(\d\d:\d\d:\d\d)/)?.[1];
  check('runner: shows elapsed time counting UP (untimed)', !!clock1 && !!clock2 && clock2 > clock1 && clock1 < '00:01:00', `${clock1} -> ${clock2}`);

  // answer every question correctly using the bank's answer key
  for (let i = 0; i < pool.length; i++) {
    const qtext = await page.evaluate(() => document.querySelector('article p.question-text')?.textContent ?? '');
    const q = pool.find((x) => x.text === qtext);
    if (!q) throw new Error('question not found in pool: ' + qtext.slice(0, 60));
    const correctTexts = q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text);
    await page.evaluate((correctTexts) => {
      for (const b of document.querySelectorAll('article [role=radio], article [role=checkbox]')) {
        const label = b.querySelector('span.flex-1')?.textContent ?? '';
        if (correctTexts.includes(label)) b.click();
      }
    }, correctTexts);
    await sleep(150);
    if (i < pool.length - 1) await page.keyboard.press('n');
    await sleep(150);
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Submit Exam')).click());
  await sleep(300);
  t = await txt();
  check('submit dialog: untimed wording', /no time limit/i.test(t));
  await page.evaluate(() => [...document.querySelectorAll('div[role=dialog] button')].find((b) => b.textContent.includes('Submit now')).click());
  await page.waitForFunction(() => location.hash.includes('/results/'), { timeout: 15000 });
  await sleep(800);
  t = await txt();
  check('results: 100% score', t.includes('100.0%'));
  check('results: shows "no time limit"', /no time limit/i.test(t));

  await page.goto(`${BASE}/#/chapters/${CH}`, { waitUntil: 'networkidle0' });
  await sleep(800);
  const after = await badgeOf(loNum);
  check(`chapter page: LO ${loNum} badge reflects the new 100% (was ${before})`, after === 'Mastered', after);
  t = await txt();
  check('chapter page: original accuracy still shown', /Original accuracy/i.test(t));
  await page.goto(`${BASE}/#/chapters/${CH}/${LO}`, { waitUntil: 'networkidle0' });
  await sleep(600);
  const head = await page.evaluate(() => document.querySelector('header .chip')?.textContent.trim());
  check('objective page: header badge Mastered', head === 'Mastered', head);
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (e) {
  check('unexpected exception', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
