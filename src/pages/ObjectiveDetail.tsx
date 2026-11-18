import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Flame, List, Play, XCircle } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { ClassBadge, Crumbs, Empty, Pct, SectionTitle, StatCard } from '../components/ui';
import { TrendLine } from '../components/Charts';
import QuestionList from '../components/QuestionList';
import { currentStatsFor, CURRENT_RULE, fmtDate, originalStatsFor, practiceStatsFor } from '../utils/stats';
import { eligible, shuffle } from '../utils/exam';
import { byPriority, isMistake } from '../utils/practice';

type Tab = 'correct' | 'incorrect' | 'all';

export default function ObjectiveDetail() {
  const { chapterId, objectiveId } = useParams();
  const app = useApp();
  const { launch, dialog } = useLauncher();
  const [tab, setTab] = useState<Tab>('incorrect');
  const ch = app.chById.get(chapterId ?? '');
  const obj = app.objById.get(objectiveId ?? '');
  const qs = useMemo(() => app.questions.filter((q) => q.learningObjectiveId === objectiveId), [app.questions, objectiveId]);
  if (!ch || !obj) return <Empty title="Learning objective not found" />;

  const orig = originalStatsFor(qs, app.progress);
  const prac = practiceStatsFor(new Set(qs.map((q) => q.id)), app.attempts);
  const current = currentStatsFor(qs, app.progress);
  const correctQs = qs.filter((q) => (app.progress.get(q.id)?.origCorrect ?? 0) > 0);
  const incorrectQs = qs.filter((q) => (app.progress.get(q.id)?.origIncorrect ?? 0) > 0);
  const scope = `objective:${obj.id}`;
  const history = app.attempts
    .filter((a) => a.scopeKey === scope)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((a, i) => ({ name: String(i + 1), full: fmtDate(a.completedAt), value: a.score }));

  const startQuiz = () =>
    launch({
      name: `LO ${ch.number}.${obj.number} Quiz · ${obj.name}`,
      mode: 'objective-quiz',
      scopeKey: scope,
      chapterId: ch.id,
      learningObjectiveId: obj.id,
      // every verified question in the objective (originally correct and incorrect), untimed
      questions: shuffle(eligible(qs)),
      requestedCount: eligible(qs).length,
    });
  const startIncorrect = () => {
    const m = byPriority(eligible(qs).filter((q) => isMistake(app.progress.get(q.id))), app.progress);
    launch({
      name: `LO ${ch.number}.${obj.number} Incorrect Questions`,
      mode: 'custom-practice',
      practiceKind: 'mistakes',
      scopeKey: `practice:mistakes:${obj.id}`,
      chapterId: ch.id,
      learningObjectiveId: obj.id,
      questions: m,
      requestedCount: Math.max(1, m.length),
    });
  };

  const tabs: { key: Tab; label: string; icon: typeof List; n: number }[] = [
    { key: 'correct', label: 'Correct Answers', icon: CheckCircle2, n: correctQs.length },
    { key: 'incorrect', label: 'Incorrect Answers', icon: XCircle, n: incorrectQs.length },
    { key: 'all', label: 'All Questions', icon: List, n: qs.length },
  ];

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <Crumbs items={[{ label: 'Chapters', to: '/chapters' }, { label: `Ch ${ch.number} · ${ch.name}`, to: `/chapters/${ch.id}` }, { label: `LO ${obj.number}` }]} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-cyan">
            LEARNING OBJECTIVE {ch.number}.{obj.number}
          </div>
          <h1 className="text-2xl font-bold">{obj.name}</h1>
          <div className="mt-1" title={CURRENT_RULE}>
            <ClassBadge value={current.accuracy} />
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button className="btn-primary flex-wrap gap-y-0.5" onClick={startQuiz}>
            <Play size={16} /> Start Learning Objective Quiz <span className="whitespace-nowrap font-mono text-xs opacity-80">({eligible(qs).length} q · no timer)</span>
          </button>
          <button className="btn-magenta" onClick={startIncorrect}>
            <Flame size={16} /> Practice Incorrect Questions
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Current accuracy" value={<Pct v={current.accuracy} digits={1} />} sub={`${current.correct}/${current.answered} questions · latest answer`} />
        <StatCard label="Original accuracy" value={<Pct v={orig.accuracy} digits={1} />} sub="original CEH quizzes" />
        <StatCard label="Correct / Incorrect" value={<><span className="text-ok">{orig.correct}</span> / <span className="text-bad">{orig.incorrect}</span></>} sub="original attempts" />
        <StatCard label="Questions" value={qs.length} />
        <StatCard label="Practice accuracy" value={<Pct v={prac.accuracy} digits={1} />} sub={prac.answered ? `${prac.correct}/${prac.answered} answers · latest ${prac.latestScore?.toFixed(0)}%` : 'not practiced yet'} />
      </div>

      {history.length > 0 && (
        <div className="panel p-4">
          <SectionTitle>Objective quiz history</SectionTitle>
          <TrendLine data={history} target={app.settings.targetScore} />
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line pb-2" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab flex items-center gap-1.5 ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label} <span className="font-mono text-xs opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'correct' && <QuestionList key="c" questions={correctQs} defaultRevealed emptyText="No originally-correct questions in this objective." />}
      {tab === 'incorrect' && (
        <>
          <p className="text-xs text-muted">Answers are hidden. Try each question yourself, then use Reveal Answer.</p>
          <QuestionList key="i" questions={incorrectQs} emptyText="No originally-incorrect questions in this objective." />
        </>
      )}
      {tab === 'all' && <QuestionList key="a" questions={qs} filters={['orig-correct', 'orig-incorrect', 'bookmarked', 'unpracticed', 'needs-review', 'recovered']} />}
    </div>
  );
}
