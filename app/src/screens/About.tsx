import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { cols } from '../select';
import { Ico, eyebrow, type IcoName } from '../ui';

const PRINCIPLE_ICONS: IcoName[] = ['verified', 'pending', 'people', 'critical'];

export function About() {
  const a = useApp();
  const L = cols(a.device === 'mobile');
  const t = tr.about;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
      <div>
        <span style={eyebrow}>{tr.footer.about}</span>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '7px 0 0', color: C.navy }}>{t.title}</h1>
        <p style={{ fontSize: 15, color: C.text, margin: '8px 0 0', maxWidth: '68ch' }}>{t.lead}</p>
      </div>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.navy}`, borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: C.navy }}>{t.formulaTitle}</h2>
        <div className="tnum" style={{
          marginTop: 12, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '14px 16px', fontSize: 16, fontWeight: 700, color: C.navy,
        }}>{t.formula}</div>
        <p style={{ fontSize: 13.5, color: C.text, margin: '12px 0 0' }}>{t.formulaBody}</p>
      </section>

      <div style={{ display: 'grid', gap: 13, gridTemplateColumns: L.two }}>
        {t.principles.map((p, i) => (
          <section key={p.title} style={{ background: G.surfaceSoft, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ico n={PRINCIPLE_ICONS[i] ?? 'need'} size={17} color={C.info} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.navy }}>{p.title}</h3>
            </div>
            <p style={{ fontSize: 13.5, color: C.text, margin: '7px 0 0' }}>{p.body}</p>
          </section>
        ))}
      </div>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 12px', color: C.navy }}>{t.dataTitle}</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {t.dataPoints.map((d) => (
            <li key={d} style={{ fontSize: 13.5, color: C.text }}>{d}</li>
          ))}
        </ul>
      </section>

      <section style={{
        background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderLeft: `3px solid ${C.emergency}`,
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.errorText }}>{t.notAuthorityTitle}</div>
        <p style={{ fontSize: 13.5, color: C.errorText, margin: '5px 0 0' }}>{t.notAuthorityBody}</p>
      </section>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button onClick={() => a.go('home')} style={{
          background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
        }}>{t.toDashboard}</button>
        <button onClick={() => a.go('orgs')} className="hv-navy" style={{
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>{tr.nav.orgs}</button>
      </div>
    </div>
  );
}
