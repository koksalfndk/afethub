import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, D, G } from '../theme';
import { Ico, IconBtn, LiveDot, type IcoName } from '../ui';
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
  const [profOpen, setProfOpen] = useState(false);   // desktop profile dropdown
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile hamburger drawer
  const profRef = useRef<HTMLDivElement | null>(null);

  // Dropdown closes on outside click and on Escape (keyboard reachable — rule 04).
  useEffect(() => {
    if (!profOpen) return;
    const onDown = (e: MouseEvent) => {
      if (profRef.current && !profRef.current.contains(e.target as Node)) setProfOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [profOpen]);

  // Navigating from a menu always closes it.
  const goAnd = (fn: () => void) => () => { fn(); setProfOpen(false); setDrawerOpen(false); };

  const navItems: { label: string; active: boolean; onClick: () => void }[] = coord
    ? [
        { label: tr.nav.dashboard, active: a.route === 'coordHome', onClick: () => a.go('coordHome') },
        { label: tr.nav.reviewQueue, active: a.route === 'coordQueue', onClick: () => a.go('coordQueue') },
        { label: tr.nav.needs, active: a.route === 'coordNeeds', onClick: () => a.go('coordNeeds') },
        { label: tr.nav.auditLog, active: a.route === 'coordLog', onClick: () => a.go('coordLog') },
      ]
    // "Teslim Noktaları" was removed from the menu — it lives on the disaster page
    // as a tab and in the delivery-points panel on the home page.
    : [
        { label: tr.nav.activeDisasters, active: a.route === 'home', onClick: () => a.go('home') },
        { label: tr.nav.needs, active: a.route === 'disaster' && a.tab === 'needs', onClick: () => a.go('disaster', { tab: 'needs' }) },
        { label: tr.nav.howItWorks, active: a.route === 'system', onClick: () => a.go('system') },
      ];

  const nav = (
    <nav style={{ display: 'flex', gap: 1, marginLeft: 12, flex: '0 1 auto', minWidth: 0 }}>
      {navItems.map((n) => (
        <button key={n.label} onClick={n.onClick} aria-current={n.active ? 'page' : undefined} style={{
          background: n.active ? G.navActive : 'transparent', border: 0, cursor: 'pointer',
          padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: n.active ? 600 : 500,
          color: n.active ? '#fff' : C.text, whiteSpace: 'nowrap',
        }}>{n.label}</button>
      ))}
    </nav>
  );

  // Compact pill search — filters the needs list, submitting lands on it.
  const search = (
    <form
      className="hdr-search"
      onSubmit={(e) => { e.preventDefault(); a.searchFromHeader(a.query); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: '#F4F7FA',
        border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '0 12px',
        height: 38, flex: '0 1 210px', minWidth: 140,
      }}
    >
      <Ico n="search" size={15} color={C.muted2} />
      <input
        value={a.query}
        onChange={(e) => a.setQuery(e.target.value)}
        placeholder={tr.header.search}
        aria-label={tr.header.searchLabel}
        style={{ border: 0, background: 'none', outline: 'none', fontSize: 13, color: C.navy, width: '100%', minWidth: 0 }}
      />
    </form>
  );

  // The one primary action in the header.
  const reportCta = (
    <button onClick={goAnd(() => a.go('report'))} className="hv-emergency" style={{
      background: G.emergencyBtn, border: '1px solid #BE2A31', borderRadius: 20, padding: '0 17px',
      height: 38, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 2px 6px rgba(191,42,49,.26)',
    }}>{tr.header.reportAid}</button>
  );

  const avatarInner = auth.profile?.avatarUrl
    ? <img src={auth.profile.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
    : loggedIn
      ? <span style={{ fontSize: 11, fontWeight: 700 }}>{initials(name)}</span>
      : <Ico n="user" size={16} />;

  const menuRow = (icon: IcoName, label: string, onClick: () => void) => (
    <button key={label} onClick={goAnd(onClick)} style={{
      display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: 10, borderRadius: 8,
      border: 0, background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: C.navy, textAlign: 'left',
    }}>
      <Ico n={icon} size={16} color={C.muted} />
      <span style={{ flex: 1 }}>{label}</span>
      <Ico n="chev" size={15} color={C.muted3} />
    </button>
  );

  // Secondary + account actions are collected here so the bar itself stays compact.
  const profileMenu = (
    <div style={{
      position: 'absolute', right: 22, top: 60, width: 250, background: C.surface,
      border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 18px 44px rgba(16,42,67,.18)',
      padding: 7, zIndex: 40,
    }}>
      <div style={{ padding: '9px 10px 11px', borderBottom: `1px solid ${C.borderFaint}`, marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{loggedIn ? name || tr.header.account : tr.header.profileMenu}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{loggedIn ? (auth.user?.email ?? '') : tr.header.guest}</div>
      </div>
      {menuRow('track', tr.header.track, () => a.go('track'))}
      {menuRow('need', tr.header.reportNeed, () => a.openWizard('public'))}
      <div style={{ height: 1, background: C.borderFaint, margin: '6px 2px' }} />
      {loggedIn
        ? [
            menuRow('user', tr.header.account, () => setAccountOpen(true)),
            menuRow('logout', tr.header.signOut, () => { void auth.signOut(); }),
          ]
        : auth.enabled
          ? [
              menuRow('user', tr.header.login, () => auth.openModal('signIn')),
              menuRow('plus', tr.header.register, () => auth.openModal('signUp')),
            ]
          : null}
    </div>
  );

  // Slim operational strip — mobile only; on desktop this information lives in the
  // hero card's own header row so the top bar stays a single line.
  const opsStrip = mob && a.snap && !coord ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 13px',
      fontSize: 11.5, background: G.opsBar, color: D.fg2,
    }}>
      <LiveDot color="#4ADE80" size={6} />
      <b style={{ color: '#fff', fontWeight: 600 }}>{a.snap.disaster.name}</b>
      <span className="tnum">{tr.home.activeNeedsCount(a.snap.needs.filter((n) => n.required > n.verified).length)}</span>
      <span style={{ flex: 1 }} />
      <span className="tnum">{tr.common.updated(a.snap.disaster.updatedLabel)}</span>
    </div>
  ) : null;

  const drawer = (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '10px 12px 14px' }}>
      {auth.enabled && !loggedIn && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={goAnd(() => auth.openModal('signIn'))} className="hv-navy" style={{
            flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, cursor: 'pointer',
          }}>{tr.header.login}</button>
          <button onClick={goAnd(() => auth.openModal('signUp'))} className="hv-emergency" style={{
            flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', cursor: 'pointer',
          }}>{tr.header.register}</button>
        </div>
      )}
      {[...navItems,
        { label: tr.header.track, active: a.route === 'track', onClick: () => a.go('track') },
        { label: tr.header.reportNeed, active: false, onClick: () => a.openWizard('public') },
      ].map((n) => (
        <button key={n.label} onClick={goAnd(n.onClick)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          padding: '13px 8px', border: 0, borderTop: `1px solid ${C.borderFaint}`, background: 'none',
          fontSize: 15, fontWeight: 600, color: n.active ? C.emergency : C.navy, cursor: 'pointer',
        }}>{n.label}<Ico n="chev" size={16} color={C.muted3} /></button>
      ))}
    </div>
  );

  return (
    <header style={{ background: G.headerBar, borderBottom: `1px solid ${C.border}`, position: 'relative', zIndex: 30 }}>
      {mob ? (
        <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr 42px', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
          <IconBtn
            icon={drawerOpen ? 'close' : 'menu'}
            label={drawerOpen ? tr.header.closeMenu : tr.header.openMenu}
            onClick={() => setDrawerOpen((v) => !v)}
          />
          <button onClick={goAnd(() => a.go(coord ? 'coordHome' : 'home'))} style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
            <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: 28, width: 'auto', display: 'block' }} />
          </button>
          <button onClick={() => (loggedIn ? setAccountOpen(true) : auth.enabled ? auth.openModal('signIn') : a.go('track'))}
            aria-label={tr.header.profileMenu} className="hv-navy" style={{
              width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, cursor: 'pointer',
            }}>{avatarInner}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', minHeight: 62 }} ref={profRef}>
          <button onClick={() => a.go(coord ? 'coordHome' : 'home')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', flex: '0 0 auto' }}>
            <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: 32, width: 'auto', display: 'block' }} />
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted2,
              background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 4, padding: '3px 6px', whiteSpace: 'nowrap',
            }}>{coord ? tr.modeCoordinator : tr.modePublic}</span>
          </button>
          {nav}
          <span style={{ flex: 1, minWidth: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 1 auto', minWidth: 0 }}>
            {coord && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.errorSurface, border: `1px solid ${C.errorBorder}`, color: C.emergency, borderRadius: 20, padding: '0 13px', height: 38, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                <LiveDot />{tr.header.awaiting(pending)}
              </span>
            )}
            {!coord && search}
            {!coord && reportCta}
            <button onClick={() => setProfOpen((v) => !v)} aria-label={tr.header.profileMenu} aria-expanded={profOpen}
              className="hv-navy" style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 6px 0 4px', borderRadius: 20,
                border: `1px solid ${C.borderSoft}`, background: C.surface, cursor: 'pointer', flex: '0 0 auto',
              }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: loggedIn ? G.navyBtn : 'linear-gradient(180deg,#F0F4F8,#DDE6EF)',
                color: loggedIn ? '#fff' : C.text, overflow: 'hidden',
              }}>{avatarInner}</span>
              <Ico n="down" size={15} color={C.muted} />
            </button>
          </div>
          {profOpen && profileMenu}
        </div>
      )}

      {mob && drawerOpen && drawer}
      {opsStrip}
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}
