import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { classColor, classify } from '../utils/stats';

/** True on phone-width screens (below Tailwind's `sm` breakpoint), updating on rotation. */
function useNarrow() {
  const query = '(max-width: 639px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

const AXIS = { stroke: '#2A3A58', tick: { fill: '#8492A6', fontSize: 11, fontFamily: 'JetBrains Mono, Consolas, monospace' } };

function Tip({ active, payload, label, unit = '%', labelPrefix = '' }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; unit?: string; labelPrefix?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const extra = p.payload.extra as string | undefined;
  return (
    <div className="rounded-lg border border-line bg-bg/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-0.5 text-muted">
        {labelPrefix}
        {(p.payload.full as string) ?? label}
      </div>
      <div className="font-mono text-sm text-ink">
        {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        {unit}
      </div>
      {extra && <div className="mt-0.5 text-muted">{extra}</div>}
    </div>
  );
}

/** Accuracy per chapter; bars colored by personal classification band (labelled in tooltip + legend below). */
export function AccuracyBars({ data, target }: { data: { name: string; full: string; value: number; extra?: string }[]; target?: number }) {
  const narrow = useNarrow(); // 20 two-digit labels do not fit side by side on a phone: label every other bar
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={6}>
          <CartesianGrid stroke="#1E2A40" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="name" {...AXIS} tickLine={false} interval={narrow && data.length > 12 ? 1 : 0} />
          <YAxis domain={[0, 100]} {...AXIS} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,245,255,0.06)' }} />
          {target !== undefined && <ReferenceLine y={target} stroke="#FF00A8" strokeDasharray="4 4" strokeWidth={1} />}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.name} fill={classColor[classify(d.value)]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLine({ data, target, color = '#00F5FF' }: { data: { name: string; full?: string; value: number; extra?: string }[]; target?: number; color?: string }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#1E2A40" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="name" {...AXIS} tickLine={false} />
          <YAxis domain={[0, 100]} {...AXIS} tickLine={false} axisLine={false} ticks={[0, 25, 50, 75, 100]} />
          <Tooltip content={<Tip />} cursor={{ stroke: '#2A3A58' }} />
          {target !== undefined && <ReferenceLine y={target} stroke="#FF00A8" strokeDasharray="4 4" strokeWidth={1} />}
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4, fill: color, stroke: '#101624', strokeWidth: 2 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal two-part status bar with labels - correct vs incorrect never relies on color alone. */
export function SplitBar({ correct, incorrect, labels = ['Correct', 'Incorrect'] }: { correct: number; incorrect: number; labels?: [string, string] }) {
  const total = correct + incorrect || 1;
  const c = (correct / total) * 100;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-md">
        <div className="h-full rounded-l-md bg-ok" style={{ width: `${c}%` }} title={`${labels[0]}: ${correct}`} />
        <div className="h-full rounded-r-md bg-bad" style={{ width: `${100 - c}%` }} title={`${labels[1]}: ${incorrect}`} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs">
        <span className="text-ink">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok" />
          {labels[0]} {correct} ({c.toFixed(1)}%)
        </span>
        <span className="text-ink">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-bad" />
          {labels[1]} {incorrect} ({(100 - c).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

export function BandLegend() {
  const bands: [string, string][] = [
    ['Critical', '<50'],
    ['Weak', '50–69'],
    ['Needs Review', '70–79'],
    ['Strong', '80–89'],
    ['Mastered', '90+'],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {bands.map(([b, r]) => (
        <span key={b} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: classColor[b as keyof typeof classColor] }} />
          {b} <span className="font-mono">{r}%</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 border-t border-dashed border-magenta" /> target
      </span>
    </div>
  );
}
