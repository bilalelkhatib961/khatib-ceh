// Cloud-mode end-to-end test against your real Supabase project.
// Credentials come from environment variables so they never appear in files or chat:
//   $env:KHATIB_EMAIL="you@example.com"; $env:KHATIB_PASSWORD="..."; node tests/cloud.mjs http://localhost:5199
// Without credentials only the signed-out checks run.
// Local /data files are BLOCKED so the question bank must come from Supabase.
// It creates one real 10-question attempt (named "Cloud test") in your history.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const EMAIL = process.env.KHATIB_EMAIL;
const PASSWORD = process.env.KHATIB_PASSWORD;
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
let failed = 0;
const check = (n, ok, d = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: exe, headless: true });

// each "device" = isolated browser context (separate storage, like a different phone/PC)
async function device(name, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.setRequestInterception(true);
  page.on('request', (r) => (/\/data\/[a-z-]+\.json/.test(r.url()) ? r.abort() : r.continue()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${name} console: ${m.text().slice(0, 300)}`));
  page.on('requestfailed', (r) => !/\/data\//.test(r.url()) && errors.push(`${name} request failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${name} HTTP ${r.status()}: ${r.url().slice(0, 140)}`));
  devices.push({ name, page, errors });
  return { page, errors, ctx };
}
const devices = [];
const txt = (p) => p.evaluate(() => document.body.innerText.toLowerCase());
const click = (p, t, sel = 'button') =>
  p.evaluate(
    (t, sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().toLowerCase().includes(t) && !e.disabled);
      el?.click();
      return !!el;
    },
    t.toLowerCase(),
    sel,
  );
async function login(p) {
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input[type=email]', { timeout: 20000 });
  await p.type('input[type=email]', EMAIL);
  await p.type('input[type=password]', PASSWORD);
  await click(p, 'sign in');
  await p.waitForFunction(() => document.body.innerText.toLowerCase().includes('study dashboard'), { timeout: 120000 }); // first load downloads ~2.6 MB
}

try {
  const A = await device('laptop', { width: 1366, height: 900 });
  await A.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await A.page.waitForSelector('input[type=email]', { timeout: 20000 });
  let t = await txt(A.page);
  check('signed-out visitor sees only the sign-in screen', t.includes('sign in') && !t.includes('study dashboard') && !t.includes('unique questions'));
  await A.page.type('input[type=email]', 'nobody@example.com');
  await A.page.type('input[type=password]', 'wrong-password');
  await click(A.page, 'sign in');
  await sleep(2500);
  t = await txt(A.page);
  check('wrong credentials are rejected', t.includes('invalid') || t.includes('credentials'));
  A.errors.length = 0; // the HTTP 400 from that deliberate wrong login is expected

  if (!EMAIL || !PASSWORD) {
    console.log('\n(Set KHATIB_EMAIL and KHATIB_PASSWORD to run the signed-in checks.)');
  } else {
    await A.page.reload({ waitUntil: 'domcontentloaded' });
    await A.page.evaluate(() => document.querySelectorAll('input').forEach((i) => (i.value = '')));
    await login(A.page);
    t = await txt(A.page);
    check('laptop: bank loaded from Supabase (local files blocked)', /unique questions\s*\n?\s*1569/.test(t));
    // start an objective quiz, answer 2, leave it unfinished
    await A.page.goto(`${BASE}/#/chapters/chapter-20/chapter-20-objective-2`, { waitUntil: 'domcontentloaded' });
    await A.page.waitForFunction(() => document.body.innerText.toLowerCase().includes('start learning objective quiz'), { timeout: 30000 });
    await sleep(800);
    await click(A.page, 'start learning objective quiz');
    await sleep(400);
    await click(A.page, 'start', 'div[role=dialog] button');
    await A.page.waitForFunction(() => location.hash.includes('/exam/run'));
    await sleep(800);
    await A.page.keyboard.press('1');
    await A.page.keyboard.press('n');
    await A.page.keyboard.press('2');
    await sleep(6500); // cloud session save is throttled to 5 s
    const timerA = (await txt(A.page)).match(/(\d\d:\d\d:\d\d)/)?.[1];

    // second device (phone) resumes it
    const B = await device('phone', { width: 390, height: 844, isMobile: true, hasTouch: true });
    await login(B.page);
    await B.page.goto(`${BASE}/#/exam/run`, { waitUntil: 'domcontentloaded' });
    await B.page.waitForFunction(() => document.body.innerText.toLowerCase().includes('question navigator'), { timeout: 20000 });
    await sleep(1000);
    t = await txt(B.page);
    const timerB = t.match(/(\d\d:\d\d:\d\d)/)?.[1];
    check('phone: resumes the unfinished quiz from the laptop', t.includes('answered 2'), t.match(/answered \d+/)?.[0]);
    check('phone: same deadline (timer continues, not reset)', !!timerA && !!timerB && timerB <= timerA, `${timerA} -> ${timerB}`);
    // finish on the phone
    await click(B.page, 'submit exam');
    await sleep(300);
    await click(B.page, 'submit now', 'div[role=dialog] button');
    await B.page.waitForFunction(() => location.hash.includes('/results/'), { timeout: 20000 });
    await sleep(1500);
    t = await txt(B.page);
    check('phone: result saved to cloud', t.includes('saved to cloud'), t.match(/saved[^\n]*/)?.[0]);
    const attemptId = B.page.url().split('/results/')[1];
    console.log(`      test attempt id: ${attemptId}`);
    console.log(`      to remove it afterwards, run in Supabase SQL Editor:  delete from public.attempts where id = '${attemptId}';`);

    // laptop picks up the result
    await A.page.goto(`${BASE}/#/history`, { waitUntil: 'domcontentloaded' });
    await A.page.reload({ waitUntil: 'domcontentloaded' });
    await A.page.waitForFunction(() => document.body.innerText.toLowerCase().includes('assessment history'), { timeout: 30000 });
    await sleep(1500);
    t = await txt(A.page);
    check('laptop: history shows the attempt finished on the phone', t.includes('lo 20.2 quiz'));
    await A.page.goto(`${BASE}/#/results/${attemptId}`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    check('laptop: no longer offers to resume the submitted quiz', !(await txt(A.page)).includes('resume “'));

    // bookmarks sync
    await A.page.goto(`${BASE}/#/chapters/chapter-20/chapter-20-objective-2`, { waitUntil: 'domcontentloaded' });
    await A.page.waitForFunction(() => document.body.innerText.toLowerCase().includes('start learning objective quiz'), { timeout: 30000 });
    await sleep(800);
    await A.page.evaluate(() => document.querySelector('button[title="Bookmark"]')?.click());
    await sleep(1500);
    await B.page.goto(`${BASE}/#/bookmarks`, { waitUntil: 'domcontentloaded' });
    await B.page.reload({ waitUntil: 'domcontentloaded' });
    await B.page.waitForFunction(() => document.body.innerText.toLowerCase().includes('bookmarked questions'), { timeout: 30000 });
    await sleep(1500);
    t = await txt(B.page);
    check('phone: sees the bookmark added on the laptop', !t.includes('no bookmarks yet'));
    // tidy: remove that bookmark again
    await A.page.evaluate(() => document.querySelector('button[title="Remove bookmark"]')?.click());
    await sleep(800);
    for (const d of [A, B]) check(`no page errors (${d === A ? 'laptop' : 'phone'})`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
  }
} catch (e) {
  check('unexpected exception', false, String(e).split('\n')[0]);
  // diagnostics: what each device was showing when it failed
  for (const d of devices) {
    try {
      const url = d.page.url();
      const body = (await d.page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400);
      await d.page.screenshot({ path: `tests/screens/cloud-fail-${d.name}.png` });
      console.log(`\n[${d.name}] url: ${url}\n[${d.name}] screen: ${body}`);
      for (const er of d.errors.slice(0, 8)) console.log(`[${d.name}] ${er}`);
    } catch {
      /* page closed */
    }
  }
} finally {
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
