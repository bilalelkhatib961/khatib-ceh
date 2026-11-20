// Revision Radar acceptance test: drives the running app (npm run dev) in headless Chrome/Edge.
// Checks content, checkboxes, progress maths, persistence, search/filter/sort, chapter completion,
// export/import (incl. invalid files and standalone-tracker backups), reset confirmations,
// corrupted storage recovery, other localStorage keys staying untouched, and the iPhone layout.
// Usage: node tests/revision-radar.mjs [baseUrl]   (set CHROME_PATH to use a browser other than Chrome/Edge)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const KEY = 'khatib-ceh:revision-radar:v1';
const TOTAL = 199;
const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(
  (p) => p && fs.existsSync(p),
);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'revision-radar-'));

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: TMP });

const ready = () => page.waitForFunction(() => !document.body.innerText.includes('Loading question bank'), { timeout: 30000 });
const go = async (hash) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
  await ready();
  await sleep(200);
};
const reload = async () => {
  await page.reload({ waitUntil: 'networkidle0' });
  await ready();
  await sleep(200);
};
const click = async (label, scope = 'body') => {
  const ok = await page.evaluate(
    (label, scope) => {
      const el = [...document.querySelectorAll(`${scope} button, ${scope} a`)].find((e) => e.textContent.trim().startsWith(label) && !e.disabled);
      el?.click();
      return !!el;
    },
    label,
    scope,
  );
  await sleep(150);
  return ok;
};
const cards = () => page.$$eval('article[id^="rr-ch"]', (els) => els.map((e) => e.id.replace('rr-', '')));
const percent = () => page.$eval('[data-testid=rr-percent]', (e) => e.textContent.trim());
const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
const tick = (id) => page.evaluate((id) => document.querySelector(`input[data-concept="${id}"]`).click(), id);
const isChecked = (id) => page.evaluate((id) => document.querySelector(`input[data-concept="${id}"]`)?.checked ?? null, id);
const setFilter = async (key) => {
  await page.click(`button[data-filter="${key}"]`);
  await sleep(150);
};
const setSort = async (value) => {
  await page.select('select[aria-label="Sort chapters"]', value);
  await sleep(150);
};
const search = async (q) => {
  await page.$eval('input[aria-label="Search chapters and concepts"]', (el) => {
    el.focus();
  });
  await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Search chapters and concepts"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (q) await page.type('input[aria-label="Search chapters and concepts"]', q);
  await sleep(200);
};
const upload = async (name, content) => {
  const f = path.join(TMP, name);
  fs.writeFileSync(f, content);
  const input = await page.$('[data-testid=rr-import-file]');
  await input.uploadFile(f);
  await sleep(400);
};
const bodyText = () => page.evaluate(() => document.body.innerText);

