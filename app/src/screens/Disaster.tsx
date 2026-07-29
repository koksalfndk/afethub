import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { PriorityBadge, ProgressBar, Chip } from '../ui';
import { LocationMap } from '../components/LocationMap';
import type { Filter, Tab } from '../store';

const FILTERS: Filter[] = ['All', 'Critical', 'Urgent', 'Normal', 'Completed'];

export function Disaster() {
  const a = useApp();
  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const needs = enrichSorted(a.snap.needs);
  const pendingSubs = a.snap.subs.filter((s) => s.status === 'Pending verification');
  const pendingUnits = pendingSubs.reduce((x, s) => x + s.qty, 0);
  const activeNeeds = needs.filter((n) => n.remaining > 0).length;
  const completedNeeds = needs.length - activeNeeds;
  const totalReq = needs.reduce((x, n) => x + n.required, 0);
  const totalVer = needs.reduce((x, n) => x + n.verified, 0);
  const fulfil = Math.round((totalVer / totalReq) * 100);

  const summary = [
    { label: tr.disaster.summary.activeNeeds, value: activeNeeds, hint: tr.disaster.summary.activeHint, color: C.navy },
    { label: tr.disaster.summary.completedNeeds, value: completedNeeds, hint: tr.disaster.summary.completedHint, color: C.success },
    { label: tr.disaster.summary.pendingDeliveries, value: pendingSubs.length, hint: tr.disaster.summary.pendingHint(pendingUnits), color: C.warning },
    { label: tr.disaster.summary.verifiedDeliveries, value: a.snap.verifiedTotal, hint: tr.disaster.summary.verifiedHint, color: C.success },
    { label: tr.disaster.summary.volunteers, value: 168, hint: tr.disaster.summary.volunteersHint, color: C.navy },
    { label: tr.disaster.summary.deliveryPoints, value: 2, hint: tr.disaster.summary.deliveryPointsHint, color: C.orange },
  ];

  const q = a.query.trim().toLowerCase();
  const visibleNeeds = needs.filter((n) =>
    (a.filter === 'All' || (a.filter === 'Completed' ? n.remaining === 0 : n.priority === a.filter)) &&
    (!q || n.name.toLowerCase().includes(q) || n.cat.toLowerCase().includes(q)),
  );
  const criticalNeeds = needs.filter((n) => n.priority === 'Critical').slice(0, 3);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: tr.disaster.tabs.overview },
    { key: 'needs', label: tr.disaster.tabs.needs },
    { key: 'locations', label: tr.disaster.tabs.locations },
    { key: 'announcements', label: tr.disaster.tabs.announcements },
    { key: 'activity', label: tr.disaster.tabs.activity },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => a.go('home')} style={{ background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>{tr.disaster.allDisasters}</button>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0, color: C.navy }}>{a.snap.disaster.name}</h1>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 4 }}>{tr.disaster.openedUpdated(a.snap.disaster.openedAt, a.snap.disaster.updatedLabel)}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.emergency }} />{tr.disaster.active}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {summary.map((c) => (
          <div key={c.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: c.color, letterSpacing: '-.02em' }}>{c.value}</div>
            <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 2 }}>{c.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 4, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => a.setTab(t.key)} style={{ background: 'none', border: 0, borderBottom: `2px solid ${a.tab === t.key ? C.emergency : 'transparent'}`, cursor: 'pointer', padding: '12px 12px', fontSize: 14, fontWeight: 600, color: a.tab === t.key ? C.navy : C.muted, whiteSpace: 'nowrap', minHeight: 44 }}>{t.label}</button>
        ))}
      </div>

      {a.tab === 'overview' && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 8px' }}>{tr.disaster.situation}</h3>
            <p style={{ fontSize: 14, color: C.text, margin: 0 }}>{tr.disaster.situationBody}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, background: C.canvas }}>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.disaster.fulfilRate}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.success }}>{fulfil}%</div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, background: C.canvas }}>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.disaster.awaitingVerification}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.warning }}>{tr.disaster.units(pendingUnits)}</div>
              </div>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.disaster.criticalNeeds}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criticalNeeds.map((n) => (
                <div key={n.id} style={{ border: '1px solid #F6C9C9', background: '#FEF7F7', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{n.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.emergency }}>{tr.disaster.left(n.remaining)}</span>
                  </div>
                  <div style={{ marginTop: 10 }}><ProgressBar pct={n.pctVal} color={C.emergency} height={6} track="#F1D6D6" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {a.tab === 'needs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={a.query} onChange={(e) => a.setQuery(e.target.value)} placeholder={tr.disaster.searchNeeds} style={{ flex: '1 1 220px', minWidth: 180, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '11px 13px', fontSize: 14, color: C.navy, minHeight: 44 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => <Chip key={f} label={tr.disaster.filters[f]} active={a.filter === f} onClick={() => a.setFilter(f)} />)}
            </div>
          </div>

          {visibleNeeds.length > 0 ? (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.need }}>
              {visibleNeeds.map((n) => (
                <div key={n.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{n.name}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>{n.cat} · {tr.common.updated(n.updated)}</div>
                    </div>
                    <PriorityBadge p={n.priority} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: C.heading2 }}>
                      <span>{tr.disaster.verifiedUnit(n.verified, n.required, n.unit)}</span>
                      <span style={{ color: n.barColor }}>{n.pctVal}%</span>
                    </div>
                    <div style={{ marginTop: 7 }}><ProgressBar pct={n.pctVal} color={n.barColor} height={8} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                    {[[tr.common.verified, n.verified, C.success], [tr.common.pending, n.pending, C.warning], [tr.common.remaining, n.remaining, C.navy]].map(([lbl, val, col]) => (
                      <div key={lbl as string} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 9px' }}>
                        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{lbl}</div>
                        <div style={{ fontSize: 15.5, fontWeight: 700, color: col as string }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{tr.common.dropOff(n.loc)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button onClick={() => a.prefillReport(n.id, n.unit, n.loc)} style={{ flex: '1 1 150px', background: n.done ? C.muted3 : C.emergency, border: `1px solid ${n.done ? C.muted3 : C.emergency}`, color: '#fff', borderRadius: 9, padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{n.done ? tr.disaster.fullyCovered : tr.disaster.iDelivered}</button>
                    <button onClick={() => a.showToast(tr.toasts.detail(n.name, n.verified, n.pending, n.remaining))} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.details}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.disaster.noNeedsTitle}</div>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.disaster.noNeedsBody}</div>
              <button onClick={a.clearFilters} style={{ marginTop: 14, background: C.navy, border: 0, color: '#fff', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.disaster.clearFilters}</button>
            </div>
          )}
        </div>
      )}

      {a.tab === 'locations' && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
          {a.snap.locations.map((l) => (
            <div key={l.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ height: 132, position: 'relative', borderBottom: `1px solid ${C.border}` }}>
                <LocationMap lat={l.lat} lng={l.lng} tone={l.statusTone} label={l.name} />
                <span style={{ position: 'absolute', bottom: 8, left: 10, zIndex: 500, background: 'rgba(255,255,255,.92)', border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '4px 8px', fontSize: 11.5, fontWeight: 600, color: C.heading2 }}>{l.coords}</span>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{l.address}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: l.statusTone === 'green' ? C.successText : C.warningText, background: l.statusTone === 'green' ? '#EAF7EF' : '#FFF8E5', border: `1px solid ${l.statusTone === 'green' ? '#C9E9D6' : '#F2DFA8'}`, borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap' }}>{l.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: '6px 10px', fontSize: 13 }}>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.hours}</span><span style={{ color: C.heading2 }}>{l.hours}</span>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.accepts}</span><span style={{ color: C.heading2 }}>{l.accepts}</span>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.contact}</span><span style={{ color: C.heading2 }}>{l.contact} · {l.phone}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '11px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.openMap}</button>
                  <button onClick={() => a.go('disaster', { tab: 'needs' })} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '11px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.viewNeeds}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {a.tab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {a.snap.announcements.map((an) => (
            <div key={an.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${an.accent}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: an.accent }}>{an.kind}</span>
                <span style={{ fontSize: 12, color: C.muted2 }}>{an.time} · {an.author}</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 6, color: C.navy }}>{an.title}</div>
              <div style={{ fontSize: 14, color: C.text, marginTop: 4 }}>{an.body}</div>
            </div>
          ))}
        </div>
      )}

      {a.tab === 'activity' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0 }}>{tr.disaster.activityLog}</h3>
            <span style={{ fontSize: 12, color: C.muted2 }}>{tr.disaster.immutableNote}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            {a.snap.log.map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, marginTop: 5 }} />
                  <span style={{ flex: 1, width: 2, background: C.border }} />
                </div>
                <div style={{ paddingBottom: 18 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{e.action}</span>
                    <span style={{ fontSize: 12.5, color: C.muted2 }}>{e.time} · {e.user}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: C.text, marginTop: 3 }}>{e.detail}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12.5, color: C.muted }}>
                    <span style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 7px' }}>{tr.disaster.was(e.oldValue)}</span>
                    <span>→</span>
                    <span style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 6, padding: '3px 7px', color: C.successText, fontWeight: 600 }}>{tr.disaster.now(e.newValue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
