import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { PriorityBadge, ProgressBar, Chip, StatCard, LiveDot, Ico, filterSelectStyle, type IcoName } from '../ui';
import { detailPairs } from '../needForm';
import { LocationMap } from '../components/LocationMap';
import { isToday } from '../util';
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

  // Volunteer and delivery-point figures come from the snapshot, not constants,
  // so the summary can never drift from what the disaster page actually lists.
  const openingSoon = a.snap.locations.filter((l) => l.statusTone === 'yellow').length;
  const summary: { label: string; value: number; hint: string; accent: string; icon: IcoName }[] = [
    { label: tr.disaster.summary.activeNeeds, value: activeNeeds, hint: tr.disaster.summary.activeHint, accent: C.navy, icon: 'need' },
    { label: tr.disaster.summary.completedNeeds, value: completedNeeds, hint: tr.disaster.summary.completedHint, accent: C.success, icon: 'completed' },
    { label: tr.disaster.summary.pendingDeliveries, value: pendingSubs.length, hint: tr.disaster.summary.pendingHint(pendingUnits), accent: C.warning, icon: 'pending' },
    { label: tr.disaster.summary.verifiedDeliveries, value: a.snap.verifiedTotal, hint: tr.disaster.summary.verifiedHint, accent: C.success, icon: 'verified' },
    { label: tr.disaster.summary.volunteers, value: a.snap.disaster.volunteers, hint: tr.disaster.summary.volunteersHint(a.snap.disaster.onShift), accent: C.teal, icon: 'people' },
    { label: tr.disaster.summary.deliveryPoints, value: a.snap.locations.length, hint: tr.disaster.summary.deliveryPointsHint(openingSoon), accent: C.info, icon: 'pin' },
  ];

  // Needs filtering: free-text search plus the secondary filters (category,
  // delivery point, critical-only, updated today). Every clause is additive.
  const q = a.query.trim().toLowerCase();
  const visibleNeeds = needs.filter((n) => {
    const priorityOk = a.filter === 'All' || (a.filter === 'Completed' ? n.remaining === 0 : n.priority === a.filter);
    const searchOk = !q
      || n.name.toLowerCase().includes(q)
      || n.cat.toLowerCase().includes(q)
      || n.loc.toLowerCase().includes(q);
    return priorityOk && searchOk
      && (!a.catFilter || n.cat === a.catFilter)
      && (!a.locFilter || n.loc === a.locFilter)
      && (!a.onlyCritical || n.priority === 'Critical')
      && (!a.updatedToday || isToday(n.updated));
  });
  const categories = Array.from(new Set(needs.map((n) => n.cat))).sort((x, y) => x.localeCompare(y, 'tr'));
  const dropOffs = Array.from(new Set(needs.map((n) => n.loc))).sort((x, y) => x.localeCompare(y, 'tr'));
  const anyFilter = a.filter !== 'All' || !!q || !!a.catFilter || !!a.locFilter || a.onlyCritical || a.updatedToday;
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
            <LiveDot size={6} />{tr.disaster.active}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {summary.map((c) => (
          <StatCard key={c.label} accent={c.accent} icon={c.icon} label={c.label} value={c.value} hint={c.hint} />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', minWidth: 180, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '0 12px', minHeight: 44 }}>
                <Ico n="search" size={15} color={C.muted2} />
                <input
                  value={a.query}
                  onChange={(e) => a.setQuery(e.target.value)}
                  placeholder={tr.disaster.searchNeeds}
                  aria-label={tr.disaster.searchNeeds}
                  style={{ border: 0, background: 'none', outline: 'none', fontSize: 14, color: C.navy, padding: '11px 0', width: '100%', minWidth: 0 }}
                />
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FILTERS.map((f) => <Chip key={f} label={tr.disaster.filters[f]} active={a.filter === f} onClick={() => a.setFilter(f)} />)}
              </div>
            </div>

            {/* Secondary filters — narrow the list without adding a second toolbar. */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={a.catFilter} onChange={(e) => a.setCatFilter(e.target.value)} aria-label={tr.disaster.filtersMore.allCategories} style={filterSelectStyle}>
                <option value="">{tr.disaster.filtersMore.allCategories}</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={a.locFilter} onChange={(e) => a.setLocFilter(e.target.value)} aria-label={tr.disaster.filtersMore.allLocations} style={filterSelectStyle}>
                <option value="">{tr.disaster.filtersMore.allLocations}</option>
                {dropOffs.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <Chip label={tr.disaster.filtersMore.onlyCritical} active={a.onlyCritical} onClick={a.toggleOnlyCritical} accent={C.emergency} />
              <Chip label={tr.disaster.filtersMore.updatedToday} active={a.updatedToday} onClick={a.toggleUpdatedToday} />
              <Chip label={tr.disaster.filtersMore.myArea} active={false} onClick={() => {}} disabled />
              <span style={{ flex: 1, minWidth: 4 }} />
              <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{tr.disaster.filtersMore.count(visibleNeeds.length, needs.length)}</span>
              {anyFilter && (
                <button onClick={a.clearFilters} style={{ background: 'none', border: 0, padding: '6px 2px', fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}>{tr.disaster.filtersMore.clear}</button>
              )}
            </div>
          </div>

          {visibleNeeds.length > 0 ? (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.need }}>
              {visibleNeeds.map((n) => (
                // Priority is carried by the top border AND the badge — never colour alone (rule 04).
                <div key={n.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${n.barColor}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{n.name}</div>
                    <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>{n.cat} · {tr.common.updated(n.updated)}</div>
                  </div>

                  {/* Remaining is the decision-driving number, so it is the largest
                      element on the card — never the requested quantity (rule 04). */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div className="tnum" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: n.barColor }}>{n.remaining}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginTop: 4 }}>
                        {n.done ? tr.disaster.coveredWord : `${n.unit} ${tr.disaster.remainingWord}`}
                      </div>
                    </div>
                    <PriorityBadge p={n.priority} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 600, color: C.heading2 }}>
                      <span className="tnum">{tr.disaster.verifiedUnit(n.verified, n.required, n.unit)}</span>
                      <span className="tnum" style={{ color: C.muted2, fontWeight: 500 }}>{n.pctVal}%</span>
                    </div>
                    <div style={{ marginTop: 7 }}><ProgressBar pct={n.pctVal} color={n.barColor} height={8} /></div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, fontWeight: 600 }}>
                      <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.successText }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.success, flex: '0 0 7px' }} />
                        {tr.disaster.verifiedInline(n.verified)}
                      </span>
                      <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.warningText }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.warning, flex: '0 0 7px' }} />
                        {tr.disaster.pendingInline(n.pending)}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: 12.5, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ico n="pin" size={14} color={C.muted2} />{tr.common.dropOff(n.loc)}
                  </div>
                  {detailPairs(n.details).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detailPairs(n.details).map(([k, val]) => (
                        <span key={k} style={{ fontSize: 12, color: C.heading2, background: C.chipNavyBg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '3px 8px' }}>
                          <b style={{ fontWeight: 600 }}>{k}:</b> {val}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Primary action stays visually dominant; details is a quiet secondary. */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button onClick={() => a.prefillReport(n.id, n.unit, n.loc)} className={n.done ? undefined : 'hv-emergency'} style={{ flex: '1 1 160px', background: n.done ? C.muted3 : C.emergency, border: `1px solid ${n.done ? C.muted3 : C.emergency}`, color: '#fff', borderRadius: 9, padding: '13px 16px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{n.done ? tr.disaster.fullyCovered : tr.disaster.iDelivered}</button>
                    <button onClick={() => a.showToast(tr.toasts.detail(n.name, n.verified, n.pending, n.remaining))} className="hv-navy" style={{ flex: '0 0 auto', background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.heading2, borderRadius: 9, padding: '13px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.common.details}</button>
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
