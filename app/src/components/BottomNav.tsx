import { useApp, type Route } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, type IcoName } from '../ui';

// Sticky mobile bottom navigation — the thumb-reach path to the actions that matter
// under stress (rules/04). The hamburger drawer in the header carries everything else.
export function BottomNav() {
  const a = useApp();
  const coord = a.role === 'coordinator';

  const items: { label: string; route: Route; icon: IcoName; tone?: string }[] = coord
    ? [
        { label: tr.bottomNav.dashboard, route: 'coordHome', icon: 'home' },
        { label: tr.bottomNav.queue, route: 'coordQueue', icon: 'pending', tone: C.emergency },
        { label: tr.bottomNav.needs, route: 'coordNeeds', icon: 'need' },
        { label: tr.bottomNav.log, route: 'coordLog', icon: 'activity' },
      ]
    : [
        { label: tr.bottomNav.home, route: 'home', icon: 'home' },
        { label: tr.bottomNav.needs, route: 'disaster', icon: 'need' },
        { label: tr.bottomNav.report, route: 'report', icon: 'plus', tone: C.emergency },
        { label: tr.bottomNav.track, route: 'track', icon: 'track' },
      ];

  return (
    <nav style={{ position: 'sticky', bottom: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '5px 4px 7px', zIndex: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, gap: 2 }}>
        {items.map((b) => {
          const on = a.route === b.route;
          return (
            <button key={b.label} onClick={() => a.go(b.route)} aria-current={on ? 'page' : undefined} style={{
              background: 'none', border: 0, cursor: 'pointer', minHeight: 52, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              borderRadius: 8, padding: '6px 2px',
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: on ? (b.tone ? G.emergencyBtn : G.navyBtn) : C.borderFaint,
              }}>
                <Ico n={b.icon} size={15} color={on ? '#fff' : C.muted2} />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? C.navy : C.muted2 }}>{b.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
