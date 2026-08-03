import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { trPledges } from '../i18n/coordPledges';
import { C, PRI } from '../theme';
import { cols } from '../select';
import { eyebrow, Ico, StatCard, PriorityBadge, inputStyle, type IcoName } from '../ui';
import { Picker } from '../components/Picker';
import { overdueLabel, PLEDGE_PAGE_SIZE } from '../data';
import type { CoordPledgeRow, PledgeStatus, PledgeView } from '../types';

// Detay çekmecesi ağır: durum geçişleri, iletişim açma paneli ve bağlama listesi
// birlikte geliyor. Bir satıra tıklanana kadar İNMİYOR (direktif §34).
const PledgeDrawer = lazy(() => import('../components/PledgeDrawer').then((m) => ({ default: m.PledgeDrawer })));

// ---------------------------------------------------------------------------
// Durum rozeti — renk TEK BAŞINA anlam taşımıyor: ikon + metin birlikte.
// ---------------------------------------------------------------------------
const STATUS_TONE: Record<PledgeStatus, { bg: string; border: string; fg: string; icon: IcoName }> = {
  pledged:            { bg: '#EEF4FB', border: '#CFE0F2', fg: '#2A6FB0', icon: 'pending' },
  confirmed:          { bg: '#EFF6FB', border: '#CBE0F0', fg: '#1E5C93', icon: 'shield' },
  in_transit:         { bg: '#FFF8E5', border: '#F2DFA8', fg: '#8A6100', icon: 'pending' },
  delivered_reported: { bg: '#FFF4E8', border: '#F2D2A8', fg: '#8A4A00', icon: 'need' },
  fulfilled:          { bg: '#EAF7EF', border: '#C9E9D6', fg: '#157F3E', icon: 'verified' },
  cancelled:          { bg: C.canvas, border: C.borderSoft, fg: C.muted, icon: 'critical' },
  expired:            { bg: C.canvas, border: C.borderSoft, fg: C.muted, icon: 'pending' },
};

export function PledgeStatusBadge({ s }: { s: PledgeStatus }) {
  const t = STATUS_TONE[s] ?? STATUS_TONE.pledged;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg,
      border: `1px solid ${t.border}`, borderRadius: 20, padding: '4px 9px',
    }}>
      <Ico n={t.icon} size={12} color={t.fg} />
      {tr.support.statusLabel[s] ?? s}
    </span>
  );
}

// Gecikme AYRI bir rozet: sözün durumunu değiştirmiyor, yanına ekleniyor.
function OverdueBadge({ minutes }: { minutes: number | null }) {
  if (minutes == null) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: 700, color: C.errorText, background: '#FEF3F2',
      border: '1px solid #F6C9C9', borderRadius: 20, padding: '4px 9px',
    }}>
      <Ico n="critical" size={12} color={C.errorText} />
      {overdueLabel(minutes)}
    </span>
  );
}

