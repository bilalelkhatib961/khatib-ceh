import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Cloud, Download, FileWarning, FolderSync, Image as ImageIcon, Keyboard, LogOut, RefreshCw, Settings as Cog, Upload, Undo2 } from 'lucide-react';
import { useApp } from '../hooks/useApp';
import { Modal, SectionTitle } from '../components/ui';
import { CloudIndicator, StorageIndicator } from '../components/Layout';
import { ShortcutTable } from './ExamRunner';
import { downloadJson } from './Results';
import { fsSupported } from '../services/storage';

export default function SettingsPage() {
  const app = useApp();
  const s = app.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<'unresolved' | 'notes' | 'verified-by-me'>('unresolved');
  const [shown, setShown] = useState(20);
  const report = app.bank!.report as Record<string, unknown>;

  const exportAll = () =>
    downloadJson(`khatib-ceh-user-data_${new Date().toISOString().slice(0, 10)}.json`, {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: app.settings,
      bookmarks: [...app.bookmarks],
      overrides: app.overrides,
      attempts: app.attempts,
    });

  const importFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      setMsg(await app.importData(json));
    } catch (e) {
      setMsg(`Import failed: ${String(e)}`);
    }
  };

  const queue = useMemo(() => {
    if (queueFilter === 'unresolved') return app.questions.filter((q) => q.verificationStatus !== 'verified');
    if (queueFilter === 'verified-by-me') return app.questions.filter((q) => app.overrides[q.id]);
    return app.questions.filter((q) => q.issues.length > 0);
  }, [app.questions, app.overrides, queueFilter]);

  return (
    <div className="fade-in space-y-6">
      <header>
        <div className="label text-cyan">// configuration</div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <Cog className="text-cyan" /> Settings
        </h1>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-4 p-5">
          <SectionTitle>Exam & targets</SectionTitle>
          <label className="block text-sm text-muted">
            CEH exam date
            <input className="input mt-1 w-full" type="date" value={s.examDate ?? ''} onChange={(e) => app.updateSettings({ examDate: e.target.value || null })} />
          </label>
          <label className="block text-sm text-muted">
            Personal target score (%)
            <input className="input mt-1 w-full" type="number" min={1} max={100} value={s.targetScore} onChange={(e) => app.updateSettings({ targetScore: Math.min(100, Math.max(1, Number(e.target.value) || 85)) })} />
            <span className="mt-1 block text-xs">A personal goal for practice scores — not an official CEH passing threshold.</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-cyan" checked={s.shuffleOptions} onChange={(e) => app.updateSettings({ shuffleOptions: e.target.checked })} />
            Randomize answer option order in assessments
            <span className="text-xs text-muted">(skipped automatically for “all of the above”-style options)</span>
          </label>
          <label className="block text-sm text-muted">
            Question text size
            <select className="input mt-1 w-full" value={s.questionFontSize} onChange={(e) => app.updateSettings({ questionFontSize: e.target.value as 'normal' | 'large' })}>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>

        <div className="panel space-y-4 p-5">
          {app.cloudEnabled && (
            <div className="space-y-3 border-b border-line pb-4">
              <SectionTitle icon={Cloud}>Cloud account</SectionTitle>
              <CloudIndicator />
              <p className="text-sm text-muted">
                Attempts, settings, bookmarks, answer verifications and any unfinished exam sync to your private Supabase database. You can continue on a phone, tablet or another computer. Results
                are saved on the device first, so nothing is lost offline.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => app.syncNow()}>
                  <RefreshCw size={15} /> Sync now
                </button>
                <button className="btn-ghost" onClick={() => app.signOut()}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          )}
          <SectionTitle icon={FolderSync}>Local data folder{app.cloudEnabled ? ' (optional backup)' : ''}</SectionTitle>
          <StorageIndicator />
          <p className="text-sm text-muted">
            Connect the project’s <code className="text-cyan">user-data</code> folder (Chrome or Edge). Each completed attempt is written as its own JSON file under{' '}
            <code>user-data/attempts/…</code>; settings, bookmarks, answer verifications and progress are mirrored to JSON files there. Until connected, everything is kept safely in the browser
            and synchronized automatically on connection.
          </p>
          {app.folder && (
            <p className="font-mono text-xs text-muted">
              Connected folder: <span className="text-ink">{app.folder}</span>
            </p>
          )}
          {app.storageError && <p className="text-xs text-bad">{app.storageError}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!fsSupported} onClick={() => app.connect(app.storage === 'not-connected')}>
              <FolderSync size={15} /> {app.storage === 'connected' ? 'Re-sync' : app.storage === 'permission-required' ? 'Grant permission' : 'Connect user-data folder'}
            </button>
            <button className="btn-ghost" disabled={!fsSupported} onClick={() => app.connect(true)}>
              Choose a different folder
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={exportAll}>
              <Download size={15} /> Export all data (JSON)
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {msg && <p className="text-sm text-cyan">{msg}</p>}
          <p className="text-xs text-muted">Import accepts an exported data file, a history export, or a single attempt file. Existing attempts are never overwritten.</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <SectionTitle icon={Keyboard}>Keyboard shortcuts (during assessments)</SectionTitle>
          <ShortcutTable />
          <p className="mt-2 text-xs text-muted">In question lists with “One at a time” view, ← → move between questions.</p>
        </div>
        <div className="panel p-5">
          <SectionTitle icon={FileWarning}>Extraction report</SectionTitle>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {(
              [
                ['Screenshots discovered', report.screenshotsDiscovered],
                ['Screenshots processed', report.screenshotsProcessed],
                ['Usable screenshots', report.screenshotsUsable],
                ['Flagged / excluded', report.screenshotsFailed],
                ['Visually reviewed', report.screenshotsVisuallyReviewed],
                ['Unique questions', report.uniqueQuestions],
                ['Duplicate screenshots merged', report.duplicateScreenshots],
                ['Verified answers', report.verifiedQuestions],
                ['Unresolved (no answer shown)', report.unresolvedQuestions],
                ['With explanations', report.questionsWithExplanations],
                ['Mock-only questions', report.mockOnlyQuestions],
                ['Generated', String(report.generatedAt).replace('T', ' ')],
              ] as [string, unknown][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-mono text-ink">{String(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">{String(report.method)}</p>
        </div>
      </section>

      <section className="panel p-5">
        <SectionTitle icon={CheckCircle2}>Manual question review queue</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Mock-exam screenshots show only your selection, never the correct answer, so those questions are excluded from graded tests. Verify an answer here (using your notes or the courseware)
          and the question joins the graded pool. Verifications are stored in <code>user-data/question-overrides.json</code>.
        </p>
        <div className="mb-3 flex flex-wrap gap-1">
          {(
            [
              ['unresolved', 'Unresolved'],
              ['notes', 'Has extraction notes'],
              ['verified-by-me', 'Verified by me'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`tab ${queueFilter === k ? 'tab-active' : ''}`} onClick={() => (setQueueFilter(k), setShown(20))}>
              {l}
            </button>
          ))}
          <span className="ml-auto self-center font-mono text-xs text-muted">{queue.length} questions</span>
        </div>
        <div className="space-y-3">
          {queue.slice(0, shown).map((q) => (
            <ReviewRow key={q.id} qid={q.id} onClear={() => setConfirmClear(q.id)} />
          ))}
          {queue.length > shown && (
            <button className="btn-ghost w-full" onClick={() => setShown(shown + 20)}>
              Show more ({queue.length - shown} remaining)
            </button>
          )}
        </div>
      </section>

      <Modal open={!!confirmClear} onClose={() => setConfirmClear(null)} title="Remove your verification?">
        <p className="text-sm text-muted">The question will return to the unresolved queue and be excluded from graded tests. Past attempt records are not changed.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmClear(null)}>
            Cancel
          </button>
          <button className="btn-danger" onClick={() => (app.setOverride(confirmClear!, null), setConfirmClear(null))}>
            <Undo2 size={15} /> Remove verification
          </button>
        </div>
      </Modal>
    </div>
  );
}

