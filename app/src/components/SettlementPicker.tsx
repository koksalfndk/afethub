import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, G } from '../theme';
import { tr } from '../i18n/strings';
import { Ico } from '../ui';
import { plateOf, foldTr } from '../trProvinces';

// Etkilenen mahalle / köy seçici (afet formu) — açılır çoklu seçim listesi.
//
// Neden serbest metin değil: aynı köy üç kayıtta üç farklı yazımla girilirse hiçbiri
// eşleşmez ve "etkilenen bölge" diye bir liste elde edilemez. Seçici, ilin GERÇEK
// yerleşim listesinden okutuyor; kaydedilen ad her zaman resmî ad.
//
// Neden açılır liste: seçenekler 65'e kadar çıkıyor ve hepsi açıkta durduğunda formun
// yarısını kaplıyordu. Kapalıyken tek satır, açıkken kendi içinde kayan bir kutu.
//
// Panel `document.body` üzerine bir portal ile çiziliyor (Picker ile aynı sebep):
// çekmecenin gövdesi `overflow-y: auto` ve mutlak konumlu bir panel orada kırpılırdı.
//
// Erişilebilirlik (rules/04): tetikleyici gerçek bir düğme, panel `role="listbox"
// aria-multiselectable`, her satır `role="option" aria-selected`. Escape kapatır ve
// odak tetikleyiciye döner.
//
// Veri `public/data/settlements/<plaka>.json` altından, sayfa başına tek dosya
// (Muğla 7 KB). Çalışma anında üçüncü tarafa istek YOK — haritalarda olduğu gibi
// kendi sunucumuzdan. Kaynak: TurkiyeAPI (MIT), bkz. o klasördeki README.

interface DistrictEntry { m: string[]; k: string[] }
type ProvinceData = Record<string, DistrictEntry>;

const MAX_LIST_H = 320;
const MIN_LIST_H = 190;

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
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxH: number; above: boolean } | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  const close = (focusBack = false) => {
    setOpen(false); setQuery('');
    if (focusBack) btnRef.current?.focus();
  };

  // Paneli tetikleyiciye demirle. Kaydırmada kapanmak yerine yeniden konumlanır:
  // kapanmak, uzun bir formda kullanıcının yerini kaybettirir.
  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < MIN_LIST_H && above > below;
    setRect({
      top: flip ? r.top : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxH: Math.max(MIN_LIST_H, Math.min(MAX_LIST_H, (flip ? above : below) - 4)),
      above: flip,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Seçilecek bir şey yoksa açılır liste hiç çizilmez; yerine NEDEN olmadığı yazılır.
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
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr.coordDisasters.settlementToggleAria}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: C.surface, border: `1px solid ${open ? C.navy : C.borderSoft}`,
          borderRadius: 9, padding: '0 12px', minHeight: 46, width: '100%',
          fontSize: 14, fontWeight: 500, textAlign: 'left',
          color: value.length > 0 ? C.navy : C.muted3, cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* Kapalıyken de KAÇ TANE seçildiği okunur: kutuyu açmadan bilinmeli. */}
          {value.length === 0
            ? tr.coordDisasters.settlementEmptyTrigger(options.length)
            : tr.coordDisasters.settlementCount(value.length, options.length)}
        </span>
        <span style={{ display: 'flex', flex: '0 0 auto', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .12s ease-out' }}>
          <Ico n="down" size={15} color={C.muted2} />
        </span>
      </button>

      {unmatchedDistricts.length > 0 && (
        <p style={{ ...note, color: C.warningText, margin: '7px 0 0' }}>
          {tr.coordDisasters.settlementUnmatched(unmatchedDistricts.join(', '))}
        </p>
      )}

      {/* Seçilenler kapalıyken de görünür: onay kutusunu kaldırmak için listeyi
          yeniden açmak gerekmesin. */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {value.map((x) => (
            <span key={x} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
              background: C.chipNavyBg, border: `1px solid ${C.border}`, borderRadius: 20,
              padding: '2px 4px 2px 10px', color: C.text,
            }}>
              {x}
              <button
                type="button"
                onClick={() => toggle(x)}
                aria-label={tr.coordDisasters.settlementRemove(x)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', border: 0,
                  background: 'none', color: C.muted, cursor: 'pointer',
                }}
              ><Ico n="close" size={12} color={C.muted} /></button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} style={{
            background: 'none', border: 0, color: C.muted, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'underline', minHeight: 26, padding: '0 4px',
          }}>{tr.coordDisasters.settlementClear}</button>
        </div>
      )}

      {open && rect && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={tr.coordDisasters.settlementToggleAria}
          style={{
            position: 'fixed', zIndex: 200,
            left: rect.left, width: Math.max(rect.width, 220),
            ...(rect.above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top }),
            background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 11,
            boxShadow: '0 14px 38px rgba(11,30,48,.18)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', maxHeight: rect.maxH,
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${C.borderFaint}`, background: G.chip, flex: '0 0 auto' }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 7, background: C.surface,
              border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: '0 10px', height: 38,
            }}>
              <Ico n="search" size={14} color={C.muted2} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr.coordDisasters.settlementSearch}
                aria-label={tr.coordDisasters.settlementSearch}
                autoComplete="off"
                style={{ border: 0, outline: 'none', background: 'none', fontSize: 13.5, color: C.navy, width: '100%', minWidth: 0 }}
              />
            </span>
          </div>

          <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: 5, minHeight: 0 }}>
            {visible.length === 0 && (
              <div style={{ padding: '12px 10px', fontSize: 13, color: C.muted }}>
                {tr.coordDisasters.settlementNoMatch}
              </div>
            )}
            {visible.map((o) => {
              const on = selected.has(foldTr(o.name));
              return (
                <label
                  key={`${o.district}-${o.kind}-${o.name}`}
                  role="option"
                  aria-selected={on}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                    borderRadius: 8, cursor: 'pointer', minHeight: 40,
                    background: on ? C.chipNavyBg : 'transparent',
                    color: on ? C.navy : C.text, fontSize: 13.5, fontWeight: on ? 600 : 500,
                  }}
                >
                  {/* Gerçek onay kutusu: seçili olma durumu renge değil, işaretli bir
                      kutuya bağlı ve klavyeyle boşluk tuşuyla değiştirilebiliyor. */}
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(o.name)}
                    style={{ width: 17, height: 17, accentColor: C.navy, flex: '0 0 17px', cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.name}
                  </span>
                  {/* Mahalle mi köy mü — renk değil, harf. */}
                  <span style={{ fontSize: 10.5, color: C.muted2, flex: '0 0 auto' }}>
                    {o.kind === 'k' ? tr.coordDisasters.settlementVillage : tr.coordDisasters.settlementNeighbourhood}
                  </span>
                </label>
              );
            })}
          </div>

          <div style={{
            flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderTop: `1px solid ${C.borderFaint}`, background: C.canvas,
          }}>
            <span style={{ fontSize: 12, color: C.muted2 }}>
              {tr.coordDisasters.settlementCount(value.length, options.length)}
            </span>
            <button type="button" onClick={() => close(true)} className="hv-navy" style={{
              marginLeft: 'auto', background: C.surface, border: `1px solid ${C.borderSoft}`,
              color: C.navy, borderRadius: 8, padding: '6px 12px', fontSize: 12.5,
              fontWeight: 600, cursor: 'pointer', minHeight: 34,
            }}>{tr.coordDisasters.settlementDone}</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const note = { margin: '0 0 8px', fontSize: 12.5, color: C.muted } as const;
