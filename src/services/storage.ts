/*
 * Persistence for user data.
 *
 * - IndexedDB is the always-available store and recovery buffer (attempts, settings,
 *   bookmarks, answer overrides, active exam session).
 * - When the user connects the `user-data` folder (File System Access API, Chrome/Edge),
 *   every completed attempt is written as its own JSON file and the other records are
 *   mirrored to JSON files. Attempt files on disk are the authoritative history once synced.
 */
import { attemptsStore, kv, StoredAttempt } from './db';
import type { ActiveSession, AttemptResult, QuestionOverride, Settings } from '../types';
import { SCHEMA_VERSION } from '../types';
import * as cloud from './cloud';

type PermState = 'granted' | 'denied' | 'prompt';
interface FSHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermState>;
  values(): AsyncIterable<FileSystemHandle>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite' }) => Promise<FSHandle>;
  }
}

export type StorageStatus = 'unsupported' | 'not-connected' | 'permission-required' | 'connected';

export const ATTEMPT_DIRS: Record<string, string> = {
  'mock-exam': 'mock-exams',
  'chapter-quiz': 'chapter-quizzes',
  'objective-quiz': 'objective-quizzes',
  'custom-practice': 'custom-practice',
};

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  examDate: '2026-11-21',
  targetScore: 85,
  shuffleOptions: true,
  compactMode: false,
  questionFontSize: 'normal',
};

let handle: FSHandle | null = null;
export const fsSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

