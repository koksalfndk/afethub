import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { cols } from '../select';
import { ProgressBar, StatCard, Ico, DISASTER_ICON, type IcoName } from '../ui';
import { OperationsMap, type MapItem } from '../components/OperationsMap';
import { plateOf } from '../trProvinces';
import type { CoordDisasterRow } from '../data';
import type { DisasterType } from '../types';
import { useAuth } from '../auth';

// Koordinasyon paneli — TÜM afetler.
//
// Bu ekran bilerek tek bir "aktif operasyon" tanımıyor. Koordinatörün erişebildiği
// her operasyon aynı yerde durur; tek bir olayın içine girmek ayrı bir sayfadır
// (/koordinasyon/afet/<slug>). Bir önceki sürüm yalnızca yüklü snapshot'ı
// gösteriyordu, yani ikinci bir afet açıldığında panel onu hiç görmüyordu.
//
// Buradaki hiçbir sayı ham satırlardan yeniden hesaplanmaz: hepsi
// coordinator_overview() RPC'sinden gelir (migration 0025). Şerit toplamları
// yalnızca sunucunun operasyon başına verdiği sayıların GÖRÜNTÜ amaçlı toplamıdır
// (CLAUDE.md §Source of Truth).

const nf = new Intl.NumberFormat('tr-TR');

// Bu eşiğin üstündeki operasyon "müdahale gerek" bandına çıkar. Skorun kendisi
// veritabanında (afethub_urgency_score); eşik bir sunum kararı olduğu için burada.
const ACTION_THRESHOLD = 80;
const BUSY_THRESHOLD = 50;

function urgencyColor(u: number): string {
  if (u >= ACTION_THRESHOLD) return C.emergency;
  if (u >= BUSY_THRESHOLD) return C.orange;
  if (u > 0) return C.info;
  return C.success;
}

// Durum HER ZAMAN metinle de söylenir; renk tek başına hiçbir şey anlatmaz
// (rules/04 §Accessibility).
function urgencyLabel(row: CoordDisasterRow): string {
  if (row.status !== 'Active') return row.status === 'Resolved' ? tr.coordDash.stateResolved : tr.coordDash.stateArchived;
  if (row.urgency >= ACTION_THRESHOLD) return tr.coordDash.stateAction;
  if (row.urgency >= BUSY_THRESHOLD) return tr.coordDash.stateBusy;
  if (row.deliveryPoints === 0) return tr.coordDash.stateSetup;
  return tr.coordDash.stateSteady;
}

function sinceLabel(iso: string | null): string {
  if (!iso) return tr.coordDash.noActivity;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return tr.coordDash.noActivity;
  const min = Math.floor(ms / 60000);
  if (min < 1) return tr.coordDash.justNow;
  if (min < 60) return tr.coordDash.minsAgo(min);
  const hours = Math.floor(min / 60);
  if (hours < 24) return tr.coordDash.hoursAgo(hours);
  return tr.coordDash.daysAgo(Math.floor(hours / 24));
}

const fulfilment = (r: CoordDisasterRow): number =>
  (r.requiredTotal > 0 ? Math.min(100, Math.round((r.verifiedTotal / r.requiredTotal) * 100)) : 0);

