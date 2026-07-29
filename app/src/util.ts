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
