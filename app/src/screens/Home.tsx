import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G, PRI, D, type PriorityKey } from '../theme';
import { LiveDot, Ico, PriorityBadge, MetricCell, ProgressBar, eyebrow, type IcoName } from '../ui';
import { agoMinutes, clockLabel, formatDate } from '../util';
import { HeroBanner } from '../components/HeroBanner';
import type { DisasterType } from '../types';
import type { DisasterCard } from '../data/repo';

// Icon per disaster kind — a colour-coded category marker, never decoration.
const TYPE_ICON: Record<DisasterType, IcoName> = {
  Wildfire: 'critical', Flood: 'activity', Earthquake: 'critical',
  Storm: 'activity', Evacuation: 'people', Other: 'need',
};
const TYPE_ORDER: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];

// Visually hidden but announced: the action column needs a name for screen readers
// while staying blank on screen (rules/04 §Accessibility).
const srOnly = {
  position: 'absolute' as const, width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden' as const, clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' as const, border: 0,
};

function chipStyle(active: boolean) {
  return {
    background: active ? C.navy : C.surface,
    border: `1px solid ${active ? C.navy : C.borderSoft}`,
    color: active ? '#fff' : C.heading2,
    borderRadius: 20, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40,
  } as const;
}

// An operation's headline priority is the worst priority among its open needs —
// derived, never stored, so it cannot drift from the needs themselves.
function worstPriority(c: DisasterCard): PriorityKey {
  let worst: PriorityKey = 'Normal';
  for (const n of c.topNeeds) {
    if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[worst] ?? PRI.Normal).rank) worst = n.priority;
  }
  return worst;
}