export function CoordHome() {
  const a = useApp();
  const auth = useAuth();
  const L = cols(a.device === 'mobile');
  const mob = a.device === 'mobile';
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'action' | 'active' | 'other'>('all');

  const rows = useMemo(() => a.coordOverview?.disasters ?? [], [a.coordOverview]);

  // Şerit toplamları: sunucunun operasyon başına verdiği sayıların toplamı.
  const totals = useMemo(() => {
    const t = {
      disasters: rows.length,
      active: rows.filter((r) => r.status === 'Active').length,
      needAction: rows.filter((r) => r.status === 'Active' && r.urgency >= ACTION_THRESHOLD).length,
      critical: 0, pending: 0, sla: 0, decidedToday: 0,
      required: 0, verified: 0, openNeeds: 0,
      volunteers: 0, pendingVolunteers: 0, points: 0, pointsAtCapacity: 0, pointsUnknown: 0,
    };
    for (const r of rows) {
      t.critical += r.criticalNeeds; t.pending += r.pendingSubs; t.sla += r.slaBreached;
      t.decidedToday += r.decidedToday; t.required += r.requiredTotal; t.verified += r.verifiedTotal;
      t.openNeeds += r.openNeeds; t.volunteers += r.volunteers; t.pendingVolunteers += r.pendingVolunteers;
      t.points += r.deliveryPoints; t.pointsAtCapacity += r.pointsAtCapacity; t.pointsUnknown += r.pointsCapacityUnknown;
    }
    return t;
  }, [rows]);

  // Harita artık ilin KENDİSİNİ boyuyor, o yüzden koordinat gerekmiyor: tanınan bir
  // il adı yeten tek şey. Bu, koordinatı girilmemiş operasyonların haritadan
  // düşmesi sorununu da ortadan kaldırdı.
  const mapItems: MapItem[] = useMemo(() => rows.map((r) => ({
    id: r.id,
    province: r.province,
    label: r.province || r.name,
    color: urgencyColor(r.urgency),
    weight: r.openNeeds,
    description: tr.coordDash.markerDesc(r.name, urgencyLabel(r), r.urgency, r.openNeeds),
  })), [rows]);

  const mappable = useMemo(() => mapItems.filter((m) => plateOf(m.province) != null).length, [mapItems]);

  const visible = useMemo(() => {
    if (selected) return rows.filter((r) => r.id === selected);
    if (statusFilter === 'action') return rows.filter((r) => r.status === 'Active' && r.urgency >= ACTION_THRESHOLD);
    if (statusFilter === 'active') return rows.filter((r) => r.status === 'Active');
    if (statusFilter === 'other') return rows.filter((r) => r.status !== 'Active');
    return rows;
  }, [rows, selected, statusFilter]);

  const queue = useMemo(() => (selected
    ? a.coordQueue.filter((q) => q.disasterId === selected)
    : a.coordQueue), [a.coordQueue, selected]);

  const alerts = useMemo(() => buildAlerts(rows), [rows]);

  // Aynı gerekçe store'daki `isCoord` ile: oturum katmanı kapalıyken (Supabase yok)
  // rol aramak, paneli geliştirme ortamında erişilemez yapar.
  const noAccess = auth.enabled
    && auth.profile?.role !== 'coordinator' && auth.profile?.role !== 'admin';

  if (noAccess) {
    return <Notice tone="info" title={tr.coordDash.noAccessTitle} body={tr.coordDash.noAccessBody} />;
  }
  if (a.coordOverviewError) {
    return (
      <Notice tone="error" title={tr.coordDash.errorTitle} body={tr.coordDash.errorBody}
        action={{ label: tr.common.retry, onClick: () => a.reloadCoordDashboard() }} />
    );
  }
  if (a.coordOverviewLoading && rows.length === 0) return <Skeleton mob={mob} />;
  if (rows.length === 0) {
    return <Notice tone="info" title={tr.coordDash.emptyTitle} body={tr.coordDash.emptyBody} />;
  }

  const overallPct = totals.required > 0 ? Math.round((totals.verified / totals.required) * 100) : 0;

  const cards: { label: string; value: string; hint: string; accent: string; icon: IcoName; onClick?: () => void }[] = [
    { label: tr.coordDash.cardOperations, value: nf.format(totals.disasters), accent: C.navy, icon: 'activity',
      hint: tr.coordDash.cardOperationsHint(totals.active, totals.disasters - totals.active) },
    { label: tr.coordDash.cardCritical, value: nf.format(totals.critical), accent: C.emergency, icon: 'critical',
      hint: tr.coordDash.cardCriticalHint },
    { label: tr.coordDash.cardPending, value: nf.format(totals.pending), accent: C.warning, icon: 'pending',
      hint: totals.sla > 0 ? tr.coordDash.cardPendingSla(totals.sla, a.coordOverview?.slaHours ?? 24) : tr.coordDash.cardPendingHint },
    { label: tr.coordDash.cardToday, value: nf.format(totals.decidedToday), accent: C.success, icon: 'verified',
      hint: tr.coordDash.cardTodayHint },
    { label: tr.coordDash.cardFulfilment, value: `%${overallPct}`, accent: C.info, icon: 'need',
      hint: tr.coordDash.cardFulfilmentHint(nf.format(totals.verified), nf.format(totals.required)) },
    { label: tr.coordDash.cardVolunteers, value: nf.format(totals.volunteers), accent: C.teal, icon: 'people',
      hint: tr.coordDash.cardVolunteersHint(totals.pendingVolunteers) },
    { label: tr.coordDash.cardPoints, value: nf.format(totals.points), accent: C.info, icon: 'pin',
      hint: totals.pointsAtCapacity > 0
        ? tr.coordDash.cardPointsFull(totals.pointsAtCapacity)
        : tr.coordDash.cardPointsUnknown(totals.pointsUnknown) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{tr.coord.dashTitle}</h1>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>
            {tr.coordDash.subtitle(totals.disasters, totals.active)}
            {totals.needAction > 0 && (
              <> · <b style={{ color: C.emergency }}>{tr.coordDash.subtitleAction(totals.needAction)}</b></>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => a.go('coordDisasters')} className="hv-navy" style={btnStyle(false)}>{tr.coordDash.manageOps}</button>
          <button onClick={() => a.go('coordQueue')} style={btnStyle(true)}>{tr.coord.reviewQueue}</button>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {cards.map((c) => (
          <StatCard key={c.label} accent={c.accent} icon={c.icon} label={c.label} value={c.value} hint={c.hint} onClick={c.onClick} />
        ))}
      </div>

      {/* Doğrulama kararı hiç kaydedilmemişse "bugün doğrulanan 0" şaşırtıcı olur;
          sebebini söylemek, sayıyı gizlemekten iyidir (rules/04 §Empty States). */}
      {totals.decidedToday === 0 && totals.pending > 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: C.muted2 }}>{tr.coordDash.todayZeroNote}</p>
      )}

      <ActionBand rows={rows} onOpen={(slug) => a.openCoordDisaster(slug)} onFocus={setSelected} />

      {selected && (
        <SelectionBar
          name={rows.find((r) => r.id === selected)?.name ?? ''}
          onOpen={() => {
            const r = rows.find((x) => x.id === selected);
            if (r) a.openCoordDisaster(r.slug);
          }}
          onClear={() => setSelected(null)}
        />
      )}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) 340px', alignItems: 'start' }}>
        <section style={panel}>
          <PanelHead title={tr.coordDash.mapTitle} hint={tr.coordDash.mapHint(mappable)} />
          <div style={{ padding: '6px 10px 12px' }}>
            <OperationsMap
              items={mapItems}
              compact={mob}
              selectedId={selected}
              onSelect={(id) => setSelected((v) => (v === id ? null : id))}
              onClear={() => setSelected(null)}
            />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '4px 6px 0', fontSize: 11.5, color: C.text }}>
              <Legend color={C.emergency} label={tr.coordDash.stateAction} />
              <Legend color={C.orange} label={tr.coordDash.stateBusy} />
              <Legend color={C.info} label={tr.coordDash.stateSteady} />
              <Legend color={C.success} label={tr.coordDash.stateResolved} />
            </div>

          </div>
        </section>

        <section style={panel}>
          <PanelHead title={tr.coordDash.rankTitle} hint={tr.coordDash.rankHint} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10 }}>
            {rows.slice(0, 4).map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected((v) => (v === r.id ? null : r.id))}
                className="hv-navy"
                style={{
                  textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '10px 11px',
                  background: selected === r.id ? C.chipNavyBg : C.surface,
                  border: `1px solid ${C.border}`, borderLeft: `3px solid ${urgencyColor(r.urgency)}`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Ico n={DISASTER_ICON[(r.type as DisasterType)] ?? 'dOther'} size={15} color={urgencyColor(r.urgency)} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{r.name}</span>
                  <span className="tnum" style={{
                    marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#fff',
                    background: urgencyColor(r.urgency), borderRadius: 20, padding: '2px 8px',
                  }}>{r.urgency}</span>
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 3 }}>
                  {[r.province, urgencyLabel(r), sinceLabel(r.lastActivityAt)].filter(Boolean).join(' · ')}
                </span>
                <span style={{ display: 'flex', gap: 12, marginTop: 7, fontSize: 11.5, color: C.text }}>
                  <span>{tr.coordDash.colCritical} <b className="tnum">{r.criticalNeeds}</b></span>
                  <span>{tr.coordDash.colPending} <b className="tnum">{r.pendingSubs}</b></span>
                  <span>{tr.coordDash.colFulfilment} <b className="tnum">%{fulfilment(r)}</b></span>
                </span>
                <span style={{ display: 'block', marginTop: 6 }}>
                  <ProgressBar pct={fulfilment(r)} color={urgencyColor(r.urgency)} height={6} />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <ComparisonTable
        rows={visible}
        total={rows.length}
        mob={mob}
        filter={statusFilter}
        onFilter={(f) => { setStatusFilter(f); setSelected(null); }}
        onOpen={(slug) => a.openCoordDisaster(slug)}
      />

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) 340px', alignItems: 'start' }}>
        <QueuePanel
          items={queue}
          loading={a.coordQueueLoading}
          scoped={!!selected}
          slaHours={a.coordOverview?.slaHours ?? 24}
          onOpen={(slug) => a.openCoordDisaster(slug)}
          onAll={() => a.go('coordQueue')}
        />
        <AlertsPanel alerts={alerts} onOpen={(slug) => a.openCoordDisaster(slug)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Müdahale bandı: eşiğin üstündeki operasyonlar, tek satırda, doğrudan girişle.
// ---------------------------------------------------------------------------
function ActionBand({ rows, onOpen, onFocus }: {
  rows: CoordDisasterRow[]; onOpen: (slug: string) => void; onFocus: (id: string) => void;
}) {
  const hot = rows.filter((r) => r.status === 'Active' && r.urgency >= ACTION_THRESHOLD);
  if (hot.length === 0) return null;
  return (
    <section style={{
      background: C.surface, border: `1px solid ${C.errorBorder}`, borderLeft: `4px solid ${C.emergency}`,
      borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap',
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9, background: C.errorSurface, color: C.emergency,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 30px',
      }}><Ico n="critical" size={16} color={C.emergency} /></span>
      <span style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13.5, color: C.navy }}>{tr.coordDash.bandTitle(hot.length)}</b>
        <span style={{ display: 'block', fontSize: 12.5, color: C.text }}>{tr.coordDash.bandBody(ACTION_THRESHOLD)}</span>
      </span>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
        {hot.map((r) => (
          <span key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: C.surface,
            border: `1px solid ${C.errorBorder}`, borderRadius: 20, padding: '4px 6px 4px 11px', fontSize: 12.5,
          }}>
            <button onClick={() => onFocus(r.id)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: C.navy, fontWeight: 600 }}>
              {r.province || r.name}
            </button>
            <b className="tnum" style={{ color: C.emergency }}>{r.urgency}</b>
            <button onClick={() => onOpen(r.slug)} className="hv-navy" style={{
              background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 14,
              padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.navy, minHeight: 30,
            }}>{tr.coordDash.open}</button>
          </span>
        ))}
      </span>
    </section>
  );
}

