import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, History as HistoryIcon, Minus } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Empty, Pct, SectionTitle } from '../components/ui';
import { TrendLine } from '../components/Charts';
import { MODE_LABEL } from '../utils/exam';
import { fmtDate, fmtDuration } from '../utils/stats';
import { downloadJson } from './Results';
import type { AssessmentMode } from '../types';

export default function History() {
  const app = useApp();
  const [mode, setMode] = useState<'all' | AssessmentMode>('all');
  const [chapter, setChapter] = useState('all');
  const [objective, setObjective] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');

  const withDelta = useMemo(() => {
    const sorted = [...app.attempts].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    const lastByScope = new Map<string, number>();
    return sorted.map((a) => {
      const prev = lastByScope.get(a.scopeKey);
      lastByScope.set(a.scopeKey, a.score);
      return { a, delta: prev === undefined ? null : a.score - prev };
    });
  }, [app.attempts]);

  const rows = withDelta
    .filter(({ a }) => {
      if (mode !== 'all' && a.mode !== mode) return false;
      if (chapter !== 'all' && a.chapterId !== chapter && !a.answers.some((x) => x.snapshot.chapterId === chapter)) return false;
      if (objective !== 'all' && a.learningObjectiveId !== objective) return false;
      if (from && a.completedAt.slice(0, 10) < from) return false;
      if (to && a.completedAt.slice(0, 10) > to) return false;
      if (minScore && a.score < Number(minScore)) return false;
      if (maxScore && a.score > Number(maxScore)) return false;
      return true;
    })
    .reverse();

  // trend for the filtered set (only meaningful when it is one comparable scope)
  const scopes = new Set(rows.map((r) => r.a.scopeKey));
  const trend = [...rows].reverse().map((r, i) => ({ name: String(i + 1), full: `${r.a.name} · ${fmtDate(r.a.completedAt)}`, value: r.a.score }));
  const objOptions = app.bank!.objectives.filter((o) => chapter === 'all' || o.chapterId === chapter);

  return (
    <div className="fade-in space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-cyan">// logbook</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <HistoryIcon className="text-cyan" /> Assessment History
          </h1>
          <p className="text-sm text-muted">Every completed attempt is kept as its own JSON record — none are overwritten.</p>
        </div>
        <button className="btn-ghost" onClick={() => downloadJson(`khatib-ceh-history_${new Date().toISOString().slice(0, 10)}.json`, { exportedAt: new Date().toISOString(), attempts: app.attempts })}>
          <Download size={16} /> Export history JSON
        </button>
      </header>

      <div className="panel grid grid-cols-2 gap-2 p-3 md:grid-cols-4 xl:grid-cols-7">
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Assessment type">
          <option value="all">All types</option>
          <option value="mock-exam">Mock examination</option>
          <option value="chapter-quiz">Chapter quiz</option>
          <option value="objective-quiz">Learning objective quiz</option>
          <option value="custom-practice">Custom practice</option>
        </select>
        <select className="input" value={chapter} onChange={(e) => (setChapter(e.target.value), setObjective('all'))} aria-label="Chapter">
          <option value="all">All chapters</option>
          {app.bank!.chapters.map((c) => (
            <option key={c.id} value={c.id}>
              Ch {c.number} · {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={objective} onChange={(e) => setObjective(e.target.value)} aria-label="Learning objective">
          <option value="all">All objectives</option>
          {objOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {app.chById.get(o.chapterId)?.number}.{o.number} {o.name}
            </option>
          ))}
        </select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        <input className="input" type="number" min={0} max={100} placeholder="Min score" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        <input className="input" type="number" min={0} max={100} placeholder="Max score" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
      </div>

      {trend.length > 1 && (
        <div className="panel p-4">
          <SectionTitle>{scopes.size === 1 ? 'Score trend · comparable attempts' : 'Score trend · filtered attempts (mixed scopes)'}</SectionTitle>
          <TrendLine data={trend} target={app.settings.targetScore} />
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title="No assessments match">Complete a quiz or mock exam to start building your history.</Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Assessment</th>
                <th className="px-2 py-3">Type</th>
                <th className="px-2 py-3">Date</th>
                <th className="px-2 py-3 text-right">Score</th>
                <th className="px-2 py-3 text-right">C / I / U</th>
                <th className="px-2 py-3 text-right">Duration</th>
                <th className="px-4 py-3 text-right">vs previous</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, delta }) => (
                <tr key={a.id} className="border-b border-line/60 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link to={`/results/${a.id}`} className="text-ink hover:text-cyan">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-muted">{MODE_LABEL[a.mode]}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-muted">{fmtDate(a.completedAt)}</td>
                  <td className="px-2 py-2.5 text-right font-mono">
                    <Pct v={a.score} digits={1} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs">
                    <span className="text-ok">{a.correctCount}</span> / <span className="text-bad">{a.incorrectCount}</span> / <span className="text-warn">{a.unansweredCount}</span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs text-muted">{fmtDuration(a.durationSeconds)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {delta === null ? (
                      <span className="text-muted">first</span>
                    ) : delta > 0 ? (
                      <span className="inline-flex items-center text-ok">
                        <ArrowUp size={12} />+{delta.toFixed(1)}
                      </span>
                    ) : delta < 0 ? (
                      <span className="inline-flex items-center text-bad">
                        <ArrowDown size={12} />
                        {delta.toFixed(1)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-muted">
                        <Minus size={12} />0
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
