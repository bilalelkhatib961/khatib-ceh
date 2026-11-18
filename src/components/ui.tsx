import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Classification, classColor, classify } from '../utils/stats';

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'cyan',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: 'cyan' | 'magenta' | 'ok' | 'bad' | 'warn';
}) {
  const color = { cyan: 'text-cyan', magenta: 'text-magenta', ok: 'text-ok', bad: 'text-bad', warn: 'text-warn' }[accent];
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {Icon && <Icon size={16} className={color} />}
      </div>
      <div className="stat mt-2 wrap-anywhere">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Bar({ value, color, height = 6 }: { value: number | null; color?: string; height?: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="w-full overflow-hidden rounded-full bg-line" style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: color ?? classColor[classify(value)] }} />
    </div>
  );
}

export function ClassBadge({ value, cls }: { value?: number | null; cls?: Classification }) {
  const c = cls ?? classify(value ?? null);
  const col = classColor[c];
  return (
    <span className="chip" style={{ color: col, borderColor: col + '66', background: col + '14' }}>
      {c}
    </span>
  );
}

export function SectionTitle({ children, right, icon: Icon }: { children: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-ink">
        {Icon && <Icon size={16} className="text-cyan" />}
        {children}
      </h2>
      {right && <div className="shrink-0 whitespace-nowrap">{right}</div>}
    </div>
  );
}

export function Empty({ title, children, icon: Icon }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 p-8 text-center">
      {Icon && <Icon size={28} className="text-muted" />}
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-line">/</span>}
          {it.to ? (
            <Link to={it.to} className="inline-block py-1 hover:text-cyan touch:-my-2 touch:py-3">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose(): void; title: string; children: ReactNode }) {
  // stop the page behind the dialog from scrolling (iOS Safari otherwise scrolls the body through the overlay)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="safe-inset fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="panel-glow fade-in max-h-full w-full max-w-lg overflow-y-auto overscroll-contain p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="mb-4 text-lg font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const BAND_ORDER: Classification[] = ['Mastered', 'Strong', 'Needs Review', 'Weak', 'Critical', 'No data'];
const BAND_RANGE: Record<Classification, string> = {
  Mastered: '90–100%',
  Strong: '80–89%',
  'Needs Review': '70–79%',
  Weak: '50–69%',
  Critical: 'below 50%',
  'No data': 'not attempted',
};

/**
 * Count of items per personal study band (based on the accuracy values passed in).
 * Clicking a card selects that band (click again to clear); "No data" is shown only when present.
 */
export function BandSummary({
  values,
  noun,
  selected,
  onSelect,
}: {
  values: (number | null)[];
  noun: string;
  selected: Classification | null;
  onSelect: (c: Classification | null) => void;
}) {
  const counts = new Map<Classification, number>(BAND_ORDER.map((b) => [b, 0]));
  for (const v of values) counts.set(classify(v), counts.get(classify(v))! + 1);
  const bands = BAND_ORDER.filter((b) => b !== 'No data' || counts.get(b)! > 0);
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${bands.length > 5 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
      {bands.map((b) => {
        const n = counts.get(b)!;
        const col = classColor[b];
        const on = selected === b;
        return (
          <button
            key={b}
            onClick={() => onSelect(on ? null : b)}
            aria-pressed={on}
            title={on ? 'Click to show all' : `Show only ${b} ${noun}`}
            className={`panel p-4 text-left transition-colors hover:border-white/20`}
            style={on ? { borderColor: col, boxShadow: `0 0 0 1px ${col}55` } : undefined}
          >
            <div className="flex items-center justify-between">
              <span className="label" style={{ color: col }}>
                {b}
              </span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col }} />
            </div>
            <div className="stat mt-2">{n}</div>
            <div className="mt-1 text-xs text-muted">
              {n === 1 ? noun.replace(/s$/, '') : noun} · {BAND_RANGE[b]}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Pct({ v, digits = 0 }: { v: number | null; digits?: number }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span style={{ color: classColor[classify(v)] }}>{v.toFixed(digits)}%</span>;
}
