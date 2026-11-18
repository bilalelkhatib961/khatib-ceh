import type { ActiveSession, AssessmentMode, AttemptAnswer, AttemptResult, Question } from '../types';
import { SCHEMA_VERSION } from '../types';

export const MODE_CONFIG: Record<'mock-exam' | 'chapter-quiz' | 'objective-quiz', { count: number; seconds: number; label: string }> = {
  'mock-exam': { count: 125, seconds: 4 * 3600, label: 'Full Mock Exam' },
  'chapter-quiz': { count: 30, seconds: 3600, label: 'Chapter Quiz' },
  // count 0 = every verified question in the objective; seconds 0 = untimed
  'objective-quiz': { count: 0, seconds: 0, label: 'Learning Objective Quiz' },
};

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick up to `count` distinct questions, spreading the selection across groups
 * (chapters for a mock exam, objectives for a chapter quiz) in proportion to group size
 * with random round-robin. Never duplicates or fabricates questions.
 */
export function pickSpread(pool: Question[], count: number, groupOf: (q: Question) => string): Question[] {
  if (pool.length <= count) return shuffle(pool);
  const groups = new Map<string, Question[]>();
  for (const q of shuffle(pool)) {
    const g = groupOf(q);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(q);
  }
  // proportional quota with minimum 1 per group, then fill remaining round-robin
  const total = pool.length;
  const picked: Question[] = [];
  const quota = new Map<string, number>();
  for (const [g, list] of groups) quota.set(g, Math.min(list.length, Math.max(1, Math.floor((list.length / total) * count))));
  let sum = [...quota.values()].reduce((a, b) => a + b, 0);
  // trim if minimums overflowed
  const keys = shuffle([...groups.keys()]);
  while (sum > count) {
    const g = keys.sort((a, b) => quota.get(b)! - quota.get(a)!)[0];
    quota.set(g, quota.get(g)! - 1);
    sum--;
  }
  for (const [g, list] of groups) picked.push(...list.slice(0, quota.get(g)));
  let i = 0;
  const rest = new Map([...groups].map(([g, l]) => [g, l.slice(quota.get(g))]));
  while (picked.length < count) {
    const g = keys[i++ % keys.length];
    const l = rest.get(g)!;
    if (l.length) picked.push(l.shift()!);
    if ([...rest.values()].every((x) => !x.length)) break;
  }
  return shuffle(picked);
}

export function eligible(questions: Question[]) {
  return questions.filter((q) => q.verificationStatus === 'verified' && q.correctOptionIds.length > 0);
}

export interface SessionSpec {
  name: string;
  mode: AssessmentMode;
  practiceKind?: string | null;
  scopeKey: string;
  chapterId?: string | null;
  learningObjectiveId?: string | null;
  questions: Question[];
  requestedCount: number;
  seconds: number;
  shuffleOptions: boolean;
}

export function createSession(spec: SessionSpec): ActiveSession {
  const optionOrders: Record<string, string[]> = {};
  for (const q of spec.questions) {
    const ids = q.options.map((o) => o.id);
    optionOrders[q.id] = spec.shuffleOptions && q.shuffleSafe ? shuffle(ids) : ids;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(),
    name: spec.name,
    mode: spec.mode,
    practiceKind: spec.practiceKind ?? null,
    scopeKey: spec.scopeKey,
    chapterId: spec.chapterId ?? null,
    learningObjectiveId: spec.learningObjectiveId ?? null,
    startedAt: new Date().toISOString(),
    deadline: spec.seconds > 0 ? Date.now() + spec.seconds * 1000 : 0, // 0 = untimed
    timeLimitSeconds: spec.seconds,
    questionIds: spec.questions.map((q) => q.id),
    optionOrders,
    answers: {},
    marked: {},
    timeSpent: {},
    current: 0,
    requestedCount: spec.requestedCount,
  };
}

export function gradeSession(s: ActiveSession, byId: Map<string, Question>, bankVersion: string, autoSubmitted: boolean): AttemptResult {
  const answers: AttemptAnswer[] = s.questionIds.map((qid) => {
    const q = byId.get(qid)!;
    const sel = s.answers[qid] ?? [];
    const correct = q.correctOptionIds;
    const ok = sel.length > 0 && sel.length === correct.length && sel.every((x) => correct.includes(x));
    return {
      questionId: qid,
      selectedOptionIds: sel,
      correctOptionIds: correct,
      result: sel.length === 0 ? 'unanswered' : ok ? 'correct' : 'incorrect',
      markedForReview: !!s.marked[qid],
      timeSpentSeconds: Math.round(s.timeSpent[qid] ?? 0),
      optionOrder: s.optionOrders[qid] ?? q.options.map((o) => o.id),
      snapshot: {
        text: q.text,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        chapterId: q.chapterId,
        learningObjectiveId: q.learningObjectiveId,
        explanation: q.explanation,
      },
    };
  });
  const correctCount = answers.filter((a) => a.result === 'correct').length;
  const unansweredCount = answers.filter((a) => a.result === 'unanswered').length;
  const completed = new Date();
  const elapsed = Math.round((completed.getTime() - new Date(s.startedAt).getTime()) / 1000);
  const duration = s.timeLimitSeconds > 0 ? Math.min(s.timeLimitSeconds, elapsed) : elapsed;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: s.id,
    name: s.name,
    mode: s.mode,
    practiceKind: s.practiceKind ?? null,
    scopeKey: s.scopeKey,
    chapterId: s.chapterId,
    learningObjectiveId: s.learningObjectiveId,
    startedAt: s.startedAt,
    completedAt: completed.toISOString(),
    timeLimitSeconds: s.timeLimitSeconds,
    durationSeconds: duration,
    totalQuestions: answers.length,
    correctCount,
    incorrectCount: answers.length - correctCount - unansweredCount,
    unansweredCount,
    score: answers.length ? Math.round((correctCount / answers.length) * 1000) / 10 : 0,
    questionBankVersion: bankVersion,
    autoSubmitted,
    answers,
  };
}

export const MODE_LABEL: Record<AssessmentMode, string> = {
  'mock-exam': 'Mock Exam',
  'chapter-quiz': 'Chapter Quiz',
  'objective-quiz': 'Objective Quiz',
  'custom-practice': 'Practice',
};
