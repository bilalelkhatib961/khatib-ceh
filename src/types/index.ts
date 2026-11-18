export const SCHEMA_VERSION = 1;

export interface Chapter {
  id: string;
  number: number;
  name: string;
  objectiveIds: string[];
}

export interface LearningObjective {
  id: string;
  chapterId: string;
  number: number;
  name: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export type VerificationStatus = 'verified' | 'unresolved';

export interface Question {
  id: string;
  /** Null for mock-only questions that could not be reliably classified. */
  chapterId: string | null;
  learningObjectiveId: string | null;
  sources: string[]; // 'quiz' | 'mock-1' | 'mock-2'
  type: 'single-choice' | 'multiple-choice';
  text: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  /** How the correct answer was established. */
  answerBasis: string | null;
  explanation: string | null;
  explanationSource: string | null;
  explanationTruncated?: boolean;
  sourceScreenshotPaths: string[];
  verificationStatus: VerificationStatus;
  extractionConfidence: 'high' | 'medium' | 'low';
  issues: string[];
  /** Keyword-inferred topic tags (not official CEH classification). */
  tags: string[];
  shuffleSafe: boolean;
}

export interface OriginalAttempt {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  result: 'correct' | 'incorrect' | 'unknown';
  source: string;
  sourceScreenshotPath: string;
  sourceFolderClassification: 'correct' | 'incorrect' | null;
  attemptedAt: string | null;
}

export interface ExtractionReport {
  generatedAt: string;
  [k: string]: unknown;
}

export interface Bank {
  chapters: Chapter[];
  objectives: LearningObjective[];
  questions: Question[];
  originalAttempts: OriginalAttempt[];
  report: ExtractionReport;
}

export type AssessmentMode =
  | 'mock-exam'
  | 'chapter-quiz'
  | 'objective-quiz'
  | 'custom-practice';

export interface QuestionSnapshot {
  text: string;
  options: { id: string; text: string }[];
  chapterId: string | null;
  learningObjectiveId: string | null;
  explanation: string | null;
}

export interface AttemptAnswer {
  questionId: string;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  result: 'correct' | 'incorrect' | 'unanswered';
  markedForReview: boolean;
  timeSpentSeconds: number;
  /** Display order of options shown to the user. */
  optionOrder: string[];
  snapshot: QuestionSnapshot;
}

export interface AttemptResult {
  schemaVersion: number;
  id: string;
  name: string;
  mode: AssessmentMode;
  /** Sub-kind for custom practice: mistakes, bookmarks, weak-chapters, ... */
  practiceKind?: string | null;
  scopeKey: string;
  chapterId: string | null;
  learningObjectiveId: string | null;
  startedAt: string;
  completedAt: string;
  timeLimitSeconds: number;
  durationSeconds: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  score: number;
  questionBankVersion: string;
  autoSubmitted: boolean;
  answers: AttemptAnswer[];
  fileName?: string;
}

export interface ActiveSession {
  schemaVersion: number;
  id: string;
  name: string;
  mode: AssessmentMode;
  practiceKind?: string | null;
  scopeKey: string;
  chapterId: string | null;
  learningObjectiveId: string | null;
  startedAt: string;
  deadline: number; // epoch ms
  timeLimitSeconds: number;
  questionIds: string[];
  optionOrders: Record<string, string[]>;
  answers: Record<string, string[]>;
  marked: Record<string, boolean>;
  timeSpent: Record<string, number>;
  current: number;
  requestedCount: number;
}

export interface Settings {
  schemaVersion: number;
  examDate: string | null;
  targetScore: number;
  shuffleOptions: boolean;
  compactMode: boolean;
  questionFontSize: 'normal' | 'large';
}

export interface QuestionOverride {
  questionId: string;
  correctOptionIds: string[];
  note?: string;
  verifiedAt: string;
}

export type LearningState = 'unpracticed' | 'needs-review' | 'improving' | 'recovered' | 'mastered';
