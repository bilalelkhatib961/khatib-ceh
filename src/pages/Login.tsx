import { FormEvent, useState } from 'react';
import { Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { signIn } from '../services/cloud';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg) setErr(msg === 'Failed to fetch' ? 'No connection to the server. Check your internet connection.' : msg);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="panel-glow fade-in w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan/40 bg-cyan/5">
            <ShieldCheck size={24} className="text-cyan" />
          </div>
          <div>
            <div className="font-mono text-lg font-bold tracking-[0.18em]">
              KHATIB <span className="text-cyan">CEH</span>
            </div>
            <div className="text-[11px] text-muted">Personal Ethical Hacking Training System</div>
          </div>
        </div>
        <p className="text-sm text-muted">Sign in to load your question bank and sync progress across your devices.</p>
        <label className="block text-sm text-muted">
          Email
          <input className="input mt-1 w-full" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm text-muted">
          Password
          <input className="input mt-1 w-full" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <div className="rounded-lg border border-bad/40 bg-bad/5 p-2 text-sm text-bad">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Sign in
        </button>
      </form>
    </div>
  );
}
