import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Flame, Play } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { BandSummary, Bar, ClassBadge, Crumbs, Empty, Pct, SectionTitle, StatCard } from '../components/ui';
import { TrendLine } from '../components/Charts';
import QuestionList from '../components/QuestionList';
import { Mini } from './Chapters';
import { Classification, classify, currentStatsFor, CURRENT_RULE, fmtDate, originalStatsFor, practiceStatsFor } from '../utils/stats';
import { eligible, shuffle } from '../utils/exam';
import { byPriority, isMistake } from '../utils/practice';

export default function ChapterDetail() {
  const { chapterId } = useParams();
  const app = useApp();
  const { launch, dialog } = useLauncher();
  const [browse, setBrowse] = useState(false);
  const [band, setBand] = useState<Classification | null>(null);
  const ch = app.chById.get(chapterId ?? '');
  const qs = useMemo(() => app.questions.filter((q) => q.chapterId === chapterId), [app.questions, chapterId]);
  if (!ch) return <Empty title="Chapter not found" />;

  const orig = originalStatsFor(qs, app.progress);
  const ids = new Set(qs.map((q) => q.id));
  const prac = practiceStatsFor(ids, app.attempts);
  const current = currentStatsFor(qs, app.progress);
  const objs = ch.objectiveIds.map((id) => app.objById.get(id)!).filter(Boolean);
  const objAcc = new Map(objs.map((o) => [o.id, currentStatsFor(qs.filter((q) => q.learningObjectiveId === o.id), app.progress).accuracy]));
  const shownObjs = band ? objs.filter((o) => classify(objAcc.get(o.id) ?? null) === band) : objs;
  const scope = `chapter:${ch.id}`;
  const history = app.attempts
    .filter((a) => a.scopeKey === scope)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .map((a, i) => ({ name: String(i + 1), full: fmtDate(a.completedAt), value: a.score }));

  const startQuiz = () =>
    launch({
      name: `Chapter ${ch.number} Quiz · ${ch.name}`,
      mode: 'chapter-quiz',
      scopeKey: scope,
      chapterId: ch.id,
      questions: shuffle(eligible(qs)), // every verified question in the chapter
      requestedCount: eligible(qs).length,
    });
  const startMistakes = () => {
    const m = byPriority(eligible(qs).filter((q) => isMistake(app.progress.get(q.id))), app.progress).slice(0, 30);
    launch({
      name: `Chapter ${ch.number} Mistakes`,
      mode: 'custom-practice',
      practiceKind: 'mistakes',
      scopeKey: `practice:mistakes:${ch.id}`,
      chapterId: ch.id,
      questions: m,
      requestedCount: Math.max(m.length, 1),
    });
  };

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <Crumbs items={[{ label: 'Chapters', to: '/chapters' }, { label: `Ch ${ch.number}` }]} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-cyan">CHAPTER {String(ch.number).padStart(2, '0')}</div>
          <h1 className="text-2xl font-bold">{ch.name}</h1>
          <div className="mt-1" title={CURRENT_RULE}>
            <ClassBadge value={current.accuracy} />
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button className="btn-primary flex-wrap gap-y-0.5" onClick={startQuiz}>
            <Play size={16} /> Start Chapter Quiz <span className="whitespace-nowrap font-mono text-xs opacity-80">({eligible(qs).length} q · no timer)</span>
          </button>
          <button className="btn-magenta" onClick={startMistakes}>
            <Flame size={16} /> Practice Chapter Mistakes
          </button>
          <button className="btn-ghost" onClick={() => setBrowse(!browse)}>
            <BookOpen size={16} /> {browse ? 'Show objectives' : 'Browse All Chapter Questions'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Current accuracy" value={<Pct v={current.accuracy} digits={1} />} sub={`${current.correct}/${current.answered} questions · latest answer`} />
        <StatCard label="Original accuracy" value={<Pct v={orig.accuracy} digits={1} />} sub="original CEH quizzes" />
        <StatCard label="Correct / Incorrect" value={<><span className="text-ok">{orig.correct}</span> / <span className="text-bad">{orig.incorrect}</span></>} sub="original attempts" />
        <StatCard label="Questions" value={qs.length} sub={`${orig.verified} verified`} />
        <StatCard label="Objectives" value={objs.length} />
        <StatCard label="Latest practice" value={<Pct v={prac.latestScore} digits={1} />} sub={prac.answered ? `${prac.correct}/${prac.answered} practice answers correct` : 'not practiced yet'} />
      </div>

      {history.length > 0 && (
        <div className="panel p-4">
          <SectionTitle>Chapter quiz history</SectionTitle>
          <TrendLine data={history} target={app.settings.targetScore} />
        </div>
      )}

      {browse ? (
        <QuestionList questions={qs} filters={['orig-correct', 'orig-incorrect', 'bookmarked', 'unpracticed', 'needs-review', 'recovered']} showContext />
      ) : (
        <>
        <BandSummary values={objs.map((o) => objAcc.get(o.id) ?? null)} noun="objectives" selected={band} onSelect={setBand} />
        {band && (
          <div className="flex items-center gap-2 text-sm text-muted">
            Showing {shownObjs.length} {band} objective{shownObjs.length === 1 ? '' : 's'} ·
            <button className="text-cyan hover:underline" onClick={() => setBand(null)}>
              show all
            </button>
          </div>
        )}
        {shownObjs.length === 0 && <Empty title={`No ${band} objectives in this chapter`} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shownObjs.map((o) => {
            const oq = qs.filter((q) => q.learningObjectiveId === o.id);
            const os = originalStatsFor(oq, app.progress);
            const oc = currentStatsFor(oq, app.progress);
            const op = practiceStatsFor(new Set(oq.map((q) => q.id)), app.attempts, `objective:${o.id}`);
            const opAny = practiceStatsFor(new Set(oq.map((q) => q.id)), app.attempts);
            return (
              <Link key={o.id} to={`/chapters/${ch.id}/${o.id}`} className="panel group flex flex-col gap-3 p-4 hover:border-cyan/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-cyan">
                      LO {ch.number}.{o.number}
                    </div>
                    <div className="font-semibold leading-snug group-hover:text-cyan">{o.name}</div>
                  </div>
                  <ClassBadge value={oc.accuracy} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="Questions" value={oq.length} />
                  <Mini label="Current" value={<Pct v={oc.accuracy} />} />
                  <Mini label="Original" value={<Pct v={os.accuracy} />} />
                </div>
                <Bar value={oc.accuracy} />
                <div className="flex justify-between font-mono text-xs text-muted">
                  <span>
                    original <span className="text-ok">{os.correct}✓</span> <span className="text-bad">{os.incorrect}✗</span>
                  </span>
                  <span>{(op.latestScore ?? opAny.latestScore) !== null ? <>latest practice <Pct v={op.latestScore ?? opAny.latestScore} /></> : 'not practiced'}</span>
                </div>
              </Link>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
