import { useState, type ReactNode } from 'react';
import type { Country } from '../sim/types';
import { rgbCss } from '../map/colors';

export function Flag({ country, iso2, size = 22 }: { country?: Pick<Country, 'color' | 'id'>; iso2?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const h = Math.round(size * 0.7);
  if (!iso2 || failed) {
    return <span className="flag flag-fallback" style={{ width: size, height: h, background: country ? rgbCss(country.color) : '#555' }}>{country?.id.slice(0, 2)}</span>;
  }
  return <img className="flag" width={size} height={h} src={`https://flagcdn.com/w80/${iso2.toLowerCase()}.png`} alt="" onError={() => setFailed(true)} />;
}

export function Stat({ label, value, sub, tone, title }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'neutral'; title?: string }) {
  return (
    <div className={`stat ${tone ?? ''}`} title={title}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Meter({ value, max = 100, color, label, right }: { value: number; max?: number; color?: string; label?: ReactNode; right?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? (pct > 66 ? 'var(--good)' : pct > 33 ? 'var(--warn)' : 'var(--bad)');
  return (
    <div className="meter-row">
      {label !== undefined && <div className="meter-label">{label}</div>}
      <div className="meter"><div className="meter-fill" style={{ width: `${pct}%`, background: c }} /></div>
      {right !== undefined && <div className="meter-right">{right}</div>}
    </div>
  );
}

export function Section({ title, children, right, collapsible = false }: { title: ReactNode; children: ReactNode; right?: ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="section">
      <header onClick={() => collapsible && setOpen(!open)} className={collapsible ? 'clickable' : ''}>
        <h3>{title}</h3>
        <div className="section-right">{right}{collapsible && <span className="chev">{open ? '▾' : '▸'}</span>}</div>
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => <button key={t.id} className={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function Slider({ value, min, max, step = 0.1, onCommit, format, disabled }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; format?: (v: number) => string; disabled?: boolean }) {
  const [local, setLocal] = useState<number | null>(null);
  const v = local ?? value;
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={v} disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => { if (local !== null) { onCommit(local); setLocal(null); } }}
        onKeyUp={() => { if (local !== null) { onCommit(local); setLocal(null); } }} />
      <span className="slider-val">{format ? format(v) : v.toFixed(1)}</span>
    </div>
  );
}

export function Pill({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  return <span className="pill" title={title} style={color ? { background: color } : undefined}>{children}</span>;
}

export function Swatch({ color }: { color: readonly number[] }) {
  return <span className="swatch" style={{ background: rgbCss(color) }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export const signed = (v: number, digits = 1, suffix = '') => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}${suffix}`;
