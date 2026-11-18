import { useState } from 'react';
import { Bookmark, BookmarkCheck, Check, Copy, Eye, EyeOff, Image as ImageIcon, X, AlertTriangle } from 'lucide-react';
import type { Question } from '../types';
import { useApp } from '../hooks/useApp';
import { Modal } from './ui';

const STATE_STYLE: Record<string, string> = {
  unpracticed: 'text-muted border-line',
  'needs-review': 'text-bad border-bad/50',
  improving: 'text-warn border-warn/50',
  recovered: 'text-cyan border-cyan/50',
  mastered: 'text-ok border-ok/50',
};

export function stateLabel(s: string) {
  return s.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * revealed=true shows: correct answer (green), my original selection (red if wrong), explanation.
 * revealed=false shows the plain question and options with nothing that hints at the answer.
 */
export default function QuestionCard({
  q,
  index,
  revealed,
  onToggle,
  showToggle = true,
  context,
}: {
  q: Question;
  index?: number;
  revealed: boolean;
  onToggle?: () => void;
  showToggle?: boolean;
  context?: string;
}) {
  const app = useApp();
  const [shot, setShot] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const orig = (app.bank?.originalAttempts ?? []).filter((a) => a.questionId === q.id);
  const mySel = new Set(orig.flatMap((a) => a.selectedOptionIds));
  const wrongSel = new Set(orig.filter((a) => a.result === 'incorrect').flatMap((a) => a.selectedOptionIds));
  const p = app.progress.get(q.id);
  const bookmarked = app.bookmarks.has(q.id);
  const verified = q.verificationStatus === 'verified';
  const obj = q.learningObjectiveId ? app.objById.get(q.learningObjectiveId) : null;
  const ch = q.chapterId ? app.chById.get(q.chapterId) : null;
  const large = app.settings.questionFontSize === 'large';

  const copy = async () => {
    const text = `${q.text}\n\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}`).join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <article className="panel p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {index !== undefined && <span className="font-mono text-cyan">Q{index + 1}</span>}
        {context && <span className="min-w-0 text-muted">{context}</span>}
        {!context && ch && (
          <span className="text-muted">
            Ch {ch.number}
            {obj ? ` · LO ${obj.number}` : ''}
          </span>
        )}
        {q.sources.some((s) => s.startsWith('mock')) && <span className="chip border-magenta/40 text-magenta">Mock</span>}
        {p && <span className={`chip ${STATE_STYLE[p.state]}`}>{stateLabel(p.state)}</span>}
        {!verified && (
          <span className="chip border-warn/50 text-warn" title="No verified correct answer: excluded from graded tests">
            <AlertTriangle size={12} /> Unverified
          </span>
        )}
        <div className="-my-1 ml-auto flex items-center gap-1 touch:-my-3">
          <button className="rounded p-1.5 text-muted hover:text-cyan touch:p-3.5" onClick={copy} title="Copy question text" aria-label="Copy question text">
            {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
          </button>
          <button className="rounded p-1.5 text-muted hover:text-cyan touch:p-3.5" onClick={() => setShot(q.sourceScreenshotPaths[0])} title="View original screenshot" aria-label="View original screenshot">
            <ImageIcon size={15} />
          </button>
          <button
            className={`rounded p-1.5 touch:p-3.5 ${bookmarked ? 'text-magenta' : 'text-muted hover:text-magenta'}`}
            onClick={() => app.toggleBookmark(q.id)}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            aria-pressed={bookmarked}
          >
            {bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
        </div>
      </header>

      <p className={`question-text mb-4 text-ink ${large ? 'text-lg' : 'text-[15px]'}`}>{q.text}</p>

      <ul className="space-y-2">
        {q.options.map((o, i) => {
          const isCorrect = revealed && o.isCorrect;
          const isMyWrong = revealed && !o.isCorrect && (wrongSel.has(o.id) || mySel.has(o.id));
          const cls = isCorrect
            ? 'border-ok/60 bg-ok/10 text-ink'
            : isMyWrong
              ? 'border-bad/60 bg-bad/10 text-ink'
              : 'border-line bg-bg/40 text-ink';
          return (
            <li key={o.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${cls}`}>
              <span className="mt-0.5 font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
              {/* phones: the verdict sits under the option text so the text keeps the full width */}
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className={`min-w-0 flex-1 ${large ? 'text-base' : 'text-sm'} whitespace-pre-wrap wrap-anywhere`}>{o.text}</span>
                {isCorrect && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ok">
                    <Check size={14} /> Correct{mySel.has(o.id) ? ' · my answer' : ''}
                  </span>
                )}
                {isMyWrong && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-bad">
                    <X size={14} /> My original answer
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {revealed && (
        <div className="fade-in mt-4 space-y-2">
          {!verified && <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-warn">The correct answer for this question could not be verified from the screenshot.</div>}
          {orig.length > 0 && (
            <div className="text-xs text-muted">
              Original assessment record{orig.length > 1 ? 's' : ''}:{' '}
              {orig.map((a, i) => (
                <span key={a.id} className={a.result === 'correct' ? 'text-ok' : a.result === 'incorrect' ? 'text-bad' : 'text-muted'}>
                  {i > 0 && ', '}
                  {a.result === 'unknown' ? `${a.source} (result not shown)` : a.result}
                </span>
              ))}
            </div>
          )}
          {q.explanation ? (
            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-3">
              <div className="label mb-1 text-cyan">Explanation · original CEH feedback</div>
              <div className="space-y-1.5 text-sm leading-relaxed text-ink/90 wrap-anywhere">
                {q.explanation.split('\n').map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
              {q.explanationTruncated && <div className="mt-1 text-xs text-muted">Explanation may be cut off in the screenshot — open the original for the full text.</div>}
            </div>
          ) : (
            <div className="text-xs text-muted">No explanation was visible in the original screenshot.</div>
          )}
        </div>
      )}

      {showToggle && onToggle && (
        <div className="mt-4">
          <button className={revealed ? 'btn-ghost' : 'btn-magenta'} onClick={onToggle}>
            {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
            {revealed ? 'Hide Answer' : 'Reveal Answer'}
          </button>
        </div>
      )}

      <Modal open={!!shot} onClose={() => setShot(null)} title="Original screenshot">
        {shot && <ScreenshotViewer paths={q.sourceScreenshotPaths} initial={shot} />}
      </Modal>
    </article>
  );
}

function ScreenshotViewer({ paths, initial }: { paths: string[]; initial: string }) {
  const [cur, setCur] = useState(initial);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-3">
      {paths.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {paths.map((p, i) => (
            <button key={p} className={`tab ${p === cur ? 'tab-active' : ''}`} onClick={() => (setCur(p), setFailed(false))}>
              #{i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="break-all font-mono text-[11px] text-muted">{cur}</div>
      {failed ? (
        <div className="text-sm text-warn">The screenshot can only be shown while the app runs via the local dev/preview server (npm run dev) with D:\CEH available.</div>
      ) : (
        <a href={`./source/${encodeURI(cur)}`} target="_blank" rel="noreferrer">
          <img src={`./source/${encodeURI(cur)}`} onError={() => setFailed(true)} className="w-full rounded border border-line" alt="Original assessment screenshot" />
        </a>
      )}
    </div>
  );
}
