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
  warningText: '#9A7100',
  canvas: '#F6F8FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderSoft: '#D9E2EC',
  borderFaint: '#EEF2F6',
  heading: '#102A43',
  heading2: '#334E68',
  text: '#486581',
  muted: '#627D98',
  muted2: '#829AB1',
  muted3: '#9FB3C8',
  chipNavyBg: '#F0F4F8',
  errorText: '#A32027',
  errorSurface: '#FEF3F2',
  errorBorder: '#F6C9C9',
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
