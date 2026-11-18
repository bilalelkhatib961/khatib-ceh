import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Play } from 'lucide-react';
import { Modal } from '../components/ui';
import { useApp } from './useApp';
import { createSession, SessionSpec } from '../utils/exam';
import { fmtLimit } from '../utils/stats';

/** Shared "start an assessment" flow with insufficient-question and active-session handling. */
export function useLauncher() {
  const app = useApp();
  const nav = useNavigate();
  const [spec, setSpec] = useState<SessionSpec | null>(null);

  const go = (s: SessionSpec) => {
    const session = createSession({ ...s, shuffleOptions: s.shuffleOptions ?? app.settings.shuffleOptions });
    app.setActiveSession(session);
    setSpec(null);
    nav('/exam/run');
  };

  const launch = (s: Omit<SessionSpec, 'shuffleOptions'> & { shuffleOptions?: boolean }) => setSpec({ shuffleOptions: app.settings.shuffleOptions, ...s });

  const short = spec ? spec.questions.length < spec.requestedCount : false;
  const dialog = (
    <Modal open={!!spec} onClose={() => setSpec(null)} title={spec?.name ?? ''}>
      {spec && (
        <div className="space-y-4 text-sm">
          {spec.questions.length === 0 ? (
            <div className="flex gap-2 rounded-lg border border-bad/40 bg-bad/5 p-3 text-bad">
              <AlertTriangle size={18} className="shrink-0" />
              No verified questions are available for this selection yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-3">
                  <div className="label">Questions</div>
                  <div className="stat text-xl">{spec.questions.length}</div>
                </div>
                <div className="panel p-3">
                  <div className="label">Time limit</div>
                  <div className="stat text-xl">{fmtLimit(spec.seconds)}</div>
                </div>
              </div>
              {short && (
                <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-warn">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>
                    Only <b>{spec.questions.length}</b> verified unique questions are available (requested {spec.requestedCount}). All available questions will be used — none are
                    duplicated or invented. {spec.seconds > 0 ? `The ${fmtLimit(spec.seconds)} time limit is kept.` : ''}
                  </span>
                </div>
              )}
              {app.activeSession && (
                <div className="flex gap-2 rounded-lg border border-magenta/40 bg-magenta/5 p-3 text-magenta">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>An unfinished assessment (“{app.activeSession.name}”) exists. Starting a new one discards it without saving.</span>
                </div>
              )}
              <p className="text-muted">Answers are not revealed until you submit. {spec.seconds > 0 ? 'The timer keeps running if you close or refresh the page.' : 'Untimed: your progress is saved if you close or refresh the page.'}</p>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-ghost" onClick={() => setSpec(null)}>
              Cancel
            </button>
            {app.activeSession && (
              <button className="btn-ghost" onClick={() => (setSpec(null), nav('/exam/run'))}>
                Resume unfinished
              </button>
            )}
            <button className="btn-primary" disabled={!spec.questions.length} onClick={() => go(spec)}>
              <Play size={15} /> Start
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
  return { launch, dialog };
}
