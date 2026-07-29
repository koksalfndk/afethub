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

export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.navy : C.surface, border: `1px solid ${active ? C.navy : C.borderSoft}`,
      color: active ? '#fff' : C.heading2, borderRadius: 20, padding: '9px 13px', fontSize: 13,
      fontWeight: 600, cursor: 'pointer', minHeight: 40,
    }}>{label}</button>
  );
}
