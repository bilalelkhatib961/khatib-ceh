import { BookMarked, Play } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import QuestionList from '../components/QuestionList';
import { eligible, shuffle } from '../utils/exam';

export default function Bookmarks() {
  const app = useApp();
  const { launch, dialog } = useLauncher();
  const qs = app.questions.filter((q) => app.bookmarks.has(q.id));
  const start = () => {
    const pool = shuffle(eligible(qs)).slice(0, 50);
    launch({
      name: 'Bookmarked Questions',
      mode: 'custom-practice',
      practiceKind: 'bookmarks',
      scopeKey: 'practice:bookmarks',
      questions: pool,
      requestedCount: Math.min(50, Math.max(1, qs.length)),
    });
  };
  return (
    <div className="fade-in space-y-5">
      {dialog}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-cyan">// saved intel</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <BookMarked className="text-magenta" /> Bookmarked Questions
          </h1>
        </div>
        <button className="btn-magenta" onClick={start} disabled={!qs.length}>
          <Play size={16} /> Practice bookmarks
        </button>
      </header>
      <QuestionList questions={qs} showContext filters={['orig-correct', 'orig-incorrect', 'unpracticed', 'needs-review', 'recovered']} emptyText="No bookmarks yet — use the bookmark icon on any question card." />
    </div>
  );
}
