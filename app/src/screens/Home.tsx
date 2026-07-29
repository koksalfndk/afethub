import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { Btn, PriorityBadge, LiveDot, Ico, MetricCell, eyebrow } from '../ui';
import { agoMinutes, clockLabel } from '../util';

export function Home() {
  const a = useApp();
  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const snap = a.snap;
  const needs = enrichSorted(snap.needs);
  const open = needs.filter((n) => n.remaining > 0);
  const topNeeds = open.slice(0, 3);
  const activeNeeds = open.length;
  const pending = snap.subs.filter((s) => s.status === 'Pending verification').length;

  // Freshness signals come from the audit log's own offsets — nothing here is
  // synthesised, so the panel can never look "live" while showing stale numbers
  // (rule 01: no misleading urgency, meaningful last-updated timestamp).
  const verifications = snap.log
    .filter((e) => e.action.toLowerCase().includes('doğrulan'))
    .map((e) => ({ e, min: agoMinutes(e.time) }))
    .sort((x, y) => x.min - y.min);
  const lastVerify = verifications.find((v) => Number.isFinite(v.min));

  // Live activity feed: the same immutable log, newest first.
  const feed = snap.log
    .map((e) => ({ e, min: agoMinutes(e.time) }))
    .sort((x, y) => x.min - y.min)
    .slice(0, 6);

  const heroStats = [
    { value: activeNeeds, label: tr.home.heroStats.activeNeeds, color: C.navy },
    { value: snap.verifiedTotal, label: tr.home.heroStats.verifiedDeliveries, color: C.successText },
    { value: pending, label: tr.home.heroStats.awaiting, color: C.warningText },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: L.heroPad, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 260 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '5px 11px', fontSize: 12.5, fontWeight: 600 }}>
            <LiveDot />{tr.home.activeBadge}
          </span>
          <h1 style={{ fontSize: L.h1, lineHeight: 1.08, letterSpacing: '-.025em', fontWeight: 700, margin: '16px 0 0', color: C.navy }}>{tr.home.heroTitle1}<br />{tr.home.heroTitle2}</h1>
          <p style={{ fontSize: 16, color: C.text, margin: '14px 0 0', maxWidth: '46ch' }}>{tr.home.heroBody}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Btn variant="emergency" className="hv-emergency" onClick={() => a.openDisaster(snap.disaster.slug, 'needs')}>{tr.home.viewNeeds}</Btn>
            <Btn variant="secondary" className="hv-navy" onClick={() => a.go('report')}>{tr.home.reportAid}</Btn>
          </div>
          <div style={{ display: 'flex', gap: 22, marginTop: 24, flexWrap: 'wrap' }}>
            {heroStats.map((h) => (
              <div key={h.label}>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: h.color }}>{h.value}</div>
                <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{h.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live operations panel — the current operation, its open needs and the
            remaining quantity of the most urgent ones. Rows are actionable. */}
        <div style={{ flex: '1 1 320px', minWidth: 260, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <LiveDot color={C.success} />
            <span style={eyebrow}>{tr.home.liveOps}</span>
          </div>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy, marginTop: 8 }}>{snap.disaster.name}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <span>{tr.home.activeNeedsCount(activeNeeds)}</span>
            {lastVerify && (
              <span className="tnum">· {tr.home.lastVerification} {clockLabel(lastVerify.min)} · {lastVerify.e.time}</span>
            )}
          </div>

          <div style={{ height: 1, background: C.border, margin: '13px 0 11px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topNeeds.map((n) => (
              <button
                key={n.id}
                onClick={() => a.prefillReport(n.id, n.unit, n.loc)}
                className="hv-navy"
                style={{
                  textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${n.barColor}`, borderRadius: 9, padding: '10px 12px',
                  cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                }}
              >
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

          <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 11 }}>{tr.common.remainingUnchanged}</div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: C.navy }}>{tr.home.activeDisasters}</h2>
          <span style={{ fontSize: 13, color: C.muted }}>{tr.common.updated(snap.disaster.updatedLabel)}</span>
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.card, alignItems: 'start' }}>
          {snap.disasters.filter((d) => d.status === 'Active').map((d) => {
            // Counters below are scoped to the loaded snapshot; for any other
            // disaster we show "—" rather than borrowing this one's numbers.
            const loaded = d.id === snap.disaster.id;
            const dash = '—';
            const metrics = [
              { accent: C.navy, value: loaded ? activeNeeds : dash, label: tr.home.metrics.activeNeeds },
              { accent: C.info, value: loaded ? snap.locations.length : dash, label: tr.home.metrics.deliveryPoints },
              { accent: C.teal, value: d.volunteers, label: tr.home.metrics.volunteers },
              { accent: C.warning, value: loaded ? pending : dash, label: tr.home.metrics.pendingDeliveries },
            ];
            return (
              <div key={d.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.emergency}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 9, minWidth: 0 }}>
                    <span style={{ paddingTop: 3 }}><Ico n="pin" size={18} color={C.emergency} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>{d.name}</div>
                      <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{d.region}</div>
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <LiveDot size={6} />{tr.home.active}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9 }}>
                  {metrics.map((m) => <MetricCell key={m.label} accent={m.accent} value={m.value} label={m.label} />)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.home.lastUpdate} · {d.updatedLabel}</span>
                  <button onClick={() => a.openDisaster(d.slug, 'overview')} style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.home.openCoordination}</button>
                </div>
              </div>
            );
          })}

          {/* Live activity feed — the immutable audit log, newest first. It grows
              as real coordinator and contributor actions are recorded. */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <LiveDot color={C.success} />
                <span style={eyebrow}>{tr.home.feedTitle}</span>
              </span>
              <span style={{ fontSize: 11.5, color: C.muted2 }}>{tr.home.feedNote}</span>
            </div>

            {feed.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {feed.map(({ e, min }) => (
                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '42px 12px 1fr', gap: 9, alignItems: 'flex-start' }}>
                    <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, paddingTop: 1 }}>{clockLabel(min) || '·'}</span>
                    <span style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, flex: '0 0 8px' }} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>{e.detail} · {e.time}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: C.muted }}>{tr.home.feedEmpty}</div>
            )}

            <button
              onClick={() => a.openDisaster(snap.disaster.slug, 'activity')}
              style={{ alignSelf: 'flex-start', marginTop: 'auto', background: 'none', border: 0, padding: 0, fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}
            >{tr.home.feedAll}</button>
          </div>
        </div>
      </section>

      {/* One continuous timeline instead of four isolated cards. */}
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: C.navy }}>{tr.home.howItWorks}</h2>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.home.howItWorksBody}</p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 660 }}>
          {tr.home.steps.map((s, i) => {
            const last = i === tr.home.steps.length - 1;
            return (
              <li key={s.title} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className="tnum" style={{ width: 26, height: 26, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 26px' }}>{i + 1}</span>
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