function etaText(iso: string): string {
  if (!iso) return trPledges.noEta;
  const d = new Date(iso);
  // Operasyonun saat dilimi tek yerde: sunucu da `Europe/Istanbul` kullanıyor.
  return d.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const VIEWS: PledgeView[] = ['all', 'today', 'upcoming', 'overdue', 'transit', 'reported', 'done', 'cancelled', 'expired'];

export function CoordPledges() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const f = a.pledgeFilter;

  // Açık kaydın detayı çekmece açıldığında yükleniyor; liste satırı yeterli değil
  // (detayda ihtiyaç miktarları ve bağlı bildirim de var).
  useEffect(() => {
    if (a.pledgeOpenId) a.loadPledgeDetail(a.pledgeOpenId);
    // `a` bilerek dışarıda: her render'da yeni bir nesne ve efekt sonsuz döner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.pledgeOpenId]);

  const operations = useMemo(
    () => (a.snap?.disasters ?? []).map((d) => ({ value: d.id, label: d.name })),
    [a.snap?.disasters],
  );

  const s = a.pledgeSummary;
  // Kart sırası operasyonel öncelik: önce geciken (direktif §6).
  const cards: { key: string; label: string; hint: string; value: number; accent: string; icon: IcoName; view: PledgeView; primary?: boolean }[] = [
    { key: 'overdue',  label: trPledges.cards.overdue,   hint: trPledges.cards.overdueHint,   value: s?.overdue ?? 0,   accent: C.emergency, icon: 'critical', view: 'overdue',  primary: true },
    { key: 'today',    label: trPledges.cards.today,     hint: trPledges.cards.todayHint,     value: s?.today ?? 0,     accent: C.navy,      icon: 'pending',  view: 'today',    primary: true },
    { key: 'reported', label: trPledges.cards.reported,  hint: trPledges.cards.reportedHint,  value: s?.reported ?? 0,  accent: C.warning,   icon: 'need',     view: 'reported', primary: true },
    { key: 'transit',  label: trPledges.cards.transit,   hint: trPledges.cards.transitHint,   value: s?.transit ?? 0,   accent: C.info,      icon: 'activity', view: 'transit' },
    { key: 'cancel',   label: trPledges.cards.cancelled, hint: trPledges.cards.cancelledHint, value: s?.cancelled ?? 0, accent: C.muted2,    icon: 'critical', view: 'cancelled' },
  ];

  const from = f.page * PLEDGE_PAGE_SIZE + 1;
  const to = Math.min((f.page + 1) * PLEDGE_PAGE_SIZE, a.pledgeTotal);
  const hasFilters = f.disasterId !== '' || f.city !== '' || f.search !== '' || f.view !== 'all' || f.sort !== 'operational';

  return (
    <div>
      <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>
        {trPledges.title}
      </h1>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 6px' }}>{trPledges.lead}</p>
      {/* Sayfanın en çok yanlış okunabilecek cümlesi en üstte, bir kez. */}
      <p style={{ fontSize: 12.5, color: C.muted2, margin: '0 0 18px', lineHeight: 1.5 }}>
        {trPledges.note}
      </p>

      {/* Özet kartları — tıklanınca görünüm filtresine dönüşüyorlar. */}
      <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fit, minmax(190px,1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map((c) => (
          <button
            key={c.key} type="button"
            onClick={() => a.setPledgeFilter({ view: c.view })}
            aria-pressed={f.view === c.view}
            style={{
              textAlign: 'left', cursor: 'pointer', padding: 0, border: 0, background: 'none',
              outline: f.view === c.view ? `2px solid ${c.accent}` : undefined,
              outlineOffset: 2, borderRadius: 12, minHeight: 48,
            }}
          >
            <StatCard label={c.label} value={c.value} hint={c.hint} accent={c.accent} icon={c.icon} primary={c.primary} />
          </button>
        ))}
      </div>

      {/* Görünüm sekmeleri. Seçim SORGUYA gidiyor; tarayıcıda gizleme yok. */}
      <div role="tablist" aria-label={trPledges.title}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map((v) => {
          const on = f.view === v;
          return (
            <button
              key={v} type="button" role="tab" aria-selected={on}
              onClick={() => a.setPledgeFilter({ view: v })}
              style={{
                background: on ? C.navy : C.surface, border: `1px solid ${on ? C.navy : C.borderSoft}`,
                color: on ? '#fff' : C.heading2, borderRadius: 20, padding: '10px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44,
              }}
            >{trPledges.views[v]}</button>
          );
        })}
      </div>
      {f.view === 'upcoming' && (
        <p style={{ ...eyebrow, marginBottom: 10 }}>{trPledges.upcomingWindow}</p>
      )}

      {/* Arama ve filtreler */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 14, marginBottom: 14, display: 'grid', gap: 10,
        gridTemplateColumns: mob ? '1fr' : 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)',
      }}>
        <label style={{ display: 'block' }}>
          <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trPledges.search}</span>
          <input
            value={f.search}
            onChange={(e) => a.setPledgeFilter({ search: e.target.value })}
            type="search" placeholder={trPledges.search}
            style={{ ...inputStyle, minHeight: 46 }}
          />
          <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
            {trPledges.searchHint}
          </span>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trPledges.filterOperation}</span>
          <Picker
            value={f.disasterId}
            onChange={(v) => a.setPledgeFilter({ disasterId: v })}
            options={[{ value: '', label: trPledges.filterAll }, ...operations]}
          />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trPledges.sortLabel}</span>
          <Picker
            value={f.sort}
            onChange={(v) => a.setPledgeFilter({ sort: v as typeof f.sort })}
            options={Object.entries(trPledges.sorts).map(([value, label]) => ({ value, label }))}
          />
        </label>
        {hasFilters && (
          <button type="button" onClick={() => a.setPledgeFilter({ view: 'all', disasterId: '', city: '', search: '', sort: 'operational', page: 0 })}
            style={{ justifySelf: 'start', background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', minHeight: 44 }}>
            {trPledges.clearFilters}
          </button>
        )}
      </div>

      {a.pledgeError ? (
        <div role="alert" style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, color: C.errorText, fontWeight: 600 }}>{a.pledgeError}</div>
          <button type="button" onClick={a.reloadPledges} className="hv-navy" style={{
            marginTop: 10, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{trPledges.retry}</button>
        </div>
      ) : a.pledgeLoading && a.pledgeRows.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, fontSize: 14, color: C.muted }}>
          {tr.common.loading}
        </div>
      ) : a.pledgeRows.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.heading2 }}>
            {trPledges.empty[f.view] ?? trPledges.empty.all}
          </div>
        </div>
      ) : mob ? (
        <MobileList rows={a.pledgeRows} onOpen={a.openPledge} />
      ) : (
        <DesktopTable rows={a.pledgeRows} onOpen={a.openPledge} />
      )}

      {a.pledgeTotal > PLEDGE_PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" disabled={f.page === 0}
            onClick={() => a.setPledgeFilter({ page: Math.max(0, f.page - 1) })}
            style={pagerStyle(f.page === 0)}>{trPledges.prev}</button>
          <span className="tnum" style={{ fontSize: 13, color: C.muted }}>
            {trPledges.pageInfo(from, to, a.pledgeTotal)}
          </span>
          <button type="button" disabled={to >= a.pledgeTotal}
            onClick={() => a.setPledgeFilter({ page: f.page + 1 })}
            style={pagerStyle(to >= a.pledgeTotal)}>{trPledges.next}</button>
        </div>
      )}

      <Suspense fallback={null}>
        {a.pledgeOpenId && <PledgeDrawer />}
      </Suspense>
    </div>
  );
}

