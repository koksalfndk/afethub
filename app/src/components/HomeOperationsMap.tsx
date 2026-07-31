import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { Ico, DISASTER_ICON } from '../ui';
import { plateOf } from '../trProvinces';
import type { DisasterCard } from '../data';

// Herkese açık ana sayfadaki operasyon haritası.
//
// Koordinatör panosundaki `OperationsMap` ile aynı coğrafyayı kullanır ama AYNI
// bileşen değildir ve bilerek öyle: oradaki harita aciliyet SKORUNA göre boyanıyor,
// o skor `coordinator_overview`'dan geliyor ve koordinatöre özel bir ölçü. Ziyaretçiye
// göstermek, panele ait bir sayıyı herkese açmak olurdu. Buradaki renk, ziyaretçinin
// zaten gördüğü iki şeyden türüyor: operasyon açık mı, kritik ihtiyacı var mı.
//
// Renk tek başına anlam taşımaz (rules/04 §Accessibility): her ilin `title`/`aria-label`
// metni durumu kelimeyle söyler, açılan kart da aynı cümleyi yazar.
//
// Coğrafya `public/maps/turkey-provinces.svg` altından gelir, pakete gömülmez.
// Kaynak: alpers/Turkey-Maps-GeoJSON (Apache-2.0). Lisans metni aynı klasörde durur.

const MAP_SRC = '/maps/turkey-provinces.svg';
const MAP_W = 1000;
const MAP_H = 422.5;
// Açılan kartın genişliği. Yatay sıkıştırma bunu piksel olarak kullanıyor.
const CARD_W = 268;

interface ProvincePath { plate: number; d: string }

type Tone = 'critical' | 'active' | 'closed';

const TONE_COLOR: Record<Tone, string> = {
  critical: C.emergency,
  active: C.orange,
  closed: C.success,
};

function toneOf(card: DisasterCard): Tone {
  if (card.disaster.status !== 'Active') return 'closed';
  return card.topNeeds.some((n) => n.priority === 'Critical') ? 'critical' : 'active';
}

// Bir ilde birden çok operasyon olabilir (Muğla'da iki yangın). İli boyayan renk en
// ağır durumu gösterir; kartta ise operasyonların HEPSİ listelenir, çünkü ilin rengi
// "burada bir şey var" der, hangisi olduğunu söylemez.
const RANK: Record<Tone, number> = { critical: 0, active: 1, closed: 2 };

