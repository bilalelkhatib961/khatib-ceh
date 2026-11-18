import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked, Crosshair, Flame, Layers, RotateCcw, Settings2, Sparkles, Target, TrendingDown } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { useLauncher } from '../hooks/useLauncher';
import { SectionTitle } from '../components/ui';
import { eligible, MODE_CONFIG, pickSpread, shuffle } from '../utils/exam';
import { buildPracticeSet, PRACTICE_LABEL, PracticeKind } from '../utils/practice';
import { fmtDuration } from '../utils/stats';

export default function ExamCenter() {
  const app = useApp();
  const nav = useNavigate();
  const { launch, dialog } = useLauncher();
  const bank = app.bank!;
  const pool = eligible(app.questions);
  const [chapter, setChapter] = useState(bank.chapters[0]?.id ?? '');
  const [objective, setObjective] = useState(bank.objectives[0]?.id ?? '');
  const [custom, setCustom] = useState({ chapters: [] as string[], count: 40, minutes: 60, source: 'all' as 'all' | 'original-incorrect' | 'original-correct' | 'unpracticed' | 'needs-review' | 'bookmarked' });

  const ctx = { questions: app.questions, progress: app.progress, bookmarks: app.bookmarks, chapters: bank.chapters, objectives: bank.objectives, attempts: app.attempts };

  const startMock = () =>
    launch({
      name: 'Full Mock Exam',
      mode: 'mock-exam',
      scopeKey: 'mock-exam',
      questions: pickSpread(pool, 125, (q) => q.chapterId ?? 'mock'),
      requestedCount: 125,
      seconds: MODE_CONFIG['mock-exam'].seconds,
    });
  const startChapter = () => {
    const c = app.chById.get(chapter)!;
    launch({
      name: `Chapter ${c.number} Quiz · ${c.name}`,
      mode: 'chapter-quiz',
      scopeKey: `chapter:${c.id}`,
      chapterId: c.id,
      questions: shuffle(pool.filter((q) => q.chapterId === c.id)),
      requestedCount: pool.filter((q) => q.chapterId === c.id).length,
      seconds: 0, // untimed
    });
  };
  const startObjective = () => {
    const o = app.objById.get(objective)!;
    const c = app.chById.get(o.chapterId)!;
    launch({
      name: `LO ${c.number}.${o.number} Quiz · ${o.name}`,
      mode: 'objective-quiz',
      scopeKey: `objective:${o.id}`,
      chapterId: c.id,
      learningObjectiveId: o.id,
      questions: shuffle(pool.filter((q) => q.learningObjectiveId === o.id)),
      requestedCount: pool.filter((q) => q.learningObjectiveId === o.id).length,
      seconds: 0, // untimed
    });
  };
  const startPractice = (kind: PracticeKind, count = 30, minutes = 45) =>
    launch({
      name: PRACTICE_LABEL[kind],
      mode: 'custom-practice',
      practiceKind: kind,
      scopeKey: `practice:${kind}`,
      questions: buildPracticeSet(kind, { ...ctx, count }),
      requestedCount: count,
      seconds: minutes * 60,
    });
  const startCustom = () =>
    launch({
      name: 'Custom Practice',
      mode: 'custom-practice',
      practiceKind: 'custom',
      scopeKey: `practice:custom:${custom.source}:${[...custom.chapters].sort().join(',') || 'all'}`,
      questions: buildPracticeSet('custom', { ...ctx, count: custom.count, chapterIds: custom.chapters, source: custom.source }),
      requestedCount: custom.count,
      seconds: custom.minutes * 60,
    });

  const modes = [
    { title: 'Full Mock Exam', icon: Crosshair, spec: `125 questions · ${fmtDuration(MODE_CONFIG['mock-exam'].seconds)}`, text: `Randomized across all chapters, proportional coverage. Pool: ${pool.length} verified questions.`, action: startMock, body: null },
    {
      title: 'Chapter Quiz',
      icon: Layers,
      spec: 'All questions in the chapter · no timer',
      text: 'Every verified question from all of the chapter’s learning objectives.',
      action: startChapter,
      body: (
        <select className="input w-full" value={chapter} onChange={(e) => setChapter(e.target.value)}>
          {bank.chapters.map((c) => (
            <option key={c.id} value={c.id}>
              Ch {c.number} · {c.name} ({pool.filter((q) => q.chapterId === c.id).length})
            </option>
          ))}
        </select>
      ),
    },
    {
      title: 'Learning Objective Quiz',
      icon: Target,
      spec: 'All questions in the objective · no timer',
      text: 'Questions from one learning objective only.',
      action: startObjective,
      body: (
        <select className="input w-full" value={objective} onChange={(e) => setObjective(e.target.value)}>
          {bank.objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {app.chById.get(o.chapterId)?.number}.{o.number} {o.name} ({pool.filter((q) => q.learningObjectiveId === o.id).length})
            </option>
          ))}
        </select>
      ),
    },
  ];

  const practice: { kind: PracticeKind; icon: typeof Flame; text: string }[] = [
    { kind: 'mistakes', icon: Flame, text: 'Original misses and recent practice misses, highest priority first.' },
    { kind: 'bookmarks', icon: BookMarked, text: `${app.bookmarks.size} bookmarked question(s).` },
    { kind: 'weak-chapters', icon: TrendingDown, text: 'Your 3 weakest chapters by current accuracy.' },
    { kind: 'weak-objectives', icon: TrendingDown, text: 'Your 5 weakest learning objectives.' },
    { kind: 'unpracticed', icon: Sparkles, text: 'Questions never answered inside KHATIB CEH.' },
  ];

  return (
    <div className="fade-in space-y-6">
      {dialog}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-cyan">// simulation bay</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Crosshair className="text-cyan" /> Exam Center
          </h1>
          <p className="text-sm text-muted">Only questions with a verified correct answer are used in graded assessments.</p>
        </div>
        {app.activeSession && (
          <button className="btn-magenta" onClick={() => nav('/exam/run')}>
            <RotateCcw size={16} /> Resume “{app.activeSession.name}”
          </button>
        )}
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {modes.map((m) => (
          <div key={m.title} className="panel-glow flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <m.icon className="text-cyan" size={20} />
              <h2 className="font-semibold">{m.title}</h2>
            </div>
            <div className="font-mono text-sm text-cyan">{m.spec}</div>
            <p className="text-sm text-muted">{m.text}</p>
            {m.body}
            <button className="btn-primary mt-auto" onClick={m.action}>
              Start
            </button>
          </div>
        ))}
      </section>

      <section>
        <SectionTitle icon={Flame}>Practice modes</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {practice.map((p) => (
            <button key={p.kind} className="panel flex flex-col items-start gap-2 p-4 text-left hover:border-magenta/50" onClick={() => startPractice(p.kind)}>
              <p.icon size={18} className="text-magenta" />
              <span className="font-medium">{PRACTICE_LABEL[p.kind]}</span>
              <span className="text-xs text-muted">{p.text}</span>
              <span className="mt-auto font-mono text-[11px] text-muted">up to 30 q · 45 min</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <SectionTitle icon={Settings2}>Custom practice</SectionTitle>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <div className="label mb-2">Chapters (none selected = all)</div>
            <div className="flex flex-wrap gap-1.5">
              {bank.chapters.map((c) => {
                const on = custom.chapters.includes(c.id);
                return (
                  <button
                    key={c.id}
                    title={c.name}
                    onClick={() => setCustom((x) => ({ ...x, chapters: on ? x.chapters.filter((y) => y !== c.id) : [...x.chapters, c.id] }))}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs ${on ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {String(c.number).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Questions
              <input className="input mt-1 w-full" type="number" min={1} max={500} value={custom.count} onChange={(e) => setCustom((x) => ({ ...x, count: Math.max(1, Number(e.target.value) || 1) }))} />
            </label>
            <label className="text-xs text-muted">
              Minutes
              <input className="input mt-1 w-full" type="number" min={1} max={600} value={custom.minutes} onChange={(e) => setCustom((x) => ({ ...x, minutes: Math.max(1, Number(e.target.value) || 1) }))} />
            </label>
            <label className="col-span-2 text-xs text-muted">
              Question source
              <select className="input mt-1 w-full" value={custom.source} onChange={(e) => setCustom((x) => ({ ...x, source: e.target.value as typeof custom.source }))}>
                <option value="all">All verified questions</option>
                <option value="original-incorrect">Originally incorrect</option>
                <option value="original-correct">Originally correct</option>
                <option value="needs-review">Needs review / open mistakes</option>
                <option value="unpracticed">Not yet practiced</option>
                <option value="bookmarked">Bookmarked</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={startCustom}>
            Start custom practice
          </button>
        </div>
      </section>
    </div>
  );
}
