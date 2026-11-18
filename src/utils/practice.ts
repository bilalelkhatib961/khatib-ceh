import type { Chapter, LearningObjective, Question } from '../types';
import type { QuestionProgress } from './stats';
import { currentStatsFor, originalStatsFor, practiceStatsFor } from './stats';
import type { AttemptResult } from '../types';
import { eligible, shuffle } from './exam';

export type PracticeKind = 'mistakes' | 'bookmarks' | 'weak-chapters' | 'weak-objectives' | 'unpracticed' | 'custom' | 'retry';

export const PRACTICE_LABEL: Record<PracticeKind, string> = {
  mistakes: 'Mistakes Only',
  bookmarks: 'Bookmarked Questions',
  'weak-chapters': 'Weak Chapters',
  'weak-objectives': 'Weak Learning Objectives',
  unpracticed: 'Unpracticed Questions',
  custom: 'Custom Practice',
  retry: 'Retry Incorrect',
};

/** A question counts as a "mistake" if I originally got it wrong or my latest practice answer was wrong. */
export function isMistake(p: QuestionProgress | undefined) {
  if (!p) return false;
  if (p.events.length) return p.streak < 0 || (p.origIncorrect > 0 && p.state !== 'recovered' && p.state !== 'mastered');
  return p.origIncorrect > 0;
}

/** Performance used for ranking weakness: current standing (most recent answer per question). */
export function weaknessScore(qs: Question[], progress: Map<string, QuestionProgress>, attempts: AttemptResult[]) {
  const orig = originalStatsFor(qs, progress);
  const prac = practiceStatsFor(new Set(qs.map((q) => q.id)), attempts);
  const current = currentStatsFor(qs, progress);
  return { orig, prac, current, blend: current.accuracy };
}

export function weakestChapters(chapters: Chapter[], questions: Question[], progress: Map<string, QuestionProgress>, attempts: AttemptResult[], n = 5) {
  return chapters
    .map((c) => ({ c, ...weaknessScore(questions.filter((q) => q.chapterId === c.id), progress, attempts) }))
    .filter((x) => x.blend !== null)
    .sort((a, b) => a.blend! - b.blend! || b.orig.incorrect - a.orig.incorrect)
    .slice(0, n);
}

export function weakestObjectives(objs: LearningObjective[], questions: Question[], progress: Map<string, QuestionProgress>, attempts: AttemptResult[], n = 5) {
  return objs
    .map((o) => ({ o, ...weaknessScore(questions.filter((q) => q.learningObjectiveId === o.id), progress, attempts) }))
    .filter((x) => x.blend !== null && x.current.answered >= 3)
    .sort((a, b) => a.blend! - b.blend! || b.orig.incorrect - a.orig.incorrect)
    .slice(0, n);
}

/** Highest study priority first, ties shuffled. */
export function byPriority(qs: Question[], progress: Map<string, QuestionProgress>) {
  return shuffle(qs).sort((a, b) => (progress.get(b.id)?.priority ?? 0) - (progress.get(a.id)?.priority ?? 0));
}

export function buildPracticeSet(
  kind: PracticeKind,
  opts: {
    questions: Question[];
    progress: Map<string, QuestionProgress>;
    bookmarks: Set<string>;
    chapters: Chapter[];
    objectives: LearningObjective[];
    attempts: AttemptResult[];
    count: number;
    chapterIds?: string[];
    source?: 'all' | 'original-incorrect' | 'original-correct' | 'unpracticed' | 'needs-review' | 'bookmarked';
  },
): Question[] {
  const { progress, count } = opts;
  let pool = eligible(opts.questions);
  if (opts.chapterIds?.length) pool = pool.filter((q) => q.chapterId && opts.chapterIds!.includes(q.chapterId));
  switch (kind) {
    case 'mistakes':
      return byPriority(pool.filter((q) => isMistake(progress.get(q.id))), progress).slice(0, count);
    case 'bookmarks':
      return shuffle(pool.filter((q) => opts.bookmarks.has(q.id))).slice(0, count);
    case 'unpracticed':
      return byPriority(pool.filter((q) => (progress.get(q.id)?.events.length ?? 0) === 0), progress).slice(0, count);
    case 'weak-chapters': {
      const ids = new Set(weakestChapters(opts.chapters, opts.questions, progress, opts.attempts, 3).map((x) => x.c.id));
      return byPriority(pool.filter((q) => q.chapterId && ids.has(q.chapterId)), progress).slice(0, count);
    }
    case 'weak-objectives': {
      const ids = new Set(weakestObjectives(opts.objectives, opts.questions, progress, opts.attempts, 5).map((x) => x.o.id));
      return byPriority(pool.filter((q) => q.learningObjectiveId && ids.has(q.learningObjectiveId)), progress).slice(0, count);
    }
    case 'custom': {
      const src = opts.source ?? 'all';
      const f = pool.filter((q) => {
        const p = progress.get(q.id);
        if (src === 'original-incorrect') return (p?.origIncorrect ?? 0) > 0;
        if (src === 'original-correct') return (p?.origCorrect ?? 0) > 0;
        if (src === 'unpracticed') return (p?.events.length ?? 0) === 0;
        if (src === 'needs-review') return p?.state === 'needs-review' || isMistake(p);
        if (src === 'bookmarked') return opts.bookmarks.has(q.id);
        return true;
      });
      return shuffle(f).slice(0, count);
    }
    default:
      return [];
  }
}
