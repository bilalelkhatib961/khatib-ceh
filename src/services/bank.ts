import type { Bank, Chapter, ExtractionReport, LearningObjective, OriginalAttempt, Question, QuestionOverride } from '../types';
import * as cloud from './cloud';
import { kv } from './db';

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`./data/${name}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data/${name} (${res.status})`);
  return res.json() as Promise<T>;
}

let onBankProgress: ((msg: string) => void) | null = null;
export function setBankProgressListener(fn: ((msg: string) => void) | null) {
  onBankProgress = fn;
}

type RawBank =[Chapter[], LearningObjective[], Question[], OriginalAttempt[], ExtractionReport, { version: string }];

async function loadLocalFiles(): Promise<RawBank> {
  return Promise.all([
    get<Chapter[]>('chapters.json'),
    get<LearningObjective[]>('learning-objectives.json'),
    get<Question[]>('questions.json'),
    get<OriginalAttempt[]>('original-attempts.json'),
    get<ExtractionReport>('extraction-report.json'),
    get<{ version: string }>('bank-version.json').catch(() => ({ version: 'unknown' })),
  ]);
}

function fromCloud(m: Record<string, unknown>): RawBank {
  const need = ['chapters', 'learning-objectives', 'questions', 'original-attempts', 'extraction-report'];
  for (const n of need) if (!m[n]) throw new Error(`Cloud question bank is missing "${n}" — run the upload script.`);
  return [
    m['chapters'] as Chapter[],
    m['learning-objectives'] as LearningObjective[],
    m['questions'] as Question[],
    m['original-attempts'] as OriginalAttempt[],
    m['extraction-report'] as ExtractionReport,
    (m['bank-version'] as { version: string }) ?? { version: 'unknown' },
  ];
}

/**
 * Cloud mode: download from Supabase (private, signed-in only) and cache in IndexedDB for offline use.
 * Local mode: read the JSON files in public/data.
 */
async function loadRaw(): Promise<RawBank> {
  if (cloud.signedIn()) {
    // fast path: this device already has the current bank version cached
    const cached = await kv.get<RawBank>('bankCache').catch(() => undefined);
    if (cached) {
      const remoteVersion = await cloud.fetchBankVersion().catch(() => null);
      if (remoteVersion === null || remoteVersion === cached[5]?.version) return cached; // offline or unchanged
    }
    try {
      onBankProgress?.('Downloading question bank (first load on this device can take up to a minute)…');
      const m = await cloud.fetchBank();
      if (m) {
        const raw = fromCloud(m);
        await kv.set('bankCache', raw).catch(() => undefined);
        return raw;
      }
    } catch (e) {
      const cached = await kv.get<RawBank>('bankCache');
      if (cached) return cached;
      try {
        return await loadLocalFiles();
      } catch {
        throw e;
      }
    }
  }
  try {
    return await loadLocalFiles();
  } catch (e) {
    const cached = await kv.get<RawBank>('bankCache');
    if (cached) return cached;
    throw e;
  }
}

export async function loadBank(): Promise<Bank & { version: string }> {
  const [chapters, objectives, questions, originalAttempts, report, ver] = await loadRaw();
  chapters.sort((a, b) => a.number - b.number);
  objectives.sort((a, b) => (a.chapterId === b.chapterId ? a.number - b.number : chapterNum(a.chapterId) - chapterNum(b.chapterId)));
  return { chapters, objectives, questions, originalAttempts, report, version: ver.version };
}

export const chapterNum = (id: string | null) => (id ? Number(id.split('-')[1]) : 999);

/** Apply answer verifications made by the user in the review queue. */
export function applyOverrides(questions: Question[], overrides: Record<string, QuestionOverride>): Question[] {
  return questions.map((q) => {
    const o = overrides[q.id];
    if (!o || !o.correctOptionIds.length) return q;
    return {
      ...q,
      correctOptionIds: o.correctOptionIds,
      options: q.options.map((op) => ({ ...op, isCorrect: o.correctOptionIds.includes(op.id) })),
      verificationStatus: 'verified',
      answerBasis: 'user-verified',
    };
  });
}