// The home page is the national dashboard: one row per operation. A single
// disaster's detail lives on its own date-stamped page (/afet/<slug>).
//
// Layout: the six national counters live in ONE dark strip instead of six white
// cards, and operations are table rows instead of cards. Same information, five
// surfaces instead of twelve — the previous version made a visitor scan a dozen
// separate boxes to answer "where is it worst right now" (rules/04 §Dense dashboard
// layouts, §Content Hierarchy). Mobile keeps cards: a six-column table at 390px
// is unusable.
export function Home() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const ov = a.overview;

  const [type, setType] = useState<DisasterType | ''>('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [q, setQ] = useState('');
  const [feedOpen, setFeedOpen] = useState(false);

  if (!ov) return <div style={{ padding: 40, color: C.muted }}>{tr.common.loading}</div>;

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

  // Dark strip cells. Colour lives on the figure only; the labels stay muted so the
  // strip reads as one instrument panel rather than six competing badges.
  const cells: { label: string; value: number; tone: string }[] = [
    { label: tr.dash.totals.disasters, value: ov.totals.activeDisasters, tone: '#FF8A8F' },
    { label: tr.dash.totals.needs, value: ov.totals.activeNeeds, tone: D.fg },
    { label: tr.dash.totals.verified, value: ov.totals.verifiedSubs, tone: D.success },
    { label: tr.dash.totals.pending, value: ov.totals.pendingSubs, tone: D.warning },
    { label: tr.dash.totals.volunteers, value: ov.totals.volunteers, tone: '#7FD8CF' },
    { label: tr.dash.totals.points, value: ov.totals.deliveryPoints, tone: '#9BC7ED' },
  ];

  const panel = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
    overflow: 'hidden' as const,
  };
  const th = {
    textAlign: 'left' as const, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' as const,
    color: C.muted2, fontWeight: 700, padding: '10px 12px', background: '#F7FAFC',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = { padding: '11px 12px', borderBottom: `1px solid ${C.borderFaint}`, verticalAlign: 'middle' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <HeroBanner />

      {/* Sample content must be labelled so it can never pass as verified live data. */}
      {ov.demo && (
        <div style={{
          background: 'linear-gradient(135deg,#FFFDF4,#FFF8E5)', border: '1px solid #F2DFA8',
          borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '10px 13px',
          display: 'flex', gap: 9, alignItems: 'flex-start',
        }}>
          <span style={{ paddingTop: 1 }}><Ico n="critical" size={15} color={C.warningText} /></span>
          <div>
            <b style={{ fontSize: 12.5, color: C.warningText }}>{tr.dash.demoTitle}</b>
            <div style={{ fontSize: 12, color: C.heading2, marginTop: 1 }}>{tr.dash.demoBody}</div>
          </div>
        </div>
      )}

      {/* ---- Komuta şeridi: the six national counters as one panel ---- */}
      <div style={{
        background: G.opsBar, borderRadius: 12, display: 'grid',
        gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))',
        overflow: 'hidden',
      }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{
            padding: mob ? '10px 12px' : '11px 14px',
            borderRight: !mob && i < cells.length - 1 ? `1px solid ${D.rowBd}` : 0,
            borderTop: mob && i > 1 ? `1px solid ${D.rowBd}` : 0,
            borderLeft: mob && i % 2 === 1 ? `1px solid ${D.rowBd}` : 0,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: D.muted }}>{c.label}</div>
            <div className="tnum" style={{ fontSize: mob ? 19 : 21, fontWeight: 700, letterSpacing: '-.02em', color: c.tone, marginTop: 2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.9fr) minmax(290px,1fr)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', minWidth: 180, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: '0 13px', height: 40 }}>
              <Ico n="search" size={15} color={C.muted2} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.dash.searchPh} aria-label={tr.dash.searchPh}
                type="search" autoComplete="off"
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveDot /><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.navy }}>{tr.dash.opsTitle}</h2>
          </div>

          {visible.length === 0 ? (
            <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.dash.noMatch}</div>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.dash.noMatchBody}</div>
            </div>
          ) : mob ? (
            // Mobile: compact rows. Remaining-needs count is the largest element.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((c) => {
                const d = c.disaster;
                const active = d.status === 'Active';
                const p = worstPriority(c);
                return (
                  <article key={d.id} style={{
                    ...panel, borderTop: `3px solid ${active ? (PRI[p] ?? PRI.Normal).bar : C.success}`,
                    padding: 13, display: 'flex', flexDirection: 'column', gap: 10, opacity: active ? 1 : .85,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                        <span style={{ paddingTop: 2 }}><Ico n={TYPE_ICON[d.type]} size={17} color={active ? C.emergency : C.muted2} /></span>
                        <div style={{ minWidth: 0 }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} style={{
                            background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                            fontSize: 15.5, fontWeight: 700, color: C.navy,
                          }}>{d.name}</button>
                          <div style={{ fontSize: 12, color: C.muted2, marginTop: 1 }}>{d.region} · {tr.common.updated(d.updatedLabel)}</div>
                        </div>
                      </div>
                      {active ? <PriorityBadge p={p} /> : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '3px 9px',
                          fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: C.successText,
                          background: '#EAF7EF', border: '1px solid #C9E9D6',
                        }}><Ico n="completed" size={12} />{d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived}</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                      <MetricCell accent={C.navy} value={c.activeNeeds} label={tr.dash.cardNeeds} onClick={() => a.openDisaster(d.slug, 'needs')} />
                      <MetricCell accent={C.warning} value={c.pendingSubs} label={tr.dash.cardPending} onClick={() => a.openDisaster(d.slug, 'activity')} />
                      <MetricCell accent={C.success} value={c.verifiedSubs} label={tr.dash.totals.verified} onClick={() => a.openDisaster(d.slug, 'activity')} />
                      <MetricCell accent={C.info} value={c.deliveryPoints} label={tr.dash.cardPoints} onClick={() => a.openDisaster(d.slug, 'locations')} />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={panel}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>{tr.dash.thOperation}</th>
                    <th style={th}>{tr.dash.thPriority}</th>
                    <th style={th}>{tr.dash.thRemaining}</th>
                    <th style={th}>{tr.dash.thVerified}</th>
                    <th style={th}>{tr.dash.thPending}</th>
                    <th style={th} scope="col"><span style={srOnly}>{tr.dash.openShort}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c, i, arr) => {
                    const d = c.disaster;
                    const active = d.status === 'Active';
                    const p = worstPriority(c);
                    const bar = (PRI[p] ?? PRI.Normal).bar;
                    const totalNeeds = c.activeNeeds + c.completedNeeds;
                    const pct = totalNeeds > 0 ? Math.round((c.completedNeeds / totalNeeds) * 100) : 0;
                    const last = i === arr.length - 1;
                    return (
                      <tr key={d.id} style={{ opacity: active ? 1 : .85 }}>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ paddingTop: 2 }}><Ico n={TYPE_ICON[d.type]} size={16} color={active ? C.emergency : C.muted2} /></span>
                            <div style={{ minWidth: 0 }}>
                              {/* The name is the primary link to the operation. */}
                              <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                                background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                                fontSize: 14.5, fontWeight: 700, color: C.navy,
                              }}>{d.name}</button>
                              <div className="tnum" style={{ fontSize: 12, color: C.muted2, marginTop: 1 }}>
                                {d.region} · {tr.common.updated(d.updatedLabel)} · {tr.dash.openedAt(formatDate(d.openedAt))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          {active ? <PriorityBadge p={p} /> : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '3px 9px',
                              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: C.successText,
                              background: '#EAF7EF', border: '1px solid #C9E9D6',
                            }}><Ico n="completed" size={12} />{d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived}</span>
                          )}
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, minWidth: 150 }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                            background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%',
                          }}>
                            <span className="tnum" style={{ fontSize: 19, fontWeight: 700, color: bar, letterSpacing: '-.02em' }}>{c.activeNeeds}</span>
                            <span style={{ fontSize: 12, color: C.muted, marginLeft: 5 }}>{tr.dash.needsWord}</span>
                            {/* A bar never stands alone — the closed/total count is written out.
                                With nothing closed yet the bar carries no information, so only
                                the sentence is shown; an always-empty track is just noise. */}
                            {c.completedNeeds > 0 && (
                              <span style={{ display: 'block', maxWidth: 130, marginTop: 5 }}>
                                <ProgressBar pct={pct} color={active ? C.success : C.muted3} height={6} />
                              </span>
                            )}
                            <span className="tnum" style={{ display: 'block', fontSize: 11, color: C.muted2, marginTop: 3 }}>
                              {tr.dash.needsClosed(c.completedNeeds, totalNeeds)}
                            </span>
                          </button>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: C.success }}>{c.verifiedSubs}</span>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <button onClick={() => a.openDisaster(d.slug, 'activity')} className="hv-navy" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                            <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: C.warning }}>{c.pendingSubs}</span>
                          </button>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, textAlign: 'right' }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                            background: active ? G.navyBtn : C.surface, border: `1px solid ${active ? C.navy : C.borderSoft}`,
                            color: active ? '#fff' : C.navy, borderRadius: 9, padding: '0 14px', height: 38,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>{tr.dash.openShort}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* The feed is context, not a headline: collapsed by default so the
              operations table owns the first screen. */}
          <div style={panel}>
            <button onClick={() => setFeedOpen((v) => !v)} aria-expanded={feedOpen} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: 'none', border: 0, padding: '13px 14px', cursor: 'pointer', minHeight: 48,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LiveDot color={C.success} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading2 }}>{tr.dash.feedToggle(ov.log.length)}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: C.info }}>
                {feedOpen ? tr.dash.feedClose : tr.dash.feedOpen}
                <span style={{ display: 'block', transform: feedOpen ? 'rotate(180deg)' : undefined }}><Ico n="down" size={14} color={C.info} /></span>
              </span>
            </button>
            {feedOpen && (
              <div style={{ padding: '0 14px 12px' }}>
                <div style={{ fontSize: 11.5, color: C.muted2, paddingBottom: 6 }}>{tr.dash.feedNote}</div>
                {ov.log.slice(0, 10).map((e, i, arr) => (
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
            )}
          </div>
        </div>

        {/* Right column: the two things that are cross-operation by nature. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <section style={{ ...panel, background: G.criticalPanel, border: '1px solid #F3DADA' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px', borderBottom: '1px solid #F3DADA' }}>
              <LiveDot /><span style={eyebrow}>{tr.dash.urgentTitle}</span>
            </div>
            {ov.urgent.map((n, i, arr) => (
              <button key={`${n.disasterId}-${n.id}`} onClick={() => a.openDisaster(n.disasterSlug, 'needs')} className="hv-navy" style={{
                textAlign: 'left', width: '100%', background: 'none', border: 0,
                borderBottom: i === arr.length - 1 ? 0 : '1px solid #F6E7E7',
                borderLeft: `3px solid ${(PRI[n.priority] ?? PRI.Normal).bar}`,
                padding: '10px 12px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
              }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.navy }}>{n.name}</span>
                  <span style={{ fontSize: 11.5, color: C.muted2, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Ico n="pin" size={11} color={C.muted3} />{n.disasterName}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="tnum" style={{ display: 'block', fontSize: 18, fontWeight: 700, color: (PRI[n.priority] ?? PRI.Normal).bar, letterSpacing: '-.02em' }}>{n.remaining}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{n.unit} {tr.disaster.remainingWord}</span>
                </span>
              </button>
            ))}
            <div style={{ fontSize: 11.5, color: C.muted2, padding: '10px 14px', borderTop: '1px solid #F6E7E7' }}>{tr.common.remainingUnchanged}</div>
          </section>

          {/* Citizen reports: a claim count, not a verified fact. Duplicates about
              the same event are merged, so this is "n kişi bildirdi", not n rows. */}
          <section style={{ ...panel, border: '1px solid #F2DFA8' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid #F2DFA8', background: '#FFFDF4' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ico n="critical" size={15} color={C.warningText} />
                <span style={eyebrow}>{tr.dashReports.title}</span>
              </span>
              <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{ov.reports.length}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted2, padding: '8px 14px 0' }}>{tr.dashReports.note}</div>
            {ov.reports.length > 0 ? ov.reports.slice(0, 3).map((r) => (
              <div key={r.id} style={{ padding: '10px 14px', borderTop: `1px solid ${C.borderFaint}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.navy }}>
                      {[r.province, r.district].filter(Boolean).join(' / ')}
                    </span>
                    <span className="tnum" style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1 }}>
                      {disasterTypeLabel[r.type]} · {formatDate(r.occurredOn)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="tnum" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: C.warning }}>{r.reportCount}</span>
                    <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{tr.dashReports.reportedWord}</span>
                  </span>
                </div>
                <button onClick={() => void a.confirmDisasterReport(r.id)} className="hv-navy" style={{
                  alignSelf: 'flex-start', background: C.surface, border: `1px solid ${C.borderSoft}`,
                  color: C.navy, borderRadius: 8, padding: '0 12px', height: 38, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}>{tr.dashReports.confirm}</button>
              </div>
            )) : <div style={{ fontSize: 13, color: C.muted, padding: '10px 14px' }}>{tr.dashReports.empty}</div>}
            <div style={{ padding: '11px 14px', borderTop: `1px solid ${C.borderFaint}` }}>
              <button onClick={a.openDisasterForm} style={{
                background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
                height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', width: '100%',
              }}>{tr.dashReports.all}</button>
            </div>
          </section>

          <button onClick={() => a.go('howItWorks')} className="hv-navy" style={{
            ...panel, background: G.surfaceSoft, textAlign: 'left', cursor: 'pointer',
            padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <span>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.navy }}>{tr.home.howItWorks}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>{tr.home.howItWorksBody}</span>
            </span>
            <Ico n="chev" size={16} color={C.muted2} />
          </button>
        </div>
      </div>

      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted2, margin: 0, paddingTop: 10, borderTop: `1px solid ${C.borderFaint}` }}>
        {tr.home.disclaimer}
      </p>
    </div>
  );
}
