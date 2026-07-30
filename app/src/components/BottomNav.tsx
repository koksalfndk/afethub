import { useApp, type Route } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, type IcoName } from '../ui';

// Mobile bottom navigation. It is `position: fixed` rather than `sticky` because the
// app shell above it uses `overflow: hidden`, which silently disables sticky — the
// bar used to scroll away with the page. App.tsx reserves the matching bottom
// padding so the last row of content is never hidden behind it.
export function BottomNav() {
  const a = useApp();
  const coord = a.role === 'coordinator';
  const frame = a.frame; // dev-only 412px phone mock: stay inside the frame

  const items: { label: string; route: Route; icon: IcoName }[] = coord
    ? [
        { label: tr.bottomNav.dashboard, route: 'coordHome', icon: 'home' },
        { label: tr.bottomNav.queue, route: 'coordQueue', icon: 'pending' },
        { label: tr.bottomNav.needs, route: 'coordNeeds', icon: 'need' },
        { label: tr.bottomNav.log, route: 'coordLog', icon: 'activity' },
      ]
    : [
        { label: tr.bottomNav.home, route: 'home', icon: 'home' },
        { label: tr.nav.orgs, route: 'orgs', icon: 'people' },
        { label: tr.bottomNav.track, route: 'track', icon: 'track' },
        { label: tr.footer.about, route: 'about', icon: 'verified' },
      ];

  // Left/right halves so the centre FAB has room.
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const tab = (b: { label: string; route: Route; icon: IcoName }) => {
    const on = a.route === b.route;
    return (
      <button key={b.label} onClick={() => a.go(b.route)} aria-current={on ? 'page' : undefined} style={{
        background: 'none', border: 0, cursor: 'pointer', minHeight: 54, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 2px',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: on ? G.navyBtn : C.borderFaint,
        }}><Ico n={b.icon} size={15} color={on ? '#fff' : C.muted2} /></span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? C.navy : C.muted2 }}>{b.label}</span>
      </button>
    );
  };

  return (
    <>
      <nav style={{
        position: frame ? 'sticky' : 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        padding: '5px 4px calc(7px + env(safe-area-inset-bottom))',
        boxShadow: '0 -6px 20px rgba(16,42,67,.07)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 72px 1fr 1fr', alignItems: 'center', gap: 2 }}>
          {left.map(tab)}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* One tap, one destination: the disaster report form opens on its
                type picker. No intermediate action sheet to read under stress. */}
            <button onClick={() => a.go('reportDisaster')} aria-label={tr.reportDisaster.title} style={{
              width: 56, height: 56, borderRadius: '50%', marginTop: -22, cursor: 'pointer',
              background: G.emergencyBtn, border: '3px solid #fff', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(191,42,49,.34)',
            }}><Ico n="critical" size={24} /></button>
          </div>
          {right.map(tab)}
        </div>
      </nav>
    </>
  );
}
