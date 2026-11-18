import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Eraser, Flag, Keyboard, Send, Timer } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Empty, Modal } from '../components/ui';
import { gradeSession } from '../utils/exam';
import { fmtClock } from '../utils/stats';
import type { ActiveSession } from '../types';
import { saveActiveSession } from '../services/storage';

export default function ExamRunner() {
  const app = useApp();
  const nav = useNavigate();
  const [s, setS] = useState<ActiveSession | null>(app.activeSession);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const lastTick = useRef(Date.now());

  useEffect(() => setS(app.activeSession), [app.activeSession]);

  const qids = useMemo(() => (s ? s.questionIds.filter((id) => app.qById.has(id)) : []), [s, app.qById]);
  const remaining = s ? Math.max(0, Math.floor((s.deadline - now) / 1000)) : 0;

  const update = useCallback((fn: (x: ActiveSession) => ActiveSession) => {
    setS((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveActiveSession(next);
      return next;
    });
  }, []);

  const submit = useCallback(
    async (auto: boolean) => {
      if (!s || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      const finalS = { ...s, questionIds: qids };
      const result = gradeSession(finalS, app.qById, app.bank?.version ?? 'unknown', auto);
      await app.recordAttempt(result);
      app.setActiveSession(null);
      nav(`/results/${result.id}`, { replace: true });
    },
    [s, qids, app, nav],
  );

  // timer + per-question time tracking
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const delta = (n - lastTick.current) / 1000;
      lastTick.current = n;
      if (document.visibilityState === 'visible' && delta < 5) {
        const qid = qids[s.current];
        if (qid) setS((prev) => (prev ? { ...prev, timeSpent: { ...prev.timeSpent, [qid]: (prev.timeSpent[qid] ?? 0) + delta } } : prev));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [s?.id, s?.current, qids]); // eslint-disable-line react-hooks/exhaustive-deps

  // periodic persistence of time spent
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => setS((prev) => (prev && saveActiveSession(prev), prev)), 10000);
    return () => clearInterval(t);
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-submit at deadline (also when reopening after the deadline passed)
  useEffect(() => {
    if (s && remaining <= 0 && !submittedRef.current) submit(true);
  }, [remaining, s, submit]);

  const q = s ? app.qById.get(qids[s.current]) : undefined;
  const order = q && s ? (s.optionOrders[q.id] ?? q.options.map((o) => o.id)) : [];
  const multi = q ? q.correctOptionIds.length > 1 : false;
  const selected = q && s ? (s.answers[q.id] ?? []) : [];

  const go = (i: number) => update((x) => ({ ...x, current: Math.max(0, Math.min(qids.length - 1, i)) }));
  const choose = (optId: string) => {
    if (!q) return;
    update((x) => {
      const cur = x.answers[q.id] ?? [];
      const next = multi ? (cur.includes(optId) ? cur.filter((o) => o !== optId) : [...cur, optId]) : [optId];
      return { ...x, answers: { ...x.answers, [q.id]: next } };
    });
  };
  const clear = () => q && update((x) => ({ ...x, answers: { ...x.answers, [q.id]: [] } }));
  const mark = () => q && update((x) => ({ ...x, marked: { ...x.marked, [q.id]: !x.marked[q.id] } }));

  // keyboard shortcuts (inactive while a dialog is open or when typing)
  useEffect(() => {
    if (!s) return;
    const h = (e: KeyboardEvent) => {
      if (confirm || showKeys || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      const idx = '1234567'.indexOf(k) >= 0 ? '1234567'.indexOf(k) : 'abcdefg'.indexOf(k);
      if (idx >= 0 && idx < order.length) return choose(order[idx]);
      if (k === 'arrowright' || k === 'n') return go(s.current + 1);
      if (k === 'arrowleft' || k === 'p') return go(s.current - 1);
      if (k === 'm') return mark();
      if (k === 'x') return clear();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!s)
    return (
      <Empty title="No active assessment">
        Start a mock exam, chapter quiz or practice session from the <Link to="/exam-center" className="text-cyan">Exam Center</Link>.
      </Empty>
    );
  if (!q) return <Empty title="Preparing assessment…" />;

  const answered = qids.filter((id) => (s.answers[id] ?? []).length > 0).length;
  const unanswered = qids.length - answered;
  const markedIds = qids.filter((id) => s.marked[id]);
  const low = remaining < 300;
  const large = app.settings.questionFontSize === 'large';

  return (
    <div className="fade-in grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="space-y-4">
        <div className="panel-glow flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="label text-cyan">{s.name}</div>
            <div className="font-mono text-sm text-muted">
              Question <span className="text-ink">{s.current + 1}</span> / {qids.length} · answered {answered}
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xl font-semibold ${low ? 'border-bad/60 text-bad' : 'border-cyan/30 text-cyan'}`} aria-live="polite">
            <Timer size={18} /> {fmtClock(remaining)}
          </div>
        </div>

        <article className="panel p-6">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="font-mono text-cyan">Q{s.current + 1}</span>
            {s.marked[q.id] && (
              <span className="chip border-warn/50 text-warn">
                <Flag size={11} /> Marked for review
              </span>
            )}
            {multi && <span className="chip border-cyan/40 text-cyan">Select {q.correctOptionIds.length}</span>}
          </div>
          <p className={`question-text mb-5 text-ink ${large ? 'text-lg' : 'text-base'}`}>{q.text}</p>
          <div className="space-y-2" role={multi ? 'group' : 'radiogroup'}>
            {order.map((oid, i) => {
              const o = q.options.find((x) => x.id === oid)!;
              const on = selected.includes(oid);
              return (
                <button
                  key={oid}
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  onClick={() => choose(oid)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    on ? 'border-cyan/70 bg-cyan/10' : 'border-line bg-bg/40 hover:border-cyan/30'
                  }`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center ${multi ? 'rounded' : 'rounded-full'} border ${on ? 'border-cyan bg-cyan' : 'border-muted'}`}>
                    {on && <span className={`h-2 w-2 bg-bg ${multi ? 'rounded-sm' : 'rounded-full'}`} />}
                  </span>
                  <span className="font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
                  <span className={`flex-1 whitespace-pre-wrap ${large ? 'text-base' : 'text-[15px]'} text-ink`}>{o.text}</span>
                </button>
              );
            })}
          </div>
        </article>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => go(s.current - 1)} disabled={s.current === 0}>
            <ChevronLeft size={16} /> Previous
          </button>
          <button className="btn-ghost" onClick={() => go(s.current + 1)} disabled={s.current >= qids.length - 1}>
            Next <ChevronRight size={16} />
          </button>
          <button className={s.marked[q.id] ? 'btn border border-warn/60 bg-warn/10 text-warn' : 'btn-ghost'} onClick={mark}>
            <Flag size={16} /> {s.marked[q.id] ? 'Unmark' : 'Mark for Review'}
          </button>
          <button className="btn-ghost" onClick={clear} disabled={!selected.length}>
            <Eraser size={16} /> Clear Answer
          </button>
          <button className="btn-ghost" onClick={() => setShowKeys(true)} title="Keyboard shortcuts">
            <Keyboard size={16} />
          </button>
          <button className="btn-primary ml-auto" onClick={() => setConfirm(true)} disabled={submitting}>
            <Send size={16} /> Submit Exam
          </button>
        </div>
      </section>

      <aside className="panel h-fit p-4 lg:sticky lg:top-4">
        <div className="label mb-3">Question navigator</div>
        <div className="grid max-h-[55vh] grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 lg:grid-cols-6">
          {qids.map((id, i) => {
            const a = (s.answers[id] ?? []).length > 0;
            const m = s.marked[id];
            const cur = i === s.current;
            return (
              <button
                key={id}
                onClick={() => go(i)}
                aria-label={`Question ${i + 1}${a ? ', answered' : ', unanswered'}${m ? ', marked for review' : ''}`}
                className={`relative h-8 rounded font-mono text-xs transition-colors ${
                  cur ? 'ring-2 ring-magenta' : ''
                } ${a ? 'bg-cyan/20 text-cyan' : 'bg-bg text-muted'} border ${m ? 'border-warn' : 'border-line'} hover:border-cyan/60`}
              >
                {i + 1}
                {m && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warn" />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-1.5 text-xs text-muted">
          <Legend cls="bg-cyan/20 border-line" label={`Answered (${answered})`} />
          <Legend cls="bg-bg border-line" label={`Unanswered (${unanswered})`} />
          <Legend cls="bg-bg border-warn" label={`Marked for review (${markedIds.length})`} />
          <Legend cls="bg-bg border-line ring-2 ring-magenta" label="Current" />
        </div>
      </aside>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit assessment?">
        <div className="space-y-3 text-sm">
          <p>
            You answered <b className="font-mono text-cyan">{answered}</b> of <b className="font-mono">{qids.length}</b> questions. Time remaining: <span className="font-mono">{fmtClock(remaining)}</span>.
          </p>
          {unanswered > 0 && (
            <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-warn">
              <AlertTriangle size={16} className="shrink-0" /> {unanswered} unanswered question{unanswered === 1 ? '' : 's'} will be scored as incorrect.
            </div>
          )}
          {markedIds.length > 0 && (
            <div className="rounded-lg border border-line p-3">
              <div className="mb-1 text-muted">Marked for review:</div>
              <div className="flex flex-wrap gap-1">
                {markedIds.map((id) => (
                  <button key={id} className="rounded border border-warn/50 px-2 py-0.5 font-mono text-xs text-warn" onClick={() => (setConfirm(false), go(qids.indexOf(id)))}>
                    {qids.indexOf(id) + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={() => setConfirm(false)}>
              Keep working
            </button>
            <button className="btn-primary" onClick={() => submit(false)} disabled={submitting}>
              <Send size={15} /> Submit now
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showKeys} onClose={() => setShowKeys(false)} title="Keyboard shortcuts">
        <ShortcutTable />
        <div className="mt-4 flex justify-end">
          <button className="btn-ghost" onClick={() => setShowKeys(false)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-4 w-5 rounded border ${cls}`} /> {label}
    </div>
  );
}

export function ShortcutTable() {
  const rows: [string, string][] = [
    ['1–7 or A–G', 'Select option (toggles on multiple-answer questions)'],
    ['→ or N', 'Next question'],
    ['← or P', 'Previous question'],
    ['M', 'Mark / unmark for review'],
    ['X', 'Clear answer'],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-line last:border-0">
            <td className="py-2 pr-4 font-mono text-cyan">{k}</td>
            <td className="py-2 text-muted">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
