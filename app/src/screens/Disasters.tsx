import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, PRI } from '../theme';
import { Ico } from '../ui';
import { DisasterOpCard, worstPriority } from '../components/DisasterOpCard';
import type { DisasterType } from '../types';

// /afetler — bütün operasyonların listesi.
//
// Neden ayrı bir sayfa: ana sayfa dört kart gösteriyor ve beşincisi "tümünü gör"ün
// arkasındaydı. O düğme bir rotaya değil, aynı ızgarayı büyüten bir duruma
// gidiyordu — altı operasyonla çalışır, yirmi operasyonla çalışmaz. Bir de
// paylaşılabilirlik sorunu vardı: "tüm afetler" görünümünün adresi yoktu,
// kimse bağlantısını gönderemiyordu (rules/09: her ekran gerçek bir yol olmalı).
//
// Ana sayfadan farkı: burası bir KARAR ekranı değil, bir ARAMA ekranı. Kahraman
// yok, eylem kartları yok, süreç anlatımı yok. Süzgeç burada var çünkü burada
// gerçekten bir liste taranıyor; ana sayfada aynı süzgeç, olmayan bir sorunun
// çözümü olurdu.
//
// Kapanmış operasyonlar VARSAYILAN OLARAK GİZLİ değil, sadece sona alınıyor ve
// süzgeçle ayrılabiliyor: bir operasyonun kapandığını görebilmek, platformun
// çalıştığının kanıtı — gizlemek o kanıtı siler.

const TYPE_ORDER: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];
type StatusFilter = 'active' | 'closed' | 'all';

function chip(active: boolean) {
  return {
    background: active ? C.navy : C.surface,
    border: `1px solid ${active ? C.navy : C.borderSoft}`,
    color: active ? '#fff' : C.heading2,
    borderRadius: 999, padding: '0 14px', minHeight: 44,
    fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  };
}

