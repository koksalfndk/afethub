import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G, ribbon } from '../theme';
import { enrichSorted, cols } from '../select';
import { PriorityBadge, LiveDot, Ico, MetricCell, StatCard, eyebrow, type IcoName } from '../ui';
import { agoMinutes, clockLabel } from '../util';

export function Home() {
  const a = useApp();
  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const snap = a.snap;
  const needs = enrichSorted(snap.needs);
  const open = needs.filter((n) => n.remaining > 0);
  const activeNeeds = open.length;
  const completedNeeds = needs.length - activeNeeds;
  const pendingSubs = snap.subs.filter((s) => s.status === 'Pending verification');
  const pendingUnits = pendingSubs.reduce((x, s) => x + s.qty, 0);
  const urgent = open.filter((n) => n.priority === 'Critical' || n.priority === 'Urgent').slice(0, 4);

  // Freshness comes from the audit log's own offsets — nothing is synthesised, so
  // the feed can never look live while showing stale numbers (rules/01).
  const feed = snap.log
    .map((e) => ({ e, min: agoMinutes(e.time) }))
    .sort((x, y) => x.min - y.min)
    .slice(0, 5);

  const heroStats = [
    { value: activeNeeds, label: tr.home.heroStats.activeNeeds, color: C.navy },
    { value: snap.verifiedTotal, label: tr.home.heroStats.verifiedDeliveries, color: C.successText },
    { value: pendingSubs.length, label: tr.home.heroStats.awaiting, color: C.warningText },
  ];

  const openingSoon = snap.locations.filter((l) => l.statusTone === 'yellow').length;
  const stats: { label: string; value: number; hint: string; accent: string; icon: IcoName }[] = [
    { label: tr.disaster.summary.activeNeeds, value: activeNeeds, hint: tr.disaster.summary.activeHint, accent: C.navy, icon: 'need' },
    { label: tr.disaster.summary.completedNeeds, value: completedNeeds, hint: tr.disaster.summary.completedHint, accent: C.success, icon: 'completed' },
    { label: tr.disaster.summary.pendingDeliveries, value: pendingSubs.length, hint: tr.disaster.summary.pendingHint(pendingUnits), accent: C.warning, icon: 'pending' },
    { label: tr.disaster.summary.verifiedDeliveries, value: snap.verifiedTotal, hint: tr.disaster.summary.verifiedHint, accent: C.success, icon: 'verified' },
    { label: tr.disaster.summary.volunteers, value: snap.disaster.volunteers, hint: tr.disaster.summary.volunteersHint(snap.disaster.onShift), accent: C.teal, icon: 'people' },
    { label: tr.disaster.summary.deliveryPoints, value: snap.locations.length, hint: tr.disaster.summary.deliveryPointsHint(openingSoon), accent: C.info, icon: 'pin' },
  ];

  const cardBase = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, position: 'relative' as const, overflow: 'hidden' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hero3">
        {/* ---- 1) Operation card: its own header row, then the public call to action ---- */}
        <section style={{ ...cardBase, background: G.heroCard, display: 'flex', flexDirection: 'column' }}>
          <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: G.heroRibbon }} />
          <div style={{ padding: '13px 18px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <LiveDot color={C.success} />
              <span style={eyebrow}>{tr.home.liveOps}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.navy }}>{snap.disaster.name}</span>
            </span>
            <span className="tnum" style={{ fontSize: 12, color: C.muted, paddingLeft: 15 }}>
              {snap.disaster.region} · {tr.home.lastUpdate} {snap.disaster.updatedLabel}
            </span>
          </div>
          <div style={{ height: 1, background: C.borderFaint }} />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h1 style={{ fontSize: L.h1, lineHeight: 1.08, letterSpacing: '-.028em', fontWeight: 700, margin: 0, color: C.navy }}>
              {tr.home.heroTitle1}<br />{tr.home.heroTitle2}
            </h1>
            <p style={{ fontSize: 15, color: C.text, margin: '12px 0 0', maxWidth: '38ch' }}>{tr.home.heroBody}</p>
            <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={() => a.openDisaster(snap.disaster.slug, 'needs')} className="hv-emergency" style={{
                background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
                padding: '0 18px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 2px 8px rgba(191,42,49,.24)',
              }}>{tr.home.viewNeeds}</button>
              <button onClick={() => a.go('report')} className="hv-navy" style={{
                background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
                padding: '0 18px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{tr.home.reportAid}</button>
            </div>

            {/* Divided counter strip — gives the card structure instead of floating numbers. */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginTop: 18,
              border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden', background: C.surface,
            }}>
              {heroStats.map((h, i) => (
                <div key={h.label} style={{ padding: '12px 14px', borderLeft: i === 0 ? 0 : `1px solid ${C.borderFaint}` }}>
                  <div className="tnum" style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.1, color: h.color }}>{h.value}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 500, marginTop: 2 }}>{h.label}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11.5, lineHeight: 1.45, color: C.muted2, margin: 'auto 0 0', paddingTop: 12, marginTop: 18, borderTop: `1px solid ${C.borderFaint}` }}>
              {tr.home.disclaimer}
            </p>
          </div>
        </section>

        {/* ---- 2) Live activity feed, flowing down the middle column ---- */}
        <section style={{ ...cardBase, padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <LiveDot color={C.success} /><span style={eyebrow}>{tr.home.feedTitle}</span>
            </span>
            <span style={{ fontSize: 11.5, color: C.muted2 }}>{tr.home.feedNote}</span>
          </div>

          {feed.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {feed.map(({ e, min }, i) => (
                <div key={e.id} style={{
                  display: 'grid', gridTemplateColumns: '44px 14px 1fr', gap: 9, padding: '9px 0',
                  borderTop: i === 0 ? 0 : `1px solid ${C.borderFaint}`,
                }}>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, paddingTop: 1 }}>{clockLabel(min) || '·'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color, marginTop: 5, flex: '0 0 9px' }} />
                    {i < feed.length - 1 && <span style={{ flex: 1, width: 2, background: C.borderFaint, marginTop: 3 }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>{e.detail} · {e.time}</span>
                    {/* Which operation the event belongs to — matters as soon as a second disaster opens. */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.heading2,
                      background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '2px 8px', marginTop: 4,
                    }}>
                      <Ico n="pin" size={12} color={C.muted} />{snap.disaster.name}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: C.muted }}>{tr.home.feedEmpty}</div>
          )}

          <button onClick={() => a.openDisaster(snap.disaster.slug, 'activity')} className="hv-navy" style={{
            marginTop: 'auto', width: '100%', height: 44, borderRadius: 10, background: C.surface,
            border: `1px solid ${C.borderSoft}`, color: C.navy, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr.home.feedAll}</button>
        </section>

        {/* ---- 3) Most urgent needs ---- */}
        <section className="h3-urgent" style={{
          ...cardBase, background: G.criticalPanel, borderColor: '#F3DADA', padding: 18,
          display: 'flex', flexDirection: 'column', gap: 11,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <LiveDot /><span style={eyebrow}>{tr.home.mostUrgent}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {urgent.map((n) => (
              <button key={n.id} onClick={() => a.prefillReport(n.id, n.unit, n.loc)} className="hv-navy" style={{
                textAlign: 'left', background: C.surface, border: '1px solid #F1DEDE', borderLeft: `3px solid ${n.barColor}`,
                borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
              }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start', minWidth: 0 }}>
                  <PriorityBadge p={n.priority} />
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: C.navy }}>{n.name}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="tnum" style={{ display: 'block', fontSize: 18, fontWeight: 700, color: n.barColor, letterSpacing: '-.02em' }}>{n.remaining}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{n.unit} {tr.disaster.remainingWord}</span>
                </span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted2 }}>{tr.common.remainingUnchanged}</div>
          <button onClick={() => a.openDisaster(snap.disaster.slug, 'needs')} style={{
            marginTop: 'auto', width: '100%', height: 48, borderRadius: 10, background: G.navyBtn,
            border: `1px solid ${C.navy}`, color: '#fff', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr.home.allNeeds}</button>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: L.stat }}>
        {stats.map((s) => <StatCard key={s.label} accent={s.accent} icon={s.icon} label={s.label} value={s.value} hint={s.hint} />)}
      </div>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 13 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: C.navy }}>{tr.home.activeDisasters}</h2>
          <span style={{ fontSize: 13, color: C.muted }}>{tr.common.updated(snap.disaster.updatedLabel)}</span>
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.card, alignItems: 'start' }}>
          {snap.disasters.filter((d) => d.status === 'Active').map((d) => {
            // Counters are scoped to the loaded snapshot; another disaster shows "—".
            const loaded = d.id === snap.disaster.id;
            const dash = '—';
            const metrics = [
              { accent: C.navy, value: loaded ? activeNeeds : dash, label: tr.home.metrics.activeNeeds },
              { accent: C.info, value: loaded ? snap.locations.length : dash, label: tr.home.metrics.deliveryPoints },
              { accent: C.teal, value: d.volunteers, label: tr.home.metrics.volunteers },
              { accent: C.warning, value: loaded ? pendingSubs.length : dash, label: tr.home.metrics.pendingDeliveries },
            ];
            return (
              <div key={d.id} style={{ ...cardBase, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: ribbon(C.emergency) }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 9, minWidth: 0 }}>
                    <span style={{ paddingTop: 3 }}><Ico n="pin" size={18} color={C.emergency} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>{d.name}</div>
                      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{d.region}</div>
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.errorSurface, color: C.emergency, border: `1px solid ${C.errorBorder}`, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <LiveDot size={6} />{tr.home.active}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9 }}>
                  {metrics.map((m) => <MetricCell key={m.label} accent={m.accent} value={m.value} label={m.label} />)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.home.lastUpdate} · {d.updatedLabel}</span>
                  <button onClick={() => a.openDisaster(d.slug, 'overview')} style={{
                    background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
                    padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                  }}>{tr.home.openCoordination}</button>
                </div>
              </div>
            );
          })}

          {/* Delivery points kept a home-page presence after leaving the top menu. */}
          <div style={{ ...cardBase, background: G.surfaceSoft, padding: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: C.navy }}>{tr.nav.deliveryLocations}</h3>
            {snap.locations.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderTop: i === 0 ? 0 : `1px solid ${C.borderFaint}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: C.navy }}>{l.name}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{l.hours}</div>
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
                  color: l.statusTone === 'green' ? C.successText : C.warningText,
                  background: l.statusTone === 'green' ? '#EAF7EF' : '#FFF8E5',
                  border: `1px solid ${l.statusTone === 'green' ? '#C9E9D6' : '#F2DFA8'}`,
                }}>{l.status}</span>
              </div>
            ))}
            <button onClick={() => a.openDisaster(snap.disaster.slug, 'locations')} className="hv-navy" style={{
              marginTop: 12, width: '100%', height: 46, borderRadius: 10, background: C.surface,
              border: `1px solid ${C.borderSoft}`, color: C.navy, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{tr.common.openMap}</button>
          </div>
        </div>
      </section>

      {/* One continuous timeline instead of four isolated cards. */}
      <section style={{ ...cardBase, background: G.surfaceSoft, padding: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: C.navy }}>{tr.home.howItWorks}</h2>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.home.howItWorksBody}</p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 660 }}>
          {tr.home.steps.map((s, i) => {
            const last = i === tr.home.steps.length - 1;
            return (
              <li key={s.title} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="tnum" style={{ width: 26, height: 26, borderRadius: '50%', background: G.navyBtn, color: '#fff', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 26px' }}>{i + 1}</span>
                  {!last && <span style={{ flex: 1, width: 2, background: C.border, marginTop: 4 }} />}
                </div>
                <div style={{ paddingBottom: last ? 0 : 16 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.navy, paddingTop: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{s.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <button onClick={() => a.go('system')} style={{ marginTop: 14, background: 'none', border: 0, padding: 0, fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}>{tr.home.howVerification}</button>
      </section>
    </div>
  );
}