async function verify(h: FSHandle, request: boolean): Promise<boolean> {
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (request && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
  return false;
}

export async function restoreHandle(): Promise<StorageStatus> {
  if (!fsSupported) return 'unsupported';
  const h = await kv.get<FSHandle>('dirHandle');
  if (!h) return 'not-connected';
  if (await verify(h, false)) {
    handle = h;
    return 'connected';
  }
  handle = null;
  return 'permission-required';
}

/** Must be called from a user gesture. */
export async function connectFolder(pickNew: boolean): Promise<StorageStatus> {
  if (!fsSupported) return 'unsupported';
  let h = pickNew ? null : await kv.get<FSHandle>('dirHandle');
  if (!h) {
    h = await window.showDirectoryPicker!({ id: 'khatib-ceh-user-data', mode: 'readwrite' });
  }
  if (!(await verify(h, true))) return 'permission-required';
  handle = h;
  await kv.set('dirHandle', h);
  for (const d of [...Object.values(ATTEMPT_DIRS)]) await subdir(['attempts', d]);
  await subdir(['active-sessions']);
  return 'connected';
}

export function folderName(): string | null {
  return handle?.name ?? null;
}

async function subdir(path: string[]): Promise<FileSystemDirectoryHandle> {
  let d: FileSystemDirectoryHandle = handle!;
  for (const p of path) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

async function writeJson(path: string[], name: string, data: unknown) {
  const dir = await subdir(path);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

async function readJson<T>(path: string[], name: string): Promise<T | null> {
  try {
    const dir = await subdir(path);
    const fh = await dir.getFileHandle(name);
    return JSON.parse(await (await fh.getFile()).text()) as T;
  } catch {
    return null;
  }
}

async function removeFile(path: string[], name: string) {
  try {
    const dir = await subdir(path);
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

// ---------- attempts ----------

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function attemptFileName(a: AttemptResult): string {
  const s = stamp(new Date(a.completedAt));
  const short = a.id.slice(0, 8);
  const ch = a.chapterId?.replace('chapter-', 'chapter-') ?? '';
  const ob = a.learningObjectiveId?.match(/objective-(\d+)$/)?.[1];
  switch (a.mode) {
    case 'mock-exam':
      return `mock-exam_${s}_${short}.json`;
    case 'chapter-quiz':
      return `${ch}_${s}_${short}.json`;
    case 'objective-quiz':
      return `${ch}_objective-${ob}_${s}_${short}.json`;
    default:
      return `custom-${a.practiceKind ?? 'practice'}_${s}_${short}.json`;
  }
}

export interface SyncResult {
  attempts: AttemptResult[];
  pending: number; // not yet written to the JSON folder (only meaningful when a folder is connected)
  cloudPending: number; // not yet uploaded to the cloud database
  error?: string;
}

/**
 * Loads attempts from IndexedDB, merges the cloud copy and the JSON files on disk,
 * then pushes anything missing to the cloud and to the folder. Never deletes or overwrites.
 */
export async function syncAttempts(): Promise<SyncResult> {
  const local = await attemptsStore.all<AttemptResult>();
  const byId = new Map<string, StoredAttempt<AttemptResult>>(local.map((r) => [r.id, r]));
  let error: string | undefined;
  // cloud -> local
  if (cloud.signedIn()) {
    try {
      for (const a of await cloud.pullAttempts()) {
        const cur = byId.get(a.id);
        if (cur) {
          if (!cur.cloudSynced) {
            cur.cloudSynced = true;
            await attemptsStore.put(cur);
          }
          continue;
        }
        const rec: StoredAttempt<AttemptResult> = { id: a.id, data: a, synced: false, cloudSynced: true, fileName: a.fileName ?? attemptFileName(a) };
        byId.set(a.id, rec);
        await attemptsStore.put(rec);
      }
    } catch (e) {
      error = `Cloud download failed: ${String(e)}`;
    }
  }
  if (handle) {
    try {
      for (const d of Object.values(ATTEMPT_DIRS)) {
        const dir = (await subdir(['attempts', d])) as FSHandle;
        for await (const entry of dir.values()) {
          if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
          try {
            const data = JSON.parse(await (await (entry as FileSystemFileHandle).getFile()).text()) as AttemptResult;
            if (!data?.id || !data.answers) continue;
            data.fileName = entry.name;
            const rec = { id: data.id, data, synced: true, fileName: entry.name, cloudSynced: byId.get(data.id)?.cloudSynced ?? false };
            byId.set(data.id, rec);
            await attemptsStore.put(rec);
          } catch {
            /* ignore malformed files */
          }
        }
      }
      for (const rec of byId.values()) {
        if (!rec.synced) {
          const name = rec.fileName ?? attemptFileName(rec.data);
          rec.data.fileName = name;
          await writeJson(['attempts', ATTEMPT_DIRS[rec.data.mode] ?? 'custom-practice'], name, rec.data);
          rec.synced = true;
          rec.fileName = name;
          await attemptsStore.put(rec);
        }
      }
    } catch (e) {
      error = String(e);
    }
  }
  // local -> cloud
  if (cloud.signedIn()) {
    for (const rec of byId.values()) {
      if (rec.cloudSynced) continue;
      if (await cloud.pushAttempt(rec.data)) {
        rec.cloudSynced = true;
        await attemptsStore.put(rec);
      }
    }
  }
  const all = [...byId.values()];
  return {
    attempts: all.map((r) => ({ ...r.data, fileName: r.fileName })).sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
    pending: all.filter((r) => !r.synced).length,
    cloudPending: all.filter((r) => !r.cloudSynced).length,
    error,
  };
}

/** Never overwrites: each attempt has a unique id and filename. Returns true when written to disk. */
export async function saveAttempt(a: AttemptResult): Promise<boolean> {
  const fileName = attemptFileName(a);
  a.fileName = fileName;
  const rec: StoredAttempt<AttemptResult> = { id: a.id, data: a, synced: false, cloudSynced: false, fileName };
  await attemptsStore.put(rec); // always saved locally first
  let saved = false;
  if (cloud.signedIn() && (await cloud.pushAttempt(a))) {
    rec.cloudSynced = true;
    saved = true;
  }
  if (handle) {
    try {
      await writeJson(['attempts', ATTEMPT_DIRS[a.mode] ?? 'custom-practice'], fileName, a);
      rec.synced = true;
      saved = true;
    } catch {
      /* stays pending; retried on next sync */
    }
  }
  await attemptsStore.put(rec);
  return saved;
}

export async function importAttempts(list: AttemptResult[]): Promise<number> {
  const existing = new Set((await attemptsStore.all<AttemptResult>()).map((r) => r.id));
  let n = 0;
  for (const a of list) {
    if (!a?.id || !Array.isArray(a.answers) || existing.has(a.id)) continue;
    await attemptsStore.put({ id: a.id, data: a, synced: false, fileName: a.fileName ?? attemptFileName(a) });
    n++;
  }
  return n;
}

// ---------- small mirrored records ----------

interface Wrapped<T> {
  schemaVersion: number;
  updatedAt: string;
  data: T;
}

/** Newest copy wins across browser storage, the JSON folder and the cloud; the others are updated. */
async function loadMirrored<T>(key: string, file: string, fallback: T): Promise<T> {
  const candidates: Wrapped<T>[] = [];
  const local = await kv.get<Wrapped<T>>(key);
  if (local) candidates.push(local);
  const disk = handle ? await readJson<Wrapped<T>>([], file) : null;
  if (disk?.data !== undefined) candidates.push(disk);
  const remote = cloud.signedIn() ? await cloud.kvGet<Wrapped<T>>(key) : null;
  if (remote?.value?.data !== undefined) candidates.push(remote.value);
  if (!candidates.length) return fallback;
  const best = candidates.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  if (best !== local) await kv.set(key, best);
  if (handle && best !== disk) await writeJson([], file, best).catch(() => undefined);
  if (cloud.signedIn() && best !== remote?.value) await cloud.kvSet(key, best, best.updatedAt);
  return best.data;
}

async function saveMirrored<T>(key: string, file: string, data: T) {
  const w: Wrapped<T> = { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString(), data };
  await kv.set(key, w);
  if (handle) await writeJson([], file, w).catch(() => undefined);
  if (cloud.signedIn()) await cloud.kvSet(key, w, w.updatedAt);
}

export const loadSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await loadMirrored<Partial<Settings>>('settings', 'settings.json', {})) });
export const saveSettings = (s: Settings) => saveMirrored('settings', 'settings.json', s);
export const loadBookmarks = () => loadMirrored<string[]>('bookmarks', 'bookmarks.json', []);
export const saveBookmarks = (b: string[]) => saveMirrored('bookmarks', 'bookmarks.json', b);
export const loadOverrides = () => loadMirrored<Record<string, QuestionOverride>>('overrides', 'question-overrides.json', {});
export const saveOverrides = (o: Record<string, QuestionOverride>) => saveMirrored('overrides', 'question-overrides.json', o);
export const saveProgress = (p: unknown) => saveMirrored('progress', 'progress.json', p);

// ---------- active session ----------

/*
 * The unfinished assessment. Stored locally on every change, in the cloud every few seconds
 * (so it can be resumed on another device) and in the folder every 15 s. The newest copy wins.
 * A cloud tombstone ({ cleared: true }) records that the session was submitted elsewhere.
 */
type SessionRecord = ActiveSession & { updatedAt?: string };
interface Tombstone {
  cleared: true;
  id: string;
  updatedAt: string;
}

export async function loadActiveSession(): Promise<ActiveSession | null> {
  const local = ((await kv.get<SessionRecord>('activeSession')) ?? null) as SessionRecord | null;
  const disk = !local && handle ? await readJson<SessionRecord>(['active-sessions'], 'current-session.json') : null;
  let best: SessionRecord | null = local ?? disk;
  if (cloud.signedIn()) {
    const remote = await cloud.kvGet<SessionRecord | Tombstone>('activeSession');
    const r = remote?.value;
    if (r && 'cleared' in r) {
      // submitted/discarded on another device after our local copy was last saved
      if (best && best.id === r.id) best = null;
      else if (best && (best.updatedAt ?? '') < r.updatedAt) best = null;
    } else if (r && (!best || (r.updatedAt ?? '') > (best.updatedAt ?? ''))) {
      best = r;
    }
    if (best) await kv.set('activeSession', best);
    else await kv.del('activeSession');
  }
  return best;
}

let lastDiskWrite = 0;
let lastCloudWrite = 0;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
export async function saveActiveSession(s: ActiveSession, force = false) {
  const rec: SessionRecord = { ...s, updatedAt: new Date().toISOString() };
  await kv.set('activeSession', rec);
  const now = Date.now();
  if (handle && (force || now - lastDiskWrite > 15000)) {
    lastDiskWrite = now;
    await writeJson(['active-sessions'], 'current-session.json', rec).catch(() => undefined);
  }
  if (cloud.signedIn()) {
    if (cloudTimer) clearTimeout(cloudTimer);
    const push = () => {
      lastCloudWrite = Date.now();
      cloud.kvSet('activeSession', rec, rec.updatedAt!);
    };
    if (force || now - lastCloudWrite > 5000) push();
    else cloudTimer = setTimeout(push, 5000);
  }
}

export async function clearActiveSession(id?: string) {
  await kv.del('activeSession');
  if (cloudTimer) clearTimeout(cloudTimer);
  if (handle) await removeFile(['active-sessions'], 'current-session.json');
  if (cloud.signedIn()) {
    const t: Tombstone = { cleared: true, id: id ?? '', updatedAt: new Date().toISOString() };
    await cloud.kvSet('activeSession', t, t.updatedAt);
  }
}