export function Disasters() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const ov = a.overview;

  const [q, setQ] = useState('');
  const [type, setType] = useState<DisasterType | ''>('');
  const [status, setStatus] = useState<StatusFilter>('active');

  if (!ov) return <div style={{ padding: 40, color: C.muted }}>{tr.common.loading}</div>;

  const t = tr.disasters;
  const needle = q.trim().toLocaleLowerCase('tr');

  const matches = ov.disasters.filter((c) => {
    const d = c.disaster;
    const isActive = d.status === 'Active';
    if (status === 'active' && !isActive) return false;
    if (status === 'closed' && isActive) return false;
    if (type && d.type !== type) return false;
    if (!needle) return true;
    // Ad, il ve bölge birlikte aranır: kullanıcı "Muğla" da yazabilir
    // "Seydikemer" de, ikisi de aynı operasyonu bulmalı.
    return [d.name, d.province, d.region].some((v) => (v ?? '').toLocaleLowerCase('tr').includes(needle));
  });

  // Açık olanlar önce; sonra öncelik, sonra kalan miktar. Kapanmış operasyonlar
  // silinmiyor, sona iniyor.
  const list = matches.slice().sort((x, y) =>
    (x.disaster.status === 'Active' ? 0 : 1) - (y.disaster.status === 'Active' ? 0 : 1)
    || (PRI[worstPriority(x)] ?? PRI.Normal).rank - (PRI[worstPriority(y)] ?? PRI.Normal).rank
    || y.remainingTotal - x.remainingTotal);

  // Süzgeç çubuğunda yalnızca GERÇEKTEN VAR OLAN türler listelenir. Seçilince boş
  // liste gösteren bir seçenek sunmak, kullanıcıya olmayan bir yol göstermektir.
  const presentTypes = TYPE_ORDER.filter((x) => ov.disasters.some((c) => c.disaster.type === x));
  const filtered = Boolean(needle) || Boolean(type) || status !== 'active';

  const clearAll = () => { setQ(''); setType(''); setStatus('active'); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: mob ? 20 : 26 }}>
      <header>
        <h1 style={{
          fontSize: mob ? 27 : 34, fontWeight: 800, letterSpacing: '-.025em',
          margin: 0, color: C.navy, lineHeight: 1.15,
        }}>{t.title}</h1>
        <p style={{
          margin: '8px 0 0', fontSize: mob ? 14.5 : 16, color: C.muted, maxWidth: '68ch',
        }}>{t.lead}</p>
      </header>

      {/* ---- Süzgeçler --------------------------------------------------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, minHeight: 48,
          background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 12,
          padding: '0 14px', maxWidth: mob ? '100%' : 460,
        }}>
          <Ico n="search" size={17} color={C.muted} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            type="search" autoComplete="off"
            placeholder={t.searchPh} aria-label={t.searchPh}
            style={{
              border: 0, background: 'none', outline: 'none', width: '100%', minWidth: 0,
              fontSize: 15, color: C.navy,
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {/* Durum: tek seçim, biri her zaman açık. */}
          <button onClick={() => setStatus('active')} style={chip(status === 'active')}>{t.fActive}</button>
          <button onClick={() => setStatus('closed')} style={chip(status === 'closed')}>{t.fClosed}</button>
          <button onClick={() => setStatus('all')} style={chip(status === 'all')}>{t.fAll}</button>
        </div>

        {presentTypes.length > 1 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button onClick={() => setType('')} style={chip(type === '')}>{t.fAllTypes}</button>
            {presentTypes.map((x) => (
              <button key={x} onClick={() => setType(x)} style={chip(type === x)}>{disasterTypeLabel[x]}</button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="tnum" style={{ fontSize: 13.5, color: C.muted, fontWeight: 600 }}>
            {t.count(list.length, ov.disasters.length)}
          </span>
          {filtered && (
            <button onClick={clearAll} className="lnk" style={{
              background: 'none', border: 0, padding: '6px 2px', font: 'inherit',
              fontSize: 13.5, fontWeight: 700, color: C.info, cursor: 'pointer', minHeight: 40,
            }}>{t.clear}</button>
          )}
        </div>
      </div>

      {/* ---- Liste -------------------------------------------------------- */}
      {list.length === 0 ? (
        <div style={{
          background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 14,
          padding: mob ? '30px 20px' : '48px 28px', textAlign: 'center',
        }}>
          <div style={{ fontSize: mob ? 16 : 18, fontWeight: 800, color: C.heading2 }}>
            {filtered ? t.emptyFiltered : t.empty}
          </div>
          <p style={{ margin: '8px auto 0', fontSize: 14, color: C.muted, maxWidth: '54ch' }}>
            {filtered ? t.emptyFilteredBody : t.emptyBody}
          </p>
          {filtered && (
            <button onClick={clearAll} className="hv-navy hv-press" style={{
              marginTop: 16, background: C.surface, border: `1px solid ${C.borderSoft}`,
              color: C.navy, borderRadius: 10, height: 46, padding: '0 18px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>{t.clear}</button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: mob ? 12 : 20,
          gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))',
        }}>
          {list.map((c) => <DisasterOpCard key={c.disaster.id} card={c} />)}
        </div>
      )}

      {/* Yayında olmayan bir afet için kapı. Liste boş olsun ya da olmasın burada
          duruyor: aradığını bulamayan ziyaretçinin bir sonraki adımı bu. */}
      <div style={{
        background: C.chipNavyBg, border: `1px dashed ${C.borderSoft}`, borderRadius: 14,
        padding: mob ? 18 : '22px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.heading2 }}>{tr.home.reportCardTitle}</div>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: C.muted, maxWidth: '52ch' }}>{tr.home.reportCardBody}</p>
        </div>
        <button onClick={a.openDisasterForm} className="hv-press" style={{
          background: 'linear-gradient(180deg,#E1454C 0%,#D9363E 55%,#C22B33 100%)',
          border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
          height: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>{tr.home.hero.ctaReport}</button>
      </div>
    </div>
  );
}
