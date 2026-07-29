import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { cols } from '../select';
import { eyebrow } from '../ui';

export function System() {
  const a = useApp();
  const t = tr.system;
  const L = cols(a.device === 'mobile');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{t.title}</h1>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{t.subtitle}</div>
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={eyebrow}>{t.ia}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            {t.iaItems.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: i.bg, marginLeft: i.indent }}>
                <span style={{ fontSize: 13.5, fontWeight: i.weight, color: C.navy }}>{i.label}</span>
                <span style={{ fontSize: 11.5, color: C.muted2 }}>{i.note}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {t.flows.map((fl) => (
            <div key={fl.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{fl.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
                {fl.steps.map((st) => (
                  <span key={st} style={{ fontSize: 12.5, fontWeight: 600, color: C.heading2, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 11px' }}>{st}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
