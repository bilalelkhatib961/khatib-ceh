// Upload the question bank (public/data/*.json) to your private Supabase database.
// Signs in with YOUR account (email + password) — no secret/service key is used or needed.
// Usage:  node scripts/upload-bank.mjs           (reads VITE_SUPABASE_* from .env.local)
// Re-run after `npm run build-data` whenever the bank changes.
import fs from 'node:fs';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

function env() {
  const out = { ...process.env };
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? s : '');
    rl.question(q, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

const E = env();
if (!E.VITE_SUPABASE_URL || !E.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(E.VITE_SUPABASE_URL, E.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const email = E.KHATIB_EMAIL || (await ask('Supabase account email: '));
const password = E.KHATIB_PASSWORD || (await ask('Password: ', true));
const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
if (authErr) {
  console.error('Sign-in failed:', authErr.message);
  process.exit(1);
}

const read = (n) => JSON.parse(fs.readFileSync(`public/data/${n}.json`, 'utf8'));
const version = read('bank-version').version;
const rows = [];
for (const name of ['chapters', 'learning-objectives', 'extraction-report', 'bank-version']) rows.push({ name, version, content: read(name) });
for (const [name, size] of [['questions', 250], ['original-attempts', 500]]) {
  const arr = read(name);
  for (let i = 0, c = 0; i < arr.length; i += size, c++) rows.push({ name: `${name}:${String(c).padStart(3, '0')}`, version, content: arr.slice(i, i + size) });
}

// remove stale chunks from an earlier, larger upload
const { data: existing } = await sb.from('bank_files').select('name');
const keep = new Set(rows.map((r) => r.name));
const stale = (existing ?? []).map((r) => r.name).filter((n) => !keep.has(n));
if (stale.length) await sb.from('bank_files').delete().in('name', stale);

for (const r of rows) {
  const { error } = await sb.from('bank_files').upsert({ ...r, updated_at: new Date().toISOString() });
  if (error) {
    console.error(`Upload failed for ${r.name}:`, error.message);
    process.exit(1);
  }
  process.stdout.write(`uploaded ${r.name}\n`);
}
const { count } = await sb.from('bank_files').select('name', { count: 'exact', head: true });
console.log(`\nDone: ${rows.length} rows, bank version ${version} (${count} rows in database).`);
await sb.auth.signOut();
