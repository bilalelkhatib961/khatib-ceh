/*
 * Supabase cloud sync. Enabled only when VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set
 * (see .env.example). Without them the app behaves exactly as the local-only version.
 */
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import type { AttemptResult } from '../types';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const cloudEnabled = !!(URL && KEY);
export const sb: SupabaseClient | null = cloudEnabled ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let session: Session | null = null;
export const signedIn = () => !!session;
export const userEmail = () => session?.user.email ?? null;

export async function initAuth(onChange: (s: Session | null) => void): Promise<Session | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_e, s) => {
    session = s;
    onChange(s);
  });
  return session;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!sb) return 'Cloud sync is not configured.';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signOut() {
  await sb?.auth.signOut();
}

// ---------- question bank ----------

/** Tiny request: the current bank version stored in the cloud (null if unavailable). */
export async function fetchBankVersion(): Promise<string | null> {
  if (!sb || !session) return null;
  const { data, error } = await sb.from('bank_files').select('version').eq('name', 'bank-version').maybeSingle();
  if (error || !data) return null;
  return data.version as string;
}

export async function fetchBank(): Promise<Record<string, unknown> | null> {
  if (!sb || !session) return null;
  const out: Record<string, unknown> = {};
  const page = 50;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from('bank_files').select('name, content').order('name').range(from, from + page - 1);
    if (error) throw new Error(`Question bank download failed: ${error.message}`);
    for (const r of data ?? []) out[r.name as string] = r.content;
    if (!data || data.length < page) break;
  }
  if (!Object.keys(out).length) return null;
  // reassemble chunked arrays ("questions:000", "questions:001", ...)
  const merged: Record<string, unknown> = {};
  for (const name of Object.keys(out).sort()) {
    const [base, chunk] = name.split(':');
    if (chunk === undefined) merged[base] = out[name];
    else merged[base] = [...((merged[base] as unknown[]) ?? []), ...(out[name] as unknown[])];
  }
  return merged;
}

// ---------- attempts ----------

export async function pullAttempts(): Promise<AttemptResult[]> {
  if (!sb || !session) return [];
  const all: AttemptResult[] = [];
  const page = 200;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from('attempts').select('data').order('completed_at').range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) all.push(r.data as AttemptResult);
    if (!data || data.length < page) break;
  }
  return all;
}

/** Insert-only; an already-uploaded attempt counts as success. */
export async function pushAttempt(a: AttemptResult): Promise<boolean> {
  if (!sb || !session) return false;
  const { error } = await sb.from('attempts').insert({
    id: a.id,
    mode: a.mode,
    scope_key: a.scopeKey,
    completed_at: a.completedAt,
    score: a.score,
    data: a,
  });
  return !error || error.code === '23505';
}

// ---------- key/value records ----------

export interface KvRow<T = unknown> {
  value: T;
  updatedAt: string;
}

export async function kvGet<T>(key: string): Promise<KvRow<T> | null> {
  if (!sb || !session) return null;
  const { data, error } = await sb.from('user_kv').select('value, updated_at').eq('key', key).maybeSingle();
  if (error || !data) return null;
  return { value: data.value as T, updatedAt: data.updated_at as string };
}

export async function kvSet(key: string, value: unknown, updatedAt: string): Promise<boolean> {
  if (!sb || !session) return false;
  const { error } = await sb.from('user_kv').upsert({ user_id: session.user.id, key, value, updated_at: updatedAt });
  return !error;
}

export async function kvDelete(key: string): Promise<boolean> {
  if (!sb || !session) return false;
  const { error } = await sb.from('user_kv').delete().eq('key', key);
  return !error;
}
