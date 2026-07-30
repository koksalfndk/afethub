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

// Mobile geometry. The phone layout is stacked, not overlaid: the photo owns a band at
// the top and the copy sits underneath it on plain white. Because the text no longer
// stands on the image, the white layer stops being a backing plate and becomes only the
// seam between the two — which is why it is 180px here instead of the 448px envelope the
// overlaid version needed (−60%).
const MOB_PHOTO_H = 250;
const MOB_FADE_H = 180;

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
        minHeight: mob ? 470 : 340, display: 'flex',
        // Mobile puts the photo first and the copy after it, so the copy starts at the top
        // of its own band (it is offset down by the photo height below, not centred).
        alignItems: mob ? 'flex-start' : 'center',
      }}
    >
      {/* The image is full-bleed and the white panel is painted on top of it with a
          single wide gradient. Splitting the surface into two columns left a visible
          seam where the photo began; one layer over one image has no edge to show. */}
      {/* Generated artwork: the base layer, always full-bleed, so a slide with no photo
          (or a file that fails to load) is never a blank frame. */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: artLayer(s.tint), backgroundSize: 'cover', backgroundPosition: 'center',
        backgroundColor: `color-mix(in srgb, ${s.tint} 9%, #EAF0F5)`,
      }} />
      {/* The photo sits in its own box rather than filling the section.
          Desktop: it takes the right 62% instead of the full width, so a 2:1 image loses
          ~19% to the crop instead of ~45% — the subject stays recognisable. Its left edge
          is a mask, not a cut: `contain` showed the whole photo but left a hard vertical
          seam, which is exactly the edge this banner is not allowed to show.
          Mobile: the top band only, full width — the copy lives below it, not on it. */}
      {s.image && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          ...(mob ? { left: 0, height: MOB_PHOTO_H } : { bottom: 0, width: '62%' }),
          backgroundImage: `url(${s.image})`, backgroundSize: 'cover',
          backgroundPosition: mob ? 'center top' : 'center', backgroundRepeat: 'no-repeat',
          maskImage: mob ? undefined : 'linear-gradient(to right, transparent 0%, #000 24%)',
          WebkitMaskImage: mob ? undefined : 'linear-gradient(to right, transparent 0%, #000 24%)',
        }} />
      )}
      {/* Mobile: solid ground under the copy. The art layer is tinted, and body text has
          to sit on flat white to hold contrast outdoors — so the area below the photo is
          filled rather than left to whatever the gradient tail happens to reach. */}
      {mob && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: MOB_PHOTO_H, bottom: 0, background: '#FFFFFF' }} />
      )}
      <div style={{
        position: 'absolute', pointerEvents: 'none',
        ...(mob
          ? { left: 0, right: 0, top: MOB_PHOTO_H - MOB_FADE_H, height: MOB_FADE_H }
          : { inset: 0 }),
        background: mob
          // Mobile: runs the other way now — transparent where the photo is clean, solid
          // white where the copy begins. It is the seam between the image band and the text
          // band, so its height is fixed to the seam (180px) and no longer has to grow with
          // the text; the copy stands on the white sheet above, not on this.
          ? 'linear-gradient(176deg, rgba(255,255,255,0) 0px, rgba(255,255,255,.2) 32px, rgba(255,255,255,.5) 62px, rgba(255,255,255,.82) 92px, rgba(255,255,255,.96) 122px, #FFFFFF 150px)'
          // Desktop: the solid white plateau is cut from 52% to 34% of the width so the photo
          // is no longer buried under it; the copy column below is narrowed to match, so the
          // text still lands on ≥.94 white. The tail ends at 76%, leaving the right quarter
          // of the frame as clean photo.
          : 'linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 34%, rgba(255,255,255,.98) 40%, rgba(255,255,255,.9) 47%, rgba(255,255,255,.68) 56%, rgba(255,255,255,.34) 66%, rgba(255,255,255,0) 76%)',
      }} />

      <div style={{
        position: 'relative', zIndex: 2,
        // Mobile: pushed below the photo band. A margin, not absolute positioning, so the
        // section still grows when a long slide body needs more room instead of the copy
        // running off the bottom edge.
        marginTop: mob ? MOB_PHOTO_H : 0,
        padding: mob ? '14px 20px 18px' : '30px 34px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: mob ? 9 : 10,
        // The copy column has to end inside the white plateau, which is now 34% wide.
        maxWidth: mob ? '100%' : 520, width: '100%',
      }}>
        <span style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase',
          color: s.tint, background: '#fff', border: `1px solid color-mix(in srgb, ${s.tint} 28%, #fff)`,
          borderRadius: 20, padding: '4px 10px',
        }}>
          <Ico n="critical" size={12} color={s.tint} />{tr.banner.label}
        </span>
        <h2 style={{ fontSize: mob ? 23 : 26, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.12, margin: 0, color: C.navy }}>{s.title}</h2>
        <p style={{
          fontSize: 14.5, color: C.text, margin: 0, maxWidth: mob ? '100%' : '44ch',
          // Still bounded to 4 lines on mobile: the banner sits above the fold, and an
          // over-long slide body would otherwise push the button off the first screen.
          ...(mob ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}),
        }}>{s.body}</p>
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
