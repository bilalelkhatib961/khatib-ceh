import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, LayoutList, Search, Square } from 'lucide-react';
import type { Question } from '../types';
import { useApp } from '../hooks/useApp';
import QuestionCard from './QuestionCard';
import { Empty } from './ui';
import { isMistake } from '../utils/practice';

export type FilterKey = 'all' | 'orig-correct' | 'orig-incorrect' | 'bookmarked' | 'unpracticed' | 'needs-review' | 'recovered';

const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  'orig-correct': 'Originally correct',
  'orig-incorrect': 'Originally incorrect',
  bookmarked: 'Bookmarked',
  unpracticed: 'Not yet practiced',
  'needs-review': 'Needs review',
  recovered: 'Recovered',
};

const PAGE = 15;

export default function QuestionList({
  questions,
  defaultRevealed = false,
  filters = [],
  showContext = false,
  emptyText = 'No questions to show.',
}: {
  questions: Question[];
  defaultRevealed?: boolean;
  filters?: FilterKey[];
  showContext?: boolean;
  emptyText?: string;
}) {
  const app = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [allRevealed, setAllRevealed] = useState(defaultRevealed);
  const [single, setSingle] = useState(false);
  const [pos, setPos] = useState(0);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter((x) => {
      const p = app.progress.get(x.id);
      if (filter === 'orig-correct' && !(p && p.origCorrect > 0)) return false;
      if (filter === 'orig-incorrect' && !(p && p.origIncorrect > 0)) return false;
      if (filter === 'bookmarked' && !app.bookmarks.has(x.id)) return false;
      if (filter === 'unpracticed' && p && p.events.length > 0) return false;
      if (filter === 'needs-review' && !(p?.state === 'needs-review' || isMistake(p))) return false;
      if (filter === 'recovered' && !(p && (p.state === 'recovered' || p.state === 'mastered'))) return false;
      if (q && !(x.text.toLowerCase().includes(q) || x.options.some((o) => o.text.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [questions, query, filter, app.progress, app.bookmarks]);

  useEffect(() => {
    setPage(0);
    setPos(0);
  }, [query, filter, questions]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const visible = single ? list.slice(pos, pos + 1) : list.slice(page * PAGE, page * PAGE + PAGE);
  const isRevealed = (id: string) => revealed[id] ?? allRevealed;
  const toggleAll = () => {
    setAllRevealed(!allRevealed);
    setRevealed({});
  };

  // keyboard: left/right in single mode (ignored while typing)
  useEffect(() => {
    if (!single) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setPos((p) => Math.min(list.length - 1, p + 1));
      if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [single, list.length]);

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[200px] sm:flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input w-full pl-9" enterKeyHint="search" placeholder="Search questions and options…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filters.length > 0 && (
          <select className="input w-full sm:w-auto" value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} aria-label="Filter">
            {(['all', ...filters] as FilterKey[]).map((f) => (
              <option key={f} value={f}>
                {FILTER_LABEL[f]}
              </option>
            ))}
          </select>
        )}
        <button className="btn-ghost flex-1 sm:flex-none" onClick={toggleAll} title="Reveal or hide all answers on this list">
          {allRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
          {allRevealed ? 'Hide All' : 'Reveal All'}
        </button>
        <button className="btn-ghost flex-1 sm:flex-none" onClick={() => setSingle(!single)} title="Toggle one-question-at-a-time view">
          {single ? <LayoutList size={15} /> : <Square size={15} />}
          {single ? 'List view' : 'One at a time'}
        </button>
        <span className="w-full text-right font-mono text-xs text-muted sm:ml-auto sm:w-auto">
          {list.length} question{list.length === 1 ? '' : 's'}
        </span>
      </div>

      {list.length === 0 ? (
        <Empty title={emptyText} />
      ) : (
        <>
          {single && (
            <Pager
              label={`Question ${pos + 1} of ${list.length}`}
              onPrev={() => setPos(Math.max(0, pos - 1))}
              onNext={() => setPos(Math.min(list.length - 1, pos + 1))}
              prevDisabled={pos === 0}
              nextDisabled={pos >= list.length - 1}
            />
          )}
          <div className="space-y-4">
            {visible.map((q, i) => {
              const ch = q.chapterId ? app.chById.get(q.chapterId) : null;
              const ob = q.learningObjectiveId ? app.objById.get(q.learningObjectiveId) : null;
              return (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={single ? pos : page * PAGE + i}
                  revealed={isRevealed(q.id)}
                  onToggle={() => setRevealed((r) => ({ ...r, [q.id]: !isRevealed(q.id) }))}
                  context={showContext ? (ch ? `Ch ${ch.number} · ${ch.name}${ob ? ` › ${ob.name}` : ''}` : 'Mock exam (unclassified)') : undefined}
                />
              );
            })}
          </div>
          {single ? (
            <Pager
              label={`Question ${pos + 1} of ${list.length} · ← → keys`}
              onPrev={() => setPos(Math.max(0, pos - 1))}
              onNext={() => setPos(Math.min(list.length - 1, pos + 1))}
              prevDisabled={pos === 0}
              nextDisabled={pos >= list.length - 1}
            />
          ) : (
            pages > 1 && (
              <Pager
                label={`Page ${page + 1} of ${pages} · questions ${page * PAGE + 1}–${Math.min(list.length, page * PAGE + PAGE)}`}
                onPrev={() => (setPage(page - 1), window.scrollTo({ top: 0 }))}
                onNext={() => (setPage(page + 1), window.scrollTo({ top: 0 }))}
                prevDisabled={page === 0}
                nextDisabled={page >= pages - 1}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

function Pager({ label, onPrev, onNext, prevDisabled, nextDisabled }: { label: string; onPrev(): void; onNext(): void; prevDisabled: boolean; nextDisabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button className="btn-ghost" onClick={onPrev} disabled={prevDisabled}>
        <ChevronLeft size={15} /> Previous
      </button>
      <span className="text-center font-mono text-xs text-muted">{label}</span>
      <button className="btn-ghost" onClick={onNext} disabled={nextDisabled}>
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}
