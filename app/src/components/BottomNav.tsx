import { useApp, type Route } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';

// Mobile bottom navigation — shown only when device === 'mobile'.
export function BottomNav() {
  const a = useApp();
  const coord = a.role === 'coordinator';

  const items: { label: string; route: Route; tone?: string }[] = coord
    ? [
        { label: tr.bottomNav.dashboard, route: 'coordHome' },
        { label: tr.bottomNav.queue, route: 'coordQueue', tone: C.emergency },
        { label: tr.bottomNav.needs, route: 'coordNeeds' },
        { label: tr.bottomNav.log, route: 'coordLog' },
      ]
    : [
        { label: tr.bottomNav.home, route: 'home' },
        { label: tr.bottomNav.needs, route: 'disaster' },
        { label: tr.bottomNav.report, route: 'report', tone: C.emergency },
        { label: tr.bottomNav.track, route: 'track' },
        { label: tr.bottomNav.request, route: 'needReq' },
      ];

  return (
    <nav style={{ position: 'sticky', bottom: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '6px 4px', zIndex: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, gap: 2 }}>
        {items.map((b) => {
          const on = a.route === b.route;
          return (
            <button key={b.label} onClick={() => a.go(b.route)} style={{
              background: 'none', border: 0, cursor: 'pointer', minHeight: 52, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              borderRadius: 8, padding: '6px 2px',
            }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: on ? (b.tone ?? C.navy) : C.borderSoft }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: on ? C.navy : C.muted2 }}>{b.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
