import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, Clock, Crosshair, Database, FileQuestion, Flame, Layers, ListChecks, Play, Radar, RotateCcw,
  Target, Trophy, XCircle, Zap,
} from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { Bar, ClassBadge, Empty, Pct, SectionTitle, StatCard } from '../components/ui';
import { AccuracyBars, BandLegend, SplitBar, TrendLine } from '../components/Charts';
import { fmtDate, fmtDuration, fmtPct, originalStatsFor } from '../utils/stats';
import { eligible, MODE_CONFIG, MODE_LABEL, pickSpread } from '../utils/exam';
import { buildPracticeSet, isMistake, weakestChapters, weakestObjectives } from '../utils/practice';
import { stateLabel } from '../components/QuestionCard';

export default function Dashboard() {
  const app = useApp();
  const nav = useNavigate();
  const { launch, dialog } = useLauncher();
  const bank = app.bank!;
  const { questions, attempts, progress } = app;

  const orig = useMemo(() => originalStatsFor(questions.filter((q) => q.chapterId), progress), [questions, progress]);
  const objAttempted = useMemo(
    () => bank.objectives.filter((o) => questions.some((q) => q.learningObjectiveId === o.id && ((progress.get(q.id)?.origCorrect ?? 0) + (progress.get(q.id)?.origIncorrect ?? 0) > 0))).length,
    [bank, questions, progress],
  );
  const report = bank.report as Record<string, number>;
  const verified = questions.filter((q) => q.verificationStatus === 'verified').length;

  const sorted = useMemo(() => [...attempts].sort((a, b) => a.completedAt.localeCompare(b.completedAt)), [attempts]);
  const mocks = sorted.filter((a) => a.mode === 'mock-exam');
  const totalTime = sorted.reduce((s, a) => s + a.durationSeconds, 0);
  const avgScore = sorted.length ? sorted.reduce((s, a) => s + a.score, 0) / sorted.length : null;
  const recovered = [...progress.values()].filter((p) => p.origIncorrect > 0 && (p.state === 'recovered' || p.state === 'mastered')).length;
  const originallyWrongQs = [...progress.values()].filter((p) => p.origIncorrect > 0).length;

  const chapterBars = bank.chapters.map((c) => {
    const s = originalStatsFor(questions.filter((q) => q.chapterId === c.id), progress);
    return { name: String(c.number), full: `Ch ${c.number} · ${c.name}`, value: s.accuracy ?? 0, extra: `${s.correct} correct / ${s.incorrect} incorrect` };
  });
  const recentTrend = sorted.slice(-15).map((a, i) => ({ name: String(i + 1), full: `${a.name} · ${fmtDate(a.completedAt)}`, value: a.score }));
  let cumC = 0;
  let cumN = 0;
  const improvement = sorted.map((a, i) => {
    cumC += a.correctCount;
    cumN += a.totalQuestions;
    return { name: String(i + 1), full: `After ${i + 1} session${i ? 's' : ''} (${fmtDate(a.completedAt)})`, value: (cumC / cumN) * 100, extra: `${cumC}/${cumN} answers correct` };
  });

  const weakCh = weakestChapters(bank.chapters, questions, progress, attempts);
  const weakObj = weakestObjectives(bank.objectives, questions, progress, attempts);
  const mistakesCount = eligible(questions).filter((q) => isMistake(progress.get(q.id))).length;
  const practiceMore = [...questions]
    .filter((q) => q.verificationStatus === 'verified' && isMistake(progress.get(q.id)))
    .sort((a, b) => (progress.get(b.id)?.priority ?? 0) - (progress.get(a.id)?.priority ?? 0))
    .slice(0, 5);

  const startMock = () => {
    const pool = eligible(questions);
    launch({
      name: 'Full Mock Exam',
      mode: 'mock-exam',
      scopeKey: 'mock-exam',
      questions: pickSpread(pool, MODE_CONFIG['mock-exam'].count, (q) => q.chapterId ?? 'mock'),
      requestedCount: MODE_CONFIG['mock-exam'].count,
    });
  };
  const startMistakes = () => {
    const qs = buildPracticeSet('mistakes', { questions, progress, bookmarks: app.bookmarks, chapters: bank.chapters, objectives: bank.objectives, attempts, count: 30 });
    launch({ name: 'Practice My Mistakes', mode: 'custom-practice', practiceKind: 'mistakes', scopeKey: 'practice:mistakes', questions: qs, requestedCount: 30 });
  };

  // recommendations derived from recorded data
  const recs: { title: string; reason: string; action: () => void; icon: typeof Play }[] = [];
  if (app.activeSession)
    recs.push({ title: `Resume “${app.activeSession.name}”`, reason: 'You have an unfinished assessment.', action: () => nav('/exam/run'), icon: RotateCcw });
  if (weakObj[0]) {
    const o = weakObj[0].o;
    const ch = app.chById.get(o.chapterId)!;
    recs.push({
      title: `LO quiz: ${o.name}`,
      reason: `Your weakest objective (${fmtPct(weakObj[0].blend)} current accuracy, ${weakObj[0].orig.incorrect} original misses) in Ch ${ch.number}.`,
      action: () => nav(`/chapters/${ch.id}/${o.id}`),
      icon: Target,
    });
  }
  if (mistakesCount > 0)
    recs.push({ title: `Practice ${Math.min(30, mistakesCount)} of your ${mistakesCount} open mistakes`, reason: 'Prioritized by repeated misses, then original misses.', action: startMistakes, icon: Flame });
  const lastMock = mocks[mocks.length - 1];
  if (!lastMock || Date.now() - new Date(lastMock.completedAt).getTime() > 36 * 3600 * 1000)
    recs.push({ title: 'Full 125-question mock exam', reason: lastMock ? `Last mock was ${fmtDate(lastMock.completedAt)} (${lastMock.score}%).` : 'No full mock taken in KHATIB CEH yet — measure exam-day stamina.', action: startMock, icon: Crosshair });

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label text-cyan">// command center</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Study Dashboard</h1>
          <p className="text-sm text-muted">Original CEH assessment results and your KHATIB CEH practice are tracked separately.</p>
        </div>
        {/* phones: 2x2 grid of equal buttons */}
        <div className="grid w-full grid-cols-2 gap-2 text-center leading-tight sm:flex sm:w-auto sm:flex-wrap sm:leading-normal">
          <button className="btn-primary" onClick={startMock}>
            <Crosshair size={16} /> Start Mock Exam
          </button>
          <button className="btn-magenta" onClick={startMistakes}>
            <Flame size={16} /> Practice My Mistakes
          </button>
          <button className="btn-ghost" disabled={!app.activeSession} onClick={() => nav('/exam/run')} title={app.activeSession ? app.activeSession.name : 'No unfinished test'}>
            <RotateCcw size={16} /> Continue Previous Test
          </button>
          <Link className="btn-ghost" to="/weakness">
            <Radar size={16} /> View Weakness Radar
          </Link>
        </div>
      </header>

      <section>
        <SectionTitle icon={Database}>Original CEH assessment</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Chapters" value={bank.chapters.length} icon={Layers} sub={`${bank.objectives.length} learning objectives`} />
          <StatCard label="Unique questions" value={questions.length} icon={FileQuestion} sub={`${verified} verified · ${questions.length - verified} unresolved`} />
          <StatCard label="Original accuracy" value={<Pct v={orig.accuracy} digits={1} />} icon={Activity} sub={`${orig.correct} correct / ${orig.incorrect} incorrect attempts`} />
          <StatCard label="Extraction coverage" value={`${report.screenshotsProcessed}/${report.screenshotsDiscovered}`} icon={ListChecks} sub={`${report.screenshotsUsable} usable screenshots · ${report.screenshotsFailed} flagged`} />
          <StatCard label="Originally correct" value={orig.correct} icon={CheckCircle2} accent="ok" sub="quiz attempts" />
          <StatCard label="Originally incorrect" value={orig.incorrect} icon={XCircle} accent="bad" sub={`${originallyWrongQs} unique questions`} />
          <StatCard label="Objectives attempted" value={`${objAttempted}/${bank.objectives.length}`} icon={Target} />
          <StatCard label="Mock-exam captures" value={report.mockOnlyQuestions} icon={AlertTriangle} accent="warn" sub="no answer shown on screen · verify in Settings" />
        </div>
      </section>

      <section>
        <SectionTitle icon={Zap}>KHATIB CEH practice</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <StatCard label="Sessions completed" value={sorted.length} icon={ListChecks} sub={`${sorted.filter((a) => a.mode === 'chapter-quiz').length} chapter · ${sorted.filter((a) => a.mode === 'objective-quiz').length} LO · ${sorted.filter((a) => a.mode === 'custom-practice').length} practice`} />
          <StatCard label="Mock exams" value={mocks.length} icon={Crosshair} sub={lastMock ? `latest ${lastMock.score}%` : 'none yet'} accent="magenta" />
          <StatCard label="Best mock" value={mocks.length ? <Pct v={Math.max(...mocks.map((m) => m.score))} digits={1} /> : '—'} icon={Trophy} accent="magenta" sub={`target ${app.settings.targetScore}%`} />
          <StatCard label="Average score" value={<Pct v={avgScore} digits={1} />} icon={Activity} sub="across all sessions" />
          <StatCard label="Mistakes recovered" value={`${recovered}/${originallyWrongQs}`} icon={CheckCircle2} accent="ok" sub="2+ correct in a row" />
          <StatCard label="Study time" value={fmtDuration(totalTime)} icon={Clock} sub="time in completed sessions" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <SectionTitle>Original accuracy by chapter</SectionTitle>
          <AccuracyBars data={chapterBars} target={app.settings.targetScore} />
          <BandLegend />
        </div>
        <div className="panel p-4">
          <SectionTitle>Original correct vs incorrect</SectionTitle>
          <div className="py-4">
            <SplitBar correct={orig.correct} incorrect={orig.incorrect} />
          </div>
          <p className="text-xs text-muted">
            Accuracy = correct ÷ (correct + incorrect) original quiz attempts. Mock-exam screenshots did not show results and are not counted. Personal bands are study indicators, not official CEH
            thresholds.
          </p>
          <div className="mt-6">
            <SectionTitle>Recent assessment scores</SectionTitle>
          </div>
          {recentTrend.length ? <TrendLine data={recentTrend} target={app.settings.targetScore} /> : <Empty title="No KHATIB CEH assessments yet">Your score trend will appear after your first session.</Empty>}
        </div>
      </section>

      {improvement.length > 1 && (
        <section className="panel p-4">
          <SectionTitle>Practice improvement · cumulative accuracy</SectionTitle>
          <TrendLine data={improvement} target={app.settings.targetScore} color="#00E676" />
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-1">
          <SectionTitle icon={Target}>Recommended next session</SectionTitle>
          <div className="space-y-2">
            {recs.slice(0, 3).map((r) => (
              <button key={r.title} onClick={r.action} className="flex w-full items-start gap-3 rounded-lg border border-line bg-bg/50 p-3 text-left hover:border-cyan/50">
                <r.icon size={18} className="mt-0.5 shrink-0 text-cyan" />
                <span>
                  <span className="block text-sm font-medium text-ink">{r.title}</span>
                  <span className="block text-xs text-muted">{r.reason}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <SectionTitle icon={AlertTriangle}>Weakest chapters</SectionTitle>
          <ul className="space-y-3">
            {weakCh.map((w) => (
              <li key={w.c.id}>
                <Link to={`/chapters/${w.c.id}`} className="group block touch:-my-1.5 touch:py-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-ink group-hover:text-cyan">
                      <span className="font-mono text-muted">{String(w.c.number).padStart(2, '0')}</span> {w.c.name}
                    </span>
                    <Pct v={w.blend} />
                  </div>
                  <Bar value={w.blend} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <SectionTitle icon={AlertTriangle}>Weakest learning objectives</SectionTitle>
          <ul className="space-y-3">
            {weakObj.map((w) => (
              <li key={w.o.id}>
                <Link to={`/chapters/${w.o.chapterId}/${w.o.id}`} className="group block touch:-my-1.5 touch:py-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-ink group-hover:text-cyan">
                      <span className="font-mono text-muted">{app.chById.get(w.o.chapterId)?.number}.{w.o.number}</span> {w.o.name}
                    </span>
                    <Pct v={w.blend} />
                  </div>
                  <Bar value={w.blend} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <SectionTitle icon={ListChecks} right={<Link to="/history" className="text-xs text-cyan touch:-my-2 touch:py-3">All history →</Link>}>
            Recently completed tests
          </SectionTitle>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted">No completed assessments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sorted
                .slice(-5)
                .reverse()
                .map((a) => (
                  <li key={a.id}>
                    <Link to={`/results/${a.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-cyan">
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{a.name}</span>
                        <span className="text-xs text-muted">
                          {MODE_LABEL[a.mode]} · {fmtDate(a.completedAt)}
                        </span>
                      </span>
                      <span className="font-mono">
                        <Pct v={a.score} digits={1} />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="panel p-4">
          <SectionTitle icon={BookOpen} right={<Link to="/weakness" className="text-xs text-cyan touch:-my-2 touch:py-3">Study queue →</Link>}>
            Questions requiring more practice
          </SectionTitle>
          <ul className="divide-y divide-line">
            {practiceMore.map((q) => {
              const p = progress.get(q.id)!;
              const ch = q.chapterId ? app.chById.get(q.chapterId) : null;
              return (
                <li key={q.id} className="py-2">
                  <div className="line-clamp-2 text-sm text-ink">{q.text}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {ch && <span>Ch {ch.number}</span>}
                    <span>orig. wrong ×{p.origIncorrect}</span>
                    {p.misses > 0 && <span className="text-bad">practice misses ×{p.misses}</span>}
                    <ClassBadge cls={p.state === 'needs-review' ? 'Critical' : 'Needs Review'} />
                    <span>{stateLabel(p.state)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
