import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';

export function Header() {
  const a = useApp();
  const coord = a.role === 'coordinator';
  const mob = a.device === 'mobile';
  const pending = a.snap ? a.snap.subs.filter((s) => s.status === 'Pending verification').length : 0;

  const navItem = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      background: active ? C.chipNavyBg : 'transparent', border: 0, cursor: 'pointer',
      padding: '9px 12px', borderRadius: 8, fontSize: 14, fontWeight: active ? 600 : 500,
      color: active ? C.navy : C.text,
    }}>{label}</button>
  );

  const nav = coord
    ? [
        navItem(tr.nav.dashboard, a.route === 'coordHome', () => a.go('coordHome')),
        navItem(tr.nav.reviewQueue, a.route === 'coordQueue', () => a.go('coordQueue')),
        navItem(tr.nav.needs, a.route === 'coordNeeds', () => a.go('coordNeeds')),
        navItem(tr.nav.auditLog, a.route === 'coordLog', () => a.go('coordLog')),
      ]
    : [
        navItem(tr.nav.activeDisasters, a.route === 'home', () => a.go('home')),
        navItem(tr.nav.needs, a.route === 'disaster', () => a.go('disaster', { tab: 'needs' })),
        navItem(tr.nav.deliveryLocations, false, () => a.go('disaster', { tab: 'locations' })),
        navItem(tr.nav.howItWorks, a.route === 'system', () => a.go('system')),
      ];

  return (
    <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: 'relative', zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: mob ? '12px 14px' : '14px 28px' }}>
        <button onClick={() => a.go(coord ? 'coordHome' : 'home')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>A</span>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.01em', color: C.navy }}>{tr.brand}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, border: `1px solid ${C.borderSoft}`, borderRadius: 5, padding: '2px 5px' }}>
            {coord ? tr.modeCoordinator : tr.modePublic}
          </span>
        </button>

        {!mob && <nav style={{ display: 'flex', gap: 2, marginLeft: 8 }}>{nav}</nav>}
        <div style={{ flex: 1 }} />

        {coord ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, background: '#FEF3F2', border: '1px solid #F6C9C9', color: C.emergency, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.emergency, animation: 'afetPulse 1.8s infinite' }} />
              {mob ? String(pending) : tr.header.awaiting(pending)}
            </span>
            {!mob && <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>EK</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => a.go('track')} className="hv-navy" style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 44 }}>{tr.header.track}</button>
            {!mob && <button style={{ background: C.navy, border: `1px solid ${C.navy}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', minHeight: 44 }}>{tr.header.login}</button>}
          </div>
        )}
      </div>
    </header>
  );
}
