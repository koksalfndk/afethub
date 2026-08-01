import { useApp, type Route } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, DESKTOP_HEADER_H } from '../theme';

// Coordinator operations sidebar — desktop only (see App: shown when coord && !mob).
export function Sidebar() {
  const a = useApp();
  const auth = useAuth();
  // The system log carries rows that name people (role grants, moderation). RLS keeps
  // them from a coordinator either way; the menu simply does not offer a page that
  // would look broken to them.
  const isAdmin = auth.profile?.role === 'admin';
  const snap = a.snap;
  const pending = snap ? snap.subs.filter((s) => s.status === 'Pending verification').length : 0;
  // Correction requests waiting. Comes from a count query, not from the loaded list —
  // the badge must be right before the screen has ever been opened.
  const openOrgEdits = a.orgEditsPending;
  // Community reports still awaiting a decision. Comes from the public overview, which
  // is already loaded, so the badge is right before the screen is ever opened.
  const openReports = a.overview?.reports.length ?? 0;

  const item = (label: string, route: Route, badge: number | null, tone: 'red' | 'grey', onClick: () => void) => {
    const active = a.route === route;
    return (
      <button key={label} onClick={onClick} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: active ? C.chipNavyBg : 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
        padding: '10px 10px', borderRadius: 8, fontSize: 14, fontWeight: active ? 600 : 500,
        color: active ? C.navy : C.text, minHeight: 44,
      }}>
        <span>{label}</span>
        {badge != null && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: tone === 'red' ? C.emergency : C.muted,
            background: tone === 'red' ? '#FEF3F2' : C.chipNavyBg, borderRadius: 20, padding: '2px 8px',
          }}>{badge}</span>
        )}
      </button>
    );
  };

  return (
    // The management menu is the coordinator's fixed frame: the column runs the full
    // page height so its edge is continuous, and the menu block inside stays in view
    // while the work area scrolls. Sticky must sit on the inner block — a sticky element
    // taller than the viewport scrolls away (same fix as the disaster rail).
    <aside aria-label={tr.nav.operations} style={{
      width: 236, flex: '0 0 236px', alignSelf: 'stretch',
      background: C.chipNavyBg, borderRight: `1px solid ${C.borderSoft}`,
      minHeight: 'calc(100vh - 63px)',
    }}>
      <div style={{
        // Offset by the header height: the header is sticky now, so `top: 0` would slide
        // the menu underneath it.
        position: 'sticky', top: DESKTOP_HEADER_H, padding: '18px 12px 20px',
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: `calc(100vh - ${DESKTOP_HEADER_H}px)`, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '6px 10px' }}>{tr.nav.operations}</span>
          {item(tr.nav.dashboard, 'coordHome', null, 'grey', () => a.go('coordHome'))}
          {item(tr.nav.disasterAdmin, 'coordDisasters', snap?.disasters.length ?? 0, 'grey', () => a.go('coordDisasters'))}
          {item(tr.nav.reviewQueue, 'coordQueue', pending, 'red', () => a.go('coordQueue'))}
          {item(tr.nav.orgEdits, 'coordOrgEdits', openOrgEdits, openOrgEdits > 0 ? 'red' : 'grey', () => a.go('coordOrgEdits'))}
          {item(tr.nav.communityReports, 'coordReports', openReports || null, openReports > 0 ? 'red' : 'grey', () => a.go('coordReports'))}
          {item(tr.nav.staff, 'coordStaff', a.volunteersPending || null, a.volunteersPending > 0 ? 'red' : 'grey', () => a.go('coordStaff'))}
          {item(tr.nav.needs, 'coordNeeds', snap?.needs.length ?? 0, 'grey', () => a.go('coordNeeds'))}
          {item(tr.nav.ops, 'coordOps', (snap?.announcements.length ?? 0) + (snap?.locations.length ?? 0), 'grey', () => a.go('coordOps'))}
          {isAdmin && item(tr.nav.systemLog, 'coordLog', null, 'grey', () => a.go('coordLog'))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '6px 10px' }}>{tr.nav.contentGroup}</span>
          {item(tr.nav.orgAdmin, 'coordOrgs', a.orgs.length, 'grey', () => a.go('coordOrgs'))}
          {item(tr.contact.panelTitle, 'coordContact', a.contactMessages.filter((m) => m.status === 'Yeni').length || null, 'grey', () => a.go('coordContact'))}
          {item(tr.nav.sliderAdmin, 'coordSlider', null, 'grey', () => a.go('coordSlider'))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '6px 10px' }}>{tr.nav.accountGroup}</span>
          {item(tr.nav.account, 'account', null, 'grey', () => a.go('account'))}
          {item(tr.nav.publicSite, 'home', null, 'grey', () => a.setRole('visitor'))}
        </div>
        <div style={{ marginTop: 'auto', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy }}>{a.snap?.disaster.name ?? ''}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{[a.snap?.disaster.province, tr.sidebarFooter.regionSuffix].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </aside>
  );
}
