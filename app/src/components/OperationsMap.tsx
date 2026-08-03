import { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme';
import { tr } from '../i18n/strings';
import { plateOf } from '../trProvinces';

// Türkiye il haritası — operasyonun bulunduğu il boyanır.
//
// Neden leaflet değil: burada gösterilen şey konum değil, KİMİN nerede olduğudur.
// Karo tabanlı bir harita motoru her koordinatörün IP'sini üçüncü taraf bir karo
// sunucusuna gönderir, çevrimdışı çalışmaz ve pakete ~40 KB ekler. Sokak düzeyinde
// konum (teslim noktası) zaten kendi leaflet haritasında.
//
// Neden elle çizilmiş siluet değil: ilk sürüm doğrusal projeksiyonla üretilmiş kaba
// bir konturdu, üstündeki daireler birbirini örtüyordu ve tıklama yanlış operasyonu
// seçiyordu. Gerçek il sınırları hem tanınabilir hem de operasyonu ilin KENDİSİNİ
// boyayarak gösteriyor — daire çakışması diye bir sorun kalmıyor.
//
// SVG pakete gömülmez: `public/maps/turkey-provinces.svg` olarak servis edilir
// (~65 KB, 23 KB gzip) ve yalnızca bu ekran açıldığında bir kez indirilir. Gömseydik
// her ziyaretçinin ana sayfa paketine girerdi.
//
// Kaynak: alpers/Turkey-Maps-GeoJSON (Apache License 2.0), Web Mercator projeksiyonu
// ve Douglas-Peucker sadeleştirmesiyle SVG'ye çevrildi. Lisans metni
// `public/maps/LICENSE-turkey-geojson.txt` içinde tutulur — Apache-2.0 atıf ister.

const MAP_SRC = '/maps/turkey-provinces.svg';
const MAP_W = 1000;
const MAP_H = 422.5;
const MAP_VIEWBOX = `0 0 ${MAP_W} ${MAP_H}`;

export interface MapItem {
  id: string;
  province: string;
  label: string;
  color: string;
  /** Açık ihtiyaç sayısı — aynı ilde birden çok operasyon varsa hangisinin ili temsil edeceğini seçer. */
  weight: number;
  /** Renk tek başına durum anlatmaz: bu cümle hem `title` hem `aria-label` olur. */
  description: string;
}

interface ProvincePath { plate: number; d: string }

export function OperationsMap({ items, selectedId, onSelect, onClear, compact }: {
  items: MapItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Seçimi haritanın kendi üstünden kaldırma. */
  onClear: () => void;
  /** Dar ekran: harita küçüldüğü için etiket SVG biriminde büyütülür. */
  compact?: boolean;
}) {
  const [paths, setPaths] = useState<ProvincePath[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState<{ id: string; x: number; y: number; text: string }[]>([]);
  const groupRef = useRef<SVGGElement | null>(null);
  // Klavye odağı React state'inde tutulur. Tarayıcının kendi odak çerçevesi bir
  // DİKDÖRTGEN çiziyor ve il şekli düzensiz olduğu için etrafında kocaman bir kutu
  // beliriyordu. Odağı kapatmak yerine kendimiz çiziyoruz: kesikli kontur, ilin
  // gerçek sınırını takip eder (rules/04 §Accessibility görünür odak ister).
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(MAP_SRC)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!alive) return;
        // DOMParser ile okunur ve YALNIZCA `d` ile `data-plate` alınır. Dosya kendi
        // sunucumuzdan geliyor ama içerik yine de sayfaya olduğu gibi enjekte
        // edilmez: bir SVG script taşıyabilir (rules/03 §File Uploads mantığı).
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const out: ProvincePath[] = [];
        doc.querySelectorAll('path[data-plate]').forEach((el) => {
          const plate = Number(el.getAttribute('data-plate'));
          const d = el.getAttribute('d');
          if (plate && d) out.push({ plate, d });
        });
        if (out.length === 0) throw new Error('empty map');
        setPaths(out);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Bir ilde birden çok operasyon olabilir (aynı ilde iki yangın). İli en çok açık
  // ihtiyacı olan temsil eder; etiket ve tıklama ona gider, diğerleri açıklamada anılır.
  const byPlate = useMemo(() => {
    const m = new Map<number, MapItem[]>();
    for (const it of items) {
      const plate = plateOf(it.province);
      if (plate == null) continue;
      const list = m.get(plate) ?? [];
      list.push(it);
      m.set(plate, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.weight - a.weight);
    return m;
  }, [items]);

  const placedCount = useMemo(
    () => Array.from(byPlate.values()).reduce((n, l) => n + l.length, 0), [byPlate]);
  const unplaced = items.length - placedCount;

  // Etiket, boyanan ilin gerçek sınırlarının orta noktasına konur. Ölçüm DOM'dan
  // (`getBBox`) alınır: il şekilleri düzensiz, merkezi elle kestirmek etiketi
  // sınırın dışına düşürürdü.
  const fontSize = compact ? 30 : 13;
  useEffect(() => {
    const g = groupRef.current;
    if (!g || !paths) return;
    const next: { id: string; x: number; y: number; text: string }[] = [];
    byPlate.forEach((list, plate) => {
      const el = g.querySelector<SVGPathElement>(`path[data-plate="${plate}"]`);
      if (!el) return;
      const box = el.getBBox();
      const text = list.length > 1
        ? tr.coordDash.mapMulti(list[0].label, list.length - 1)
        : list[0].label;
      // Kenardaki iller (Çanakkale, Hatay) için etiket çerçeveyi taşıyor ve
      // kırpılıyordu — "nakkale" diye okunuyordu. Yazının yarı genişliği kadar
      // içeri çekilir; il boyalı kaldığı için hangi ile ait olduğu yine belli.
      const halfW = text.length * fontSize * 0.29;
      next.push({
        id: list[0].id,
        x: Math.min(MAP_W - halfW - 4, Math.max(halfW + 4, box.x + box.width / 2)),
        y: Math.min(MAP_H - fontSize * 0.7, Math.max(fontSize * 0.7, box.y + box.height / 2)),
        text,
      });
    });
    setLabels(next);
  }, [paths, byPlate, fontSize]);

  if (failed) {
    // Boş bir kutu "operasyon yok" gibi okunur. Harita gelmezse bunu söyleriz;
    // altındaki tablo zaten aynı veriyi taşıyor (rules/04 §Error States).
    return (
      <p style={{ margin: 0, padding: '28px 16px', textAlign: 'center', fontSize: 13, color: C.muted }}>
        {tr.coordDash.mapFailed}
      </p>
    );
  }
  if (!paths) {
    return <div aria-busy="true" style={{ height: 220, borderRadius: 10, background: C.borderFaint }} />;
  }

  return (
    <div style={{ position: 'relative' }}>
      {selectedId && (
        <button
          onClick={onClear}
          className="hv-navy"
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 2,
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', minHeight: 38, boxShadow: '0 1px 4px rgba(16,42,67,.12)',
          }}
        >{tr.coordDash.clearSelection}</button>
      )}
      <svg
        viewBox={MAP_VIEWBOX}
        role="img"
        aria-label={tr.coordDash.mapAria(byPlate.size)}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <g ref={groupRef}>
          {paths.map((p, i) => {
            const list = byPlate.get(p.plate);
            const active = list?.[0];
            const on = !!active && active.id === selectedId;
            const keyFocus = !!active && active.id === focusedId;
            return (
              <path
                key={`${p.plate}-${i}`}
                data-plate={p.plate}
                d={p.d}
                fill={active ? active.color : C.chipNavyBg}
                fillOpacity={active && !on ? 0.92 : 1}
                // İl sınırları her yerde görünür: boyanmamış iller ince gri konturla
                // ayrılır, boyanmış iller beyaz konturla birbirinden kopar (yan yana
                // iki operasyon tek bir leke gibi okunmamalı).
                stroke={on ? C.navy : keyFocus ? C.navy : active ? '#FFFFFF' : C.muted3}
                strokeWidth={on ? 3 : keyFocus ? 2.5 : active ? 1.3 : 0.9}
                strokeDasharray={keyFocus && !on ? '5 3' : undefined}
                strokeLinejoin="round"
                tabIndex={active ? 0 : undefined}
                role={active ? 'button' : undefined}
                aria-pressed={active ? on : undefined}
                aria-label={active ? active.description : undefined}
                onClick={active ? () => onSelect(active.id) : undefined}
                onFocus={active ? () => setFocusedId(active.id) : undefined}
                onBlur={active ? () => setFocusedId(null) : undefined}
                onKeyDown={active ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(active.id); }
                } : undefined}
                // Tarayıcının dikdörtgen odak çerçevesi kapatılır; yerine yukarıdaki
                // kesikli kontur çiziliyor.
                style={{ cursor: active ? 'pointer' : 'default', outline: 'none' }}
              >
                {active && <title>{active.description}</title>}
              </path>
            );
          })}
        </g>
        {/* Etiketler en üstte ve tıklamayı yakalamaz: altındaki il tıklanabilir kalmalı. */}
        <g pointerEvents="none">
          {labels.map((l) => (
            <text
              key={l.id}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                // 1000 birimlik viewBox telefonda ~360px'e sığıyor, yani 13 birim
                // 4-5 piksele iner ve okunmaz. Etiket SVG biriminde büyütülür ki
                // ekrandaki fiziksel boyu her iki ende de yaklaşık aynı kalsın.
                fontSize, fontWeight: 700, fill: C.navy,
                paintOrder: 'stroke', stroke: '#fff',
                strokeWidth: compact ? 7 : 3.5, strokeLinejoin: 'round',
              }}
            >{l.text}</text>
          ))}
        </g>
      </svg>
      {unplaced > 0 && (
        <p style={{ margin: '8px 6px 0', fontSize: 11.5, color: C.muted2 }}>
          {tr.coordDash.mapUnplaced(unplaced)}
        </p>
      )}
    </div>
  );
}
