import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CheckCheck, CheckCircle2, ChevronDown, CircleDashed, Download, History, ListChecks, RotateCcw, Search, Timer, Upload, X } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Bar, Modal, Pct, SectionTitle } from '../components/ui';
import { Mini } from './Chapters';
import { downloadJson } from './Results';
import { originalStatsFor } from '../utils/stats';
import {
  ASSESSMENT_BASELINE,
  CONCEPT_IDS,
  EXAM_DATE,
  PRIORITY_META,
  PRIORITY_ORDER,
  REVISION_CHAPTERS,
  RevisionChapter,
  RevisionPriority,
  TOTAL_CONCEPTS,
} from '../data/revisionRadar';
import * as rev from '../services/revision';
import type { ImportResult, RevisionFilter, RevisionSort, RevisionState } from '../services/revision';

const SORT_LABEL: Record<RevisionSort, string> = {
  weakest: 'Weakest chapters first',
  chapter: 'Chapter order',
  least: 'Least revised first',
  most: 'Most revised first',
};
const FILTER_LABEL: Record<RevisionFilter, string> = {
  all: 'All chapters',
  high: 'High priority',
  focused: 'Focused revision',
  incomplete: 'Incomplete',
  completed: 'Completed',
};
/** Compact labels for phone widths, so the filter tabs fit on two rows. */
const FILTER_SHORT: Record<RevisionFilter, string> = { all: 'All', high: 'High', focused: 'Focused', incomplete: 'Incomplete', completed: 'Completed' };

const pad2 = (n: number) => String(n).padStart(2, '0');
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const revisedIn = (c: RevisionChapter, checked: Record<string, string>) => c.concepts.reduce((n, k) => n + (checked[k.id] ? 1 : 0), 0);

// ---------- persistence ----------

function useRevisionStore() {
  const [init] = useState(rev.loadRevision);
  const [state, setState] = useState<RevisionState>(init.state);
  const [notice, setNotice] = useState<string | null>(init.notice);
  const [saveFailed, setSaveFailed] = useState(!init.storageOk);
  const lastRaw = useRef<string | null>(init.raw);

  // write after every change (skipped when the stored copy is already identical)
  useEffect(() => {
    if (rev.serializeRevision(state) === lastRaw.current) return;
    const written = rev.saveRevision(state);
    setSaveFailed(written === null);
    if (written) lastRaw.current = written;
  }, [state]);

  // another tab of the app changed the progress: adopt it
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== rev.REVISION_STORAGE_KEY) return;
      let raw: string | null;
      try {
        raw = window.localStorage.getItem(rev.REVISION_STORAGE_KEY);
      } catch {
        return;
      }
      const parsed = rev.parseStored(raw);
      if (parsed === undefined) return;
      lastRaw.current = raw;
      setState(parsed ?? rev.defaultRevisionState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (s: RevisionState) => RevisionState) => setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() })), []);

  const setChecked = useCallback(
    (ids: string[], on: boolean) =>
      update((s) => {
        const now = new Date().toISOString();
        const checked = { ...s.checked };
        for (const id of ids) {
          if (on) checked[id] ??= now;
          else delete checked[id];
        }
        return { ...s, checked, lastRevisedAt: on && ids.length ? now : s.lastRevisedAt };
      }),
    [update],
  );
  const resetAll = useCallback(() => update((s) => ({ ...s, checked: {}, lastRevisedAt: null })), [update]);
  const importChecked = useCallback(
    (checked: Record<string, string>, lastRevisedAt: string | null, mode: 'replace' | 'merge') =>
      update((s) => {
        const times = [s.lastRevisedAt, lastRevisedAt].filter((t): t is string => !!t);
        return {
          ...s,
          checked: mode === 'replace' ? { ...checked } : { ...checked, ...s.checked },
          lastRevisedAt: times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null,
        };
      }),
    [update],
  );
  const setSort = useCallback((sort: RevisionSort) => update((s) => ({ ...s, sort })), [update]);
  const setFilter = useCallback((filter: RevisionFilter) => update((s) => ({ ...s, filter })), [update]);

  return { state, notice, dismissNotice: () => setNotice(null), saveFailed, setChecked, resetAll, importChecked, setSort, setFilter };
}

// ---------- historical accuracy (reused from the question bank, snapshot as fallback) ----------