function SelectionBar({ name, onOpen, onClear }: { name: string; onOpen: () => void; onClear: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: '#F5F9FF', border: '1px solid #CFE0F5', borderRadius: 12, padding: '9px 13px', fontSize: 13,
    }}>
      <Ico n="pin" size={15} color={C.info} />
      <span style={{ color: C.text }}>{tr.coordDash.selected} <b style={{ color: C.navy }}>{name}</b></span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button onClick={onOpen} className="hv-navy" style={btnStyle(false, true)}>{tr.coordDash.openOperation}</button>
        <button onClick={onClear} style={{ ...btnStyle(false, true), border: 0, color: C.muted }}>{tr.coordDash.clearSelection}</button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Karşılaştırma tablosu
// ---------------------------------------------------------------------------
function ComparisonTable({ rows, total, mob, filter, onFilter, onOpen }: {
  rows: CoordDisasterRow[]; total: number; mob: boolean;
  filter: 'all' | 'action' | 'active' | 'other';
  onFilter: (f: 'all' | 'action' | 'active' | 'other') => void;
  onOpen: (slug: string) => void;
}) {
  const chips: { key: 'all' | 'action' | 'active' | 'other'; label: string }[] = [
    { key: 'all', label: tr.coordDash.filterAll },
    { key: 'action', label: tr.coordDash.stateAction },
    { key: 'active', label: tr.coordDash.filterActive },
    { key: 'other', label: tr.coordDash.filterOther },
  ];
  return (
    <section style={panel}>
      <PanelHead title={tr.coordDash.tableTitle} hint={tr.coordDash.tableHint} />
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px', borderBottom: `1px solid ${C.borderFaint}` }}>
        {chips.map((c) => (
          <button key={c.key} onClick={() => onFilter(c.key)} style={{
            border: `1px solid ${filter === c.key ? C.navy : C.border}`,
            background: filter === c.key ? C.navy : C.surface,
            color: filter === c.key ? '#fff' : C.text,
            borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: filter === c.key ? 600 : 500,
            cursor: 'pointer', minHeight: 36,
          }}>{c.label}</button>
        ))}
        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: C.muted2 }}>
          {tr.coordDash.tableCount(rows.length, total)}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: mob ? 760 : 900 }}>
          <thead>
            <tr>
              {[tr.coordDash.colUrgency, tr.coordDash.colOperation, tr.coordDash.colState,
                tr.coordDash.colCritical, tr.coordDash.colPending, tr.coordDash.colFulfilment,
                tr.coordDash.colVolunteers, tr.coordDash.colPoints, tr.coordDash.colLast, ''].map((h, i) => (
                <th key={i} style={{
                  textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
                  color: C.muted2, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b className="tnum" style={{ fontSize: 13, color: urgencyColor(r.urgency), width: 26 }}>{r.urgency}</b>
                    <span style={{ width: 70 }}><ProgressBar pct={r.urgency} color={urgencyColor(r.urgency)} height={6} /></span>
                  </span>
                </td>
                <td style={td}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, color: C.navy }}>
                    <Ico n={DISASTER_ICON[(r.type as DisasterType)] ?? 'dOther'} size={15} color={C.muted} />
                    {r.name}
                    {r.demo && <span style={demoChip}>{tr.coordDash.demo}</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted2 }}>{r.province}</span>
                </td>
                <td style={td}><span style={stateChip(urgencyColor(r.urgency))}>{urgencyLabel(r)}</span></td>
                <td style={td}><b className="tnum" style={{ fontSize: 15, color: r.criticalNeeds > 0 ? C.emergency : C.muted2 }}>{r.criticalNeeds}</b></td>
                <td style={td}>
                  <b className="tnum" style={{ fontSize: 15, color: r.pendingSubs > 0 ? C.warningText : C.muted2 }}>{r.pendingSubs}</b>
                  {r.slaBreached > 0 && (
                    <span style={{ display: 'block', fontSize: 11.5, color: C.emergency, fontWeight: 600 }}>
                      {tr.coordDash.slaOut(r.slaBreached)}
                    </span>
                  )}
                </td>
                <td style={td}>
                  <span style={{ display: 'block', minWidth: 96 }}>
                    <ProgressBar pct={fulfilment(r)} color={urgencyColor(r.urgency)} height={7} />
                  </span>
                  <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
                    {r.requiredTotal > 0
                      ? tr.coordDash.fulfilmentCell(nf.format(r.verifiedTotal), nf.format(r.requiredTotal), fulfilment(r))
                      : tr.coordDash.noNeeds}
                  </span>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <span className="tnum">{nf.format(r.volunteers)}</span>
                  {r.pendingVolunteers > 0 && (
                    <span className="tnum" style={{ color: C.muted2 }}> / {r.pendingVolunteers}</span>
                  )}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <span className="tnum">{r.deliveryPoints}</span>
                  {r.pointsAtCapacity > 0 && (
                    <span style={{ display: 'block', fontSize: 11.5, color: C.emergency, fontWeight: 600 }}>
                      {tr.coordDash.pointsFull(r.pointsAtCapacity)}
                    </span>
                  )}
                </td>
                <td style={{ ...td, fontSize: 12, color: C.muted2, whiteSpace: 'nowrap' }}>{sinceLabel(r.lastActivityAt)}</td>
                <td style={td}>
                  <button onClick={() => onOpen(r.slug)} className="hv-navy" style={btnStyle(false, true)}>
                    {r.status === 'Active' && r.deliveryPoints === 0 ? tr.coordDash.setUp : tr.coordDash.open}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p style={{ margin: 0, padding: '26px 16px', textAlign: 'center', fontSize: 13, color: C.muted2 }}>
          {tr.coordDash.tableEmpty}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Birleşik iş kuyruğu
//
// Satır içi doğrulama BİLEREK yok: doğrulama kararı o operasyonun ihtiyaç ve stok
// bağlamıyla verilir ve mevcut onay akışı yüklü snapshot üzerinden çalışır. Panelde
// yarım çalışan bir "Doğrula" düğmesi, çalışmayan bir düğmeden kötüdür — satır
// operasyonun kendi sayfasını açar, karar orada verilir.
// ---------------------------------------------------------------------------
function QueuePanel({ items, loading, scoped, slaHours, onOpen, onAll }: {
  items: ReturnType<typeof useApp>['coordQueue'];
  loading: boolean; scoped: boolean; slaHours: number;
  onOpen: (slug: string) => void; onAll: () => void;
}) {
  return (
    <section style={panel}>
      <PanelHead
        title={tr.coordDash.queueTitle}
        hint={scoped ? tr.coordDash.queueScoped : tr.coordDash.queueAll(slaHours)}
        badge={items.length}
      />
      {loading && items.length === 0 && <p style={emptyText}>{tr.common.loading}</p>}
      {!loading && items.length === 0 && (
        <p style={emptyText}>{scoped ? tr.coordDash.queueEmptyScoped : tr.coordDash.queueEmpty}</p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.slice(0, 8).map((q) => (
          <li key={q.id} style={{ display: 'flex', gap: 11, padding: '12px 14px', borderTop: `1px solid ${C.borderFaint}`, alignItems: 'flex-start' }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9, flex: '0 0 30px', marginTop: 1,
              background: q.slaBreached ? C.errorSurface : C.chipNavyBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Ico n="need" size={15} color={q.slaBreached ? C.emergency : C.info} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13.5, color: C.navy }}>
                  {tr.coordDash.queueLine(q.needName || tr.coordDash.unknownNeed, nf.format(q.qty), q.unit)}
                </b>
                <span style={opChip}>{q.disasterName}</span>
                {q.slaBreached && <span style={slaChip}>{tr.coordDash.slaChip}</span>}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.text, marginTop: 2 }}>
                {[q.contributor, q.loc, q.code].filter(Boolean).join(' · ')}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 3 }}>
                {tr.coordDash.waiting(q.waitingHours)}{q.hasPhoto ? ` · ${tr.coordDash.withPhoto}` : ` · ${tr.coordDash.noPhoto}`}
              </span>
            </span>
            <button onClick={() => onOpen(q.disasterSlug)} className="hv-navy" style={btnStyle(false, true)}>
              {tr.coordDash.review}
            </button>
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <div style={{ padding: '11px 14px', borderTop: `1px solid ${C.borderFaint}` }}>
          <button onClick={onAll} className="hv-navy" style={{ ...btnStyle(false), width: '100%' }}>
            {tr.coordDash.queueMore(items.length - 8)}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Afetler arası uyarılar — hepsi sunucudan gelen sayılardan türetilir, hiçbiri
// tahmin değildir. Uydurulabilecek bir uyarı (örneğin "şu kalem şurada fazla")
// bilerek yok: kalem düzeyinde afetler arası karşılaştırma için gereken sorgu
// henüz yazılmadı, ve olmayan veriden uyarı üretmek koordinatörü yanlış yere yollar.
// ---------------------------------------------------------------------------
interface Alert { id: string; tone: string; kind: string; body: string; slug: string; action: string }

function buildAlerts(rows: CoordDisasterRow[]): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    if (r.status === 'Active' && r.deliveryPoints === 0) {
      out.push({ id: `${r.id}-setup`, tone: C.emergency, kind: tr.coordDash.alertSetup,
        body: tr.coordDash.alertSetupBody(r.name), slug: r.slug, action: tr.coordDash.setUp });
    }
    if (r.pointsAtCapacity > 0) {
      out.push({ id: `${r.id}-cap`, tone: C.warning, kind: tr.coordDash.alertCapacity,
        body: tr.coordDash.alertCapacityBody(r.name, r.pointsAtCapacity), slug: r.slug, action: tr.coordDash.open });
    }
    if (r.slaBreached > 0) {
      out.push({ id: `${r.id}-sla`, tone: C.emergency, kind: tr.coordDash.alertSla,
        body: tr.coordDash.alertSlaBody(r.name, r.slaBreached), slug: r.slug, action: tr.coordDash.review });
    }
    if (r.pendingVolunteers > 0) {
      out.push({ id: `${r.id}-vol`, tone: C.teal, kind: tr.coordDash.alertVolunteers,
        body: tr.coordDash.alertVolunteersBody(r.name, r.pendingVolunteers), slug: r.slug, action: tr.coordDash.open });
    }
    if (r.status === 'Active' && r.openNeeds === 0 && r.pendingSubs === 0 && r.completedNeeds > 0) {
      out.push({ id: `${r.id}-done`, tone: C.success, kind: tr.coordDash.alertClosable,
        body: tr.coordDash.alertClosableBody(r.name), slug: r.slug, action: tr.coordDash.open });
    }
    if (r.status === 'Active' && r.deliveryPoints > 0 && r.pointsCapacityUnknown === r.deliveryPoints) {
      out.push({ id: `${r.id}-unk`, tone: C.info, kind: tr.coordDash.alertUnknown,
        body: tr.coordDash.alertUnknownBody(r.name, r.deliveryPoints), slug: r.slug, action: tr.coordDash.open });
    }
  }
  // Kritik olanlar üstte; liste uzarsa koordinatör önce en pahalı olanı görür.
  const rank = (t: string) => (t === C.emergency ? 0 : t === C.warning ? 1 : 2);
  out.sort((x, y) => rank(x.tone) - rank(y.tone));

  // Aynı türden uyarı her operasyon için ayrı satır olunca panel tek bir cümlenin
  // altı kopyasıyla doluyor ve gerçek sinyal aşağı itiliyordu (tarayıcı testinde
  // beş özdeş "doluluk bilinmiyor" satırı çıktı). Tür başına en fazla iki satır
  // gösterilir, kalanı tek bir özet satırına iner — bilgi kaybolmaz, tekrar kaybolur.
  const perKind = new Map<string, Alert[]>();
  for (const al of out) {
    const list = perKind.get(al.kind) ?? [];
    list.push(al);
    perKind.set(al.kind, list);
  }
  const merged: Alert[] = [];
  for (const [kind, list] of perKind) {
    merged.push(...list.slice(0, 2));
    if (list.length > 2) {
      merged.push({
        id: `${kind}-rest`, tone: list[0].tone, kind,
        body: tr.coordDash.alertMore(list.length - 2, kind.toLocaleLowerCase('tr')),
        slug: list[2].slug, action: tr.coordDash.open,
      });
    }
  }
  return merged.sort((x, y) => rank(x.tone) - rank(y.tone)).slice(0, 8);
}

function AlertsPanel({ alerts, onOpen }: { alerts: Alert[]; onOpen: (slug: string) => void }) {
  return (
    <section style={panel}>
      <PanelHead title={tr.coordDash.alertsTitle} hint={tr.coordDash.alertsHint} badge={alerts.length} />
      {alerts.length === 0 && <p style={emptyText}>{tr.coordDash.alertsEmpty}</p>}
      {alerts.map((al) => (
        <div key={al.id} style={{ padding: '11px 14px', borderTop: `1px solid ${C.borderFaint}` }}>
          <span style={stateChip(al.tone)}>{al.kind}</span>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.text }}>{al.body}</p>
          <button onClick={() => onOpen(al.slug)} className="hv-navy" style={{ ...btnStyle(false, true), marginTop: 8 }}>
            {al.action}
          </button>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------
const panel = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
} as const;

const td = { padding: '11px 12px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 13, verticalAlign: 'middle' } as const;

const emptyText = { margin: 0, padding: '26px 16px', textAlign: 'center', fontSize: 13, color: C.muted2 } as const;

const demoChip = {
  fontSize: 10.5, fontWeight: 700, background: C.chipNavyBg, color: C.muted,
  borderRadius: 20, padding: '1px 7px',
} as const;

const opChip = {
  fontSize: 11, fontWeight: 600, background: C.chipNavyBg, color: C.text,
  borderRadius: 20, padding: '2px 8px',
} as const;

const slaChip = {
  fontSize: 11, fontWeight: 700, background: C.errorSurface, color: C.errorText,
  borderRadius: 20, padding: '2px 8px',
} as const;

const stateChip = (color: string): CSSProperties => ({
  display: 'inline-block', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
  color, background: C.canvas, border: `1px solid ${color}33`,
});

function btnStyle(primary: boolean, small = false): CSSProperties {
  return {
    background: primary ? C.emergency : C.surface,
    border: `1px solid ${primary ? C.emergency : C.borderSoft}`,
    color: primary ? '#fff' : C.navy,
    borderRadius: 9, padding: small ? '7px 12px' : '11px 15px',
    fontSize: small ? 12.5 : 13.5, fontWeight: 600, cursor: 'pointer',
    minHeight: small ? 36 : 44, whiteSpace: 'nowrap' as const,
  };
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <i style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function PanelHead({ title, hint, badge }: { title: string; hint?: string; badge?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '13px 14px', borderBottom: `1px solid ${C.borderFaint}`,
    }}>
      <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>{title}</h2>
      {badge != null && (
        <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, background: C.chipNavyBg, color: C.text, borderRadius: 20, padding: '1px 8px' }}>
          {badge}
        </span>
      )}
      {hint && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted2 }}>{hint}</span>}
    </div>
  );
}

