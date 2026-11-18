import type { AttemptResult, Chapter, LearningObjective, LearningState, OriginalAttempt, Question } from '../types';

export interface OrigStats {
  correct: number; // original correct attempts
  incorrect: number; // original incorrect attempts
  attempts: number;
  accuracy: number | null; // correct / (correct + incorrect) * 100
  questions: number; // unique questions
  verified: number;
}

export function emptyOrig(): OrigStats {
  return { correct: 0, incorrect: 0, attempts: 0, accuracy: null, questions: 0, verified: 0 };
}

export function finishOrig(s: OrigStats): OrigStats {
  s.attempts = s.correct + s.incorrect;
  s.accuracy = s.attempts ? (s.correct / s.attempts) * 100 : null;
  return s;
}

export type Classification = 'Critical' | 'Weak' | 'Needs Review' | 'Strong' | 'Mastered' | 'No data';

/** Personal study indicators (not official CEH thresholds). */
export function classify(pct: number | null): Classification {
  if (pct === null) return 'No data';
  if (pct < 50) return 'Critical';
  if (pct < 70) return 'Weak';
  if (pct < 80) return 'Needs Review';
  if (pct < 90) return 'Strong';
  return 'Mastered';
}

export const classColor: Record<Classification, string> = {
  Critical: '#FF4757',
  Weak: '#FF7A45',
  'Needs Review': '#FFB800',
  Strong: '#00F5FF',
  Mastered: '#00E676',
  'No data': '#8492A6',
};

export interface PracticeEvent {
  attemptId: string;
  completedAt: string;
  result: 'correct' | 'incorrect' | 'unanswered';
  selected: string[];
}

export interface QuestionProgress {
  origCorrect: number;
  origIncorrect: number;
  origUnknown: number;
  /** Result of the most recent original CEH attempt (by screenshot time). */
  origLatest: 'correct' | 'incorrect' | null;
  events: PracticeEvent[]; // chronological
  state: LearningState;
  misses: number;
  correct: number;
  streak: number; // consecutive correct at the end (negative = consecutive misses)
  priority: number;
}

/*
 * Learning-state rules (evaluated on KHATIB CEH practice answers, oldest -> newest;
 * each completed assessment counts once; unanswered counts as a miss):
 *   unpracticed  - never answered in a completed KHATIB CEH assessment
 *   needs-review - the most recent practice answer was wrong or unanswered
 *   improving    - the most recent answer was correct, but not yet recovered/mastered
 *   recovered    - originally answered incorrectly (or missed earlier in practice) and the
 *                  last 2 practice answers, in separate sessions, were correct
 *   mastered     - the last 3 practice answers, in separate sessions, were correct
 */
export const STATE_RULES: Record<LearningState, string> = {
  unpracticed: 'Never answered in a completed KHATIB CEH assessment.',
  'needs-review': 'Most recent practice answer was wrong or left unanswered.',
  improving: 'Most recent practice answer was correct, but not yet 2 (recovered) or 3 (mastered) in a row.',
  recovered: 'Originally wrong or previously missed, then answered correctly in the last 2 separate sessions.',
  mastered: 'Answered correctly in the last 3 separate sessions.',
};

export function computeProgress(
  questions: Question[],
  original: OriginalAttempt[],
  attempts: AttemptResult[],
): Map<string, QuestionProgress> {
  const map = new Map<string, QuestionProgress>();
  for (const q of questions)
    map.set(q.id, { origCorrect: 0, origIncorrect: 0, origUnknown: 0, origLatest: null, events: [], state: 'unpracticed', misses: 0, correct: 0, streak: 0, priority: 0 });
  const origSorted = [...original].sort((a, b) => (a.attemptedAt ?? '').localeCompare(b.attemptedAt ?? ''));
  for (const a of origSorted) {
    const p = map.get(a.questionId);
    if (!p) continue;
    if (a.result === 'correct') p.origCorrect++;
    else if (a.result === 'incorrect') p.origIncorrect++;
    else p.origUnknown++;
    if (a.result === 'correct' || a.result === 'incorrect') p.origLatest = a.result;
  }
  const sorted = [...attempts].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const at of sorted)
    for (const ans of at.answers) {
      const p = map.get(ans.questionId);
      if (!p) continue;
      p.events.push({ attemptId: at.id, completedAt: at.completedAt, result: ans.result, selected: ans.selectedOptionIds });
    }
  for (const p of map.values()) {
    let streak = 0;
    for (const e of p.events) {
      if (e.result === 'correct') {
        p.correct++;
        streak = streak > 0 ? streak + 1 : 1;
      } else {
        p.misses++;
        streak = streak < 0 ? streak - 1 : -1;
      }
    }
    p.streak = streak;
    const everWrong = p.origIncorrect > 0 || p.misses > 0;
    if (!p.events.length) p.state = 'unpracticed';
    else if (streak < 0) p.state = 'needs-review';
    else if (streak >= 3) p.state = 'mastered';
    else if (streak >= 2 && everWrong) p.state = 'recovered';
    else p.state = 'improving';
    // study priority: repeated misses rank highest
    p.priority =
      p.origIncorrect * 3 +
      p.misses * 2.5 +
      (streak < 0 ? -streak * 2 : 0) -
      (streak > 0 ? streak * 1.5 : 0) +
      (p.events.length === 0 ? 1 : 0) -
      p.origCorrect * 0.5;
  }
  return map;
}

