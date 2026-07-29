import { useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { Ico } from '../ui';
import { AccountModal } from './AccountModal';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AH';
  const a = parts[0][0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (a + b).toUpperCase() || 'AH';
}

export function Header() {
  const a = useApp();
  const auth = useAuth();
  const coord = a.role === 'coordinator';
  const mob = a.device === 'mobile';
  const pending = a.snap ? a.snap.subs.filter((s) => s.status === 'Pending verification').length : 0;
  const loggedIn = auth.enabled && !!auth.user;
  const name = auth.profile?.fullName || '';
  const [accountOpen, setAccountOpen] = useState(false);

  const navItem = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      background: active ? C.chipNavyBg : 'transparent', border: 0, cursor: 'pointer',
      padding: '9px 11px', borderRadius: 8, fontSize: 14, fontWeight: active ? 600 : 500,
      color: active ? C.navy : C.text, whiteSpace: 'nowrap',
    }}>{label}</button>
  );

  const onNeeds = a.route === 'disaster' && a.tab === 'needs';
  const onLocations = a.route === 'disaster' && a.tab === 'locations';

  const nav = coord
    ? [
        navItem(tr.nav.dashboard, a.route === 'coordHome', () => a.go('coordHome')),
        navItem(tr.nav.reviewQueue, a.route === 'coordQueue', () => a.go('coordQueue')),
        navItem(tr.nav.needs, a.route === 'coordNeeds', () => a.go('coordNeeds')),
        navItem(tr.nav.auditLog, a.route === 'coordLog', () => a.go('coordLog')),
      ]
    : [
        navItem(tr.nav.activeDisasters, a.route === 'home', () => a.go('home')),
        navItem(tr.nav.needs, onNeeds, () => a.go('disaster', { tab: 'needs' })),
        navItem(tr.nav.deliveryLocations, onLocations, () => a.go('disaster', { tab: 'locations' })),
        navItem(tr.nav.howItWorks, a.route === 'system', () => a.go('system')),
      ];

  // Operational search: typing filters the needs list, submitting lands on it.
  // Kept visually light (canvas fill, no heavy border) so it never competes with the CTA.
  const search = (
    <form
      className="hdr-search"
      onSubmit={(e) => { e.preventDefault(); a.searchFromHeader(a.query); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: C.canvas,
        border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '0 11px',
        minHeight: 44, flex: '0 1 250px', minWidth: 150,
      }}
    >
      <Ico n="search" size={15} color={C.muted2} />
      <input
        value={a.query}
        onChange={(e) => a.setQuery(e.target.value)}
        placeholder={tr.header.search}
        aria-label={tr.header.searchLabel}
        style={{
          border: 0, background: 'none', outline: 'none', fontSize: 13.5, color: C.navy,
          padding: '11px 0', width: '100%', minWidth: 0,
        }}
      />
    </form>
  );

  const trackBtn = (
    <button onClick={() => a.go('track')} className="hv-navy hdr-track" style={{
      background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 14px',
      fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
    }}>{tr.header.track}</button>
  );

  // The primary public action is helping, so this CTA stays visible at every width —
  // including mobile, where the rest of the right-hand cluster collapses.
  const reportCta = (
    <button onClick={() => a.go('report')} className="hv-emergency" style={{
      background: C.emergency, border: `1px solid ${C.emergency}`, borderRadius: 9,
      padding: mob ? '10px 13px' : '10px 16px', fontSize: 13.5, fontWeight: 600, color: '#fff',
      cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
    }}>{tr.header.reportAid}</button>
  );

  const avatarEl = (
    <button onClick={() => setAccountOpen(true)} title={name} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', flex: '0 0 34px' }}>
      {auth.profile?.avatarUrl
        ? <img src={auth.profile.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', display: 'block', border: `1px solid ${C.borderSoft}` }} />
        : <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(name)}</span>}
    </button>
  );
  // Signing in is secondary to contributing (rule 04: account creation is never the
  // primary action), so it is styled quieter than the CTA beside it.
  const loginBtn = (
    <button onClick={auth.openModal} className="hv-navy hdr-login" style={{
      background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 14px',
      fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
    }}>{tr.header.login}</button>
  );

  return (
    <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, position: 'relative', zIndex: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: mob ? 10 : 14, padding: mob ? '12px 14px' : '14px 28px' }}>
        <button onClick={() => a.go(coord ? 'coordHome' : 'home')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', flex: '0 0 auto' }}>
          <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: mob ? 32 : 38, width: 'auto', display: 'block' }} />
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, border: `1px solid ${C.borderSoft}`, borderRadius: 5, padding: '2px 5px', whiteSpace: 'nowrap' }}>
            {coord ? tr.modeCoordinator : tr.modePublic}
          </span>
        </button>

        {!mob && <nav className="hdr-nav" style={{ display: 'flex', gap: 2, marginLeft: 4, flex: '0 1 auto', minWidth: 0 }}>{nav}</nav>}
        <div style={{ flex: 1, minWidth: 8 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 1 auto', minWidth: 0 }}>
          {coord && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#FEF3F2', border: '1px solid #F6C9C9', color: C.emergency, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.emergency, animation: 'afetPulse 1.8s infinite' }} />
              {mob ? String(pending) : tr.header.awaiting(pending)}
            </span>
          )}
          {!coord && !mob && search}
          {!coord && !mob && trackBtn}
          {!coord && reportCta}
          {loggedIn ? avatarEl : (auth.enabled ? loginBtn : null)}
        </div>
      </div>
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}