// Boş ekran yerine iskelet: panel yüklenirken beyaz bir sayfa, bağlantısı zayıf bir
// koordinatöre "bozuk" gibi görünür (rules/04 §Loading States).
function Skeleton({ mob }: { mob: boolean }) {
  const box = (h: number) => (
    <div style={{ background: C.borderFaint, borderRadius: 12, height: h }} />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy="true" aria-live="polite">
      <span style={{ fontSize: 13, color: C.muted }}>{tr.common.loading}</span>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: cols(mob).stat }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i}>{box(84)}</div>)}
      </div>
      {box(mob ? 240 : 320)}
      {box(220)}
    </div>
  );
}

function Notice({ tone, title, body, action }: {
  tone: 'error' | 'info'; title: string; body: string; action?: { label: string; onClick: () => void };
}) {
  const accent = tone === 'error' ? C.emergency : C.info;
  return (
    <section style={{
      background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: 18, maxWidth: 620,
    }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.navy }}>{title}</h1>
      <p style={{ margin: '7px 0 0', fontSize: 13.5, color: C.text }}>{body}</p>
      {action && (
        <button onClick={action.onClick} className="hv-navy" style={{ ...btnStyle(false), marginTop: 12 }}>
          {action.label}
        </button>
      )}
    </section>
  );
}
