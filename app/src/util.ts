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

// Preset unit templates for the "unit" fields (datalist — free text still allowed).
export const UNIT_PRESETS = [
  'adet', 'kutu', 'paket', 'koli', 'çift', 'kg', 'litre', 'çuval', 'palet', 'top', 'şişe', 'poşet', 'kişi', 'sefer',
];
