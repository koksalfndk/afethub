import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';
import type { SlideAction } from '../types';
import { supabase } from '../data/supabaseClient';
import { slideImageSrc } from '../imageUpload';

// Informative banner slider.
//
// Images are optional and live in app/public/banners/. When a file is missing the
// slide falls back to a calm gradient, so the banner never renders a broken frame —
// and no dramatic imagery is required for the product to work (rules/04 §Visual
// Language keeps photography out of the operational views; this is the one
// informational surface where a photo is allowed).
interface Slide { key: string; image: string; tint: string; title: string; body: string; cta: string; onClick: () => void }

// Self-contained backdrop drawn under the (optional) photo. Without it a missing
// file left the right half of the banner as flat empty tint. Abstract contour lines
// carry no claim about a real event, which is what keeps this acceptable where a
// dramatic photograph would not be (rules/04 §Visual Language, rules/07 §Seed Content).
function artLayer(tint: string): string {
  const line = (i: number): string => {
    const y = 96 + i * 46;
    const o = (0.26 - i * 0.03).toFixed(2);
    return `<path d="M-40 ${y} C 150 ${y - 46} 300 ${y + 42} 470 ${y - 14} S 700 ${y - 58} 860 ${y + 16}"`
      + ` fill="none" stroke="${tint}" stroke-opacity="${o}" stroke-width="2"/>`;
  };
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice">'
    + `<circle cx="628" cy="128" r="104" fill="${tint}" opacity=".06"/>`
    + `<circle cx="628" cy="128" r="62" fill="${tint}" opacity=".06"/>`
    + [0, 1, 2, 3, 4, 5, 6].map(line).join('')
    + '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function HeroBanner() {
  const a = useApp();
  const mob = a.device === 'mobile';

  // Slides come from the data layer so a coordinator can edit them in the panel
  // (/koordinasyon/slider). The built-in set is the fallback for a database that has
  // no rows yet — the banner is never empty and never blocks on this read.
  const managed = a.slides.filter((sl) => sl.active).sort((x, y) => x.sortOrder - y.sortOrder);
  const act = (action: SlideAction): (() => void) => {
    switch (action) {
      case 'reportDisaster': return a.openDisasterForm;
      case 'howItWorks': return () => a.go('howItWorks');
      case 'orgs': return () => a.go('orgs');
      case 'track': return () => a.go('track');
      default: return () => a.go('home');
    }
  };
  const slides: Slide[] = managed.length > 0
    ? managed.map((sl) => ({
        // An uploaded slide is stored as 'upload:<object>'; it has to be resolved to a
        // URL here too. Only the admin thumbnail did it, so an uploaded image saved fine
        // and then silently failed to render on the home page.
        key: sl.id, image: slideImageSrc(sl.image, supabase), tint: sl.tint,
        title: sl.title, body: sl.body, cta: sl.ctaLabel, onClick: act(sl.action),
      }))
    : [
        { key: 'report', image: '/banners/wildfire.webp', tint: '#D9363E',
          title: tr.banner.reportTitle, body: tr.banner.reportBody, cta: tr.reportDisaster.title,
          onClick: a.openDisasterForm },
        { key: 'verify', image: '/banners/coordination.webp', tint: '#159947',
          title: tr.banner.verifyTitle, body: tr.banner.verifyBody, cta: tr.home.howVerification,
          onClick: () => a.go('howItWorks') },
        { key: 'orgs', image: '/banners/volunteers.webp', tint: '#2A6FB0',
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
        border: `1px solid ${C.border}`, background: C.surface,
        minHeight: mob ? 380 : 340, display: 'flex', alignItems: 'center',
      }}
    >
      {/* The image is full-bleed and the white panel is painted on top of it with a
          single wide gradient. Splitting the surface into two columns left a visible
          seam where the photo began; one layer over one image has no edge to show. */}
      <div style={{
        position: 'absolute', inset: 0,
        // Photo first, generated artwork behind it: a real file at the slide's path
        // simply covers the artwork, so dropping images into public/banners/ needs no
        // code change and a missing file is never a blank frame.
        backgroundImage: s.image ? `url(${s.image}), ${artLayer(s.tint)}` : artLayer(s.tint),
        backgroundSize: s.image ? 'cover, cover' : 'cover',
        backgroundPosition: mob ? 'center top, center' : 'right center, right center',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundColor: `color-mix(in srgb, ${s.tint} 9%, #EAF0F5)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: mob
          // Mobile: the copy block is the full width, so the white plateau has to clear
          // it vertically — body text over the image failed the outdoor-contrast rule.
          ? 'linear-gradient(185deg, #FFFFFF 0%, #FFFFFF 46%, rgba(255,255,255,.97) 56%, rgba(255,255,255,.88) 66%, rgba(255,255,255,.66) 76%, rgba(255,255,255,.34) 88%, rgba(255,255,255,0) 100%)'
          // The white plateau ends where the (now 70% wider) text column ends, so the
          // copy never sits on the image and the fade still finishes inside the frame.
          : 'linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 52%, rgba(255,255,255,.985) 60%, rgba(255,255,255,.92) 68%, rgba(255,255,255,.74) 77%, rgba(255,255,255,.46) 86%, rgba(255,255,255,.18) 94%, rgba(255,255,255,0) 100%)',
      }} />

      <div style={{
        position: 'relative', zIndex: 2,
        padding: mob ? '24px 20px 26px' : '36px 38px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11,
        maxWidth: mob ? '100%' : 850, width: '100%',
      }}>
        <span style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
          color: s.tint, background: '#fff', border: `1px solid color-mix(in srgb, ${s.tint} 28%, #fff)`,
          borderRadius: 20, padding: '4px 10px',
        }}>
          <Ico n="critical" size={12} color={s.tint} />{tr.banner.label}
        </span>
        <h2 style={{ fontSize: mob ? 24 : 30, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.12, margin: 0, color: C.navy }}>{s.title}</h2>
        <p style={{ fontSize: 14.5, color: C.text, margin: 0, maxWidth: '70ch' }}>{s.body}</p>
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
