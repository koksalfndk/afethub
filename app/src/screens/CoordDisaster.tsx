import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, D, G, PRI } from '../theme';
import { cols, enrichSorted } from '../select';
import { ProgressBar, StatusBadge, PriorityBadge, Ico, DISASTER_ICON } from '../ui';
import type { CoordDisasterRow } from '../data';
import { DistrictMap } from '../components/DistrictMap';
import { plateOf } from '../trProvinces';

// Tek bir operasyonun koordinasyon sayfası (/koordinasyon/afet/<slug>).
//
// Ana panel "hangi operasyon" sorusunu yanıtlar; bu sayfa "bu operasyonda ne
// yapmalıyım" sorusunu. Bu yüzden buradaki her blok işlem yapılabilir: kuyruk
// satırında gerçek doğrulama düğmeleri var (o operasyonun snapshot'ı yüklü),
// teslim noktasında doluluk yazılabiliyor.
//
// Sayaç şeridi ana paneldeki ile AYNI kaynaktan (coordinator_overview) okunur.
// Aynı sayıyı iki yerde iki farklı yoldan hesaplamak, iki farklı cevap demektir.

const nf = new Intl.NumberFormat('tr-TR');

const CAPACITY_STEPS = [0, 25, 50, 75, 90, 100];

// Kahraman şeridi bir özet; 65 yerleşimin tamamını buraya dökmek başlığı boğar.
// Tamamı afet kaydında duruyor ve oradan düzenleniyor.
const SETTLEMENT_PREVIEW = 8;

