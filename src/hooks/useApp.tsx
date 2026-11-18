import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSession, AttemptResult, Bank, Chapter, LearningObjective, Question, QuestionOverride, Settings } from '../types';
import { applyOverrides, loadBank, setBankProgressListener } from '../services/bank';
import * as store from '../services/storage';
import * as cloud from '../services/cloud';
import { computeProgress, QuestionProgress } from '../utils/stats';

export interface AppState {
  loading: boolean;
  error: string | null;
  /** Cloud configured but nobody signed in: show the login screen. */
  needsLogin: boolean;
  loadingMsg: string | null;
  cloudEnabled: boolean;
  email: string | null;
  online: boolean;
  cloudPending: number;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
  bank: (Bank & { version: string }) | null;
  questions: Question[];
  qById: Map<string, Question>;
  chById: Map<string, Chapter>;
  objById: Map<string, LearningObjective>;
  progress: Map<string, QuestionProgress>;
  attempts: AttemptResult[];
  settings: Settings;
  bookmarks: Set<string>;
  overrides: Record<string, QuestionOverride>;
  storage: store.StorageStatus;
  pending: number;
  folder: string | null;
  storageError: string | null;
  activeSession: ActiveSession | null;
  toggleBookmark(id: string): void;
  updateSettings(p: Partial<Settings>): void;
  setOverride(qid: string, correctOptionIds: string[] | null, note?: string): void;
  connect(pickNew?: boolean): Promise<void>;
  refreshAttempts(): Promise<void>;
  setActiveSession(s: ActiveSession | null): void;
  recordAttempt(a: AttemptResult): Promise<boolean>;
  importData(json: unknown): Promise<string>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState<(Bank & { version: string }) | null>(null);
  const [attempts, setAttempts] = useState<AttemptResult[]>([]);
  const [settings, setSettings] = useState<Settings>(store.DEFAULT_SETTINGS);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, QuestionOverride>>({});
  const [storage, setStorage] = useState<store.StorageStatus>('not-connected');
  const [pending, setPending] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeSession, setActive] = useState<ActiveSession | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [cloudPending, setCloudPending] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  useEffect(() => {
    setBankProgressListener(setLoadingMsg);
    return () => setBankProgressListener(null);
  }, []);

  const loadUserData = useCallback(async () => {
    const [s, b, o, sess, sync] = await Promise.all([
      store.loadSettings(),
      store.loadBookmarks(),
      store.loadOverrides(),
      store.loadActiveSession(),
      store.syncAttempts(),
    ]);
    setSettings(s);
    setBookmarks(new Set(b));
    setOverrides(o);
    setActive(sess);
    setAttempts(sync.attempts);
    setPending(sync.pending);
    setCloudPending(sync.cloudPending);
    setStorageError(sync.error ?? null);
  }, []);

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, st] = await Promise.all([loadBank(), store.restoreHandle()]);
      setBank(b);
      setStorage(st);
      await loadUserData();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [loadUserData]);

  useEffect(() => {
    (async () => {
      if (cloud.cloudEnabled) {
        const s = await cloud.initAuth((sess) => {
          setEmail(sess?.user.email ?? null);
          setNeedsLogin(!sess);
        });
        setEmail(s?.user.email ?? null);
        if (!s) {
          setNeedsLogin(true);
          setLoading(false);
          return;
        }
      }
      await boot();
    })();
  }, [boot]);

  // after signing in from the login screen
  const wasLogin = useRef(false);
  useEffect(() => {
    if (needsLogin) wasLogin.current = true;
    else if (wasLogin.current && cloud.signedIn()) {
      wasLogin.current = false;
      boot();
    }
  }, [needsLogin, boot]);

  // keep devices in step: re-sync when the connection returns, when the tab regains focus, and every 2 minutes
  useEffect(() => {
    const resync = () => {
      if (!cloud.signedIn() || !navigator.onLine) return;
      loadUserData().catch(() => undefined);
    };
    const on = () => (setOnline(true), resync());
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === 'visible' && !window.location.hash.includes('/exam/run') && resync();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => !window.location.hash.includes('/exam/run') && resync(), 120000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(t);
    };
  }, [loadUserData]);

  const questions = useMemo(() => (bank ? applyOverrides(bank.questions, overrides) : []), [bank, overrides]);
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const chById = useMemo(() => new Map((bank?.chapters ?? []).map((c) => [c.id, c])), [bank]);
  const objById = useMemo(() => new Map((bank?.objectives ?? []).map((o) => [o.id, o])), [bank]);
  const progress = useMemo(() => computeProgress(questions, bank?.originalAttempts ?? [], attempts), [questions, bank, attempts]);

  // mirror a compact progress summary to user-data/progress.json
  useEffect(() => {
    if (!bank || !attempts.length) return;
    const summary: Record<string, { state: string; correct: number; misses: number }> = {};
    for (const [id, p] of progress) if (p.events.length) summary[id] = { state: p.state, correct: p.correct, misses: p.misses };
    store.saveProgress({ generatedFrom: attempts.length + ' attempts', questions: summary }).catch(() => undefined);
  }, [progress, attempts.length, bank]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      store.saveBookmarks([...next]);
      return next;
    });
  }, []);

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      store.saveSettings(next);
      return next;
    });
  }, []);

  const setOverride = useCallback((qid: string, ids: string[] | null, note?: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (!ids) delete next[qid];
      else next[qid] = { questionId: qid, correctOptionIds: ids, note, verifiedAt: new Date().toISOString() };
      store.saveOverrides(next);
      return next;
    });
  }, []);

  const refreshAttempts = useCallback(async () => {
    const sync = await store.syncAttempts();
    setAttempts(sync.attempts);
    setPending(sync.pending);
    setCloudPending(sync.cloudPending);
    setStorageError(sync.error ?? null);
  }, []);

  const signOut = useCallback(async () => {
    await cloud.signOut();
    setBank(null);
    setAttempts([]);
    setNeedsLogin(true);
  }, []);

  const connect = useCallback(
    async (pickNew = false) => {
      try {
        const st = await store.connectFolder(pickNew);
        setStorage(st);
        if (st === 'connected') await loadUserData();
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setStorageError(String(e));
      }
    },
    [loadUserData],
  );

  const activeRef = useRef<ActiveSession | null>(null);
  activeRef.current = activeSession;
  const setActiveSession = useCallback((s: ActiveSession | null) => {
    const prevId = activeRef.current?.id;
    setActive(s);
    if (s) store.saveActiveSession(s, true);
    else store.clearActiveSession(prevId);
  }, []);

  const recordAttempt = useCallback(
    async (a: AttemptResult) => {
      const ok = await store.saveAttempt(a);
      await refreshAttempts();
      return ok;
    },
    [refreshAttempts],
  );

  const importData = useCallback(
    async (json: unknown): Promise<string> => {
      const obj = json as Record<string, unknown>;
      let list: AttemptResult[] = [];
      if (Array.isArray(obj)) list = obj as AttemptResult[];
      else if (Array.isArray(obj?.attempts)) list = obj.attempts as AttemptResult[];
      else if (obj?.id && Array.isArray(obj?.answers)) list = [obj as unknown as AttemptResult];
      const n = await store.importAttempts(list);
      if (Array.isArray(obj?.bookmarks)) {
        const merged = new Set([...bookmarks, ...(obj.bookmarks as string[])]);
        setBookmarks(merged);
        await store.saveBookmarks([...merged]);
      }
      if (obj?.overrides && typeof obj.overrides === 'object') {
        const merged = { ...overrides, ...(obj.overrides as Record<string, QuestionOverride>) };
        setOverrides(merged);
        await store.saveOverrides(merged);
      }
      await refreshAttempts();
      return `Imported ${n} new attempt(s).`;
    },
    [bookmarks, overrides, refreshAttempts],
  );

  const value: AppState = {
    needsLogin,
    loadingMsg,
    cloudEnabled: cloud.cloudEnabled,
    email,
    online,
    cloudPending,
    signOut,
    syncNow: refreshAttempts,
    loading,
    error,
    bank,
    questions,
    qById,
    chById,
    objById,
    progress,
    attempts,
    settings,
    bookmarks,
    overrides,
    storage,
    pending,
    folder: store.folderName(),
    storageError,
    activeSession,
    toggleBookmark,
    updateSettings,
    setOverride,
    connect,
    refreshAttempts,
    setActiveSession,
    recordAttempt,
    importData,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
