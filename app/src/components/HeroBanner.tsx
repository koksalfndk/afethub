import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';

// Informative banner slider.
//
// Images are optional and live in app/public/banners/. When a file is missing the
// slide falls back to a calm gradient, so the banner never renders a broken frame —
// and no dramatic imagery is required for the product to work (rules/04 §Visual
// Language keeps photography out of the operational views; this is the one
// informational surface where a photo is allowed).
interface Slide { key: string; image: string; tint: string; title: string; body: string; cta: string; onClick: () => void }

export function HeroBanner() {
  const a = useApp();
  const mob = a.device === 'mobile';

  const slides: Slide[] = [
    { key: 'report', image: '/banners/wildfire.jpg', tint: '#D9363E',
      title: tr.banner.reportTitle, body: tr.banner.reportBody, cta: tr.reportDisaster.title,
      onClick: a.openDisasterForm },
    { key: 'verify', image: '/banners/coordination.jpg', tint: '#159947',
      title: tr.banner.verifyTitle, body: tr.banner.verifyBody, cta: tr.home.howVerification,
      onClick: () => a.go('system') },
    { key: 'orgs', image: '/banners/volunteers.jpg', tint: '#2A6FB0',
      title: tr.banner.orgsTitle, body: tr.banner.orgsBody, cta: tr.nav.orgs,
      onClick: () => a.go('orgs') },
  ];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance, but never while the visitor is interacting with it, and never for
  // people who asked for reduced motion.
  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((v) => (v + 1) % slides.length), 7000);
    return () => clearTimeout(t);
  }, [i, paused, slides.length]);

  const s = slides[i];

  return (
    <section
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      aria-roledescription="carousel" aria-label={tr.banner.label}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 14,
        border: `1px solid ${C.border}`, background: C.surface, minHeight: mob ? 300 : 260,
        display: 'grid', gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)',
      }}
    >
      {/* Right: photo (or gradient stand-in). Left: white panel, with the gradient
          layer bridging the two so the text always sits on solid white. */}
      <div style={{
        position: mob ? 'absolute' : 'relative', inset: mob ? 0 : undefined,
        gridColumn: mob ? undefined : 2, minHeight: mob ? undefined : 260,
        backgroundImage: `url(${s.image})`, backgroundSize: 'cover', backgroundPosition: 'center',
        backgroundColor: `color-mix(in srgb, ${s.tint} 12%, #E7EEF4)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: mob
          ? 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,.94) 46%, rgba(255,255,255,.55) 74%, rgba(255,255,255,0) 100%)'
          : 'linear-gradient(90deg, #FFFFFF 0%, #FFFFFF 38%, rgba(255,255,255,.82) 52%, rgba(255,255,255,0) 72%)',
      }} />

      <div style={{
        position: 'relative', gridColumn: 1, gridRow: 1, zIndex: 2,
        padding: mob ? '20px 18px 22px' : '30px 32px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, maxWidth: mob ? '100%' : 460,
      }}>
        <span style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
          color: s.tint, background: '#fff', border: `1px solid color-mix(in srgb, ${s.tint} 28%, #fff)`,
          borderRadius: 20, padding: '4px 10px',
        }}>
          <Ico n="critical" size={12} color={s.tint} />{tr.banner.label}
        </span>
        <h2 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.12, margin: 0, color: C.navy }}>{s.title}</h2>
        <p style={{ fontSize: 14, color: C.text, margin: 0, maxWidth: '44ch' }}>{s.body}</p>
        <button onClick={s.onClick} className="hv-emergency" style={{
          alignSelf: 'flex-start', marginTop: 4, background: G.emergencyBtn, border: '1px solid #BE2A31',
          color: '#fff', borderRadius: 10, padding: '0 18px', height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>{s.cta}</button>

        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {slides.map((sl, idx) => (
            <button key={sl.key} onClick={() => setI(idx)} aria-label={sl.title} aria-current={idx === i ? 'true' : undefined}
              style={{
                width: idx === i ? 26 : 9, height: 9, borderRadius: 20, border: 0, padding: 0, cursor: 'pointer',
                background: idx === i ? C.navy : C.borderSoft, transition: 'width .18s ease-out',
              }} />
          ))}
        </div>
      </div>
    </section>
  );
}
