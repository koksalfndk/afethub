import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { Report } from '../screens/Report';

// "Teslimat bildir" as a modal overlay (over the current page).
export function ReportModal() {
  const a = useApp();
  const close = () => a.go('home');

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 75, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in" style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 720, boxShadow: '0 18px 48px rgba(11,30,48,.28)', overflow: 'hidden', margin: 'auto' }}>
        {a.reportStage === 'form' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 0' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.navy }}>{tr.report.title}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>{tr.report.intro}</p>
            </div>
            <button onClick={close} aria-label="Kapat" style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, fontSize: 15, color: C.muted, cursor: 'pointer', flex: '0 0 34px' }}>✕</button>
          </div>
        )}
        <div style={{ padding: '16px 24px 24px' }}>
          <Report inModal />
        </div>
      </div>
    </div>
  );
}
