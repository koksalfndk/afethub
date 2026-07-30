import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';
import { ReportDisasterForm } from '../screens/ReportDisaster';

// Reporting a disaster is a modal everywhere it is triggered from, so the reporter
// never loses the page behind them. /afet-bildir renders the same steps as a page.
export function DisasterReportModal() {
  const a = useApp();
  if (!a.disasterFormOpen) return null;
  const mob = a.device === 'mobile';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 75, display: 'flex', alignItems: mob ? 'flex-end' : 'center', justifyContent: 'center', padding: mob ? 0 : 20 }}>
      <div onClick={a.closeDisasterForm} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.46)' }} />
      <div className="anim-in" role="dialog" aria-modal="true" aria-label={tr.reportDisaster.title} style={{
        position: 'relative', width: '100%', maxWidth: 600, maxHeight: mob ? '94vh' : '90vh', overflowY: 'auto',
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: mob ? '16px 16px 0 0' : 14, boxShadow: '0 26px 60px rgba(16,42,67,.28)',
      }}>
        <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: G.heroRibbon }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 18px 12px', borderBottom: `1px solid ${C.borderFaint}` }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.reportDisaster.title}</div>
            <div style={{ fontSize: 12, color: C.muted2, marginTop: 2, maxWidth: '52ch' }}>{tr.reportDisaster.modalIntro}</div>
          </div>
          <button onClick={a.closeDisasterForm} aria-label={tr.orgs.cancel} style={{
            width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 34px',
          }}><Ico n="close" size={16} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <ReportDisasterForm onClose={a.closeDisasterForm} />
        </div>
      </div>
    </div>
  );
}