function useHistoricalAccuracy() {
  const { bank, questions, progress, chById } = useApp();
  return useMemo(() => {
    const byChapter = new Map<number, number>();
    const byObjective = new Map<string, number>();
    if (bank) {
      for (const c of bank.chapters) {
        const s = originalStatsFor(
          questions.filter((q) => q.chapterId === c.id),
          progress,
        );
        if (s.accuracy !== null) byChapter.set(c.number, s.accuracy);
      }
      const wanted = new Set(REVISION_CHAPTERS.flatMap((c) => c.weakObjectives.map((w) => w.code)));
      for (const o of bank.objectives) {
        const ch = chById.get(o.chapterId);
        const code = ch ? `${ch.number}.${o.number}` : '';
        if (!wanted.has(code)) continue;
        const s = originalStatsFor(
          questions.filter((q) => q.learningObjectiveId === o.id),
          progress,
        );
        if (s.accuracy !== null) byObjective.set(code, s.accuracy);
      }
    }
    return {
      chapter: (c: RevisionChapter): number | null => byChapter.get(c.number) ?? c.snapshotAccuracy,
      objective: (code: string, fallback: number): number => byObjective.get(code) ?? fallback,
    };
  }, [bank, questions, progress, chById]);
}

// ---------- search, filter, sort ----------

const SEARCH_INDEX = REVISION_CHAPTERS.map((c) => ({
  key: c.key,
  head: norm(`${pad2(c.number)} ${c.number} ${c.name} ${c.priority} ${c.reminder} ${c.weakObjectives.map((w) => `${w.code} ${w.name}`).join(' ')}`),
  concepts: c.concepts.map((k) => ({ id: k.id, hay: norm(k.text) })),
}));

/** chapter key -> 'all' (chapter itself matches) or the matching concept ids; null when not searching. */
type Matches = Map<string, 'all' | Set<string>> | null;

function searchMatches(query: string): Matches {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const out = new Map<string, 'all' | Set<string>>();
  for (const s of SEARCH_INDEX) {
    if (tokens.every((t) => s.head.includes(t))) {
      out.set(s.key, 'all');
      continue;
    }
    const ids = new Set(s.concepts.filter((k) => tokens.every((t) => s.head.includes(t) || k.hay.includes(t))).map((k) => k.id));
    if (ids.size) out.set(s.key, ids);
  }
  return out;
}

function passesFilter(c: RevisionChapter, filter: RevisionFilter, checked: Record<string, string>) {
  const done = revisedIn(c, checked) === c.concepts.length;
  if (filter === 'high') return c.priority === 'HIGH';
  if (filter === 'focused') return c.priority === 'FOCUSED';
  if (filter === 'incomplete') return !done;
  if (filter === 'completed') return done;
  return true;
}

function orderChapters(sort: RevisionSort, filter: RevisionFilter, matches: Matches, checked: Record<string, string>, acc: (c: RevisionChapter) => number | null): string[] {
  const rows = REVISION_CHAPTERS.filter((c) => passesFilter(c, filter, checked) && (!matches || matches.has(c.key))).map((c) => ({
    c,
    pct: revisedIn(c, checked) / c.concepts.length,
  }));
  type Row = (typeof rows)[number];
  // weakest: HIGH → FOCUSED → STANDARD, then lowest original accuracy, then the tracker's revision order
  const weakest = (a: Row, b: Row) =>
    PRIORITY_META[a.c.priority].rank - PRIORITY_META[b.c.priority].rank ||
    (acc(a.c) ?? 101) - (acc(b.c) ?? 101) ||
    PRIORITY_ORDER.indexOf(a.c.number) - PRIORITY_ORDER.indexOf(b.c.number);
  if (sort === 'chapter') rows.sort((a, b) => a.c.number - b.c.number);
  if (sort === 'weakest') rows.sort(weakest);
  if (sort === 'least') rows.sort((a, b) => a.pct - b.pct || weakest(a, b));
  if (sort === 'most') rows.sort((a, b) => b.pct - a.pct || a.c.number - b.c.number);
  return rows.map((r) => r.c.key);
}

