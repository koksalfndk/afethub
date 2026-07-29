import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';

export function CoordLog() {
  const a = useApp();
  if (!a.snap) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 2px' }}>{tr.coord.logTitle}</h1>
      <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.coord.logBody}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: C.canvas }}>
              {tr.coord.logHead.map((h) => (
                <th key={h} style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, padding: '11px 14px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.snap.log.map((e) => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${C.borderFaint}` }}>
                <td style={{ padding: '12px 14px', fontSize: 13.5, color: C.heading2 }}>{e.user}</td>
                <td style={{ padding: '12px 14px', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</td>
                <td style={{ padding: '12px 14px', fontSize: 13.5, color: C.muted }}>{e.oldValue}</td>
                <td style={{ padding: '12px 14px', fontSize: 13.5, fontWeight: 600, color: C.successText }}>{e.newValue}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, color: C.muted2, whiteSpace: 'nowrap' }}>{e.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
