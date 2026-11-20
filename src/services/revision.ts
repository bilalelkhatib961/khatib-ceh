/*
 * Revision Radar persistence: one versioned localStorage key, frontend only.
 * Nothing here touches the app's other storage (IndexedDB, cloud, user-data folder) or other keys.
 * Saved data is always validated on the way in; unreadable data is kept under a backup key, never silently lost.
 */
import { CONCEPT_IDS, REVISION_CHAPTERS, TOTAL_CONCEPTS, conceptFromLegacyId } from '../data/revisionRadar';

export const REVISION_STORAGE_KEY = 'khatib-ceh:revision-radar:v1';
const CORRUPT_BACKUP_KEY = REVISION_STORAGE_KEY + ':unreadable-backup';
const SCHEMA_VERSION = 1;
const MAX_IMPORT_BYTES = 1_000_000;

export type RevisionSort = 'weakest' | 'chapter' | 'least' | 'most';
export type RevisionFilter = 'all' | 'high' | 'focused' | 'incomplete' | 'completed';
export const SORTS: RevisionSort[] = ['weakest', 'chapter', 'least', 'most'];
export const FILTERS: RevisionFilter[] = ['all', 'high', 'focused', 'incomplete', 'completed'];

export interface RevisionState {
  /** concept id -> ISO time it was marked as revised */
  checked: Record<string, string>;
  sort: RevisionSort;
  filter: RevisionFilter;
  /** last time a concept was marked as revised */
  lastRevisedAt: string | null;
  updatedAt: string | null;
}

export interface ChapterProgress {
  revised: number;
  total: number;
  completed: boolean;
}

/** What is written to localStorage (and inside export files). `chapterProgress` is derived, for readability. */
interface StoredRevision extends RevisionState {
  schemaVersion: number;
  chapterProgress: Record<string, ChapterProgress>;
}

export const defaultRevisionState = (): RevisionState => ({ checked: {}, sort: 'weakest', filter: 'all', lastRevisedAt: null, updatedAt: null });

