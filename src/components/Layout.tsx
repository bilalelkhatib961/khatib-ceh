import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookMarked, Cloud, CloudOff, Crosshair, FolderSync, History, LayoutDashboard, Layers, Menu, Radar, Settings, ShieldCheck, Timer, X } from 'lucide-react';
import { useApp } from '../hooks/useApp';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/chapters', label: 'Chapters', icon: Layers },
  { to: '/exam-center', label: 'Exam Center', icon: Crosshair },
  { to: '/weakness', label: 'Weakness Radar', icon: Radar },
  { to: '/bookmarks', label: 'Bookmarked', icon: BookMarked },
  { to: '/history', label: 'Assessment History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Countdown() {
  const { settings } = useApp();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!settings.examDate) return null;
  const target = new Date(settings.examDate + 'T09:00:00').getTime();
  const diff = target - now;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return (
    <div className="rounded-lg border border-magenta/30 bg-magenta/5 p-3">
      <div className="label flex items-center gap-1.5 text-magenta">
        <Timer size={12} /> CEH exam
      </div>
      {diff > 0 ? (
        <div className="mt-1 font-mono text-lg font-semibold text-ink">
          {days}d {hours}h
        </div>
      ) : (
        <div className="mt-1 font-mono text-sm text-ink">Exam day reached</div>
      )}
      <div className="text-[11px] text-muted">{new Date(settings.examDate + 'T00:00:00').toDateString()}</div>
    </div>
  );
}

export function CloudIndicator() {
  const { cloudEnabled, email, online, cloudPending, syncNow } = useApp();
  const [busy, setBusy] = useState(false);
  if (!cloudEnabled) return null;
  const ok = online && cloudPending === 0;
  const color = !online ? 'text-warn border-warn/40' : ok ? 'text-ok border-ok/40' : 'text-warn border-warn/40';
  const text = !online ? `Offline · saved on this device${cloudPending ? ` (${cloudPending} to upload)` : ''}` : ok ? 'Cloud synced' : `Cloud upload pending (${cloudPending})`;
  return (
    <button
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-[11px] leading-snug ${color} hover:bg-white/5`}
      onClick={async () => {
        setBusy(true);
        await syncNow().catch(() => undefined);
        setBusy(false);
      }}
      title="Click to sync now"
    >
      {online ? <Cloud size={14} className={`mt-0.5 shrink-0 ${busy ? 'animate-pulse' : ''}`} /> : <CloudOff size={14} className="mt-0.5 shrink-0" />}
      <span>
        {text}
        {email && <span className="block truncate text-muted">{email}</span>}
      </span>
    </button>
  );
}

export function StorageIndicator({ compact }: { compact?: boolean }) {
  const { storage, pending, connect, folder, cloudEnabled } = useApp();
  if (cloudEnabled && storage === 'unsupported') return null; // phones/tablets: the cloud handles sync
  let color = 'text-muted border-line';
  let text = '';
  if (storage === 'connected' && pending === 0) {
    color = 'text-ok border-ok/40';
    text = 'Local folder connected · saved to JSON';
  } else if (storage === 'connected') {
    color = 'text-warn border-warn/40';
    text = `Synchronization pending (${pending})`;
  } else if (storage === 'permission-required') {
    color = 'text-warn border-warn/40';
    text = 'Permission required' + (pending ? ` · ${pending} pending` : '');
  } else if (storage === 'unsupported') {
    color = 'text-bad border-bad/40';
    text = 'Folder access unsupported (use Chrome/Edge) · saved in browser' + (pending ? ` · ${pending} pending` : '');
  } else if (cloudEnabled) {
    color = 'text-muted border-line';
    text = 'JSON folder backup off (optional)';
  } else {
    color = 'text-warn border-warn/40';
    text = 'Data folder not connected' + (pending ? ` · ${pending} pending` : '');
  }
  const action = storage === 'permission-required' || storage === 'not-connected';
  return (
    <button
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-[11px] leading-snug ${color} ${action ? 'hover:bg-white/5' : 'cursor-default'}`}
      onClick={() => action && connect(storage === 'not-connected')}
      title={folder ? `Folder: ${folder}` : undefined}
    >
      <FolderSync size={14} className="mt-0.5 shrink-0" />
      <span>
        {text}
        {action && !compact && <span className="block text-cyan">Click to {storage === 'permission-required' ? 'grant access' : 'connect user-data'}</span>}
      </span>
    </button>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  // keep the page behind the open mobile drawer from scrolling (iOS Safari scrolls the body through overlays)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  const inExam = loc.pathname.startsWith('/exam/');
  return (
    <div className="flex min-h-dvh">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[calc(18rem+env(safe-area-inset-left))] max-w-[85vw] flex-col overflow-y-auto overscroll-contain border-r border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] backdrop-blur transition-transform lg:w-64 lg:max-w-none lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/5">
            <ShieldCheck size={22} className="text-cyan" />
          </div>
          <div>
            <div className="font-mono text-lg font-bold tracking-[0.18em] text-ink">
              KHATIB <span className="text-cyan">CEH</span>
            </div>
            <div className="text-[10px] leading-tight text-muted">Personal Ethical Hacking Training System</div>
          </div>
          <button className="-mr-2.5 ml-auto rounded-lg p-2.5 text-muted hover:bg-white/5 hover:text-ink lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors touch:min-h-11 ${
                  isActive ? 'border border-cyan/30 bg-cyan/10 text-cyan' : 'border border-transparent text-muted hover:bg-white/5 hover:text-ink'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line p-3">
          <Countdown />
          <CloudIndicator />
          <StorageIndicator />
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <div className="page-gutter sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 pb-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <button className="-ml-2.5 rounded-lg p-2.5 text-ink hover:bg-white/5" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Menu size={22} />
          </button>
          <span className="font-mono font-bold tracking-[0.18em]">
            KHATIB <span className="text-cyan">CEH</span>
          </span>
        </div>
        <main className={`page-gutter mx-auto w-full min-w-0 flex-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:pt-6 lg:pt-[calc(1.5rem+env(safe-area-inset-top))] ${inExam ? 'max-w-7xl' : 'max-w-7xl'}`}>{children}</main>
      </div>
    </div>
  );
}
