import { useState } from 'react';
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
  const [sheet, setSheet] = useState(false);
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
        { label: tr.bottomNav.needs, route: 'disaster', icon: 'need' },
        { label: tr.bottomNav.track, route: 'track', icon: 'track' },
        { label: tr.nav.orgs, route: 'orgs', icon: 'people' },
      ];

  // Left/right halves so the centre FAB has room.
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const tab = (b: { label: string; route: Route; icon: IcoName }) => {
    const on = a.route === b.route;
    return (
      <button key={b.label} onClick={() => { setSheet(false); a.go(b.route); }} aria-current={on ? 'page' : undefined} style={{
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

  const action = (icon: IcoName, title: string, hint: string, accent: string, onClick: () => void) => (
    <button onClick={() => { setSheet(false); onClick(); }} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      background: C.surface, border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: '13px 14px', cursor: 'pointer', minHeight: 64,
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 11, flex: '0 0 38px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: C.canvas, border: `1px solid ${C.borderFaint}`,
      }}><Ico n={icon} size={19} color={accent} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: C.navy }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: C.muted }}>{hint}</span>
      </span>
      <span style={{ marginLeft: 'auto' }}><Ico n="chev" size={16} color={C.muted3} /></span>
    </button>
  );

  return (
    <>
      {/* Action sheet — the FAB is the single entry point for "I want to report
          something", so the three public write flows sit together. */}
      {sheet && (
        <>
          <div onClick={() => setSheet(false)} style={{
            position: frame ? 'absolute' : 'fixed', inset: 0, background: 'rgba(11,30,48,.42)', zIndex: 58,
          }} />
          <div className="anim-in" style={{
            position: frame ? 'absolute' : 'fixed', left: 0, right: 0, bottom: 68, zIndex: 59,
            background: C.canvas, borderTop: `1px solid ${C.border}`, borderRadius: '16px 16px 0 0',
            padding: '14px 12px 18px', display: 'flex', flexDirection: 'column', gap: 9,
            boxShadow: '0 -14px 36px rgba(16,42,67,.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 2px 4px' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{tr.fab.title}</span>
              <button onClick={() => setSheet(false)} aria-label={tr.fab.close} style={{
                width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`,
                background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}><Ico n="close" size={16} /></button>
            </div>
            {action('critical', tr.fab.disaster, tr.fab.disasterHint, C.emergency, () => a.go('reportDisaster'))}
            {action('need', tr.fab.need, tr.fab.needHint, C.orange, () => a.openWizard('public'))}
            {action('verified', tr.fab.delivery, tr.fab.deliveryHint, C.success, () => a.go('report'))}
          </div>
        </>
      )}

      <nav style={{
        position: frame ? 'sticky' : 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        background: C.surface, borderTop: `1px solid ${C.border}`,
        padding: '5px 4px calc(7px + env(safe-area-inset-bottom))',
        boxShadow: '0 -6px 20px rgba(16,42,67,.07)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 72px 1fr 1fr', alignItems: 'center', gap: 2 }}>
          {left.map(tab)}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setSheet((v) => !v)} aria-label={tr.fab.label} aria-expanded={sheet} style={{
              width: 56, height: 56, borderRadius: '50%', marginTop: -22, cursor: 'pointer',
              background: G.emergencyBtn, border: '3px solid #fff', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(191,42,49,.34)',
              transform: sheet ? 'rotate(45deg)' : 'none', transition: 'transform .18s ease-out',
            }}><Ico n="plus" size={24} /></button>
          </div>
          {right.map(tab)}
        </div>
      </nav>
    </>
  );
}
