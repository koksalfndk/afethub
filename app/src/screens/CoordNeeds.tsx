import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { PriorityBadge, Btn } from '../ui';
import { detailPairs } from '../needForm';

export function CoordNeeds() {
  const a = useApp();
  if (!a.snap) return null;
  const L = cols(a.device === 'mobile');
  const manage = enrichSorted(a.snap.needs);

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>{tr.coord.createNeed}</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.coord.createNeedBody}</p>
        <Btn variant="primary" onClick={() => a.openWizard('coord')} style={{ width: '100%' }}>
          {tr.coord.newNeed}
        </Btn>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.coord.publishedNeeds}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {manage.map((n) => {
            const extras = detailPairs(n.details);
            return (
              <div key={n.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{n.name}</div>
                  <div style={{ fontSize: 12.5, color: C.muted2 }}>{tr.coord.verifiedRemaining(n.verified, n.required, n.remaining)}</div>
                  {extras.length > 0 && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                      {extras.map(([k, val]) => `${k}: ${val}`).join(' · ')}
                    </div>
                  )}
                </div>
                <PriorityBadge p={n.priority} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => a.bumpNeed(n.id)} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 36 }}>{tr.coord.bump}</button>
                  <button onClick={() => a.togglePause(n.id)} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: 'pointer', minHeight: 36 }}>{n.priority === 'Paused' ? tr.coord.resume : tr.coord.pause}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