export function HomeOperationsMap() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [paths, setPaths] = useState<ProvincePath[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openPlate, setOpenPlate] = useState<number | null>(null);
  const [focusedPlate, setFocusedPlate] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; below: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(MAP_SRC)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!alive) return;
        // DOMParser ile okunur ve YALNIZCA `d` ile `data-plate` alınır: dosya kendi
        // sunucumuzdan gelse de sayfaya olduğu gibi enjekte edilmez.
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

  // İl → o ildeki operasyonlar. İl adı kayıttan geliyor ve tanınmayan bir ad sessizce
  // yutulmaz: haritada gösterilemeyen operasyon sayısı kartın altında yazılır.
  const { byPlate, unplaced } = useMemo(() => {
    const map = new Map<number, DisasterCard[]>();
    const missing: DisasterCard[] = [];
    for (const card of a.overview?.disasters ?? []) {
      const plate = plateOf(card.disaster.province);
      if (plate == null) { missing.push(card); continue; }
      map.set(plate, [...(map.get(plate) ?? []), card]);
    }
    for (const [, list] of map) list.sort((x, y) => RANK[toneOf(x)] - RANK[toneOf(y)]);
    return { byPlate: map, unplaced: missing };
  }, [a.overview]);

  const activeProvinces = useMemo(
    () => [...byPlate.values()].filter((list) => list.some((c) => c.disaster.status === 'Active')).length,
    [byPlate],
  );

  const openCards = openPlate == null ? null : byPlate.get(openPlate) ?? null;

  const close = () => { setOpenPlate(null); setAnchor(null); };

  useEffect(() => {
    if (openPlate == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [openPlate]);

  // Kart tıklanan ilin YANINDA açılır. Konum, ilin gerçek sınır kutusundan yüzde
  // olarak hesaplanır; sabit bir köşeye açmak hangi ile ait olduğunu belirsiz
  // bırakırdı.
  //
  // Dikeyde ortalanmıyor: ortalanınca kuzeydeki iller (Kastamonu) için kartın yarısı
  // haritanın üstüne, kart alanının dışına taşıyordu. İl haritanın üst yarısındaysa
  // kart ALTINA, alt yarısındaysa ÜSTÜNE açılır — böylece her zaman harita alanının
  // içinde kalır ve tıklanan ili örtmez.
  const openAt = (plate: number) => {
    if (!byPlate.has(plate)) return;
    const el = groupRef.current?.querySelector<SVGPathElement>(`path[data-plate="${plate}"]`);
    if (el) {
      const box = el.getBBox();
      const cy = ((box.y + box.height / 2) / MAP_H) * 100;
      // Yatay sınır SVG BİRİMİYLE değil, ekranda kapladığı piksel genişliğine göre
      // hesaplanır: kartın yarısı sabit piksel (134), haritanın genişliği ise ekrana
      // göre değişiyor. Sabit bir yüzde eşiği, batıdaki illerde (Çanakkale, Muğla)
      // kartı haritanın solundan taşırıyordu.
      const w = el.ownerSVGElement?.getBoundingClientRect().width ?? 0;
      const pad = w > 0 ? Math.min(48, (CARD_W / 2 / w) * 100) : 14;
      setAnchor({
        x: Math.min(100 - pad, Math.max(pad, ((box.x + box.width / 2) / MAP_W) * 100)),
        y: cy,
        below: cy < 50,
      });
    }
    setOpenPlate(plate);
  };

  if (failed) {
    return (
      <div style={card}>
        <Header count={activeProvinces} />
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted }}>{tr.home.mapFailed}</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <Header count={activeProvinces} />

      <div ref={wrapRef} style={{ position: 'relative', marginTop: 11, flex: 1, minHeight: 0 }}>
        {!paths ? (
          <div aria-busy="true" style={{ height: mob ? 150 : 210, borderRadius: 10, background: C.borderFaint }} />
        ) : (
          <svg
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            role="group"
            aria-label={tr.home.mapAria(activeProvinces)}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            <g ref={groupRef}>
              {paths.map((p) => {
                const list = byPlate.get(p.plate);
                const tone = list ? toneOf(list[0]) : null;
                const on = !!list;
                const open = openPlate === p.plate;
                const focused = focusedPlate === p.plate;
                return (
                  <path
                    key={p.plate}
                    data-plate={p.plate}
                    d={p.d}
                    role={on ? 'button' : undefined}
                    tabIndex={on ? 0 : undefined}
                    aria-label={list ? tr.home.mapProvinceAria(list.length, list[0].disaster.province) : undefined}
                    onClick={on ? () => openAt(p.plate) : undefined}
                    onKeyDown={on ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAt(p.plate); }
                    } : undefined}
                    onFocus={on ? () => setFocusedPlate(p.plate) : undefined}
                    onBlur={on ? () => setFocusedPlate(null) : undefined}
                    fill={tone ? TONE_COLOR[tone] : '#E7EDF3'}
                    stroke={open ? C.navy : focused ? C.navy : '#FFFFFF'}
                    strokeWidth={open ? 2.4 : focused ? 2 : 0.6}
                    strokeDasharray={focused && !open ? '4 3' : undefined}
                    strokeLinejoin="round"
                    style={{
                      cursor: on ? 'pointer' : 'default',
                      // Tarayıcının kendi odak çerçevesi il şeklinin etrafına kocaman bir
                      // DİKDÖRTGEN çiziyor; odağı kapatmıyoruz, kendimiz çiziyoruz.
                      outline: 'none',
                    }}
                  >
                    {list && <title>{tr.home.mapProvinceAria(list.length, list[0].disaster.province)}</title>}
                  </path>
                );
              })}
            </g>
          </svg>
        )}

        {openCards && anchor && (
          // Konumlandırma ile animasyon AYRI elemanlarda.
          //
          // Tek elemanda toplandığında kart açılırken sağa kayıp sonra ortaya
          // zıplıyordu: `.anim-in` giriş animasyonu `transform: none` ile bitiyor ve
          // animasyon süresince satır içi `translateX(-50%)` değerini eziyor. Kart
          // ortalanmamış çiziliyor, animasyon bitince yerine oturuyordu.
          //
          // Dıştaki eleman yalnızca yerleştirme (transform da onda), içteki yalnızca
          // animasyon yapıyor — ikisi artık aynı özelliği paylaşmıyor.
          <div
            style={{
              position: 'absolute', left: `${anchor.x}%`,
              ...(anchor.below
                ? { top: `calc(${anchor.y}% + 14px)` }
                : { bottom: `calc(${100 - anchor.y}% + 14px)` }),
              transform: 'translateX(-50%)', zIndex: 5, width: CARD_W, maxWidth: '94%',
            }}
          >
          <div
            role="dialog"
            aria-label={tr.home.mapCardAria(openCards[0].disaster.province)}
            className="anim-in"
            style={{
              background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 12,
              boxShadow: '0 16px 40px rgba(11,30,48,.22)', padding: '10px 11px 11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: C.muted2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{openCards[0].disaster.province.toLocaleUpperCase('tr')}</span>
              <button
                onClick={close}
                aria-label={tr.shareDisaster.close}
                style={{
                  marginLeft: 'auto', width: 26, height: 26, borderRadius: 8, flex: '0 0 26px',
                  border: `1px solid ${C.borderSoft}`, background: C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              ><Ico n="close" size={13} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {openCards.map((c) => {
                const tone = toneOf(c);
                return (
                  <button
                    key={c.disaster.id}
                    onClick={() => { close(); a.openDisaster(c.disaster.slug); }}
                    className="hv-navy"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderLeft: `3px solid ${TONE_COLOR[tone]}`,
                      borderRadius: 9, padding: '7px 9px', cursor: 'pointer', minHeight: 42,
                    }}
                  >
                    <Ico n={DISASTER_ICON[c.disaster.type]} size={15} color={TONE_COLOR[tone]} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      {/* Ad kırpılmaz, sarmalanır: "Kastamonu Sel ve T…" hangi
                          operasyon olduğunu söylemiyor. */}
                      <span style={{
                        display: 'block', fontSize: 12.5, fontWeight: 600, color: C.navy, lineHeight: 1.3,
                      }}>{c.disaster.name}</span>
                      {/* Durum kelimeyle: renk tek başına anlatmaz. */}
                      <span style={{ display: 'block', fontSize: 11, color: C.muted2 }}>
                        {tr.home.mapChipHint(tone === 'closed', c.activeNeeds)}
                      </span>
                    </span>
                    <Ico n="chev" size={13} color={C.muted3} />
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 11, color: C.muted }}>
        <Legend color={TONE_COLOR.critical} label={tr.home.mapLegendCritical} />
        <Legend color={TONE_COLOR.active} label={tr.home.mapLegendActive} />
        <Legend color={TONE_COLOR.closed} label={tr.home.mapLegendClosed} />
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.muted2 }}>{tr.home.mapHint}</p>
      {/* Haritaya yerleştirilemeyen operasyon sessizce kaybolmaz. */}
      {unplaced.length > 0 && (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: C.warningText }}>
          {tr.home.mapUnplaced(unplaced.length)}
        </p>
      )}
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <i style={{
        width: 7, height: 7, borderRadius: '50%', background: C.emergency,
        boxShadow: '0 0 0 3px rgba(217,54,62,.15)', display: 'inline-block',
      }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', color: C.muted2 }}>
        {tr.home.mapTitle.toLocaleUpperCase('tr')}
      </span>
      <span className="tnum" style={{
        marginLeft: 'auto', background: C.chipNavyBg, borderRadius: 20,
        padding: '2px 8px', fontSize: 10.5, color: C.text,
      }}>{tr.home.mapCount(count)}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <i style={{ width: 9, height: 9, borderRadius: 3, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

const card = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: '13px 14px 14px', display: 'flex', flexDirection: 'column', minWidth: 0,
} as const;
