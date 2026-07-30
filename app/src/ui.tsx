import type { CSSProperties, ReactNode } from 'react';
import {
  Activity, BatteryCharging, Building2, Bus, Check, ChevronDown, ChevronRight, CircleCheck, Clock,
  CloudRain, Flame, House, LogOut, MapPin, Menu, Package, PackageSearch, PawPrint, Plus, Search,
  ShieldCheck, Shirt, Soup, SprayCan, Stethoscope, TriangleAlert, Truck, User, Users, Waves, Wind,
  Wrench, X, type LucideIcon,
} from 'lucide-react';
import { C, G, PRI, STATUS, barFill, ribbon, wash, type PriorityKey, type StatusKey } from './theme';
import { priorityLabel, statusLabel } from './i18n/strings';
import type { DisasterType } from './types';

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

export function ProgressBar({ pct, color, height = 8, track = C.border, flat }: {
  pct: number; color: string; height?: number; track?: string; flat?: boolean;
}) {
  return (
    <span style={{ display: 'block', height, borderRadius: 5, background: track, overflow: 'hidden' }}>
      <span style={{ display: 'block', height, borderRadius: 5, background: flat ? color : barFill(color), width: `${pct}%` }} />
    </span>
  );
}

type BtnVariant = 'emergency' | 'primary' | 'secondary' | 'approve' | 'ghost';
const btnStyles: Record<BtnVariant, CSSProperties> = {
  emergency: {
    background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 2px 6px rgba(191,42,49,.26)',
  },
  primary: { background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff' },
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

// Icon set — Lucide (lucide-react). The `Ico` adapter keeps semantic, domain-level
// names at the call sites ("pending", "verified", "pin") so the visual library can be
// swapped in one place and screens never import icon components directly.
export type IcoName =
  | 'need' | 'verified' | 'pending' | 'completed' | 'pin' | 'people' | 'critical' | 'activity' | 'search'
  | 'user' | 'menu' | 'close' | 'chev' | 'down' | 'home' | 'track' | 'plus' | 'logout'
  | 'org' | 'shield'
  // Disaster kinds. Mapped here so an operation's icon is decided once and every screen
  // (home cards, coordinator list, detail header) shows the same one.
  | 'dWildfire' | 'dFlood' | 'dEarthquake' | 'dStorm' | 'dEvacuation' | 'dOther'
  // Need categories (wizard step 2). Kept in the same semantic map so a category's
  // icon is chosen once, here, and never hard-coded at a call site.
  | 'catHealth' | 'catEquipment' | 'catHygiene' | 'catClothing' | 'catEnergy'
  | 'catFood' | 'catTransport' | 'catHaulage' | 'catPets';

const ICO: Record<IcoName, LucideIcon> = {
  need: Package,
  verified: CircleCheck,
  completed: Check,
  pending: Clock,
  pin: MapPin,
  people: Users,
  critical: TriangleAlert,
  activity: Activity,
  search: Search,
  user: User,
  menu: Menu,
  close: X,
  chev: ChevronRight,
  down: ChevronDown,
  home: House,
  track: PackageSearch,
  plus: Plus,
  logout: LogOut,
  catHealth: Stethoscope,
  catEquipment: Wrench,
  catHygiene: SprayCan,
  catClothing: Shirt,
  catEnergy: BatteryCharging,
  catFood: Soup,
  catTransport: Bus,
  catHaulage: Truck,
  catPets: PawPrint,
  org: Building2,
  shield: ShieldCheck,
  dWildfire: Flame,
  dFlood: Waves,
  dEarthquake: Activity,
  dStorm: Wind,
  dEvacuation: Users,
  dOther: CloudRain,
};

// One icon per disaster kind, defined once. This used to be copy-pasted into three
// screens with generic stand-ins ('critical' for both a wildfire and an earthquake), so
// the same operation could look like a different kind depending on where you saw it.
export const DISASTER_ICON: Record<DisasterType, IcoName> = {
  Wildfire: 'dWildfire', Flood: 'dFlood', Earthquake: 'dEarthquake',
  Storm: 'dStorm', Evacuation: 'dEvacuation', Other: 'dOther',
};

export function Ico({ n, size = 17, color }: { n: IcoName; size?: number; color?: string }) {
  const Cmp = ICO[n];
  return (
    <Cmp
      size={size}
      color={color ?? 'currentColor'}
      strokeWidth={1.8}
      absoluteStrokeWidth
      aria-hidden="true"
      style={{ display: 'block', flex: `0 0 ${size}px` }}
    />
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
      {/* Gradient ribbon on the top edge carries the status colour; the surface stays white. */}
      <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: ribbon(accent) }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Ico n={icon} size={16} color={accent} />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{label}</span>
      </span>
      <span className="tnum" style={{ fontSize: 25, fontWeight: 700, color: accent, letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</span>
      {hint ? <span style={{ fontSize: 11.5, color: C.muted2 }}>{hint}</span> : null}
    </>
  );
  const style: CSSProperties = {
    textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '14px 15px 13px', display: 'flex', flexDirection: 'column', gap: 5,
    position: 'relative', overflow: 'hidden',
  };
  return onClick
    ? <button onClick={onClick} className="hv-navy" style={{ ...style, cursor: 'pointer' }}>{body}</button>
    : <div style={style}>{body}</div>;
}

// Card surface with an accent wash — used by need cards so priority is felt before it is read.
export const washCard = (accent: string, pct = 5): CSSProperties => ({
  background: wash(accent, pct), border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`,
  borderRadius: 14,
});

// Compact icon-only control (mobile hamburger / profile, header actions).
export function IconBtn({ icon, label, onClick, size = 20 }: { icon: IcoName; label: string; onClick: () => void; size?: number }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="hv-navy" style={{
      width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, cursor: 'pointer', flex: '0 0 42px',
    }}><Ico n={icon} size={size} /></button>
  );
}

// Compact metric inside a card (disaster summary). Colour lives on the left edge
// and the number only.
export function MetricCell({ accent, value, label, onClick, title }: {
  accent: string; value: string | number; label: string; onClick?: () => void; title?: string;
}) {
  const inner = (
    <>
      <div className="tnum" style={{ fontSize: 21, fontWeight: 700, color: accent, letterSpacing: '-.02em', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 500, marginTop: 1 }}>{label}</div>
    </>
  );
  const style: CSSProperties = {
    background: C.canvas, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
    borderRadius: 9, padding: '9px 11px', textAlign: 'left',
  };
  // A counter that names a section is a link to that section, not decoration.
  return onClick
    ? <button onClick={onClick} title={title ?? label} className="hv-navy" style={{ ...style, cursor: 'pointer', width: '100%' }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
