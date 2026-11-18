import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import Layout from './components/Layout';
import { useApp } from './hooks/useApp';
import Dashboard from './pages/Dashboard';
import Chapters from './pages/Chapters';
import ChapterDetail from './pages/ChapterDetail';
import ObjectiveDetail from './pages/ObjectiveDetail';
import ExamCenter from './pages/ExamCenter';
import ExamRunner from './pages/ExamRunner';
import Results from './pages/Results';
import History from './pages/History';
import WeaknessRadar from './pages/WeaknessRadar';
import Bookmarks from './pages/Bookmarks';
import SettingsPage from './pages/Settings';
import Login from './pages/Login';

export default function App() {
  const { loading, error, needsLogin, bank, loadingMsg } = useApp();
  if (needsLogin) return <Login />;
  // also wait while the bank is not loaded yet (e.g. the moment right after signing in)
  if (loading || (!bank && !error))
    return (
      <div className="safe-inset flex min-h-dvh items-center justify-center gap-3 text-center font-mono text-cyan">
        <Loader2 className="animate-spin" /> {loadingMsg ?? 'Loading question bank…'}
      </div>
    );
  if (error)
    return (
      <div className="safe-inset flex min-h-dvh items-center justify-center">
        <div className="panel max-w-lg p-6">
          <div className="mb-2 flex items-center gap-2 font-semibold text-bad">
            <ShieldAlert /> Could not start KHATIB CEH
          </div>
          <p className="text-sm text-muted">{error}</p>
          <p className="mt-3 text-sm text-muted">
            Run the app with <code className="text-cyan">npm run dev</code> from the project folder so the data files in <code>public/data</code> can be loaded.
          </p>
        </div>
      </div>
    );
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chapters" element={<Chapters />} />
        <Route path="/chapters/:chapterId" element={<ChapterDetail />} />
        <Route path="/chapters/:chapterId/:objectiveId" element={<ObjectiveDetail />} />
        <Route path="/exam-center" element={<ExamCenter />} />
        <Route path="/exam/run" element={<ExamRunner />} />
        <Route path="/results/:attemptId" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/weakness" element={<WeaknessRadar />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
