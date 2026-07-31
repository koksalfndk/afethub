import { DIAL_CODE_LIST } from './data/dialCodes';
// Small shared helpers.

// Estimated arrival default: now + 30 min, rounded UP to the next half hour.
// e.g. 13:10 → +30 = 13:40 → 14:00 ; 13:00 → 13:30 ; 13:25 → 14:00
export function defaultEta(now: Date = new Date()): string {
  let t = now.getHours() * 60 + now.getMinutes() + 30;
  t = Math.ceil(t / 30) * 30;
  t = t % (24 * 60);
  const hh = String(Math.floor(t / 60)).padStart(2, '0');
  const mm = String(t % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// All half-hour slots of the day: "00:00", "00:30", … "23:30".
export function halfHourSlots(): string[] {
  const out: string[] = [];
  for (let t = 0; t < 24 * 60; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

// ---- Relative-time helpers -------------------------------------------------
// The data layer stores human display strings ("4 dakika önce", "1 saat önce",
// "az önce"). agoMinutes() turns one back into an offset so operational lists can
// be ordered by recency and rendered as a clock time. Unknown shapes return
// Infinity: they sort last and are never presented as recent.
export function agoMinutes(label: string): number {
  const s = (label ?? '').trim().toLowerCase();
  if (!s) return Number.POSITIVE_INFINITY;
  if (s.startsWith('az önce') || s.startsWith('şimdi')) return 0;
  const m = s.match(/(\d+)\s*(saniye|dakika|dk|saat|gün|hafta)/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 'saniye': return 0;
    case 'dakika': case 'dk': return n;
    case 'saat': return n * 60;
    case 'gün': return n * 1440;
    case 'hafta': return n * 10080;
    default: return Number.POSITIVE_INFINITY;
  }
}

// Clock time of an event that happened `min` minutes ago. Derived from the real
// offset stored with the event — never an invented timestamp. Empty when the
// offset is unknown, so the caller can omit the clock instead of guessing.
export function clockLabel(min: number, now: Date = new Date()): string {
  if (!Number.isFinite(min)) return '';
  const d = new Date(now.getTime() - min * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// True when the event's own offset places it inside the last 24 hours.
export const isToday = (label: string): boolean => agoMinutes(label) < 1440;

// Preset unit templates for the "unit" fields (datalist — free text still allowed).
export const UNIT_PRESETS = [
  'adet', 'kutu', 'paket', 'koli', 'çift', 'kg', 'litre', 'çuval', 'palet', 'top', 'şişe', 'poşet', 'kişi', 'sefer',
];

// ---- Network guard -----------------------------------------------------------
// A hanging request must never leave an emergency screen on an indefinite spinner
// (rules/04 §Loading States). supabase-js does not time out on its own: a blocked
// or black-holed connection can keep a promise pending forever. Every read the UI
// blocks on goes through this.
export const LOAD_TIMEOUT_MS = 6000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`istek ${ms} ms içinde yanıtlanmadı`);
    this.name = 'TimeoutError';
  }
}

// Yazma işlemleri için ayrı bütçe. 6 sn bir OKUMA bütçesi; doğrulama kararı gibi bir
// yazma, ardından operasyonun anlık görüntüsünün yeniden okunmasını da tetikliyor
// (RPC + iki tekil sorgu + altı tablo). Aynı bütçeyi paylaşmaları, işini yapmış bir
// yazmayı "başarısız" diye göstermeye yetiyordu.
export const WRITE_TIMEOUT_MS = 15000;

// Yazma BAŞARILI oldu, ama sonraki tazeleme okuması başarısız. Ayrı bir tip, çünkü bu
// ikisine aynı mesajı vermek yalan olur: "kayıt değişmedi" demek, değişmiş bir kaydı
// koordinatöre ikinci kez işlettirir.
export class RefreshFailedError extends Error {
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super('kayıt yazıldı, ekran tazelenemedi');
    this.name = 'RefreshFailedError';
    this.cause = cause;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number = LOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ---- Dates -------------------------------------------------------------------
// Product-wide display format is GG-AA-YYYY (rules/04 §Dates and Numbers: Turkish
// locale). Storage stays ISO; only presentation is reordered. Non-date input is
// returned untouched so a label that is already human ("21 Temmuz") survives.
export function formatDate(value: string): string {
  const v = (value ?? '').trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return v;
}

// Date part of a disaster slug: "…-21-07-2026".
export const slugDate = (iso: string): string => formatDate(iso);

// ---- Phone dial codes --------------------------------------------------------
// Shared by every contact form so the split/join rule exists once. The stored value is
// always one string ("+90 5xx …"): the split is a UI affordance, not a data model.
// The full country list lives in data/dialCodes.ts; this stays the flat set of codes
// so splitPhone() keeps one source of truth for the prefix rule.
export const DIAL_CODES = DIAL_CODE_LIST;
export const DEFAULT_DIAL = '+90';

// An unrecognised or missing prefix falls back to +90 with the digits left exactly as
// typed — a phone number is never silently rewritten.
export function splitPhone(value: string): { dial: string; rest: string } {
  const v = (value ?? '').trim();
  const match = DIAL_CODES
    .slice()
    .sort((a, b) => b.length - a.length)   // longest first so +994 wins over +9
    .find((c) => v.startsWith(c));
  if (!match) return { dial: DEFAULT_DIAL, rest: v };
  return { dial: match, rest: v.slice(match.length).trim() };
}

export const joinPhone = (dial: string, rest: string): string =>
  (rest.trim() ? `${dial} ${rest.trim()}` : '');

// ---------------------------------------------------------------------------
// Contact masking
// ---------------------------------------------------------------------------
// Coordinator list views show a contact only well enough to recognise a repeat
// requester, never in full. Full details are revealed on a per-record basis by
// someone with an operational need (rules/03 §Contact Information).
export function maskEmail(email: string): string {
  const v = email.trim();
  const at = v.indexOf('@');
  if (at < 1) return v ? '***' : '';
  const head = v.slice(0, at);
  const keep = head.slice(0, 1);
  return `${keep}${'*'.repeat(Math.max(2, head.length - 1))}${v.slice(at)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 4) return digits ? '***' : '';
  // Last four digits only: enough to match against a record already in hand, not
  // enough to dial from a list.
  return `${digits.slice(0, Math.min(4, digits.length - 4)).replace(/\d/g, '*')}*** ${digits.slice(-4)}`;
}