export function CoordDisaster() {
  const a = useApp();
  const L = cols(a.device === 'mobile');
  const mob = a.device === 'mobile';
  const [needFilter, setNeedFilter] = useState<'all' | 'critical' | 'open' | 'done'>('all');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const snap = a.snap;
  const row: CoordDisasterRow | null = useMemo(() => {
    const rows = a.coordOverview?.disasters ?? [];
    return rows.find((r) => r.slug === a.currentSlug) ?? rows.find((r) => r.id === snap?.disaster.id) ?? null;
  }, [a.coordOverview, a.currentSlug, snap?.disaster.id]);

  if (!snap) return null;
  const d = snap.disaster;

  const needs = enrichSorted(snap.needs);
  const pending = snap.subs.filter((s) => s.status === 'Pending verification' || s.status === 'Information requested');
  const visibleNeeds = needs.filter((n) => {
    if (needFilter === 'critical') return n.priority === 'Critical' && !n.done;
    if (needFilter === 'open') return !n.done;
    if (needFilter === 'done') return n.done;
    return true;
  });

  const others = (a.coordOverview?.disasters ?? []).filter((r) => r.slug !== d.slug);
  const plate = plateOf(d.province);
  // İlçe vurgusu operasyonun aciliyetiyle aynı rengi kullanır; pano ile detay sayfası
  // aynı olayı iki farklı renkte göstermemeli.
  const accent = !row ? C.info
    : row.urgency >= 80 ? C.emergency
    : row.urgency >= 50 ? C.orange
    : row.status === 'Active' ? C.info : C.success;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ---- Komuta şeridi ------------------------------------------------ */}
      <section style={{
        background: G.opsBar, color: D.fg, borderRadius: 14, padding: mob ? '14px 14px 16px' : '16px 18px 18px',
      }}>
        <nav aria-label={tr.coordOperation.breadcrumb} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 12.5 }}>
          <button onClick={() => a.go('coordHome')} style={crumbBtn}>{tr.coord.dashTitle}</button>
          <span style={{ color: D.muted }}>/</span>
          <button onClick={() => a.go('coordDisasters')} style={crumbBtn}>{tr.nav.disasterAdmin}</button>
          <span style={{ color: D.muted }}>/</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{d.name}</span>

          {others.length > 0 && (
            <span style={{ position: 'relative', marginLeft: 4 }}>
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-expanded={switcherOpen}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: D.btnBg,
                  border: `1px solid ${D.btnBd}`, color: '#fff', borderRadius: 9,
                  padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 36,
                }}
              >{tr.coordOperation.switch}<Ico n="down" size={13} color="#fff" /></button>
              {switcherOpen && (
                <span style={{
                  position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 30, minWidth: 290,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 6,
                  boxShadow: '0 12px 32px rgba(16,42,67,.22)', display: 'block',
                }}>
                  {others.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => { setSwitcherOpen(false); a.openCoordDisaster(o.slug); }}
                      className="hv-navy"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                        background: 'none', border: 0, cursor: 'pointer', borderRadius: 8,
                        padding: '9px 9px', fontSize: 13, color: C.navy, minHeight: 40,
                      }}
                    >
                      <Ico n={DISASTER_ICON[o.type as keyof typeof DISASTER_ICON] ?? 'dOther'} size={15} color={C.muted} />
                      <span style={{ minWidth: 0, flex: 1 }}>{o.name}</span>
                      <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{o.urgency}</span>
                    </button>
                  ))}
                </span>
              )}
            </span>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', color: '#F9A26C', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, display: 'inline-block' }} />
              {tr.coordOperation.eyebrow(d.status === 'Active', row?.urgency ?? null)}
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>{d.name}</h1>
            <div style={{ fontSize: 13, color: D.fg2, marginTop: 3 }}>
              {[d.region || d.province, tr.coordOperation.points(snap.locations.length), tr.coordOperation.updated(d.updatedLabel)]
                .filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button onClick={() => a.openDisaster(d.slug)} style={darkBtn(false)}>{tr.coordOps.openPublic}</button>
              <button onClick={() => a.go('coordOps')} style={darkBtn(false)}>{tr.nav.ops}</button>
              <button onClick={() => a.go('coordNeeds')} style={darkBtn(true)}>{tr.coord.newNeed}</button>
            </div>
          </div>

          {/* Etkilenen ilçeler artık kahramanın içinde: "bu operasyon nerede" sorusu
              başlıkla birlikte okunmalı, sayfanın ortasında ayrı bir bölüm olarak
              değil. Koyu şeride yalnızca kısa etiketler ve şekil giriyor; açıklayıcı
              cümleler burada YOK (rules/04: gradyan zeminde gövde metni olmaz). */}
          {/* Açık ada: harita koyu şeridin ÜSTÜNDE değil, içine gömülü açık bir kartta.
              Doğrudan gradyanın üstünde denendi, nötr ilçeler zeminden ayrışmıyordu;
              çözüm rengi değiştirmek değil, yüzey vermek oldu. Kart panodaki il
              haritasıyla aynı paleti kullanır — bakımda ikinci bir renk kipi yok. */}
          <div style={{
            flex: mob ? '1 1 100%' : '0 0 430px', width: mob ? '100%' : 430, minWidth: 0,
            background: '#F7F9FB', border: '1px solid #DCE4EC', borderRadius: 12,
            padding: '11px 12px 12px',
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em',
              color: C.muted2, marginBottom: 8,
            }}>{tr.coordOperation.districtTitle.toLocaleUpperCase('tr')}</div>

            {d.districts.length === 0 ? (
              // Bekleyen bir iş olduğunu söyler ve doğrudan oraya götürür; boş bir
              // harita çizmek "hiçbir yer etkilenmedi" diye okunurdu.
              <div style={cardNote}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.warningText, fontWeight: 600 }}>
                  <Ico n="pending" size={14} color={C.warning} />
                  {tr.coordOperation.districtWaitingTitle}
                </span>
                <span style={{ display: 'block', marginTop: 5, color: C.muted }}>
                  {tr.coordOperation.districtWaitingBody}
                </span>
                <button onClick={() => a.go('coordDisasters')} className="hv-navy" style={{
                  marginTop: 9, background: C.surface, border: `1px solid ${C.borderSoft}`,
                  color: C.navy, borderRadius: 8, padding: '7px 11px',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 36,
                }}>{tr.coordOperation.districtEdit}</button>
              </div>
            ) : plate == null ? (
              <div style={cardNote}>{tr.coordOperation.districtUnknownShort}</div>
            ) : (
              // Solda harita, sağda liste: harita kareye yakın, tek sütunda kartın
              // yarısı boş kalıyordu. Liste haritanın açıklaması değil, tamamlayıcısı —
              // ilçe haritada, yerleşim yazıyla.
              <div style={{
                display: 'grid', gap: 12, alignItems: 'start',
                gridTemplateColumns: mob ? '1fr' : 'minmax(0,168px) minmax(0,1fr)',
              }}>
                <DistrictMap plate={plate} affected={d.districts} accent={accent} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {d.districts.map((x) => (
                      <span key={x} style={{
                        fontSize: 11.5, fontWeight: 600, color: C.navy, background: C.surface,
                        border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`,
                        borderRadius: 7, padding: '3px 9px',
                      }}>{x}</span>
                    ))}
                  </div>

                  <div style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em',
                    color: C.muted2, margin: '12px 0 6px',
                  }}>{tr.coordOperation.settlementsTitle.toLocaleUpperCase('tr')}</div>

                  {d.settlements.length === 0 ? (
                    // Yerleşim girilmemiş olması ilçenin tamamının etkilendiği
                    // anlamına GELMEZ; boş liste yerine ne olduğu yazılır.
                    <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                      {tr.coordOperation.settlementsWaiting}
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {d.settlements.slice(0, SETTLEMENT_PREVIEW).map((x) => (
                          <span key={x} style={{
                            fontSize: 11.5, color: C.text, background: C.surface,
                            border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 9px',
                          }}>{x}</span>
                        ))}
                      </div>
                      {d.settlements.length > SETTLEMENT_PREVIEW && (
                        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: C.muted2 }}>
                          {tr.coordOperation.settlementsMore(d.settlements.length - SETTLEMENT_PREVIEW)}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sayaçlar. row null ise (pano henüz yüklenmediyse) hiçbir sayı uydurulmaz:
            şerit gizlenir ve sayfanın kalanı normal çalışır. */}
        {row && (
          <div style={{
            display: 'grid', gap: 1, background: D.rowBd, border: `1px solid ${D.rowBd}`,
            borderRadius: 11, overflow: 'hidden', marginTop: 14,
            gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))',
          }}>
            <Kpi color="#FF6B72" label={tr.coordDash.cardCritical} value={row.criticalNeeds} hint={tr.coordOperation.kpiCriticalHint} />
            <Kpi color="#FFC94A" label={tr.coordDash.cardPending} value={row.pendingSubs}
              hint={row.slaBreached > 0 ? tr.coordDash.slaOut(row.slaBreached) : tr.coordOperation.kpiPendingHint} />
            <Kpi color="#7FD6A6" label={tr.coordDash.cardToday} value={row.decidedToday} hint={tr.coordOperation.kpiTodayHint} />
            <Kpi color="#7FB6E8" label={tr.coordDash.cardFulfilment}
              value={row.requiredTotal > 0 ? `%${Math.round((row.verifiedTotal / row.requiredTotal) * 100)}` : '—'}
              hint={row.requiredTotal > 0
                ? tr.coordDash.cardFulfilmentHint(nf.format(row.verifiedTotal), nf.format(row.requiredTotal))
                : tr.coordDash.noNeeds} />
            <Kpi color="#F9A26C" label={tr.coordDash.cardPoints} value={row.deliveryPoints}
              hint={row.pointsAtCapacity > 0 ? tr.coordDash.pointsFull(row.pointsAtCapacity) : tr.coordOperation.kpiPointsHint} />
            <Kpi color="#5FD3C4" label={tr.coordDash.cardVolunteers} value={`${row.volunteers} / ${row.onShift}`}
              hint={tr.coordOperation.kpiVolunteersHint} />
          </div>
        )}
      </section>

      {/* ---- Bugünkü iş kuyruğu ------------------------------------------- */}
      <section style={panel}>
        <Head title={tr.coordOperation.queueTitle} badge={pending.length} hint={tr.coordOperation.queueHint} />
        {pending.length === 0 ? (
          <p style={emptyText}>{tr.coordOperation.queueEmpty}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pending.map((s) => {
              const need = snap.needs.find((n) => n.id === s.needId);
              const critical = need?.priority === 'Critical';
              return (
                <li key={s.id} style={{
                  display: 'flex', gap: 12, padding: '13px 14px', borderTop: `1px solid ${C.borderFaint}`,
                  alignItems: 'flex-start', flexWrap: 'wrap',
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 9, flex: '0 0 32px', marginTop: 1,
                    background: critical ? C.errorSurface : C.chipNavyBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Ico n="need" size={16} color={critical ? C.emergency : C.info} /></span>

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 13.5, color: C.navy }}>
                        {need?.name ?? tr.coordDash.unknownNeed} · {nf.format(s.qty)} {s.unit}
                      </b>
                      {need && <PriorityBadge p={need.priority} />}
                      <StatusBadge s={s.status} />
                      <span style={codeChip}>{s.code}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: C.text, marginTop: 3 }}>
                      {[s.contributor, s.city, s.loc].filter(Boolean).join(' · ')}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 3 }}>
                      {[
                        tr.coordOperation.reported(s.submitted),
                        s.photoUrl ? tr.coordDash.withPhoto : tr.coordDash.noPhoto,
                        need ? tr.coordOperation.remainingAfter(Math.max(0, need.required - need.verified), need.unit) : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {s.note && <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 3 }}>{s.note}</span>}
                  </span>

                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => a.openModal(s, 'approve')} style={actBtn({ background: C.success, border: `1px solid ${C.success}`, color: '#fff' })}>{tr.coord.approve}</button>
                    <button onClick={() => a.openModal(s, 'partial')} style={actBtn({ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy })}>{tr.coord.partial}</button>
                    <button onClick={() => a.openModal(s, 'reject')} style={actBtn({ background: C.surface, border: `1px solid ${C.errorBorder}`, color: C.emergency })}>{tr.coord.reject}</button>
                    <button onClick={() => a.openModal(s, 'info')} style={{
                      background: 'none', border: 0, color: C.muted, fontSize: 12.5, fontWeight: 600,
                      cursor: 'pointer', padding: '8px 4px', textDecoration: 'underline', minHeight: 36,
                    }}>{tr.coord.requestInfo}</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- İhtiyaç karşılama matrisi ------------------------------------ */}
      <section style={panel}>
        <Head title={tr.coordOperation.matrixTitle} badge={needs.length} hint={tr.coordOperation.matrixHint} />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '11px 14px', borderBottom: `1px solid ${C.borderFaint}` }}>
          {([
            ['all', tr.coordDash.filterAll],
            ['critical', tr.coordOperation.filterCritical],
            ['open', tr.coordOperation.filterOpen],
            ['done', tr.coordOperation.filterDone],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setNeedFilter(k)} style={{
              border: `1px solid ${needFilter === k ? C.navy : C.border}`,
              background: needFilter === k ? C.navy : C.surface,
              color: needFilter === k ? '#fff' : C.text,
              borderRadius: 20, padding: '6px 12px', fontSize: 12.5,
              fontWeight: needFilter === k ? 600 : 500, cursor: 'pointer', minHeight: 36,
            }}>{label}</button>
          ))}
          <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: C.muted2 }}>
            {tr.coordOperation.matrixCount(visibleNeeds.length, needs.length)}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
            <thead>
              <tr>
                {[tr.coordOperation.colNeed, tr.coordOperation.colPriority, tr.coordOperation.colProgress,
                  tr.coordOperation.colRemaining, tr.coordOperation.colPending, tr.coordOperation.colPoint,
                  tr.coordOperation.colUpdated].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleNeeds.map((n) => (
                <tr key={n.id}>
                  <td style={td}>
                    <span style={{ fontWeight: 600, color: C.navy }}>{n.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: C.muted2 }}>{n.cat} · {n.unit}</span>
                  </td>
                  <td style={td}><PriorityBadge p={n.priority} /></td>
                  <td style={td}>
                    <span style={{ display: 'block', minWidth: 110 }}>
                      <ProgressBar pct={n.pctVal} color={n.barColor} height={7} />
                    </span>
                    {/* Çubuk asla tek başına: sayı her zaman yanında (rules/04 §Quantity Display). */}
                    <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
                      {tr.coordOperation.progressCell(nf.format(n.verified), nf.format(n.required), n.unit, n.pctVal)}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <b className="tnum" style={{ fontSize: 15, color: n.done ? C.successText : (PRI[n.priority] ?? PRI.Normal).fg }}>
                      {nf.format(n.remaining)}
                    </b>
                    <span style={{ fontSize: 11.5, color: C.muted2 }}> {n.unit}</span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span className="tnum" style={{ color: n.pending > 0 ? C.warningText : C.muted2 }}>
                      {nf.format(n.pending)} {n.unit}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: C.muted2 }}>{tr.common.remainingUnchanged}</span>
                  </td>
                  <td style={{ ...td, fontSize: 12.5 }}>{n.loc || tr.coordOperation.noPoint}</td>
                  <td style={{ ...td, fontSize: 12, color: C.muted2, whiteSpace: 'nowrap' }}>{n.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleNeeds.length === 0 && <p style={emptyText}>{tr.coordOperation.matrixEmpty}</p>}
      </section>

      {/* ---- Saha durumu + operasyon kaydı --------------------------------- */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.2fr) minmax(0,1fr)', alignItems: 'start' }}>
        <section style={panel}>
          <Head title={tr.coordOperation.fieldTitle} badge={snap.locations.length} hint={tr.coordOperation.fieldHint} />
          {snap.locations.length === 0 && <p style={emptyText}>{tr.coordOperation.noPoints}</p>}
          {snap.locations.map((l) => (
            <div key={l.id} style={{ padding: '12px 14px', borderTop: `1px solid ${C.borderFaint}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13.5, color: C.navy }}>{l.name}</b>
                {l.capacityPct != null && l.capacityPct >= 85 && (
                  <span style={{ ...codeChip, background: C.errorSurface, color: C.errorText }}>{tr.coordOps.capacityFull}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>
                {[l.contact || tr.coordOperation.noContact, l.hours].filter(Boolean).join(' · ')}
              </div>

              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* Bilinmeyen doluluk çubuk olarak çizilmez. Boş bir çubuk "yer var"
                    diye okunur ve sevkiyat dolu bir noktaya gider. */}
                {l.capacityPct == null ? (
                  <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>
                    <Ico n="pending" size={13} color={C.muted2} /> {tr.coordOps.capacityUnknown}
                  </span>
                ) : (
                  <span style={{ minWidth: 150 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: C.muted, marginBottom: 4 }}>
                      <span>{tr.coordOps.capacityLabel}</span>
                      <b className="tnum">%{l.capacityPct}</b>
                    </span>
                    <ProgressBar
                      pct={l.capacityPct}
                      color={l.capacityPct >= 85 ? C.emergency : l.capacityPct >= 60 ? C.warning : C.success}
                      height={7}
                    />
                  </span>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                  <span>{tr.coordOperation.setCapacity}</span>
                  <select
                    value={l.capacityPct == null ? '' : String(l.capacityPct)}
                    onChange={(e) => {
                      const v = e.target.value;
                      void a.setLocationCapacity(l.id, v === '' ? null : Number(v), '');
                    }}
                    style={{
                      border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: '7px 9px',
                      fontSize: 12.5, color: C.navy, background: C.surface, minHeight: 36,
                    }}
                  >
                    <option value="">{tr.coordOperation.capacityUnknownOption}</option>
                    {CAPACITY_STEPS.map((p) => <option key={p} value={p}>%{p}</option>)}
                  </select>
                </label>
              </div>

              {l.capacityUpdated && (
                <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 5 }}>{tr.coordOps.capacityMeasured(l.capacityUpdated)}</div>
              )}
              {l.capacityPct == null && (
                <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 5 }}>{tr.coordOps.capacityUnknownHint}</div>
              )}
            </div>
          ))}
          <div style={{ padding: '11px 14px', borderTop: `1px solid ${C.borderFaint}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => a.go('coordOps')} className="hv-navy" style={ghostBtn}>{tr.coordOperation.managePoints}</button>
            <button onClick={() => a.go('coordStaff')} className="hv-navy" style={ghostBtn}>{tr.coordOperation.manageVolunteers}</button>
          </div>
        </section>

        <section style={panel}>
          <Head title={tr.coordOperation.logTitle} hint={tr.coordOperation.logHint} />
          <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
            {snap.log.slice(0, 10).map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 14px', alignItems: 'flex-start' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color, marginTop: 6, flex: '0 0 9px' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted2 }}>{e.detail} · {e.time} · {e.user}</span>
                </span>
              </li>
            ))}
          </ul>
          {snap.log.length === 0 && <p style={emptyText}>{tr.coordOperation.logEmpty}</p>}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Kpi({ color, label, value, hint }: { color: string; label: string; value: string | number; hint: string }) {
  return (
    <div style={{ background: '#0F2C46', padding: '12px 13px' }}>
      <div style={{ fontSize: 11.5, color: D.fg2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <i style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label}
      </div>
      <div className="tnum" style={{ fontSize: 23, fontWeight: 700, color: '#fff', letterSpacing: '-.02em', lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function Head({ title, hint, badge }: { title: string; hint?: string; badge?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '13px 14px' }}>
      <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>{title}</h2>
      {badge != null && (
        <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, background: C.chipNavyBg, color: C.text, borderRadius: 20, padding: '1px 8px' }}>{badge}</span>
      )}
      {hint && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted2 }}>{hint}</span>}
    </div>
  );
}

const cardNote = {
  fontSize: 12, color: C.muted, background: C.surface,
  border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 11px',
} as const;

const panel = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' } as const;
const th = {
  textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: C.muted2,
  padding: '9px 12px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const, background: C.canvas,
};
const td = { padding: '11px 12px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 13, verticalAlign: 'top' as const };
const emptyText = { margin: 0, padding: '26px 16px', textAlign: 'center' as const, fontSize: 13, color: C.muted2 };
const codeChip = { fontSize: 11, fontWeight: 700, background: C.chipNavyBg, color: C.text, borderRadius: 20, padding: '2px 8px' } as const;
const crumbBtn = { background: 'none', border: 0, color: D.fg2, cursor: 'pointer', padding: 0, fontSize: 12.5, fontWeight: 500, textDecoration: 'underline' } as const;
const ghostBtn = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
  padding: '9px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40,
} as const;

const darkBtn = (primary: boolean): CSSProperties => ({
  background: primary ? C.emergency : D.btnBg,
  border: `1px solid ${primary ? C.emergency : D.btnBd}`,
  color: '#fff', borderRadius: 9, padding: '9px 13px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', minHeight: 42, whiteSpace: 'nowrap' as const,
});

const actBtn = (extra: CSSProperties): CSSProperties => ({
  borderRadius: 7, padding: '8px 11px', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', minHeight: 36, ...extra,
});
