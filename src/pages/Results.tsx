import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Download, Flag, Home, Minus, RefreshCw, Repeat, RotateCcw, Shuffle, X } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { Bar, Empty, Pct, SectionTitle, StatCard } from '../components/ui';
import { eligible, MODE_CONFIG, MODE_LABEL, pickSpread, shuffle } from '../utils/exam';
import { fmtDate, fmtDuration } from '../utils/stats';
import { buildPracticeSet, PracticeKind } from '../utils/practice';
import type { AttemptAnswer, AttemptResult, Question } from '../types';

type Cat = 'all' | 'incorrect' | 'correct' | 'unanswered' | 'marked';

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Results() {
  const { attemptId } = useParams();
  const app = useApp();
  const nav = useNavigate();
  const { launch, dialog } = useLauncher();
  const [cat, setCat] = useState<Cat>('all');
  const a = app.attempts.find((x) => x.id === attemptId);

  const comparable = useMemo(
    () => (a ? app.attempts.filter((x) => x.scopeKey === a.scopeKey && x.completedAt < a.completedAt).sort((x, y) => x.completedAt.localeCompare(y.completedAt)) : []),
    [a, app.attempts],
  );
  if (!a) return <Empty title="Assessment not found">It may still be loading, or it was saved in a different browser profile.</Empty>;

  const prevBest = comparable.length ? Math.max(...comparable.map((x) => x.score)) : null;
  const prev = comparable[comparable.length - 1];
  const delta = prev ? a.score - prev.score : null;
  const target = app.settings.targetScore;

  // breakdown
  const groupKey = a.mode === 'mock-exam' || a.mode === 'custom-practice' ? 'chapterId' : 'learningObjectiveId';
  const groups = new Map<string, { label: string; c: number; n: number }>();
  for (const ans of a.answers) {
    const k = (ans.snapshot[groupKey] as string | null) ?? 'unclassified';
    const label =
      groupKey === 'chapterId'
        ? (app.chById.get(k) ? `Ch ${app.chById.get(k)!.number} · ${app.chById.get(k)!.name}` : 'Mock (unclassified)')
        : (app.objById.get(k) ? `LO ${app.objById.get(k)!.number} · ${app.objById.get(k)!.name}` : 'Unclassified');
    const g = groups.get(k) ?? { label, c: 0, n: 0 };
    g.n++;
    if (ans.result === 'correct') g.c++;
    groups.set(k, g);
  }
  const breakdown = [...groups.entries()].sort((x, y) => x[1].c / x[1].n - y[1].c / y[1].n);

  const filtered = a.answers
    .map((ans, i) => ({ ans, i }))
    .filter(({ ans }) => (cat === 'all' ? true : cat === 'marked' ? ans.markedForReview : ans.result === cat));

  const qList = (ids: string[]) => ids.map((id) => app.qById.get(id)).filter((q): q is Question => !!q && q.verificationStatus === 'verified');
  const retryIncorrect = () => {
    const qs = qList(a.answers.filter((x) => x.result !== 'correct').map((x) => x.questionId));
    launch({
      name: `Retry incorrect · ${a.name}`,
      mode: 'custom-practice',
      practiceKind: 'retry',
      scopeKey: `practice:retry:${a.scopeKey}`,
      chapterId: a.chapterId,
      learningObjectiveId: a.learningObjectiveId,
      questions: shuffle(qs),
      requestedCount: qs.length || 1,
      seconds: Math.max(5, Math.ceil(qs.length * 1.6)) * 60,
    });
  };
  const retake = () => {
    const qs = qList(a.answers.map((x) => x.questionId));
    launch({ name: a.name, mode: a.mode, practiceKind: a.practiceKind, scopeKey: a.scopeKey, chapterId: a.chapterId, learningObjectiveId: a.learningObjectiveId, questions: shuffle(qs), requestedCount: a.totalQuestions, seconds: a.timeLimitSeconds });
  };
  const fresh = () => {
    let qs: Question[] = [];
    let req = a.totalQuestions;
    if (a.mode === 'mock-exam') {
      qs = pickSpread(eligible(app.questions), MODE_CONFIG['mock-exam'].count, (q) => q.chapterId ?? 'mock');
      req = MODE_CONFIG['mock-exam'].count;
    } else if (a.mode === 'chapter-quiz') {
      qs = shuffle(eligible(app.questions.filter((q) => q.chapterId === a.chapterId)));
      req = qs.length;
    } else if (a.mode === 'objective-quiz') {
      qs = shuffle(eligible(app.questions.filter((q) => q.learningObjectiveId === a.learningObjectiveId)));
      req = qs.length;
    } else {
      const kind = (a.practiceKind ?? 'custom') as PracticeKind;
      qs = ['mistakes', 'bookmarks', 'weak-chapters', 'weak-objectives', 'unpracticed'].includes(kind)
        ? buildPracticeSet(kind, { questions: app.questions, progress: app.progress, bookmarks: app.bookmarks, chapters: app.bank!.chapters, objectives: app.bank!.objectives, attempts: app.attempts, count: a.totalQuestions })
        : shuffle(qList(a.answers.map((x) => x.questionId)));
    }
    launch({ name: a.name, mode: a.mode, practiceKind: a.practiceKind, scopeKey: a.scopeKey, chapterId: a.chapterId, learningObjectiveId: a.learningObjectiveId, questions: qs, requestedCount: req, seconds: a.timeLimitSeconds });
  };

  const cats: { k: Cat; label: string; n: number }[] = [
    { k: 'all', label: 'All Questions', n: a.totalQuestions },
    { k: 'incorrect', label: 'Incorrect', n: a.incorrectCount },
    { k: 'correct', label: 'Correct', n: a.correctCount },
    { k: 'unanswered', label: 'Unanswered', n: a.unansweredCount },
    { k: 'marked', label: 'Marked for Review', n: a.answers.filter((x) => x.markedForReview).length },
  ];

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label text-cyan">
            // {MODE_LABEL[a.mode]} result {a.autoSubmitted && '· auto-submitted at time limit'}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{a.name}</h1>
          <p className="text-sm text-muted">{fmtDate(a.completedAt)}</p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            {[
              app.cloudEnabled ? (app.cloudPending === 0 ? 'Saved to cloud' : 'Saved on this device · cloud upload pending') : null,
              app.storage === 'connected' && app.pending === 0
                ? `Saved to JSON · ${a.fileName}`
                : app.cloudEnabled
                  ? null
                  : 'Saved in browser · JSON file sync pending (connect the data folder in Settings)',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-center leading-tight sm:flex sm:w-auto sm:flex-wrap sm:leading-normal">
          <button className="btn-magenta col-span-2" onClick={retryIncorrect} disabled={a.correctCount === a.totalQuestions}>
            <RotateCcw size={16} /> Retry Incorrect Questions
          </button>
          <button className="btn-ghost" onClick={retake}>
            <Repeat size={16} /> Retake Assessment
          </button>
          <button className="btn-ghost" onClick={fresh}>
            <Shuffle size={16} /> New Randomized Assessment
          </button>
          <button className="btn-ghost" onClick={() => downloadJson(a.fileName ?? `${a.id}.json`, a)}>
            <Download size={16} /> JSON
          </button>
          <Link className="btn-ghost" to="/">
            <Home size={16} /> Dashboard
          </Link>
        </div>
      </header>

      <div className="panel-glow grid grid-cols-1 gap-6 p-4 sm:p-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center">
          <div className="font-mono text-5xl font-bold">
            <Pct v={a.score} digits={1} />
          </div>
          <div className="mt-1 text-xs text-muted">
            target {target}% · {a.score >= target ? <span className="text-ok">target reached</span> : <span className="text-warn">{(target - a.score).toFixed(1)} pts below target</span>}
          </div>
          <div className="mt-2 flex items-center gap-1 font-mono text-sm">
            {delta === null ? (
              <span className="text-muted">first attempt in this scope</span>
            ) : delta > 0 ? (
              <span className="flex items-center text-ok">
                <ArrowUp size={14} /> +{delta.toFixed(1)} vs previous
              </span>
            ) : delta < 0 ? (
              <span className="flex items-center text-bad">
                <ArrowDown size={14} /> {delta.toFixed(1)} vs previous
              </span>
            ) : (
              <span className="flex items-center text-muted">
                <Minus size={14} /> same as previous
              </span>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] leading-snug text-muted">A practice score is a study signal only — it does not guarantee a result on the official CEH exam.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total" value={a.totalQuestions} />
          <StatCard label="Correct" value={<span className="text-ok">{a.correctCount}</span>} accent="ok" />
          <StatCard label="Incorrect" value={<span className="text-bad">{a.incorrectCount}</span>} accent="bad" />
          <StatCard label="Unanswered" value={a.unansweredCount} accent="warn" />
          <StatCard label="Time spent" value={fmtDuration(a.durationSeconds)} sub={`${a.timeLimitSeconds > 0 ? 'limit ' + fmtDuration(a.timeLimitSeconds) : 'no time limit'}`} />
          <StatCard label="Avg / question" value={`${Math.round(a.durationSeconds / Math.max(1, a.totalQuestions))}s`} />
          <StatCard label="Previous best" value={<Pct v={prevBest} digits={1} />} sub={`${comparable.length} earlier attempt(s)`} />
          <StatCard label="Previous" value={<Pct v={prev?.score ?? null} digits={1} />} sub={prev ? fmtDate(prev.completedAt) : '—'} />
        </div>
      </div>

      {breakdown.length > 1 && (
        <div className="panel p-4">
          <SectionTitle>{groupKey === 'chapterId' ? 'Breakdown by chapter' : 'Breakdown by learning objective'} · weakest first</SectionTitle>
          <div className="space-y-2">
            {breakdown.map(([k, g]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-sm md:grid-cols-[minmax(0,2fr)_3fr_auto]">
                <span className="truncate text-ink">{g.label}</span>
                <span className="hidden md:block">
                  <Bar value={(g.c / g.n) * 100} />
                </span>
                <span className="font-mono text-xs">
                  {g.c}/{g.n} · <Pct v={(g.c / g.n) * 100} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-line pb-2">
          {cats.map((c) => (
            <button key={c.k} className={`tab ${cat === c.k ? 'tab-active' : ''}`} onClick={() => setCat(c.k)}>
              {c.label} <span className="font-mono text-xs opacity-70">{c.n}</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filtered.length === 0 && <Empty title="Nothing in this category" />}
          {filtered.map(({ ans, i }) => (
            <ReviewItem key={ans.questionId} ans={ans} index={i} attempt={a} />
          ))}
        </div>
      </div>
      <div className="flex justify-center">
        <button className="btn-ghost" onClick={() => nav('/history')}>
          <RefreshCw size={15} /> Assessment History
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ ans, index, attempt }: { ans: AttemptAnswer; index: number; attempt: AttemptResult }) {
  const app = useApp();
  const snap = ans.snapshot;
  const ch = snap.chapterId ? app.chById.get(snap.chapterId) : null;
  const ob = snap.learningObjectiveId ? app.objById.get(snap.learningObjectiveId) : null;
  const order = ans.optionOrder?.length ? ans.optionOrder : snap.options.map((o) => o.id);
  const color = ans.result === 'correct' ? 'border-ok/40' : ans.result === 'incorrect' ? 'border-bad/40' : 'border-warn/40';
  void attempt;
  return (
    <article className={`panel border-l-4 p-4 sm:p-5 ${color}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono text-cyan">Q{index + 1}</span>
        <span className={ans.result === 'correct' ? 'text-ok' : ans.result === 'incorrect' ? 'text-bad' : 'text-warn'}>{ans.result.toUpperCase()}</span>
        {ans.markedForReview && (
          <span className="chip border-warn/50 text-warn">
            <Flag size={11} /> marked
          </span>
        )}
        <span className="min-w-0">{ch ? `Ch ${ch.number} · ${ch.name}` : 'Mock (unclassified)'}</span>
        {ob && <span className="min-w-0">› LO {ob.number} · {ob.name}</span>}
        <span className="ml-auto font-mono">{ans.timeSpentSeconds}s</span>
      </div>
      <p className="question-text mb-3 text-[15px] text-ink">{snap.text}</p>
      <ul className="space-y-1.5">
        {order.map((oid, i) => {
          const o = snap.options.find((x) => x.id === oid);
          if (!o) return null;
          const isC = ans.correctOptionIds.includes(oid);
          const isS = ans.selectedOptionIds.includes(oid);
          return (
            <li key={oid} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${isC ? 'border-ok/60 bg-ok/10' : isS ? 'border-bad/60 bg-bad/10' : 'border-line'}`}>
              <span className="font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
              {/* phones: verdicts wrap under the option text */}
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
                <span className="min-w-0 basis-full whitespace-pre-wrap wrap-anywhere sm:flex-1 sm:basis-auto">{o.text}</span>
                {isC && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ok">
                    <Check size={13} /> Correct answer
                  </span>
                )}
                {isS && (
                  <span className={`flex shrink-0 items-center gap-1 text-xs ${isC ? 'text-ok' : 'text-bad'}`}>
                    {isC ? <Check size={13} /> : <X size={13} />} My answer
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {snap.explanation && (
        <details className="mt-3 rounded-lg border border-cyan/20 bg-cyan/5 p-3">
          <summary className="cursor-pointer text-xs font-medium text-cyan touch:-my-3 touch:py-3">Explanation · original CEH feedback</summary>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink/90 wrap-anywhere">
            {snap.explanation.split('\n').map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
