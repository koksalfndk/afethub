// AfetHUB design tokens — ported verbatim from the approved design (AfetHUB.dc.html).
// Canonical domain keys (Critical, Verified, …) are stable and match the DB enums;
// human-facing labels live in i18n/strings.ts so the app stays translatable (rule 07).

export const C = {
  navy: '#102A43',
  headerNavy: '#0B1E30',
  emergency: '#D9363E',
  emergencyHover: '#C22B33',
  orange: '#F97316',
  success: '#159947',
  successText: '#157F3E',
  warning: '#E6A700',
  // 4.43:1 idi — AA'yı altı basamakla kaçırıyordu. Altı basamak koyultuldu: 4.52:1.
  warningText: '#946B00',
  canvas: '#F6F8FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderSoft: '#D9E2EC',
  borderFaint: '#EEF2F6',
  heading: '#102A43',
  heading2: '#334E68',
  text: '#486581',
  // İkincil METİN rengi. #627D98 iken beyazda 4.28:1, canvas üzerinde 4.02:1 idi —
  // ikisi de WCAG AA'nın altında ve bu token bölüm açıklamalarında, kart üstbilgisinde,
  // kısacası okunması gereken yerlerde kullanılıyor. Sekiz basamak koyultuldu; gözle
  // fark edilmiyor, ölçüyle canvas üzerinde 4.50:1 (rules/04 §Accessibility).
  muted: '#5A7590',
  // DİKKAT: muted2 ve muted3 METİN İÇİN DEĞİL. Sırasıyla 2.91:1 ve 2.15:1 —
  // ikisi de AA metin eşiğinin çok altında. İkon, ayırıcı, kenarlık ve devre dışı
  // öğeler için kullanılır; okunması gereken bir cümle için ASLA. Koyultmak yerine
  // kullanım alanı daraltıldı: koyultsaydık `muted` ile ayırt edilemez hale gelir ve
  // taşıdıkları hiyerarşi bilgisi kaybolurdu.
  muted2: '#829AB1',
  muted3: '#9FB3C8',
  chipNavyBg: '#F0F4F8',
  errorText: '#A32027',
  errorSurface: '#FEF3F2',
  errorBorder: '#F6C9C9',
  // Accent-only tokens — used for stat-card borders, icons and numbers so
  // operational categories are distinguishable without filling cards with colour.
  info: '#2A6FB0',   // delivery locations
  teal: '#0F766E',   // volunteers
} as const;

// ---- Gradients (design direction "Vurgu Panelleri") -------------------------
// Gradients are used for surface depth and for the two inverted panels, never as
// decoration and never behind body copy that has to stay readable outdoors.
// Glassmorphism stays banned (rules/04).
export const G = {
  headerBar: 'linear-gradient(180deg,#FFFFFF 0%,#F9FBFD 100%)',
  opsBar: 'linear-gradient(90deg,#0B1E30 0%,#153A5A 100%)',
  // Hero stays light so the headline and body copy remain readable outdoors
  // (rules/01: weak network, bright sunlight, older screens).
  heroCard: 'linear-gradient(158deg,#FFFFFF 0%,#F8FBFD 52%,#EFF6FB 100%)',
  heroRibbon: 'linear-gradient(90deg,#D9363E 0%,#F97316 55%,rgba(249,115,22,0) 100%)',
  criticalPanel: 'linear-gradient(160deg,#FFFFFF 0%,#FEF7F7 55%,#FDEDED 100%)',
  surfaceSoft: 'linear-gradient(135deg,#FFFFFF 0%,#FAFCFE 100%)',
  navActive: 'linear-gradient(180deg,#102A43 0%,#0B1E30 100%)',
  navyBtn: 'linear-gradient(180deg,#1C3F5F 0%,#102A43 100%)',
  emergencyBtn: 'linear-gradient(180deg,#E1454C 0%,#D9363E 55%,#C22B33 100%)',
  chip: 'linear-gradient(135deg,#F7FAFD 0%,#EDF2F7 100%)',
} as const;

// Very low-intensity accent wash for a white card: the surface still reads white.
export const wash = (accent: string, pct = 6): string =>
  `linear-gradient(170deg, color-mix(in srgb, ${accent} ${pct}%, #fff) 0%,`
  + ` color-mix(in srgb, ${accent} 1.5%, #fff) 40%, #fff 75%)`;
// Progress fill and the stat-card top ribbon.
export const barFill = (accent: string): string =>
  `linear-gradient(90deg, color-mix(in srgb, ${accent} 58%, #fff) 0%, ${accent} 100%)`;
export const ribbon = (accent: string): string =>
  `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 32%, transparent) 70%, transparent 100%)`;

// Text/border tokens for the inverted (dark gradient) panels.
export const D = {
  fg: '#EAF1F7', fg2: '#AFC4D6', muted: '#8FA7BE', border: '#12324D',
  rowBg: 'rgba(255,255,255,.06)', rowBd: 'rgba(255,255,255,.14)',
  btnBg: 'rgba(255,255,255,.08)', btnBd: 'rgba(255,255,255,.24)',
  success: '#6EE7A8', warning: '#FFD470',
} as const;

export type PriorityKey = 'Critical' | 'Urgent' | 'Normal' | 'Paused' | 'Completed';
export type StatusKey =
  | 'Pending verification'
  | 'Verified'
  | 'Partially verified'
  | 'Rejected'
  | 'Information requested';

export interface PriorityToken { fg: string; bg: string; border: string; bar: string; rank: number; }
export interface StatusToken { fg: string; bg: string; border: string; }

export const PRI: Record<PriorityKey, PriorityToken> = {
  Critical:  { fg: '#A32027', bg: '#FEF3F2', border: '#F6C9C9', bar: '#D9363E', rank: 0 },
  Urgent:    { fg: '#B45309', bg: '#FFF6ED', border: '#FBD3AC', bar: '#F97316', rank: 1 },
  Normal:    { fg: '#334E68', bg: '#F0F4F8', border: '#D9E2EC', bar: '#102A43', rank: 2 },
  Paused:    { fg: '#627D98', bg: '#F0F4F8', border: '#D9E2EC', bar: '#9FB3C8', rank: 3 },
  Completed: { fg: '#157F3E', bg: '#EAF7EF', border: '#C9E9D6', bar: '#159947', rank: 4 },
};

export const STATUS: Record<StatusKey, StatusToken> = {
  'Pending verification':  { fg: '#9A7100', bg: '#FFF8E5', border: '#F2DFA8' },
  'Verified':              { fg: '#157F3E', bg: '#EAF7EF', border: '#C9E9D6' },
  'Partially verified':    { fg: '#B45309', bg: '#FFF6ED', border: '#FBD3AC' },
  'Rejected':              { fg: '#A32027', bg: '#FEF3F2', border: '#F6C9C9' },
  'Information requested': { fg: '#334E68', bg: '#F0F4F8', border: '#D9E2EC' },
};

// Header heights, shared so anything that has to sit directly under the bar (the
// coordinator rail, the mobile sticky filter row) cannot drift from it. Both are
// deterministic from the header's own padding and control heights — see Header.tsx.
// Mobile: 9px padding + 42px controls + 9px padding + 1px border.
// Desktop: 11px padding + 42px logo + 11px padding + 1px border. Both are driven by the
// LOGO height, so these change whenever the logo does — measured, not assumed.
export const MOBILE_HEADER_H = 61;
export const DESKTOP_HEADER_H = 65;
