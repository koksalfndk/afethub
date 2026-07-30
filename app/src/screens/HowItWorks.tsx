import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { cols } from '../select';
import { Ico, eyebrow, type IcoName } from '../ui';

// Public explanation of the product. This is content, not a dashboard: one centred
// reading column, sections in document order, no live figures. The internal
// architecture view (/sistem) stays separate and is reachable from the dev toolbar.
//
// Everything here describes behaviour that exists in the app. No claim of official
// affiliation and no "delivered" language for an unverified report (rules/03, rules/07).

const ACCENT: Record<string, string> = {
  navy: C.navy, success: C.success, warning: C.warning, emergency: C.emergency,
};

export function HowItWorks() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const t = tr.howItWorks;

  const card = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
    padding: mob ? 16 : 20,
  } as const;
  const h2 = {
    fontSize: mob ? 17 : 19, fontWeight: 700, letterSpacing: '-.015em',
    margin: 0, color: C.navy,
  } as const;
  const body = { fontSize: 14, color: C.text, margin: 0, lineHeight: 1.62 } as const;

  return (
    // Centred reading column: content pages are read, not scanned across a wide grid.
    <div style={{ maxWidth: 880, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: mob ? 16 : 22 }}>
      <header>
        <span style={eyebrow}>{t.eyebrow}</span>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '7px 0 0', color: C.navy }}>{t.title}</h1>
        <p style={{ ...body, fontSize: 15.5, marginTop: 10 }}>{t.lead}</p>
      </header>

      {/* The one rule, then the four states it produces, then a worked example. */}
      <section style={{ ...card, borderTop: `3px solid ${C.navy}` }}>
        <h2 style={h2}>{t.formulaTitle}</h2>
        <div className="tnum" style={{
          marginTop: 12, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '15px 16px', fontSize: mob ? 15 : 17, fontWeight: 700, color: C.navy, letterSpacing: '-.01em',
        }}>{t.formula}</div>
        <p style={{ ...body, marginTop: 12 }}>{t.formulaBody}</p>

        <div style={{ display: 'grid', gap: 9, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 14 }}>
          {t.states.map((s) => (
            <div key={s.label} style={{
              background: C.canvas, border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${ACCENT[s.accent] ?? C.navy}`, borderRadius: 9, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT[s.accent] ?? C.navy }}>{s.label}</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 3 }}>{s.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderFaint}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.heading2 }}>{t.exampleTitle}</div>
          <ol style={{ margin: '9px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {t.exampleSteps.map((s) => <li key={s} style={{ fontSize: 13.5, color: C.text }}>{s}</li>)}
          </ol>
        </div>
      </section>

      <section>
        <h2 style={h2}>{t.partsTitle}</h2>
        <p style={{ ...body, marginTop: 7 }}>{t.partsIntro}</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 13 }}>
          {t.parts.map((p) => (
            <div key={p.label} style={{ background: G.surfaceSoft, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ico n={p.icon as IcoName} size={16} color={C.info} />
                <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{p.label}</span>
              </div>
              <p style={{ fontSize: 13, color: C.text, margin: '6px 0 0', lineHeight: 1.55 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>{t.rolesTitle}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 13 }}>
          {t.roles.map((r) => (
            <div key={r.label} style={{ paddingLeft: 13, borderLeft: `3px solid ${C.borderSoft}` }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{r.label}</div>
              <p style={{ fontSize: 13.5, color: C.text, margin: '4px 0 0', lineHeight: 1.58 }}>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Functions: each one is a numbered flow plus the single sentence that keeps it
          from being misread ("bildirim ≠ teslim edildi"). */}
      <section>
        <h2 style={h2}>{t.flowsTitle}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 13 }}>
          {t.flows.map((f, i) => (
            <div key={f.label} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tnum" style={{
                  width: 26, height: 26, flex: '0 0 26px', borderRadius: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', background: G.navActive,
                  color: '#fff', fontSize: 13, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{f.label}</span>
              </div>
              <ol style={{ margin: '11px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {f.steps.map((s) => <li key={s} style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{s}</li>)}
              </ol>
              <div style={{
                marginTop: 11, background: '#FFF8E5', border: '1px solid #F2DFA8', borderRadius: 9,
                padding: '9px 11px', fontSize: 13, fontWeight: 600, color: C.warningText,
              }}>{f.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>{t.chainTitle}</h2>
        <p style={{ ...body, marginTop: 7 }}>{t.chainIntro}</p>
        {/* One continuous timeline rather than six separate cards: the point is that these
            steps are a single ordered chain. */}
        <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {t.chain.map((c, i) => {
            const last = i === t.chain.length - 1;
            return (
              <li key={c.label} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 22px' }}>
                  <span className="tnum" style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: C.surface, border: `2px solid ${C.info}`,
                    color: C.info, fontSize: 11.5, fontWeight: 700,
                  }}>{i + 1}</span>
                  {!last && <span style={{ flex: 1, width: 2, background: C.border, minHeight: 18 }} />}
                </div>
                <div style={{ paddingBottom: last ? 0 : 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{c.label}</div>
                  <div style={{ fontSize: 13.5, color: C.text, marginTop: 2, lineHeight: 1.55 }}>{c.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section style={card}>
        <h2 style={h2}>{t.privacyTitle}</h2>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {t.privacyPoints.map((p) => <li key={p} style={{ fontSize: 13.5, color: C.text, lineHeight: 1.58 }}>{p}</li>)}
        </ul>
      </section>

      <section style={{
        background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderLeft: `3px solid ${C.emergency}`,
        borderRadius: 12, padding: mob ? 15 : 18,
      }}>
        <h2 style={{ ...h2, fontSize: 16.5, color: C.errorText }}>{t.notTitle}</h2>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {t.notPoints.map((p) => <li key={p} style={{ fontSize: 13.5, color: C.errorText, lineHeight: 1.55 }}>{p}</li>)}
        </ul>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.errorText, marginTop: 11 }}>{t.emergency}</div>
      </section>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <button onClick={() => a.go('home')} style={{
          background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
        }}>{t.ctaDashboard}</button>
        <button onClick={() => a.go('orgs')} className="hv-navy" style={{
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>{t.ctaOrgs}</button>
        <button onClick={() => a.go('about')} className="hv-navy" style={{
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>{t.ctaAbout}</button>
      </div>
    </div>
  );
}