// ---------- small pieces ----------

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function relTime(iso: string | null, now: number) {
  if (!iso) return 'not yet';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Counts down to the exam calendar day; no exam time is known, so none is invented. */
function ExamCountdown({ examDate, now }: { examDate: string; now: number }) {
  const [y, m, d] = examDate.split('-').map(Number);
  const exam = new Date(y, m - 1, d);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((exam.getTime() - today.getTime()) / 86400000);
  const ms = exam.getTime() - now;
  const big = days > 1 ? `${days} days` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : 'Passed';
  const sub =
    days > 1
      ? 'until exam day'
      : days === 1
        ? `exam day starts in ${Math.floor(ms / 3600000)}h ${pad2(Math.floor((ms % 3600000) / 60000))}m`
        : days === 0
          ? 'exam day: good luck'
          : 'the exam date has passed';
  return (
    <div className="rounded-lg border border-magenta/30 bg-magenta/5 p-3 sm:min-w-[13.5rem]">
      <div className="label flex items-center gap-1.5 text-magenta">
        <Timer size={12} /> CEH exam
      </div>
      <div className="mt-1 font-mono text-xl font-semibold text-ink">{big}</div>
      <div className="text-[11px] text-muted tabular-nums">{sub}</div>
      <div className="text-[11px] text-muted">{exam.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · exam time not set</div>
    </div>
  );
}

function PriorityChip({ p }: { p: RevisionPriority }) {
  const m = PRIORITY_META[p];
  return (
    <span className="chip font-mono text-[10px] tracking-wider" style={{ color: m.color, borderColor: m.color + '66', background: m.color + '14' }} title={m.hint}>
      {p}
    </span>
  );
}

// ---------- chapter card ----------

function ChapterCard({
  c,
  checked,
  open,
  matches,
  accuracy,
  objectiveAccuracy,
  onToggleOpen,
  onCheck,
  onMarkAll,
  onReset,
}: {
  c: RevisionChapter;
  checked: Record<string, string>;
  open: boolean;
  matches: 'all' | Set<string> | null;
  accuracy: number | null;
  objectiveAccuracy: (code: string, fallback: number) => number;
  onToggleOpen(): void;
  onCheck(id: string, on: boolean): void;
  onMarkAll(): void;
  onReset(): void;
}) {
  const revised = revisedIn(c, checked);
  const total = c.concepts.length;
  const done = revised === total;
  const pct = (revised / total) * 100;
  const shown = matches instanceof Set ? c.concepts.filter((k) => matches.has(k.id)) : c.concepts;
  const bodyId = `rr-body-${c.key}`;
  return (
    <article id={`rr-${c.key}`} className={`panel scroll-mt-20 transition-colors lg:scroll-mt-6 ${done ? 'border-ok/35' : ''}`}>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-xl p-4 text-left hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan/60"
      >
        <span className="mt-px font-mono text-lg font-semibold tabular-nums text-cyan">{pad2(c.number)}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug text-ink">{c.name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <PriorityChip p={c.priority} />
            {accuracy !== null && (
              <span className="font-mono text-[11px] text-muted" title="Historical accuracy in your original CEH quizzes. Not revision progress.">
                orig. accuracy <Pct v={accuracy} />
              </span>
            )}
          </span>
          <span className="mt-2.5 flex items-center gap-3">
            <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Chapter ${c.number} revision progress`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={revised}>
              <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: done ? '#00E676' : '#00F5FF' }} />
            </span>
            <span className="w-[6.5rem] shrink-0 text-right font-mono text-xs tabular-nums text-muted">
              <span className={done ? 'text-ok' : 'text-ink'}>
                {revised}/{total}
              </span>{' '}
              revised
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-center gap-1.5">
          {done ? <CheckCircle2 size={20} className="text-ok" role="img" aria-label="Chapter completed" /> : <CircleDashed size={20} className="text-muted/60" aria-hidden />}
          <ChevronDown size={18} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      {open && (
        <div id={bodyId} className="fade-in space-y-3 border-t border-line px-4 pb-4 pt-3">
          {c.weakObjectives.map((w) => (
            <div key={w.code} className="flex items-start gap-2 rounded-lg border border-magenta/30 bg-magenta/5 px-3 py-2 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-magenta" />
              <span>
                <span className="text-ink">
                  Weak objective {w.code} · {w.name}
                </span>{' '}
                <span className="whitespace-nowrap font-mono text-xs text-muted">
                  orig. <Pct v={objectiveAccuracy(w.code, w.accuracy)} />
                </span>
              </span>
            </div>
          ))}
          {matches instanceof Set && (
            <p className="text-xs text-muted">
              Showing {shown.length} of {total} concepts that match your search.
            </p>
          )}
          <ul className="space-y-1.5">
            {shown.map((k) => {
              const on = !!checked[k.id];
              return (
                <li key={k.id}>
                  <label
                    className={`relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${on ? 'border-cyan/25 bg-cyan/[0.06]' : 'border-line bg-bg/40 hover:border-cyan/40'}`}
                  >
                    <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onCheck(k.id, e.target.checked)} data-concept={k.id} />
                    <span
                      aria-hidden
                      className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-cyan/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-panel ${on ? 'border-cyan bg-cyan text-bg' : 'border-muted/60 bg-bg'}`}
                    >
                      {on && <Check size={16} strokeWidth={3} />}
                    </span>
                    <span className={`min-w-0 pt-0.5 text-sm leading-snug ${on ? 'text-muted line-through decoration-muted/50' : 'text-ink'}`}>{k.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="rounded-r-lg border-l-2 border-magenta bg-bg/40 px-3 py-2 text-sm text-muted">
            <span className="label mr-2 text-magenta">Exam reminder</span>
            {c.reminder}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button type="button" className="btn-ghost leading-tight" disabled={done} onClick={onMarkAll}>
              <CheckCheck size={15} className="shrink-0" /> Mark all as revised
            </button>
            <button type="button" className="btn-danger leading-tight" disabled={revised === 0} onClick={onReset}>
              <RotateCcw size={15} className="shrink-0" /> Reset chapter
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------- page ----------

type Confirm = { kind: 'chapter'; c: RevisionChapter } | { kind: 'all' } | null;

export default function RevisionRadar() {
  const { settings } = useApp();
  const store = useRevisionStore();
  const { state } = store;
  const hist = useHistoricalAccuracy();
  const now = useNow(30000);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['ch10']));
  const [orderTick, setOrderTick] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pendingImport, setPendingImport] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const examDate = settings.examDate && /^\d{4}-\d{2}-\d{2}$/.test(settings.examDate) ? settings.examDate : EXAM_DATE;

  // ---- statistics (always live) ----
  const revisedIds = Object.keys(state.checked).filter((id) => CONCEPT_IDS.has(id));
  const revised = revisedIds.length;
  const remaining = TOTAL_CONCEPTS - revised;
  const percent = (revised / TOTAL_CONCEPTS) * 100;
  const chaptersDone = REVISION_CHAPTERS.filter((c) => revisedIn(c, state.checked) === c.concepts.length).length;
  const priorityLeft = REVISION_CHAPTERS.filter((c) => c.priority !== 'STANDARD').reduce((n, c) => n + c.concepts.length - revisedIn(c, state.checked), 0);
  const filterCount = (f: RevisionFilter) => REVISION_CHAPTERS.filter((c) => passesFilter(c, f, state.checked)).length;

  // ---- list: order and membership are refreshed when sort, filter or search change, not on every tick,
  //      so cards never jump away under your finger while you revise ----
  const matches = useMemo(() => searchMatches(query), [query]);
  const checkedRef = useRef(state.checked);
  checkedRef.current = state.checked;
  const histRef = useRef(hist);
  histRef.current = hist;
  // background cloud re-syncs rebuild the statistics objects: only re-sort when an accuracy value really changes
  const accuracyKey = REVISION_CHAPTERS.map((c) => hist.chapter(c)?.toFixed(2) ?? '-').join();
  const shownKeys = useMemo(
    () => orderChapters(state.sort, state.filter, matches, checkedRef.current, histRef.current.chapter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sort, state.filter, matches, accuracyKey, orderTick],
  );
  const liveKeys = orderChapters(state.sort, state.filter, matches, state.checked, hist.chapter);
  const stale = shownKeys.join() !== liveKeys.join();
  const byKey = useMemo(() => new Map(REVISION_CHAPTERS.map((c) => [c.key, c])), []);

  // searching opens every matching chapter
  useEffect(() => {
    if (matches) setExpanded(new Set(matches.keys()));
  }, [matches]);

  const toggleOpen = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const jumpTo = (c: RevisionChapter) => {
    setQuery('');
    if (!passesFilter(c, state.filter, state.checked)) store.setFilter('all');
    setExpanded((prev) => new Set(prev).add(c.key));
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => document.getElementById(`rr-${c.key}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }), 60);
  };

  const exportFile = () => {
    const d = new Date();
    downloadJson(`khatib-ceh-revision-radar_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`, rev.buildExport(state));
    setMsg({ ok: true, text: 'Backup file downloaded.' });
  };

  const readFile = async (f: File) => {
    try {
      const r = rev.parseImport(await f.text());
      if (r.ok) setPendingImport(r);
      else setMsg({ ok: false, text: `Import failed: ${r.error} Your progress was not changed.` });
    } catch {
      setMsg({ ok: false, text: 'Import failed: the file could not be read. Your progress was not changed.' });
    }
  };

  const applyImport = (mode: 'replace' | 'merge') => {
    if (!pendingImport) return;
    const r = pendingImport;
    store.importChecked(r.checked, r.lastRevisedAt, mode);
    setOrderTick((t) => t + 1);
    setPendingImport(null);
    setMsg({
      ok: true,
      text: `${mode === 'replace' ? 'Replaced your progress with' : 'Merged'} ${r.recognized} revised concept${r.recognized === 1 ? '' : 's'} from the backup${r.ignored ? ` (${r.ignored} unrecognized entr${r.ignored === 1 ? 'y' : 'ies'} ignored)` : ''}.`,
    });
  };

  const B = ASSESSMENT_BASELINE;
  const highChapters = REVISION_CHAPTERS.filter((c) => c.priority === 'HIGH').sort((a, b) => (hist.chapter(a) ?? 101) - (hist.chapter(b) ?? 101));
  const weakObjectives = REVISION_CHAPTERS.flatMap((c) => c.weakObjectives.map((w) => ({ c, w }))).sort((a, b) => a.w.accuracy - b.w.accuracy);

  return (
    <div className="fade-in space-y-5">
      <header>
        <div className="label text-cyan">// final revision</div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <ListChecks className="text-cyan" /> Revision Radar
        </h1>
        <p className="text-sm text-muted">Master the concepts, not the answers. Check an item only when you can explain it without notes.</p>
      </header>

      {store.saveFailed && (
        <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          This browser is blocking local storage, so revision progress cannot be saved here. Export a backup before you leave this page.
        </div>
      )}
      {store.notice && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-warn">
          <span className="min-w-0 flex-1 wrap-anywhere">{store.notice}</span>
          <button type="button" className="shrink-0 text-xs underline" onClick={store.dismissNotice}>
            Dismiss
          </button>
        </div>
      )}

      {/* ---- dashboard ---- */}
      <section className="panel-glow p-4 sm:p-5" aria-label="Revision progress">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0">
            <div className="label">Revision completion</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-cyan" data-testid="rr-percent">
                {Math.round(percent)}%
              </span>
              <span className="font-mono text-sm tabular-nums text-muted">
                {revised}/{TOTAL_CONCEPTS} concepts revised
              </span>
            </div>
            <div className="mt-3">
              <Bar value={percent} height={8} color="linear-gradient(90deg, #00F5FF, #FF00A8)" />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Saved on this device · last revised {relTime(state.lastRevisedAt, now)}
            </p>
          </div>
          <ExamCountdown examDate={examDate} now={now} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Mini label="Revised" value={<span className="tabular-nums">{revised}</span>} />
          <Mini label="Remaining" value={<span className="tabular-nums">{remaining}</span>} />
          <Mini label="Chapters done" value={<span className="tabular-nums">{chaptersDone}/20</span>} />
          <Mini label="Priority left" value={<span className="tabular-nums">{priorityLeft}</span>} />
        </div>
      </section>

      {/* ---- priorities and historical baseline ---- */}
      <details className="panel p-4 text-sm">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-ink touch:-my-3 touch:py-3">
          <History size={15} className="text-cyan" /> Priorities &amp; historical baseline
          <span className="font-mono text-xs text-muted">
            {B.originalAccuracy}% original · mocks {B.mocks.map((m) => m.score).join(' → ')}%
          </span>
        </summary>
        <div className="mt-4 space-y-4">
          <p className="rounded-lg border border-line bg-bg/40 p-3 text-xs text-muted">
            <b className="text-ink">Historical results, recorded 20 Nov 2026.</b> These come from your original CEH quizzes and mock exams. They are not your current mastery and not a prediction of the exam
            result. Revision completion above is a separate measure: it only counts the concepts you have ticked.
          </p>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
            <Mini label="Original accuracy" value={`${B.originalAccuracy}%`} />
            <Mini label="Graded attempts" value={B.gradedAttempts.toLocaleString('en-US')} />
            <Mini label="Correct" value={<span className="text-ok">{B.correctAttempts}</span>} />
            <Mini label="Incorrect" value={<span className="text-bad">{B.incorrectAttempts}</span>} />
            <Mini label="Chapters" value={`${B.chaptersAttempted}/${B.chaptersTotal}`} />
            <Mini label="Objectives" value={`${B.objectivesAttempted}/${B.objectivesTotal}`} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {B.mocks.map((m) => (
              <Mini key={m.label} label={m.label} value={`${m.score}%`} />
            ))}
          </div>
          <p className="text-xs text-muted">
            {B.uniqueQuestions.toLocaleString('en-US')} unique questions · {B.unresolvedMockCaptures} unresolved mock captures.{' '}
            <Link to="/" className="text-cyan hover:underline">
              Live statistics on the Dashboard →
            </Link>
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="label mb-2">High-priority chapters</div>
              <ul className="space-y-1">
                {highChapters.map((c) => (
                  <li key={c.key}>
                    <button type="button" onClick={() => jumpTo(c)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5 touch:min-h-11">
                      <span className="min-w-0 truncate text-ink">
                        <span className="font-mono text-muted">{pad2(c.number)}</span> {c.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        <Pct v={hist.chapter(c)} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label mb-2">Weakest learning objectives</div>
              <ul className="space-y-1">
                {weakObjectives.map(({ c, w }) => (
                  <li key={w.code}>
                    <button type="button" onClick={() => jumpTo(c)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5 touch:min-h-11">
                      <span className="min-w-0 truncate text-ink">
                        <span className="font-mono text-muted">{w.code}</span> {w.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        <Pct v={hist.objective(w.code, w.accuracy)} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <PriorityChip p="HIGH" /> lowest original accuracy <PriorityChip p="FOCUSED" /> focused revision <PriorityChip p="STANDARD" /> standard
          </p>
        </div>
      </details>

      {/* ---- search, filter, sort ---- */}
      <section className="space-y-3" aria-label="Find chapters">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="input w-full pl-9 pr-11 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search concepts, tools, protocols…"
            aria-label="Search chapters and concepts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2.5 text-muted hover:text-ink" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter chapters">
          {rev.FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={state.filter === f}
              data-filter={f}
              onClick={() => store.setFilter(f)}
              className={`tab focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 ${state.filter === f ? 'tab-active' : ''}`}
            >
              <span className="sm:hidden">{FILTER_SHORT[f]}</span>
              <span className="hidden sm:inline">{FILTER_LABEL[f]}</span> <span className="font-mono text-xs tabular-nums opacity-70">{filterCount(f)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select className="input col-span-2 cursor-pointer sm:w-auto" aria-label="Sort chapters" value={state.sort} onChange={(e) => store.setSort(e.target.value as RevisionSort)}>
            {rev.SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost sm:ml-auto" onClick={() => setExpanded(new Set(shownKeys))}>
            Expand all
          </button>
          <button type="button" className="btn-ghost" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>
            Showing {shownKeys.length} chapter{shownKeys.length === 1 ? '' : 's'} · {SORT_LABEL[state.sort].toLowerCase()}
          </span>
          {state.sort !== 'chapter' && (
            <button type="button" className="text-cyan hover:underline touch:-my-2 touch:py-2" onClick={() => store.setSort('chapter')}>
              Use chapter order
            </button>
          )}
          {stale && (
            <button type="button" className="text-warn hover:underline touch:-my-2 touch:py-2" onClick={() => setOrderTick((t) => t + 1)}>
              · Progress changed: update list
            </button>
          )}
        </div>
      </section>

      {/* ---- chapters ---- */}
      <section className="space-y-3" aria-label="Chapters">
        {shownKeys.length === 0 && (
          <div className="panel p-8 text-center text-sm text-muted">
            No chapters match{query ? ` “${query}”` : ''} in {FILTER_LABEL[state.filter].toLowerCase()}.{' '}
            <button
              type="button"
              className="text-cyan hover:underline"
              onClick={() => {
                setQuery('');
                store.setFilter('all');
              }}
            >
              Show all chapters
            </button>
          </div>
        )}
        {shownKeys.map((key) => {
          const c = byKey.get(key)!;
          return (
            <ChapterCard
              key={key}
              c={c}
              checked={state.checked}
              open={expanded.has(key)}
              matches={matches?.get(key) ?? null}
              accuracy={hist.chapter(c)}
              objectiveAccuracy={hist.objective}
              onToggleOpen={() => toggleOpen(key)}
              onCheck={(id, on) => store.setChecked([id], on)}
              onMarkAll={() =>
                store.setChecked(
                  c.concepts.map((k) => k.id),
                  true,
                )
              }
              onReset={() => setConfirm({ kind: 'chapter', c })}
            />
          );
        })}
      </section>

      {/* ---- backup ---- */}
      <section className="panel space-y-3 p-4 sm:p-5">
        <SectionTitle icon={Download}>Progress backup</SectionTitle>
        <p className="text-sm text-muted">
          Revision progress is stored only in this browser (<code className="wrap-anywhere text-cyan">{rev.REVISION_STORAGE_KEY}</code>). It is not uploaded or synced. Export a backup to move it
          to another device or browser.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button type="button" className="btn-ghost" onClick={exportFile}>
            <Download size={15} /> Export progress (JSON)
          </button>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import progress
          </button>
          <button type="button" className="btn-danger" disabled={Object.keys(state.checked).length === 0} onClick={() => setConfirm({ kind: 'all' })}>
            <RotateCcw size={15} /> Reset all progress
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="rr-import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? 'text-cyan' : 'text-bad'}`}>
            {msg.text}
          </p>
        )}
        <p className="text-xs text-muted">Import accepts a Revision Radar export or a backup from the standalone revision tracker. Invalid files are rejected without changing your progress.</p>
      </section>

      {/* ---- dialogs ---- */}
      <Modal open={confirm?.kind === 'chapter'} onClose={() => setConfirm(null)} title={confirm?.kind === 'chapter' ? `Reset Chapter ${pad2(confirm.c.number)} · ${confirm.c.name}?` : ''}>
        {confirm?.kind === 'chapter' && (
          <>
            <p className="text-sm text-muted">
              This unchecks the {revisedIn(confirm.c, state.checked)} revised concept{revisedIn(confirm.c, state.checked) === 1 ? '' : 's'} in this chapter. Other chapters are not affected.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  store.setChecked(
                    confirm.c.concepts.map((k) => k.id),
                    false,
                  );
                  setConfirm(null);
                }}
              >
                <RotateCcw size={15} /> Reset chapter
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal open={confirm?.kind === 'all'} onClose={() => setConfirm(null)} title="Reset all revision progress?">
        <p className="text-sm text-muted">
          This unchecks all {revised} revised concepts across all 20 chapters on this device. It cannot be undone, so export a backup first if you might want them back.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button type="button" className="btn-ghost" onClick={exportFile}>
            <Download size={15} /> Export backup first
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              store.resetAll();
              setOrderTick((t) => t + 1);
              setConfirm(null);
              setMsg({ ok: true, text: 'All revision progress was reset.' });
            }}
          >
            <RotateCcw size={15} /> Reset all
          </button>
        </div>
      </Modal>
      <Modal open={!!pendingImport} onClose={() => setPendingImport(null)} title="Import revision progress?">
        {pendingImport && (
          <>
            <ul className="space-y-1 text-sm text-muted">
              <li>
                Backup: <b className="text-ink">{pendingImport.recognized}</b> revised concept{pendingImport.recognized === 1 ? '' : 's'}
                {pendingImport.legacy ? ' (standalone tracker backup)' : ''}
                {pendingImport.exportedAt ? `, exported ${new Date(pendingImport.exportedAt).toLocaleString()}` : ''}.
              </li>
              {pendingImport.ignored > 0 && (
                <li className="text-warn">
                  {pendingImport.ignored} unrecognized entr{pendingImport.ignored === 1 ? 'y' : 'ies'} will be ignored.
                </li>
              )}
              <li>
                Current progress on this device: <b className="text-ink">{revised}</b> revised.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted">
              <b className="text-ink">Replace</b> makes your progress exactly match the backup. <b className="text-ink">Merge</b> keeps everything already ticked here and adds the backup’s ticks.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <button type="button" className="btn-ghost" onClick={() => applyImport('merge')}>
                Merge
              </button>
              <button type="button" className="btn-primary" onClick={() => applyImport('replace')}>
                Replace
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
