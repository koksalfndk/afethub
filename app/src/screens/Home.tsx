import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G, PRI, ribbon } from '../theme';
import { cols } from '../select';
import { LiveDot, Ico, StatCard, PriorityBadge, MetricCell, eyebrow, type IcoName } from '../ui';
import { agoMinutes, clockLabel, formatDate } from '../util';
import { HeroBanner } from '../components/HeroBanner';
import type { DisasterType } from '../types';

// Icon per disaster kind — a colour-coded category marker, never decoration.
const TYPE_ICON: Record<DisasterType, IcoName> = {
  Wildfire: 'critical', Flood: 'activity', Earthquake: 'critical',
  Storm: 'activity', Evacuation: 'people', Other: 'need',
};
const TYPE_ORDER: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];

function chipStyle(active: boolean) {
  return {
    background: active ? C.navy : C.surface,
    border: `1px solid ${active ? C.navy : C.borderSoft}`,
    color: active ? '#fff' : C.heading2,
    borderRadius: 20, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40,
  } as const;
}

// The home page is the national dashboard: one card per operation. A single
// disaster's detail lives on its own date-stamped page (/afet/<slug>).
export function Home() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const ov = a.overview;

  const [type, setType] = useState<DisasterType | ''>('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [q, setQ] = useState('');

  if (!ov) return <div style={{ padding: 40, color: C.muted }}>Yükleniyor…</div>;

  const needle = q.trim().toLowerCase();
  const visible = ov.disasters.filter((c) => {
    const d = c.disaster;
    return (!type || d.type === type)
      && (!onlyActive || d.status === 'Active')
      && (!needle
        || d.name.toLowerCase().includes(needle)
        || d.province.toLowerCase().includes(needle)
        || d.region.toLowerCase().includes(needle));
  });
  const presentTypes = TYPE_ORDER.filter((t) => ov.disasters.some((c) => c.disaster.type === t));

  const totals: { label: string; value: number; accent: string; icon: IcoName }[] = [
    { label: tr.dash.totals.disasters, value: ov.totals.activeDisasters, accent: C.emergency, icon: 'critical' },
    { label: tr.dash.totals.needs, value: ov.totals.activeNeeds, accent: C.navy, icon: 'need' },
    { label: tr.dash.totals.verified, value: ov.totals.verifiedSubs, accent: C.success, icon: 'verified' },
    { label: tr.dash.totals.pending, value: ov.totals.pendingSubs, accent: C.warning, icon: 'pending' },
    { label: tr.dash.totals.volunteers, value: ov.totals.volunteers, accent: C.teal, icon: 'people' },
    { label: tr.dash.totals.points, value: ov.totals.deliveryPoints, accent: C.info, icon: 'pin' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* The banner is the page head now: the old eyebrow + title + blurb block
          repeated what the banner already says. */}
      <HeroBanner />

      {/* Sample content must be labelled so it can never pass as verified live data. */}
      {ov.demo && (
        <div style={{
          background: 'linear-gradient(135deg,#FFFDF4,#FFF8E5)', border: '1px solid #F2DFA8',
          borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '11px 13px',
          display: 'flex', gap: 9, alignItems: 'flex-start',
        }}>
          <span style={{ paddingTop: 1 }}><Ico n="critical" size={16} color={C.warningText} /></span>
          <div>
            <b style={{ fontSize: 13, color: C.warningText }}>{tr.dash.demoTitle}</b>
            <div style={{ fontSize: 12.5, color: C.heading2, marginTop: 2 }}>{tr.dash.demoBody}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: L.stat }}>
        {totals.map((t) => <StatCard key={t.label} accent={t.accent} icon={t.icon} label={t.label} value={t.value} />)}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.85fr) minmax(280px,1fr)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', minWidth: 180, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: '0 13px', height: 40 }}>
              <Ico n="search" size={15} color={C.muted2} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.dash.searchPh} aria-label={tr.dash.searchPh}
                style={{ border: 0, background: 'none', outline: 'none', fontSize: 13.5, color: C.navy, width: '100%', minWidth: 0 }} />
            </label>
            <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{tr.dash.countLabel(visible.length, ov.disasters.length)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setType('')} style={chipStyle(type === '')}>{tr.dash.allTypes}</button>
            {presentTypes.map((t) => (
              <button key={t} onClick={() => setType(t)} style={chipStyle(type === t)}>{disasterTypeLabel[t]}</button>
            ))}
            <button onClick={() => setOnlyActive((v) => !v)} style={chipStyle(onlyActive)}>{tr.dash.onlyActive}</button>
          </div>

          {visible.length > 0 ? (
            <div style={{ display: 'grid', gap: 13, gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))' }}>
              {visible.map((c) => {
                const d = c.disaster;
                const active = d.status === 'Active';
                const label = active ? tr.home.active : d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived;
                return (
                  <article key={d.id} style={{
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
                    position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12,
                    opacity: active ? 1 : .84,
                  }}>
                    <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: ribbon(active ? C.emergency : C.success) }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 9, minWidth: 0 }}>
                        <span style={{ paddingTop: 2 }}><Ico n={TYPE_ICON[d.type]} size={18} color={active ? C.emergency : C.muted2} /></span>
                        <div style={{ minWidth: 0 }}>
                          {/* The card title is the primary link to the operation. */}
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} style={{
                            background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                            fontSize: 16, fontWeight: 700, color: C.navy,
                          }}>{d.name}</button>
                          <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>{disasterTypeLabel[d.type]} · {d.region}</div>
                        </div>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: '4px 10px',
                        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        color: active ? C.emergency : C.successText,
                        background: active ? C.errorSurface : '#EAF7EF',
                        border: `1px solid ${active ? C.errorBorder : '#C9E9D6'}`,
                      }}>{active ? <LiveDot size={6} /> : <Ico n="completed" size={12} />}{label}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                      {/* Each counter opens the section it counts. */}
                      <MetricCell accent={C.navy} value={c.activeNeeds} label={tr.dash.cardNeeds} onClick={() => a.openDisaster(d.slug, 'needs')} />
                      <MetricCell accent={C.warning} value={c.pendingSubs} label={tr.dash.cardPending} onClick={() => a.openDisaster(d.slug, 'activity')} />
                      <MetricCell accent={C.info} value={c.deliveryPoints} label={tr.dash.cardPoints} onClick={() => a.openDisaster(d.slug, 'locations')} />
                      <MetricCell accent={C.teal} value={d.volunteers} label={tr.dash.cardVolunteers} onClick={() => a.openDisaster(d.slug, 'overview')} />
                    </div>

                    {c.topNeeds.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {c.topNeeds.map((n) => (
                          <div key={n.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            background: C.canvas, border: `1px solid ${C.borderFaint}`,
                            borderLeft: `3px solid ${(PRI[n.priority] ?? PRI.Normal).bar}`, borderRadius: 8, padding: '7px 10px',
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <PriorityBadge p={n.priority} />
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                            </span>
                            <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: (PRI[n.priority] ?? PRI.Normal).bar, whiteSpace: 'nowrap' }}>
                              {n.remaining} {n.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
                      <span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>
                        {tr.dash.openedAt(formatDate(d.openedAt))} · {tr.common.updated(d.updatedLabel)}
                      </span>
                      <button onClick={() => a.openDisaster(d.slug, 'needs')} style={{
                        background: active ? G.navyBtn : C.surface, border: `1px solid ${active ? C.navy : C.borderSoft}`,
                        color: active ? '#fff' : C.navy, borderRadius: 9, padding: '10px 15px',
                        fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                      }}>{tr.dash.open}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.dash.noMatch}</div>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.dash.noMatchBody}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{ background: G.criticalPanel, border: '1px solid #F3DADA', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <LiveDot /><span style={eyebrow}>{tr.dash.urgentTitle}</span>
            </div>
            {ov.urgent.map((n) => (
              <button key={`${n.disasterId}-${n.id}`} onClick={() => a.openDisaster(n.disasterSlug, 'needs')} className="hv-navy" style={{
                textAlign: 'left', background: C.surface, border: '1px solid #F1DEDE',
                borderLeft: `3px solid ${(PRI[n.priority] ?? PRI.Normal).bar}`, borderRadius: 10, padding: '10px 12px',
                cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
              }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', minWidth: 0 }}>
                  <PriorityBadge p={n.priority} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>{n.name}</span>
                  <span style={{ fontSize: 11.5, color: C.muted2, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Ico n="pin" size={11} color={C.muted3} />{n.disasterName}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="tnum" style={{ display: 'block', fontSize: 18, fontWeight: 700, color: (PRI[n.priority] ?? PRI.Normal).bar, letterSpacing: '-.02em' }}>{n.remaining}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{n.unit} {tr.disaster.remainingWord}</span>
                </span>
              </button>
            ))}
            <div style={{ fontSize: 11.5, color: C.muted2 }}>{tr.common.remainingUnchanged}</div>
          </section>

          {/* Citizen reports: a claim count, not a verified fact. Duplicates about
              the same event are merged, so this is "n kişi bildirdi", not n rows. */}
          <section style={{ background: 'linear-gradient(160deg,#FFFFFF,#FFFDF4 60%,#FFF8E5)', border: '1px solid #F2DFA8', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ico n="critical" size={15} color={C.warningText} />
                <span style={eyebrow}>{tr.dashReports.title}</span>
              </span>
              <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{ov.reports.length}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted2, marginTop: -6 }}>{tr.dashReports.note}</div>
            {ov.reports.length > 0 ? ov.reports.slice(0, 4).map((r) => (
              <div key={r.id} style={{ background: C.surface, border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.navy }}>
                      {disasterTypeLabel[r.type]} · {[r.province, r.district].filter(Boolean).join(' / ')}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 1 }}>{r.locationNote}</span>
                  </span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.warningText, whiteSpace: 'nowrap' }}>
                    {tr.reportDisaster.reportedBy(r.reportCount)}
                  </span>
                </div>
                <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
                  {tr.reportDisaster.observedOn(formatDate(r.occurredOn))} · {tr.reportDisaster.lastReport(r.lastReportLabel)}
                </span>
                <button onClick={() => void a.confirmDisasterReport(r.id)} className="hv-navy" style={{
                  alignSelf: 'flex-start', background: C.surface, border: `1px solid ${C.borderSoft}`,
                  color: C.navy, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40,
                }}>{tr.dashReports.confirm}</button>
              </div>
            )) : <div style={{ fontSize: 13, color: C.muted }}>{tr.dashReports.empty}</div>}
            <button onClick={() => a.go('reportDisaster')} style={{
              background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
              height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', width: '100%',
            }}>{tr.dashReports.all}</button>
          </section>

          <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <LiveDot color={C.success} /><span style={eyebrow}>{tr.dash.feedTitle}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted2 }}>{tr.dash.feedNote}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
              {ov.log.slice(0, 8).map((e, i, arr) => (
                <div key={e.id} style={{
                  display: 'grid', gridTemplateColumns: '42px 12px 1fr', gap: 9, padding: '9px 0',
                  borderTop: i === 0 ? 0 : `1px solid ${C.borderFaint}`,
                }}>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, paddingTop: 1 }}>{clockLabel(agoMinutes(e.time)) || '·'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color, marginTop: 5, flex: '0 0 9px' }} />
                    {i < arr.length - 1 && <span style={{ flex: 1, width: 2, background: C.borderFaint, marginTop: 3 }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>{e.detail} · {e.time}</span>
                    {e.disasterName && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.heading2,
                        background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '2px 8px', marginTop: 4,
                      }}><Ico n="pin" size={11} color={C.muted} />{e.disasterName}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: G.surfaceSoft, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 3px', color: C.navy }}>{tr.home.howItWorks}</h3>
            <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 12px' }}>{tr.home.howItWorksBody}</p>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tr.home.steps.map((s, i) => {
                const last = i === tr.home.steps.length - 1;
                return (
                  <li key={s.title} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span className="tnum" style={{ width: 24, height: 24, borderRadius: '50%', background: G.navyBtn, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 24px' }}>{i + 1}</span>
                      {!last && <span style={{ flex: 1, width: 2, background: C.border, marginTop: 4 }} />}
                    </div>
                    <div style={{ paddingBottom: last ? 0 : 12 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.navy, paddingTop: 3 }}>{s.title}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <button onClick={() => a.go('howItWorks')} style={{ marginTop: 10, background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}>{tr.home.howVerification}</button>
          </section>
        </div>
      </div>

      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted2, margin: 0, paddingTop: 12, borderTop: `1px solid ${C.borderFaint}` }}>
        {tr.home.disclaimer}
      </p>
    </div>
  );
}
