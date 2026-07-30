import { useApp, type Route } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';

// Coordinator operations sidebar — desktop only (see App: shown when coord && !mob).
export function Sidebar() {
  const a = useApp();
  const snap = a.snap;
  const pending = snap ? snap.subs.filter((s) => s.status === 'Pending verification').length : 0;
  // Correction requests waiting. Comes from a count query, not from the loaded list —
  // the badge must be right before the screen has ever been opened.
  const openOrgEdits = a.orgEditsPending;

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
        position: 'sticky', top: 0, padding: '18px 12px 20px',
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '100vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '6px 10px' }}>{tr.nav.operations}</span>
          {item(tr.nav.dashboard, 'coordHome', null, 'grey', () => a.go('coordHome'))}
          {item(tr.nav.disasterAdmin, 'coordDisasters', snap?.disasters.length ?? 0, 'grey', () => a.go('coordDisasters'))}
          {item(tr.nav.reviewQueue, 'coordQueue', pending, 'red', () => a.go('coordQueue'))}
          {item(tr.nav.orgEdits, 'coordOrgEdits', openOrgEdits, openOrgEdits > 0 ? 'red' : 'grey', () => a.go('coordOrgEdits'))}
          {item(tr.nav.needs, 'coordNeeds', snap?.needs.length ?? 0, 'grey', () => a.go('coordNeeds'))}
          {item(tr.nav.auditLog, 'coordLog', snap?.log.length ?? 0, 'grey', () => a.go('coordLog'))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '6px 10px' }}>{tr.nav.contentGroup}</span>
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