function ReviewRow({ qid, onClear }: { qid: string; onClear(): void }) {
  const app = useApp();
  const q = app.qById.get(qid)!;
  const orig = app.bank!.originalAttempts.filter((a) => a.questionId === qid);
  const mine = new Set(orig.flatMap((a) => a.selectedOptionIds));
  const ov = app.overrides[qid];
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono">{q.id}</span>
        <span>{q.sources.join(', ')}</span>
        {q.answerBasis && <span className="text-ok">answer basis: {q.answerBasis}</span>}
        <a className="ml-auto inline-flex items-center gap-1 text-cyan" href={`./source/${encodeURI(q.sourceScreenshotPaths[0])}`} target="_blank" rel="noreferrer">
          <ImageIcon size={12} /> screenshot
        </a>
      </div>
      {q.issues.length > 0 && <div className="mb-2 text-xs text-warn">{q.issues.join(' · ')}</div>}
      <p className="question-text mb-2 text-sm text-ink">{q.text}</p>
      <div className="grid gap-1.5">
        {q.options.map((o, i) => (
          <div key={o.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm ${o.isCorrect ? 'border-ok/50 bg-ok/5' : 'border-line'}`}>
            <span className="font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
            <span className="flex-1">{o.text}</span>
            {mine.has(o.id) && <span className="text-[11px] text-muted">my original choice</span>}
            {pending === o.id ? (
              <span className="flex gap-1">
                <button className="btn-primary px-2 py-1 text-xs" onClick={() => (app.setOverride(qid, [o.id], 'verified in review queue'), setPending(null))}>
                  Confirm
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPending(o.id)}>
                Set correct
              </button>
            )}
          </div>
        ))}
      </div>
      {ov && (
        <button className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={onClear}>
          <Undo2 size={13} /> Remove my verification
        </button>
      )}
    </div>
  );
}