export interface CurrentStats {
  correct: number; // questions whose most recent answer is correct
  answered: number; // questions with any answer (original or practice)
  practiced: number; // of those, how many have been answered in KHATIB CEH practice
  accuracy: number | null;
}

/*
 * Current standing: each question counts once, using its MOST RECENT answer —
 * the latest KHATIB CEH practice answer if it has been practiced, otherwise the
 * latest original CEH result. This drives the badges, progress bars and weakness
 * rankings, so practice improvements are reflected immediately.
 */
export const CURRENT_RULE =
  'Current accuracy: each question counts once, using its most recent answer: your latest practice answer if you have practiced it, otherwise your original CEH result.';

export function currentStatsFor(questions: Question[], progress: Map<string, QuestionProgress>): CurrentStats {
  let correct = 0;
  let answered = 0;
  let practiced = 0;
  for (const q of questions) {
    const p = progress.get(q.id);
    if (!p) continue;
    const last = p.events[p.events.length - 1];
    if (last) {
      answered++;
      practiced++;
      if (last.result === 'correct') correct++;
    } else if (p.origLatest) {
      answered++;
      if (p.origLatest === 'correct') correct++;
    }
  }
  return { correct, answered, practiced, accuracy: answered ? (correct / answered) * 100 : null };
}

export function originalStatsFor(questions: Question[], progress: Map<string, QuestionProgress>): OrigStats {
  const s = emptyOrig();
  for (const q of questions) {
    const p = progress.get(q.id);
    s.questions++;
    if (q.verificationStatus === 'verified') s.verified++;
    if (!p) continue;
    s.correct += p.origCorrect;
    s.incorrect += p.origIncorrect;
  }
  return finishOrig(s);
}

export interface PracticeStats {
  answered: number;
  correct: number;
  accuracy: number | null;
  latestScore: number | null;
  latestAt: string | null;
  sessions: number;
}

/** Practice performance for a set of questions, from all completed KHATIB CEH assessments. */
export function practiceStatsFor(qids: Set<string>, attempts: AttemptResult[], scopeKey?: string): PracticeStats {
  let answered = 0;
  let correct = 0;
  let sessions = 0;
  let latestScore: number | null = null;
  let latestAt: string | null = null;
  const sorted = [...attempts].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const at of sorted) {
    const rel = at.answers.filter((a) => qids.has(a.questionId));
    if (!rel.length) continue;
    sessions++;
    const c = rel.filter((a) => a.result === 'correct').length;
    answered += rel.length;
    correct += c;
    if (!scopeKey || at.scopeKey === scopeKey) {
      latestScore = (c / rel.length) * 100;
      latestAt = at.completedAt;
    }
  }
  return { answered, correct, accuracy: answered ? (correct / answered) * 100 : null, latestScore, latestAt, sessions };
}

export function chapterQuestions(questions: Question[], ch: Chapter) {
  return questions.filter((q) => q.chapterId === ch.id);
}
export function objectiveQuestions(questions: Question[], o: LearningObjective) {
  return questions.filter((q) => q.learningObjectiveId === o.id);
}

export const fmtPct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`);

export function fmtDuration(sec: number) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

/** A time limit for display; 0 means the assessment is untimed. */
export const fmtLimit = (sec: number) => (sec > 0 ? fmtDuration(sec) : 'No time limit');

export function fmtClock(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
