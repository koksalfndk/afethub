import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { ProgressBar, StatCard, Ico, type IcoName } from '../ui';
import { useAuth } from '../auth';

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

  // Same accent-only stat card as the public disaster page, so both roles read the
  // operational counters the same way.
  const cards: { label: string; value: number; hint: string; accent: string; icon: IcoName; onClick: () => void }[] = [
    { label: tr.coord.cards.criticalNeeds, value: needs.filter((n) => n.priority === 'Critical').length, hint: tr.coord.cards.criticalHint, accent: C.emergency, icon: 'critical', onClick: () => a.go('coordNeeds') },
    { label: tr.coord.cards.pendingDeliveries, value: pendingSubs.length, hint: tr.coord.cards.pendingHint(pendingUnits), accent: C.warning, icon: 'pending', onClick: () => { a.setSubFilter('Pending'); a.go('coordQueue'); } },
    { label: tr.coord.cards.verifiedToday, value: verifiedToday, hint: tr.coord.cards.verifiedHint, accent: C.success, icon: 'verified', onClick: () => { a.setSubFilter('Verified'); a.go('coordQueue'); } },
    { label: tr.coord.cards.completedNeeds, value: completedNeeds, hint: tr.coord.cards.completedHint, accent: C.success, icon: 'completed', onClick: () => a.go('coordNeeds') },
    { label: tr.coord.cards.openRequests, value: 3, hint: tr.coord.cards.openRequestsHint, accent: C.orange, icon: 'need', onClick: () => a.showToast(tr.coord.requestsToast) },
    { label: tr.coord.cards.pendingVolunteers, value: 11, hint: tr.coord.cards.pendingVolunteersHint, accent: C.teal, icon: 'people', onClick: () => a.showToast(tr.coord.volunteersToast) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{tr.coord.dashTitle}</h1>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{tr.coord.dashSubtitle(a.snap.disaster.name)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => a.go('coordNeeds')} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.coord.newNeed}</button>
          <button onClick={() => a.go('coordQueue')} style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 9, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.coord.reviewQueue}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {cards.map((c) => (
          <StatCard key={c.label} accent={c.accent} icon={c.icon} label={c.label} value={c.value} hint={c.hint} onClick={c.onClick} />
        ))}
      </div>

      <MembershipCard />

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

// Which institution / association / volunteer group the signed-in coordinator belongs
// to. Shown here because it is operational context: it tells the person (and anyone
// looking over their shoulder) on whose behalf they are acting. The badge repeats the
// account page's rule — a self-declared membership stays "Doğrulama bekliyor" until a
// coordinator confirms it, so this panel never implies an affiliation is proven.
function MembershipCard() {
  const a = useApp();
  const auth = useAuth();
  const p = auth.profile;
  const org = p?.orgId ? a.orgs.find((o) => o.id === p.orgId) ?? null : null;
  const verified = !!p?.orgVerified;

  return (
    <section style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${org ? (verified ? C.success : C.warning) : C.borderSoft}`,
      borderRadius: 12, padding: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', minWidth: 0 }}>
        <span style={{
          width: 40, height: 40, flex: '0 0 40px', borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${C.borderFaint}`, background: C.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {org?.logo
            ? <img src={org.logo} alt="" width={32} height={32} loading="lazy"
                style={{ width: 32, height: 32, objectFit: 'contain', display: 'block' }} />
            : <Ico n="people" size={18} color={C.muted2} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted2 }}>
            {tr.account.panelMembership}
          </div>
          {org ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginTop: 2 }}>{org.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>
                {[p?.orgTitle, org.kind, org.scope === 'Ulusal' ? tr.orgs.national : org.province]
                  .filter(Boolean).join(' · ')}
              </div>
              {/* Status in text as well as colour (rules/04 §Accessibility). */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
                fontSize: 12, fontWeight: 700,
                color: verified ? C.successText : C.warningText,
              }}>
                <Ico n={verified ? 'verified' : 'pending'} size={13} color={verified ? C.success : C.warning} />
                {verified ? tr.account.orgVerified : tr.account.orgPending}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{tr.account.panelNoOrg}</div>
          )}
        </div>
      </div>
      <button onClick={() => a.go('account')} className="hv-navy" style={{
        background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
        height: 42, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>{org ? tr.nav.account : tr.account.panelAddOrg}</button>
    </section>
  );
}