export function chapterProgress(checked: Record<string, string>): Record<string, ChapterProgress> {
  const out: Record<string, ChapterProgress> = {};
  for (const c of REVISION_CHAPTERS) {
    const revised = c.concepts.filter((k) => checked[k.id]).length;
    out[c.key] = { revised, total: c.concepts.length, completed: revised === c.concepts.length };
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validTime = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const ID_SHAPE = /^ch\d{2}-[a-z0-9-]{1,80}$/;

/**
 * Validates a stored state. Keeps well-formed ids even when they are not in the current content
 * (so a content update never wipes saved ticks); unknown ids are simply not counted.
 */
function sanitize(v: unknown): RevisionState | null {
  if (!isObj(v) || v.schemaVersion !== SCHEMA_VERSION || !isObj(v.checked)) return null;
  const checked: Record<string, string> = {};
  for (const [id, at] of Object.entries(v.checked)) {
    if (!ID_SHAPE.test(id)) continue;
    checked[id] = validTime(at) ? at : new Date(0).toISOString();
  }
  return {
    checked,
    sort: SORTS.includes(v.sort as RevisionSort) ? (v.sort as RevisionSort) : 'weakest',
    filter: FILTERS.includes(v.filter as RevisionFilter) ? (v.filter as RevisionFilter) : 'all',
    lastRevisedAt: validTime(v.lastRevisedAt) ? v.lastRevisedAt : null,
    updatedAt: validTime(v.updatedAt) ? v.updatedAt : null,
  };
}

export function serializeRevision(s: RevisionState): string {
  const stored: StoredRevision = { schemaVersion: SCHEMA_VERSION, ...s, chapterProgress: chapterProgress(s.checked) };
  return JSON.stringify(stored);
}

/** Parses a raw localStorage value; null means "missing", undefined means "unreadable". */
export function parseStored(raw: string | null): RevisionState | null | undefined {
  if (raw === null) return null;
  try {
    return sanitize(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

export interface LoadResult {
  state: RevisionState;
  /** Raw string as read, so the first save can be skipped when nothing changed. */
  raw: string | null;
  notice: string | null;
  storageOk: boolean;
}

export function loadRevision(): LoadResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(REVISION_STORAGE_KEY);
  } catch {
    return { state: defaultRevisionState(), raw: null, notice: null, storageOk: false };
  }
  const parsed = parseStored(raw);
  if (parsed === undefined) {
    // keep the unreadable copy so it can be recovered by hand; then start fresh
    try {
      window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw!);
    } catch {
      /* storage full: nothing more we can do */
    }
    return {
      state: defaultRevisionState(),
      raw,
      notice: `Saved revision progress could not be read and was reset. The unreadable copy was kept under "${CORRUPT_BACKUP_KEY}".`,
      storageOk: true,
    };
  }
  return { state: parsed ?? defaultRevisionState(), raw, notice: null, storageOk: true };
}

/** Returns the string written, or null when the browser refused to store it. */
export function saveRevision(s: RevisionState): string | null {
  const raw = serializeRevision(s);
  try {
    window.localStorage.setItem(REVISION_STORAGE_KEY, raw);
    return raw;
  } catch {
    return null;
  }
}

// ---------- export / import ----------

export function buildExport(s: RevisionState) {
  const revised = Object.keys(s.checked).filter((id) => CONCEPT_IDS.has(id)).length;
  const cp = chapterProgress(s.checked);
  return {
    app: 'khatib-ceh',
    feature: 'revision-radar',
    storageKey: REVISION_STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    summary: {
      revisedConcepts: revised,
      totalConcepts: TOTAL_CONCEPTS,
      percent: Math.round((revised / TOTAL_CONCEPTS) * 1000) / 10,
      chaptersCompleted: Object.values(cp).filter((c) => c.completed).length,
    },
    state: JSON.parse(serializeRevision(s)) as StoredRevision,
  };
}

export type ImportResult =
  | { ok: true; checked: Record<string, string>; lastRevisedAt: string | null; recognized: number; ignored: number; exportedAt: string | null; legacy: boolean }
  | { ok: false; error: string };

/**
 * Accepts a Revision Radar export, or a backup from the standalone tracker ({ version: 1, checked: ["10-0", …] }).
 * Only ids of concepts that exist are applied; anything else is reported and ignored.
 */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'This file is too large to be a revision progress backup.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!isObj(data)) return { ok: false, error: 'This file is not a revision progress backup.' };

  // standalone tracker backup
  if (data.version === 1 && Array.isArray(data.checked) && !('app' in data)) {
    const checked: Record<string, string> = {};
    let ignored = 0;
    const at = new Date().toISOString();
    for (const x of data.checked) {
      const id = typeof x === 'string' ? (conceptFromLegacyId(x) ?? (CONCEPT_IDS.has(x) ? x : null)) : null;
      if (id) checked[id] = at;
      else ignored++;
    }
    const recognized = Object.keys(checked).length;
    if (data.checked.length > 0 && recognized === 0) return { ok: false, error: 'None of the concepts in this backup match Revision Radar.' };
    return { ok: true, checked, lastRevisedAt: null, recognized, ignored, exportedAt: null, legacy: true };
  }

  if (data.app !== 'khatib-ceh' || data.feature !== 'revision-radar') return { ok: false, error: 'This file is not a Revision Radar backup.' };
  if (data.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: `Unsupported backup version (${String(data.schemaVersion)}).` };
  const state = sanitize(data.state);
  if (!state) return { ok: false, error: 'The backup is damaged: its progress data is missing or malformed.' };
  const checked: Record<string, string> = {};
  let ignored = 0;
  for (const [id, t] of Object.entries(state.checked)) {
    if (CONCEPT_IDS.has(id)) checked[id] = t;
    else ignored++;
  }
  const recognized = Object.keys(checked).length;
  if (recognized === 0 && ignored > 0) return { ok: false, error: 'None of the concepts in this backup match Revision Radar.' };
  return { ok: true, checked, lastRevisedAt: state.lastRevisedAt, recognized, ignored, exportedAt: validTime(data.exportedAt) ? data.exportedAt : null, legacy: false };
}