const pagerStyle = (disabled: boolean) => ({
  background: C.surface, border: `1px solid ${C.borderSoft}`,
  color: disabled ? C.muted3 : C.navy, borderRadius: 9, padding: '0 14px',
  height: 44, fontSize: 13.5, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
});

// ---------------------------------------------------------------------------
// Masaüstü: yoğun ama okunabilir tablo
// ---------------------------------------------------------------------------
function DesktopTable({ rows, onOpen }: { rows: CoordPledgeRow[]; onOpen: (id: string) => void }) {
  const th: React.CSSProperties = {
    ...eyebrow, textAlign: 'left', padding: '10px 12px',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 13.5, verticalAlign: 'top',
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {trPledges.title}
        </caption>
        <thead>
          <tr>
            <th scope="col" style={th}>{trPledges.colCode}</th>
            <th scope="col" style={th}>{trPledges.colNeed}</th>
            <th scope="col" style={th}>{trPledges.colQty}</th>
            <th scope="col" style={th}>{trPledges.colLocation}</th>
            <th scope="col" style={th}>{trPledges.colEta}</th>
            <th scope="col" style={th}>{trPledges.colStatus}</th>
            <th scope="col" style={th}>{trPledges.colContact}</th>
            <th scope="col" style={th}>{trPledges.colAction}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>
                <span className="tnum" style={{ fontWeight: 700, color: C.navy }}>{r.code}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 2 }}>
                  {r.disasterName}
                </span>
              </td>
              <td style={td}>
                <span style={{ display: 'block', fontWeight: 600, color: C.heading2 }}>{r.needName}</span>
                <span style={{ display: 'inline-block', marginTop: 4 }}><PriorityBadge p={r.needPriority} /></span>
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap' }} className="tnum">{r.qty} {r.unit}</td>
              <td style={td}>{r.locationName || '—'}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }} className="tnum">{etaText(r.estimatedAt)}</td>
              <td style={td}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <PledgeStatusBadge s={r.status} />
                  <OverdueBadge minutes={r.overdueMinutes} />
                </div>
              </td>
              {/* MASKELİ. Tam bilgi yalnızca detay panelinden, gerekçeyle. */}
              <td style={td}>
                <span style={{ display: 'block', color: C.heading2 }}>{r.contactMasked || '—'}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted2 }}>{r.emailMasked}</span>
                {r.city && <span style={{ display: 'block', fontSize: 12, color: C.muted2 }}>{r.city}</span>}
              </td>
              <td style={td}>
                <button type="button" onClick={() => onOpen(r.id)} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                  borderRadius: 9, padding: '0 13px', height: 44, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{trPledges.open}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobil: tablo küçültülmüyor, kart kullanılıyor
// ---------------------------------------------------------------------------
function MobileList({ rows, onOpen }: { rows: CoordPledgeRow[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.id} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${r.overdueMinutes != null ? C.emergency : (PRI[r.needPriority] ?? PRI.Normal).bar}`,
          borderRadius: 12, padding: 14,
        }}>
          {/* Sıra: ihtiyaç → miktar → durum → zaman → gecikme → nokta → kod */}
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{r.needName}</div>
          <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: C.heading2, marginTop: 2 }}>
            {r.qty} {r.unit}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <PledgeStatusBadge s={r.status} />
            <OverdueBadge minutes={r.overdueMinutes} />
          </div>
          <div className="tnum" style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>{etaText(r.estimatedAt)}</div>
          {r.locationName && (
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{r.locationName}</div>
          )}
          <div className="tnum" style={{ fontSize: 12, color: C.muted2, marginTop: 6 }}>
            {r.code} · {r.disasterName}
          </div>
          <button type="button" onClick={() => onOpen(r.id)} className="hv-navy" style={{
            marginTop: 12, width: '100%', background: C.surface, border: `1px solid ${C.borderSoft}`,
            color: C.navy, borderRadius: 9, minHeight: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{trPledges.open}</button>
        </div>
      ))}
    </div>
  );
}

export { etaText };
