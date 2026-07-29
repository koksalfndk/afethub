import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { ProgressBar } from '../ui';

export function CoordHome() {
  const a = useApp();
  if (!a.snap) return null;
  const L = cols(a.device === 'mobile');
  const needs = enrichSorted(a.snap.needs);
  const pendingSubs = a.snap.subs.filter((s) => s.status === 'Pending verification');
  const pendingUnits = pendingSubs.reduce((x, s) => x + s.qty, 0);
  const activeNeeds = needs.filter((n) => n.remaining > 0).length;
  const completedNeeds = needs.length - activeNeeds;
  const verifiedToday = a.snap.subs.filter((s) => s.status === 'Verified' || s.status === 'Partially verified').length;
  const nearDone = needs.slice().sort((x, y) => y.pctVal - x.pctVal).slice(0, 4);
  const recent = a.snap.log.slice(0, 4);

  const cards = [
    { label: tr.coord.cards.criticalNeeds, value: needs.filter((n) => n.priority === 'Critical').length, hint: tr.coord.cards.criticalHint, color: C.emergency, onClick: () => a.go('coordNeeds') },
    { label: tr.coord.cards.pendingDeliveries, value: pendingSubs.length, hint: tr.coord.cards.pendingHint(pendingUnits), color: C.warning, onClick: () => { a.setSubFilter('Pending'); a.go('coordQueue'); } },
    { label: tr.coord.cards.verifiedToday, value: verifiedToday, hint: tr.coord.cards.verifiedHint, color: C.success, onClick: () => { a.setSubFilter('Verified'); a.go('coordQueue'); } },
    { label: tr.coord.cards.completedNeeds, value: completedNeeds, hint: tr.coord.cards.completedHint, color: C.success, onClick: () => a.go('coordNeeds') },
    { label: tr.coord.cards.openRequests, value: 3, hint: tr.coord.cards.openRequestsHint, color: C.orange, onClick: () => a.showToast(tr.coord.requestsToast) },
    { label: tr.coord.cards.pendingVolunteers, value: 11, hint: tr.coord.cards.pendingVolunteersHint, color: C.navy, onClick: () => a.showToast(tr.coord.volunteersToast) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{tr.coord.dashTitle}</h1>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{tr.coord.dashSubtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => a.go('coordNeeds')} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.coord.newNeed}</button>
          <button onClick={() => a.go('coordQueue')} style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 9, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.coord.reviewQueue}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {cards.map((c) => (
          <button key={c.label} onClick={c.onClick} className="hv-navy" style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 14, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{c.label}</div>
            <div style={{ fontSize: 25, fontWeight: 700, marginTop: 6, color: c.color, letterSpacing: '-.02em' }}>{c.value}</div>
            <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 2 }}>{c.hint}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.coord.nearDone}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {nearDone.map((n) => (
              <div key={n.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}>
                  <span>{n.name}</span><span style={{ color: C.muted }}>{n.verified}/{n.required}</span>
                </div>
                <div style={{ marginTop: 6 }}><ProgressBar pct={n.pctVal} color={n.barColor} height={7} /></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.coord.latestActivity}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, marginTop: 6, flex: '0 0 8px' }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</div>
                  <div style={{ fontSize: 12.5, color: C.muted2 }}>{e.detail} · {e.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
