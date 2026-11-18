import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Play, Radar, Tag, TrendingDown } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { Bar, Pct, SectionTitle } from '../components/ui';
import QuestionList from '../components/QuestionList';
import { stateLabel } from '../components/QuestionCard';
import { CURRENT_RULE, originalStatsFor, practiceStatsFor, STATE_RULES } from '../utils/stats';
import { byPriority, weaknessScore } from '../utils/practice';
import { eligible } from '../utils/exam';
import type { LearningState, Question } from '../types';

type Cat =
  | 'queue'
  | 'orig-incorrect'
  | 'frequently-missed'
  | 'repeated-practice-miss'
  | 'never-practiced'
  | 'improved'
  | LearningState;

const STATE_ORDER: LearningState[] = ['unpracticed', 'needs-review', 'improving', 'recovered', 'mastered'];
const STATE_COLOR: Record<LearningState, string> = {
  unpracticed: '#8492A6',
  'needs-review': '#FF4757',
  improving: '#FFB800',
  recovered: '#00F5FF',
  mastered: '#00E676',
};

export default function WeaknessRadar() {
  const app = useApp();
  const { launch, dialog } = useLauncher();
  const [cat, setCat] = useState<Cat>('queue');
  const { progress, questions, attempts } = app;
  const bank = app.bank!;
  const verified = useMemo(() => eligible(questions), [questions]);

  const lists = useMemo(() => {
    const P = (q: Question) => progress.get(q.id)!;
    const m: Record<Cat, Question[]> = {
      queue: byPriority(verified.filter((q) => P(q).priority > 0.5), progress).slice(0, 60),
      'orig-incorrect': verified.filter((q) => P(q).origIncorrect > 0),
      'frequently-missed': verified.filter((q) => P(q).origIncorrect + P(q).misses >= 2),
      'repeated-practice-miss': verified.filter((q) => P(q).misses >= 2),
      'never-practiced': verified.filter((q) => P(q).events.length === 0),
      improved: verified.filter((q) => (P(q).origIncorrect > 0 || P(q).misses > 0) && P(q).streak > 0),
      unpracticed: [],
      'needs-review': [],
      improving: [],
      recovered: [],
      mastered: [],
    };
    for (const q of verified) m[P(q).state].push(q);
    return m;
  }, [verified, progress]);

  const chapterRows = bank.chapters
    .map((c) => ({ c, ...weaknessScore(questions.filter((q) => q.chapterId === c.id), progress, attempts) }))
    .sort((a, b) => (a.blend ?? 101) - (b.blend ?? 101));
  const objRows = bank.objectives
    .map((o) => ({ o, ...weaknessScore(questions.filter((q) => q.learningObjectiveId === o.id), progress, attempts) }))
    .filter((x) => x.orig.attempts > 0)
    .sort((a, b) => (a.blend ?? 101) - (b.blend ?? 101))
    .slice(0, 12);
  // regression: originally strong (>=80%) areas where practice accuracy is 15+ points lower over >= 5 answers
  const regressions = bank.objectives
    .map((o) => {
      const qs = questions.filter((q) => q.learningObjectiveId === o.id);
      return { o, orig: originalStatsFor(qs, progress), prac: practiceStatsFor(new Set(qs.map((q) => q.id)), attempts) };
    })
    .filter((x) => (x.orig.accuracy ?? 0) >= 80 && x.prac.answered >= 5 && (x.prac.accuracy ?? 100) <= (x.orig.accuracy ?? 0) - 15);

  const tagRows = useMemo(() => {
    const m = new Map<string, { c: number; i: number; n: number }>();
    for (const q of questions) {
      const p = progress.get(q.id)!;
      for (const t of q.tags) {
        const r = m.get(t) ?? { c: 0, i: 0, n: 0 };
        r.c += p.origCorrect;
        r.i += p.origIncorrect;
        r.n++;
        m.set(t, r);
      }
    }
    return [...m.entries()].map(([t, r]) => ({ t, ...r, acc: r.c + r.i ? (r.c / (r.c + r.i)) * 100 : null })).sort((a, b) => (a.acc ?? 101) - (b.acc ?? 101));
  }, [questions, progress]);

  const cats: { k: Cat; label: string; hint: string }[] = [
    { k: 'queue', label: 'Prioritized study queue', hint: 'Top 60 by priority score' },
    { k: 'orig-incorrect', label: 'Originally incorrect', hint: 'Missed in the original CEH quizzes' },
    { k: 'frequently-missed', label: 'Frequently missed', hint: '2+ misses (original + practice)' },
    { k: 'repeated-practice-miss', label: 'Repeated practice misses', hint: 'Missed 2+ times in KHATIB CEH' },
    { k: 'never-practiced', label: 'Never practiced', hint: 'Not yet answered here' },
    { k: 'improved', label: 'Improved over time', hint: 'Previously missed, now answered correctly' },
  ];

  const practiceCat = () => {
    const qs = byPriority(lists[cat], progress).slice(0, 40);
    const label = cats.find((c) => c.k === cat)?.label ?? stateLabel(cat);
    launch({
      name: `Weakness Radar · ${label}`,
      mode: 'custom-practice',
      practiceKind: `radar-${cat}`,
      scopeKey: `practice:radar:${cat}`,
      questions: qs,
      requestedCount: Math.min(40, Math.max(1, lists[cat].length)),
      seconds: Math.max(5, Math.ceil(qs.length * 1.5)) * 60,
    });
  };

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <header>
        <div className="label text-cyan">// threat model of your knowledge</div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <Radar className="text-cyan" /> Weakness Radar
        </h1>
        <p className="text-sm text-muted">Built only from your original CEH quiz results and the assessments you complete here.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STATE_ORDER.map((s) => (
          <button key={s} onClick={() => setCat(s)} className={`panel p-4 text-left hover:border-cyan/40 ${cat === s ? 'border-cyan/60' : ''}`} title={STATE_RULES[s]}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[s] }} />
              <span className="label">{stateLabel(s)}</span>
            </div>
            <div className="stat mt-2">{lists[s].length}</div>
            <div className="mt-1 text-[11px] leading-snug text-muted">{STATE_RULES[s]}</div>
          </button>
        ))}
      </section>

      <details className="panel p-4 text-sm text-muted">
        <summary className="flex cursor-pointer items-center gap-2 text-ink touch:-my-3 touch:py-3">
          <Info size={15} className="text-cyan" /> How states and priority are calculated
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {STATE_ORDER.map((s) => (
            <li key={s}>
              <b className="text-ink">{stateLabel(s)}:</b> {STATE_RULES[s]}
            </li>
          ))}
          <li>Each completed assessment counts once per question; unanswered counts as a miss.</li>
          <li>
            <b className="text-ink">Priority</b> = 3 × original misses + 2.5 × practice misses + 2 × current miss streak − 1.5 × current correct streak + 1 if never practiced − 0.5 × original
            correct answers. Repeated misses rank highest.
          </li>
          <li>{CURRENT_RULE} Chapters and objectives are ranked by this current accuracy; the original CEH accuracy is shown alongside.</li>
        </ul>
      </details>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <SectionTitle icon={TrendingDown}>Weakest chapters</SectionTitle>
          <RankTable
            rows={chapterRows.map((r) => ({ key: r.c.id, to: `/chapters/${r.c.id}`, label: `${String(r.c.number).padStart(2, '0')} · ${r.c.name}`, orig: r.orig.accuracy, prac: r.prac.accuracy, blend: r.blend, n: r.orig.incorrect }))}
          />
        </div>
        <div className="panel p-4">
          <SectionTitle icon={TrendingDown}>Weakest learning objectives</SectionTitle>
          <RankTable
            rows={objRows.map((r) => ({
              key: r.o.id,
              to: `/chapters/${r.o.chapterId}/${r.o.id}`,
              label: `${app.chById.get(r.o.chapterId)?.number}.${r.o.number} · ${r.o.name}`,
              orig: r.orig.accuracy,
              prac: r.prac.accuracy,
              blend: r.blend,
              n: r.orig.incorrect,
            }))}
          />
          {regressions.length > 0 && (
            <div className="mt-4 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
              <div className="mb-1 font-medium text-warn">Regression detected</div>
              {regressions.map((r) => (
                <div key={r.o.id} className="text-muted">
                  {r.o.name}: original <Pct v={r.orig.accuracy} /> → practice <Pct v={r.prac.accuracy} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel p-4">
        <SectionTitle icon={Tag}>Topic tags · inferred</SectionTitle>
        <p className="mb-3 text-xs text-muted">Tags are assigned automatically by keyword matching. They are an aid for revision, not an official CEH classification. Original accuracy per tag:</p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {tagRows.map((r) => (
            <div key={r.t} className="text-sm">
              <div className="flex justify-between">
                <span className="text-ink">{r.t}</span>
                <span className="font-mono text-xs">
                  <Pct v={r.acc} /> <span className="text-muted">· {r.n} q</span>
                </span>
              </div>
              <Bar value={r.acc} height={4} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          {cats.map((c) => (
            <button key={c.k} className={`tab ${cat === c.k ? 'tab-active' : ''}`} onClick={() => setCat(c.k)} title={c.hint}>
              {c.label} <span className="font-mono text-xs opacity-70">{lists[c.k].length}</span>
            </button>
          ))}
          {STATE_ORDER.includes(cat as LearningState) && <span className="tab tab-active">{stateLabel(cat)}</span>}
          <button className="btn-magenta ml-auto" onClick={practiceCat} disabled={!lists[cat].length}>
            <Play size={15} /> Practice this category
          </button>
        </div>
        <QuestionList key={cat} questions={lists[cat]} showContext filters={['bookmarked', 'orig-incorrect', 'unpracticed']} emptyText="No questions in this category yet." />
      </section>
    </div>
  );
}

function RankTable({ rows }: { rows: { key: string; to: string; label: string; orig: number | null; prac: number | null; blend: number | null; n: number }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
          <th className="pb-2">Area</th>
          <th className="pb-2 text-right">Original</th>
          <th className="pb-2 text-right">Practice</th>
          <th className="pb-2 text-right">Current</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-line/60">
            <td className="max-w-0 py-1.5 pr-2">
              <Link to={r.to} className="block truncate text-ink hover:text-cyan touch:-my-1 touch:py-2.5" title={r.label}>
                {r.label}
              </Link>
            </td>
            <td className="py-1.5 text-right font-mono text-xs">
              <Pct v={r.orig} />
            </td>
            <td className="py-1.5 text-right font-mono text-xs">
              <Pct v={r.prac} />
            </td>
            <td className="py-1.5 text-right font-mono text-xs font-semibold">
              <Pct v={r.blend} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
