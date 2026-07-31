import { useEffect, useMemo, useRef, useState } from 'react';
import { C, D } from '../theme';
import { tr } from '../i18n/strings';
import { foldTr } from '../trProvinces';

// Operasyonun ilinin ilçe haritası — etkilenen ilçeler boyanır.
//
// Ulusal panoda il yeter ("hangi operasyon"); burada soru "il içinde NEREDE".
// Kayıtta ilçe listesi yoksa (migration 0026 öncesi kayıtlar) harita hiç çizilmez:
// hepsi boş bir il haritası "hiçbir yer etkilenmedi" gibi okunurdu.
//
// Coğrafya `public/maps/districts/<plaka>.svg` altından gelir, pakete gömülmez.
// Kaynak: turkey-district-maps-3 (MIT). Lisans metni aynı klasörde durur ve
// kaldırılmamalıdır.

const src = (plate: number): string => `/maps/districts/${plate}.svg`;

interface DistrictPath { name: string; d: string }

export function DistrictMap({ plate, affected, accent, onDark }: {
  plate: number;
  /** Kayıttaki ilçe adları. Boş dizi ile çağrılmamalı — çağıran taraf paneli hiç göstermez. */
  affected: string[];
  accent: string;
  /** Koyu komuta şeridinin içinde çiziliyor: nötr iller ve etiketler ters renklenir. */
  onDark?: boolean;
}) {
  const [paths, setPaths] = useState<DistrictPath[] | null>(null);
  const [viewBox, setViewBox] = useState('0 0 100 100');
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState<{ name: string; x: number; y: number }[]>([]);
  // Kaynak dosyaların viewBox'ı il başına farklı ve çoğu şeklin etrafında geniş boşluk
  // bırakıyor: Kastamonu haritası kutunun ortasında küçücük kalıyordu. Çizimden SONRA
  // gerçek sınır kutusu ölçülüp viewBox ona daraltılıyor — böylece her il aynı ölçekte
  // ve panelin tamamını kullanacak şekilde görünüyor.
  const [fit, setFit] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    let alive = true;
    setPaths(null); setFailed(false); setLabels([]); setFit(null);
    fetch(src(plate))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!alive) return;
        // Sadece `d`, `data-district` ve viewBox okunur; dosya sayfaya olduğu gibi
        // enjekte edilmez (rules/03 §File Uploads mantığı).
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const vb = doc.querySelector('svg')?.getAttribute('viewBox');
        const out: DistrictPath[] = [];
        doc.querySelectorAll('path[data-district]').forEach((el) => {
          const name = el.getAttribute('data-district') ?? '';
          const d = el.getAttribute('d');
          if (name && d) out.push({ name, d });
        });
        if (!vb || out.length === 0) throw new Error('empty district map');
        setViewBox(vb);
        setPaths(out);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plate]);

  // Kayıttaki ad ile haritadaki ad aynı yazımda değil ("Köyceğiz" / "KÖYCEĞİZ",
  // "Seydikemer" / "SEYDİKEMER"), bu yüzden ikisi de aynı eşleyiciden geçer.
  const wanted = useMemo(() => new Set(affected.map(foldTr).filter(Boolean)), [affected]);

  const matched = useMemo(
    () => new Set((paths ?? []).map((p) => foldTr(p.name)).filter((f) => wanted.has(f))),
    [paths, wanted],
  );
  // Kayıtta yazan ama haritada karşılığı olmayan ilçe adı sessizce yutulmaz:
  // yazım hatası olabilir ve koordinatör bunu görmeli.
  const unmatched = useMemo(
    () => affected.filter((a) => foldTr(a) && !matched.has(foldTr(a))),
    [affected, matched],
  );

  useEffect(() => {
    const g = groupRef.current;
    if (!g || !paths) return;
    const whole = g.getBBox();
    if (whole.width > 0 && whole.height > 0) {
      const pad = Math.max(whole.width, whole.height) * 0.03;
      setFit({ x: whole.x - pad, y: whole.y - pad, w: whole.width + pad * 2, h: whole.height + pad * 2 });
    }
    // Etiket çakışması: komşu iki ilçe seçilince adlar üst üste biniyordu
    // ("İNEB…" ile "BOZKURT" tek kelime gibi okunuyordu). Ad, ilçenin merkezinden
    // başlayıp boş bulduğu ilk satıra yerleşir; ilçe zaten boyalı olduğu için
    // etiketin biraz kayması hangi ilçe olduğunu belirsizleştirmez.
    const size = (Math.max(whole.width, whole.height) || 100) / 22;
    const placed: { x: number; y: number; hw: number }[] = [];
    const next: { name: string; x: number; y: number }[] = [];
    paths.forEach((p) => {
      if (!wanted.has(foldTr(p.name))) return;
      const el = g.querySelector<SVGPathElement>(`path[data-district="${CSS.escape(p.name)}"]`);
      if (!el) return;
      const box = el.getBBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const hw = (p.name.length * size) / 3.4;
      const candidates = [cy, cy - size * 1.25, cy + size * 1.25, cy - size * 2.5, cy + size * 2.5];
      const y = candidates.find((c) => !placed.some(
        (q) => Math.abs(q.y - c) < size && Math.abs(q.x - cx) < q.hw + hw,
      )) ?? cy + size * 3.75;
      placed.push({ x: cx, y, hw });
      next.push({ name: p.name, x: cx, y });
    });
    setLabels(next);
  }, [paths, wanted]);

  // Koyu zeminde açık gri il dolgusu ve lacivert yazı okunmaz. Nötr renkler ve
  // etiketin kontur halesi zemine göre ters çevrilir; VURGU rengi (accent) aynı
  // kalır — aynı operasyon panoda ve burada aynı renkte görünmeli.
  const neutralFill = onDark ? 'rgba(255,255,255,.10)' : C.chipNavyBg;
  const neutralStroke = onDark ? 'rgba(255,255,255,.24)' : C.muted3;
  const labelFill = onDark ? '#FFFFFF' : C.navy;
  const labelHalo = onDark ? 'rgba(9,26,42,.92)' : '#fff';

  // Çizgi ve yazı kalınlıkları SVG biriminde; il başına viewBox ölçeği değiştiği için
  // sabit bir değer bir ilde tüy gibi, ötekinde haritayı kaplayacak kadar kalın olur.
  const unit = fit ? Math.max(fit.w, fit.h) : 100;
  const labelSize = unit / 22;
  const strokeUnit = unit / 400;

  if (failed) {
    return <p style={onDark ? darkNote : note}>{tr.coordOperation.districtFailed}</p>;
  }
  if (!paths) {
    return (
      <div aria-busy="true" style={{
        height: onDark ? 130 : 160, borderRadius: 10,
        background: onDark ? 'rgba(255,255,255,.07)' : C.borderFaint,
      }} />
    );
  }

  return (
    <>
      <svg
        viewBox={fit ? `${fit.x} ${fit.y} ${fit.w} ${fit.h}` : viewBox}
        role="img"
        aria-label={tr.coordOperation.districtAria(affected.join(', '))}
        style={{ width: '100%', height: 'auto', display: 'block', maxHeight: onDark ? 190 : 340 }}
      >
        <g ref={groupRef}>
          {paths.map((p) => {
            const on = wanted.has(foldTr(p.name));
            return (
              <path
                key={p.name}
                data-district={p.name}
                d={p.d}
                fill={on ? accent : neutralFill}
                fillOpacity={on ? 0.95 : 1}
                stroke={on ? '#FFFFFF' : neutralStroke}
                strokeWidth={on ? strokeUnit * 1.6 : strokeUnit}
                strokeLinejoin="round"
              >
                <title>{on ? tr.coordOperation.districtAffected(p.name) : p.name}</title>
              </path>
            );
          })}
        </g>
        <g pointerEvents="none">
          {labels.map((l) => (
            <text
              key={l.name}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: labelSize, fontWeight: 700, fill: labelFill,
                paintOrder: 'stroke', stroke: labelHalo, strokeWidth: labelSize * 0.3,
                strokeLinejoin: 'round',
              }}
            >{l.name}</text>
          ))}
        </g>
      </svg>
      {unmatched.length > 0 && (
        <p style={onDark ? darkNote : note}>{tr.coordOperation.districtUnmatched(unmatched.join(', '))}</p>
      )}
    </>
  );
}

const note = { margin: '8px 6px 0', fontSize: 11.5, color: C.muted2 } as const;
const darkNote = { margin: '6px 2px 0', fontSize: 11.5, color: D.muted } as const;
