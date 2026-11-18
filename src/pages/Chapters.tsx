import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { BandSummary, Bar, ClassBadge, Empty, Pct } from '../components/ui';
import { Classification, classify, currentStatsFor, originalStatsFor, practiceStatsFor } from '../utils/stats';

type SortKey = 'number' | 'lowest' | 'highest' | 'incorrect' | 'least-practiced';

export function useChapterRows() {
  const app = useApp();
  return useMemo(
    () =>
      app.bank!.chapters.map((c) => {
        const qs = app.questions.filter((q) => q.chapterId === c.id);
        const orig = originalStatsFor(qs, app.progress);
        const prac = practiceStatsFor(new Set(qs.map((q) => q.id)), app.attempts);
        const current = currentStatsFor(qs, app.progress);
        return { c, qs, orig, prac, current };
      }),
    [app.bank, app.questions, app.progress, app.attempts],
  );
}

export default function Chapters() {
  const rows = useChapterRows();
  const [sort, setSort] = useState<SortKey>('number');
  const [band, setBand] = useState<Classification | null>(null);
  const sorted = useMemo(() => {
    const r = [...rows];
    const acc = (x: (typeof rows)[number]) => x.current.accuracy ?? 101;
    if (sort === 'lowest') r.sort((a, b) => acc(a) - acc(b));
    if (sort === 'highest') r.sort((a, b) => acc(b) - acc(a));
    if (sort === 'incorrect') r.sort((a, b) => b.orig.incorrect - a.orig.incorrect);
    if (sort === 'least-practiced') r.sort((a, b) => a.prac.answered - b.prac.answered);
    return band ? r.filter((x) => classify(x.current.accuracy) === band) : r;
  }, [rows, sort, band]);

  return (
    <div className="fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-cyan">// modules</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Layers className="text-cyan" /> Chapters
          </h1>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Sort by
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="number">Chapter number</option>
            <option value="lowest">Lowest score</option>
            <option value="highest">Highest score</option>
            <option value="incorrect">Most incorrect answers</option>
            <option value="least-practiced">Least practiced</option>
          </select>
        </label>
      </header>
      <BandSummary values={rows.map((x) => x.current.accuracy)} noun="chapters" selected={band} onSelect={setBand} />
      {band && (
        <div className="flex items-center gap-2 text-sm text-muted">
          Showing {sorted.length} {band} chapter{sorted.length === 1 ? '' : 's'} ·
          <button className="text-cyan hover:underline" onClick={() => setBand(null)}>
            show all
          </button>
        </div>
      )}
      {sorted.length === 0 && <Empty title={`No ${band} chapters`} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map(({ c, qs, orig, prac, current }) => (
          <Link key={c.id} to={`/chapters/${c.id}`} className="panel group flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-cyan">CHAPTER {String(c.number).padStart(2, '0')}</div>
                <div className="font-semibold leading-snug text-ink group-hover:text-cyan">{c.name}</div>
              </div>
              <ClassBadge value={current.accuracy} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Objectives" value={c.objectiveIds.length} />
              <Mini label="Questions" value={qs.length} />
              <Mini label="Current" value={<Pct v={current.accuracy} />} />
            </div>
            <Bar value={current.accuracy} />
            <div className="font-mono text-xs text-muted">
              original <Pct v={orig.accuracy} />
              {current.practiced > 0 && <span> · {current.practiced} practiced</span>}
            </div>
            <div className="flex justify-between font-mono text-xs text-muted">
              <span>
                <span className="text-ok">{orig.correct}</span> correct · <span className="text-bad">{orig.incorrect}</span> incorrect
              </span>
              <span>{prac.latestScore !== null ? <>latest practice <Pct v={prac.latestScore} /></> : 'not practiced'}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 px-2 py-1.5">
      <div className="font-mono text-base font-semibold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