try {
  // ---- other localStorage keys must survive untouched ----
  await go('/');
  const foreign = { 'sb-fixture-auth-token': '{"keep":"me"}', 'khatib-ceh-revision-v1': '["10-0"]', 'unrelated-key': 'x'.repeat(50) };
  await page.evaluate((f, k) => {
    for (const [a, b] of Object.entries(f)) localStorage.setItem(a, b);
    localStorage.removeItem(k);
  }, foreign, KEY);

  // ---- navigation ----
  await page.evaluate(() => [...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === 'Revision Radar')?.click());
  await sleep(400);
  check('nav item opens the page', page.url().endsWith('#/revision') && (await bodyText()).includes('Master the concepts, not the answers'), page.url());

  // ---- content ----
  check('20 chapter cards', (await cards()).length === 20, (await cards()).length);
  await click('Expand all');
  const boxes = await page.$$eval('input[data-concept]', (els) => els.length);
  check(`all ${TOTAL} concepts rendered`, boxes === TOTAL, boxes);
  const ids = await page.$$eval('input[data-concept]', (els) => els.map((e) => e.dataset.concept));
  check('concept ids are unique and not index-based', new Set(ids).size === ids.length && ids.every((id) => /^ch\d\d-[a-z0-9-]+$/.test(id) && !/^ch\d\d-\d+$/.test(id)));
  const t = await bodyText();
  check('priority chips, reminders and weak objectives shown', t.includes('HIGH') && t.includes('FOCUSED') && t.includes('STANDARD') && t.includes('EXAM REMINDER') && t.includes('Weak objective 4.4 · NTP and NFS Enumeration'));
  check('starts at 0%', (await percent()) === '0%');
  check('exam countdown shown without an invented time', t.includes('CEH EXAM') && t.includes('exam time not set'));

  // ---- default sort: weakest first ----
  check('default sort = weakest first, high priority on top', (await cards()).slice(0, 5).join() === 'ch10,ch08,ch19,ch12,ch18', (await cards()).slice(0, 6).join());

  // ---- checkboxes and maths ----
  const first = 'ch10-dos-ddos-drdos';
  await tick(first);
  check('ticking updates percent immediately', (await percent()) === `${Math.round((1 / TOTAL) * 100)}%` && (await bodyText()).includes(`1/${TOTAL} concepts revised`));
  check('ticking saved to localStorage', JSON.parse(await stored()).checked[first] !== undefined);
  await tick(first);
  check('unticking works', (await isChecked(first)) === false && (await percent()) === '0%');
  let flips = 0;
  for (const id of ids) {
    await page.evaluate((id) => document.querySelector(`input[data-concept="${id}"]`).click(), id);
    flips += (await isChecked(id)) ? 1 : 0;
  }
  check('every checkbox toggles on', flips === TOTAL, flips);
  check('100% with every concept ticked, 20/20 chapters', (await percent()) === '100%' && (await bodyText()).includes('20/20'));
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await reload();

  // ---- chapter completion and persistence ----
  await click('Expand all');
  const ch10 = await page.$$eval('article#rr-ch10 input[data-concept]', (els) => els.length);
  for (let i = 0; i < ch10 - 1; i++) await page.evaluate((i) => document.querySelectorAll('article#rr-ch10 input[data-concept]')[i].click(), i);
  check('chapter not completed until every concept is ticked', !(await page.$('article#rr-ch10 [aria-label="Chapter completed"]')));
  await click('Mark all as revised', 'article#rr-ch10');
  check('Mark all as revised completes the chapter', !!(await page.$('article#rr-ch10 [aria-label="Chapter completed"]')) && (await bodyText()).includes('1/20'));
  await tick('ch04-ntp-enumeration-udp-123');
  const expected = `${Math.round(((ch10 + 1) / TOTAL) * 100)}%`;
  check('overall maths after mark-all', (await percent()) === expected, `${await percent()} vs ${expected}`);
  await reload();
  await click('Expand all');
  check('progress survives a reload', (await percent()) === expected && (await isChecked('ch04-ntp-enumeration-udp-123')) === true);

  // ---- filters ----
  for (const [key, n] of [
    ['high', 5],
    ['focused', 6],
    ['completed', 1],
    ['incomplete', 19],
    ['all', 20],
  ]) {
    await setFilter(key);
    check(`filter "${key}" shows ${n}`, (await cards()).length === n, (await cards()).length);
  }
  await setFilter('completed');
  await reload();
  check('filter preference persists', (await cards()).length === 1);
  await setFilter('all');

  // ---- sorting ----
  await setSort('chapter');
  check('chapter order', (await cards()).slice(0, 3).join() === 'ch01,ch02,ch03');
  await setSort('most');
  check('most revised first', (await cards())[0] === 'ch10' && (await cards())[1] === 'ch04');
  await setSort('least');
  check('least revised first', !['ch10', 'ch04'].includes((await cards())[0]) && (await cards()).slice(-2).join() === 'ch04,ch10');
  await reload();
  check('sort preference persists', (await page.$eval('select[aria-label="Sort chapters"]', (e) => e.value)) === 'least');
  await setSort('weakest');

  // ---- search ----
  await search('showmount');
  check('search by tool finds Enumeration', (await cards()).join() === 'ch04' && (await page.$$eval('article#rr-ch04 input[data-concept]', (e) => e.length)) === 1);
  await search('udp');
  check('search by protocol', (await cards()).length >= 2 && (await cards()).includes('ch04') && (await cards()).includes('ch10'), (await cards()).join());
  await search('slowloris');
  check('search by attack name', (await cards()).join() === 'ch10');
  await search('cryptography');
  check('search by chapter name shows the whole chapter', (await cards()).join() === 'ch20' && (await page.$$eval('article#rr-ch20 input[data-concept]', (e) => e.length)) === 13);
  await search('zzznotathing');
  check('no-match search shows an empty state', (await cards()).length === 0 && (await bodyText()).includes('No chapters match'));
  await search('');

  // ---- reset chapter needs confirmation ----
  await click('Expand all');
  await click('Reset chapter', 'article#rr-ch04');
  check('reset chapter opens a confirmation', (await bodyText()).includes('Reset Chapter 04'));
  await click('Cancel', 'div[role=dialog]');
  check('cancel keeps progress', (await isChecked('ch04-ntp-enumeration-udp-123')) === true);
  await click('Reset chapter', 'article#rr-ch04');
  await click('Reset chapter', 'div[role=dialog]');
  check('confirmed chapter reset', (await isChecked('ch04-ntp-enumeration-udp-123')) === false && (await isChecked('ch10-dos-ddos-drdos')) === true);

  // ---- export ----
  await click('Export progress');
  await sleep(800);
  const file = fs.readdirSync(TMP).find((f) => f.startsWith('khatib-ceh-revision-radar_') && f.endsWith('.json'));
  const exported = file ? JSON.parse(fs.readFileSync(path.join(TMP, file), 'utf8')) : null;
  check('export downloads a JSON backup', !!exported && exported.feature === 'revision-radar' && Object.keys(exported.state.checked).length === ch10, file);

  // ---- reset all needs confirmation ----
  await click('Reset all progress');
  check('reset all opens a confirmation', (await bodyText()).includes('Reset all revision progress?'));
  await click('Cancel', 'div[role=dialog]');
  check('cancel keeps everything', (await isChecked('ch10-dos-ddos-drdos')) === true);
  await click('Reset all progress');
  await click('Reset all', 'div[role=dialog]');
  check('confirmed reset all', (await percent()) === '0%');

  // ---- import ----
  await upload('backup.json', JSON.stringify(exported));
  check('import asks before applying', (await bodyText()).includes('Import revision progress?') && (await percent()) === '0%');
  await click('Replace', 'div[role=dialog]');
  check('import restores progress', (await isChecked('ch10-dos-ddos-drdos')) === true && (await bodyText()).includes('1/20'));
  const before = await stored();
  await upload('broken.json', '{ this is not json');
  check('invalid JSON rejected safely', (await bodyText()).includes('Import failed') && (await stored()) === before);
  await upload('other.json', JSON.stringify({ app: 'something-else', checked: {} }));
  check('foreign JSON rejected safely', (await bodyText()).includes('not a Revision Radar backup') && (await stored()) === before);
  await upload('bad-ids.json', JSON.stringify({ ...exported, state: { ...exported.state, checked: { 'ch99-nope': '2026-11-20T00:00:00Z' } } }));
  check('unknown concept ids rejected safely', (await bodyText()).includes('match Revision Radar') && (await stored()) === before);
  await upload('legacy.json', JSON.stringify({ version: 1, checked: ['8-0', '19-2'] }));
  check('standalone tracker backup recognized', (await bodyText()).includes('standalone tracker backup'));
  await click('Merge', 'div[role=dialog]');
  check('merge adds legacy ticks and keeps existing ones', (await isChecked('ch08-active-passive-sniffing')) === true && (await isChecked('ch19-shared-responsibility-model')) === true && (await isChecked('ch10-dos-ddos-drdos')) === true);

  // ---- corrupted storage ----
  await page.evaluate((k) => localStorage.setItem(k, '{corrupt'), KEY);
  await reload();
  check('corrupted data handled gracefully', (await bodyText()).includes('could not be read') && (await percent()) === '0%' && (await page.evaluate((k) => localStorage.getItem(k + ':unreadable-backup'), KEY)) === '{corrupt');

  // ---- other keys untouched ----
  const after = await page.evaluate((f) => Object.fromEntries(Object.keys(f).map((k) => [k, localStorage.getItem(k)])), foreign);
  check('other localStorage keys untouched', JSON.stringify(after) === JSON.stringify(foreign));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check('only its own versioned keys added', keys.filter((k) => !(k in foreign)).every((k) => k.startsWith('khatib-ceh:revision-radar:v1')), keys.join(', '));

  // ---- existing pages still render ----
  for (const [hash, needle] of [
    ['/', 'Study Dashboard'],
    ['/chapters', 'Chapters'],
    ['/exam-center', 'Exam Center'],
    ['/weakness', 'Weakness Radar'],
    ['/history', 'History'],
    ['/settings', 'Settings'],
  ]) {
    await go(hash);
    check(`existing page ${hash} renders`, (await bodyText()).includes(needle));
  }

  // ---- iPhone layout ----
  const phone = await browser.newPage();
  await phone.emulate({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 402, height: 874, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  });
  await phone.goto(`${BASE}/#/revision`, { waitUntil: 'networkidle0' });
  await phone.waitForFunction(() => !document.body.innerText.includes('Loading question bank'), { timeout: 30000 });
  await phone.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Expand all').click());
  await phone.evaluate(() => document.querySelector('details').open = true);
  await sleep(400);
  const m = await phone.evaluate(() => ({
    overflow: Math.max(document.documentElement.scrollWidth, window.innerWidth) - 402,
    smallTargets: [...document.querySelectorAll('label:has(input[data-concept])')].filter((l) => l.getBoundingClientRect().height < 44).length,
    zoomFields: [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), select')].filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).length,
  }));
  check('iPhone: no horizontal overflow', m.overflow <= 0, `${m.overflow}px`);
  check('iPhone: checkbox rows are at least 44px tall', m.smallTargets === 0, m.smallTargets);
  check('iPhone: no form fields that make Safari zoom', m.zoomFields === 0, m.zoomFields);
  const tapId = 'ch20-symmetric-asymmetric-encryption';
  await phone.evaluate((id) => document.querySelector(`input[data-concept="${id}"]`).closest('label').scrollIntoView({ block: 'center' }), tapId);
  await sleep(200);
  const box = await phone.evaluate((id) => {
    const r = document.querySelector(`input[data-concept="${id}"]`).closest('label').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tapId);
  await phone.touchscreen.tap(box.x, box.y);
  await sleep(200);
  check('iPhone: tapping a concept row ticks it', await phone.evaluate((id) => document.querySelector(`input[data-concept="${id}"]`).checked, tapId));
  fs.mkdirSync('tests/screens', { recursive: true });
  await phone.evaluate(() => window.scrollTo(0, 0));
  await phone.screenshot({ path: 'tests/screens/revision-radar-iphone.png' });
  await phone.close();

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.log('FAIL  test crashed —', e);
} finally {
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
