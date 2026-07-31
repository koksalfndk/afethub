import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import { tr } from '../i18n/strings';
import { plateOf, foldTr } from '../trProvinces';

// Etkilenen mahalle / köy seçici (afet formu).
//
// Neden serbest metin değil: aynı köy üç kayıtta üç farklı yazımla girilirse
// hiçbiri eşleşmez ve "etkilenen bölge" diye bir liste elde edilemez. Seçici, ilin
// GERÇEK yerleşim listesinden okutuyor; kaydedilen ad her zaman resmî ad.
//
// Veri `public/data/settlements/<plaka>.json` altından, sayfa başına tek dosya
// (Muğla 7 KB). Çalışma anında üçüncü tarafa istek YOK — haritalarda olduğu gibi
// kendi sunucumuzdan. Kaynak: TurkiyeAPI (MIT), bkz. o klasördeki README.

interface DistrictEntry { m: string[]; k: string[] }
type ProvinceData = Record<string, DistrictEntry>;

export function SettlementPicker({ province, districts, value, onChange }: {
  province: string;
  /** Formdaki ilçe(ler). Yerleşim listesi bunların birleşimi. */
  districts: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [data, setData] = useState<ProvinceData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const plate = plateOf(province);

  useEffect(() => {
    if (plate == null) { setData(null); setFailed(false); return; }
    let alive = true;
    setData(null); setFailed(false);
    fetch(`/data/settlements/${plate}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (alive) setData(j as ProvinceData); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plate]);

  // İlçe adı iki ayrı kaynaktan geliyor (form listesi ve yerleşim veri seti), aynı
  // yazımda olmak zorunda değiller. Eşleşme normalize edilmiş adla yapılır ve
  // eşleşmeyen ilçe SESSİZCE boş liste göstermez — aşağıda adıyla bildirilir.
  const { options, unmatchedDistricts } = useMemo(() => {
    if (!data) return { options: [] as { name: string; kind: 'm' | 'k'; district: string }[], unmatchedDistricts: [] as string[] };
    const byFold = new Map(Object.keys(data).map((k) => [foldTr(k), k] as const));
    const opts: { name: string; kind: 'm' | 'k'; district: string }[] = [];
    const missing: string[] = [];
    for (const d of districts) {
      const key = byFold.get(foldTr(d));
      if (!key) { if (d.trim()) missing.push(d); continue; }
      const entry = data[key];
      for (const n of entry.m) opts.push({ name: n, kind: 'm', district: key });
      for (const n of entry.k) opts.push({ name: n, kind: 'k', district: key });
    }
    opts.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return { options: opts, unmatchedDistricts: missing };
  }, [data, districts]);

  const selected = useMemo(() => new Set(value.map(foldTr)), [value]);

  const visible = useMemo(() => {
    const q = foldTr(query);
    if (!q) return options;
    return options.filter((o) => foldTr(o.name).includes(q));
  }, [options, query]);

  const toggle = (name: string) => {
    const f = foldTr(name);
    onChange(selected.has(f) ? value.filter((v) => foldTr(v) !== f) : [...value, name]);
  };

  if (plate == null) {
    return <p style={note}>{province ? tr.coordDisasters.settlementUnknownProvince : tr.coordDisasters.settlementPickProvince}</p>;
  }
  if (districts.length === 0) return <p style={note}>{tr.coordDisasters.settlementPickDistrict}</p>;
  if (failed) return <p style={note}>{tr.coordDisasters.settlementFailed}</p>;
  if (!data) return <p style={note}>{tr.common.loading}</p>;
  if (options.length === 0) {
    return (
      <p style={note}>
        {tr.coordDisasters.settlementNoneFound(unmatchedDistricts.join(', ') || districts.join(', '))}
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.coordDisasters.settlementSearch}
          aria-label={tr.coordDisasters.settlementSearch}
          style={{
            flex: '1 1 200px', minWidth: 0, border: `1px solid ${C.borderSoft}`, borderRadius: 9,
            padding: '9px 11px', fontSize: 13.5, color: C.navy, background: C.surface, minHeight: 42,
          }}
        />
        <span style={{ fontSize: 12, color: C.muted2 }}>
          {tr.coordDisasters.settlementCount(value.length, options.length)}
        </span>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} style={{
            background: 'none', border: 0, color: C.muted, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'underline', minHeight: 36,
          }}>{tr.coordDisasters.settlementClear}</button>
        )}
      </div>

      {unmatchedDistricts.length > 0 && (
        <p style={{ ...note, color: C.warningText }}>
          {tr.coordDisasters.settlementUnmatched(unmatchedDistricts.join(', '))}
        </p>
      )}

      {/* Uzun liste: 65 mahalle tek ekrana sığmaz, kutu kendi içinde kayar. */}
      <div style={{
        maxHeight: 210, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 9, display: 'flex', flexWrap: 'wrap', gap: 6, background: C.canvas,
      }}>
        {visible.length === 0 && (
          <span style={{ fontSize: 12.5, color: C.muted2, padding: '4px 2px' }}>
            {tr.coordDisasters.settlementNoMatch}
          </span>
        )}
        {visible.map((o) => {
          const on = selected.has(foldTr(o.name));
          return (
            <button
              key={`${o.district}-${o.kind}-${o.name}`}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.name)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1px solid ${on ? C.navy : C.border}`,
                background: on ? C.navy : C.surface,
                color: on ? '#fff' : C.text,
                borderRadius: 20, padding: '6px 11px', fontSize: 12.5,
                fontWeight: on ? 600 : 500, cursor: 'pointer', minHeight: 36,
              }}
            >
              {o.name}
              {/* Mahalle mi köy mü — renk değil, harf. Seçili/seçili değil ayrımı
                  zaten rengi kullanıyor; ikinci bir anlamı renge yüklemek olmaz. */}
              <span style={{ fontSize: 10.5, opacity: 0.75 }}>
                {o.kind === 'k' ? tr.coordDisasters.settlementVillage : tr.coordDisasters.settlementNeighbourhood}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const note = { margin: '0 0 8px', fontSize: 12.5, color: C.muted } as const;
