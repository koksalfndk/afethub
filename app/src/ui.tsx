import type { CSSProperties, ReactNode } from 'react';
import { C, PRI, STATUS, type PriorityKey, type StatusKey } from './theme';
import { priorityLabel, statusLabel } from './i18n/strings';

// Reusable style fragments ported from the prototype.
export const inputStyle: CSSProperties = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9,
  padding: '11px 12px', fontSize: 14, color: C.navy, minHeight: 46, width: '100%',
};
export const cardStyle: CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18,
};
export const labelText: CSSProperties = { fontSize: 13, fontWeight: 600, color: C.heading2 };
export const eyebrow: CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted2,
};

export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={labelText}>
        {label}{hint ? <span style={{ color: C.muted3, fontWeight: 500 }}> {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function PriorityBadge({ p }: { p: PriorityKey }) {
  const t = PRI[p] ?? PRI.Normal;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
      color: t.fg, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 5,
      padding: '4px 7px', whiteSpace: 'nowrap',
    }}>{priorityLabel[p]}</span>
  );
}

export function StatusBadge({ s }: { s: StatusKey }) {
  const t = STATUS[s] ?? STATUS.Verified;
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg, border: `1px solid ${t.border}`,
      borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap',
    }}>{statusLabel[s]}</span>
  );
}

export function ProgressBar({ pct, color, height = 8, track = C.border }: { pct: number; color: string; height?: number; track?: string }) {
  return (
    <span style={{ display: 'block', height, borderRadius: 5, background: track, overflow: 'hidden' }}>
      <span style={{ display: 'block', height, borderRadius: 5, background: color, width: `${pct}%` }} />
    </span>
  );
}

type BtnVariant = 'emergency' | 'primary' | 'secondary' | 'approve' | 'ghost';
const btnStyles: Record<BtnVariant, CSSProperties> = {
  emergency: { background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff' },
  primary: { background: C.navy, border: `1px solid ${C.navy}`, color: '#fff' },
  secondary: { background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy },
  approve: { background: C.success, border: `1px solid ${C.success}`, color: '#fff' },
  ghost: { background: 'none', border: 0, color: C.muted },
};

export function Btn({
  variant = 'primary', onClick, children, style, className, disabled, type,
}: {
  variant?: BtnVariant; onClick?: () => void; children: ReactNode;
  style?: CSSProperties; className?: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type ?? 'button'} onClick={onClick} disabled={disabled} className={className}
      style={{
        borderRadius: 10, padding: '13px 20px', fontSize: 15, fontWeight: 600, minHeight: 48,
        cursor: disabled ? 'default' : 'pointer', ...btnStyles[variant], ...style,
      }}
    >{children}</button>
  );
}

export function Chip({ label, active, onClick, disabled, accent }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean; accent?: string;
}) {
  const on = active && !disabled;
  const tone = accent ?? C.navy;
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={disabled ? label : undefined} style={{
      background: on ? tone : C.surface, border: `1px solid ${on ? tone : C.borderSoft}`,
      color: disabled ? C.muted3 : on ? '#fff' : C.heading2, borderRadius: 20, padding: '9px 13px', fontSize: 13,
      fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 40,
    }}>{label}</button>
  );
}

// Lightweight select used by the needs filter bar — same footprint as a Chip so
// the filter row stays visually calm.
export const filterSelectStyle: CSSProperties = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.heading2,
  borderRadius: 20, padding: '9px 12px', fontSize: 13, fontWeight: 600, minHeight: 40,
  cursor: 'pointer', maxWidth: 200,
};

// ---- Operational primitives ------------------------------------------------

// Pulsing status dot — marks anything that reflects live operational state.
export function LiveDot({ color = C.emergency, size = 7, still }: { color?: string; size?: number; still?: boolean }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: color, flex: `0 0 ${size}px`,
      animation: still ? undefined : 'afetPulse 1.8s infinite',
    }} />
  );
}

// Minimal stroke icon set (currentColor, 1.8px) — used only as a colour-coded
// category marker on stat cards and headers, never as decoration.
export type IcoName = 'need' | 'verified' | 'pending' | 'completed' | 'pin' | 'people' | 'critical' | 'activity' | 'search';

const ICO: Record<IcoName, ReactNode> = {
  need: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  verified: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.5L16 9.5" /></>,
  completed: <><path d="M20 6.5 9.5 17 4 11.5" /></>,
  pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  people: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M17 4.4a3.6 3.6 0 0 1 0 7" /><path d="M21 20v-1.5a4 4 0 0 0-3-3.8" /></>,
  critical: <><path d="M12 4.5 21 19H3z" /><path d="M12 10v4M12 16.8h.01" /></>,
  activity: <><path d="M3 12h4l2.5-6 4 12L16 12h5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></>,
};

export function Ico({ n, size = 17, color }: { n: IcoName; size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block', flex: `0 0 ${size}px` }}
    >{ICO[n]}</svg>
  );
}

// Operational stat card. The card body stays white — only the top border, the
// icon and the number carry the status colour, so a grid of these stays calm
// while still being scannable.
export function StatCard({ accent, icon, label, value, hint, onClick }: {
  accent: string; icon: IcoName; label: string; value: string | number; hint?: string; onClick?: () => void;
}) {
  const body = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Ico n={icon} size={16} color={accent} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
      </span>
      <span style={{ fontSize: 25, fontWeight: 700, color: accent, letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</span>
      {hint ? <span style={{ fontSize: 11.5, color: C.muted2 }}>{hint}</span> : null}
    </>
  );
  const style: CSSProperties = {
    textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`,
    borderTop: `3px solid ${accent}`, borderRadius: 11, padding: '12px 14px 13px',
    display: 'flex', flexDirection: 'column', gap: 5,
  };
  return onClick
    ? <button onClick={onClick} className="hv-navy" style={{ ...style, cursor: 'pointer' }}>{body}</button>
    : <div style={style}>{body}</div>;
}

// Compact metric inside a card (disaster summary). Colour lives on the left edge
// and the number only.
export function MetricCell({ accent, value, label }: { accent: string; value: string | number; label: string }) {
  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 9, padding: '9px 11px',
    }}>
      <div style={{ fontSize: 21, fontWeight: 700, color: accent, letterSpacing: '-.02em', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 500, marginTop: 1 }}>{label}</div>
    </div>
  );
}
