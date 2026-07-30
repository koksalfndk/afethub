import { useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { SLIDE_ACTIONS, isLocalSlideImage } from '../data/repo';
import type { BannerSlide, BannerSlideInput, SlideAction } from '../types';

// Coordinator screen: manage the home banner slides.
//
// Two deliberate restrictions:
//  1. `image` is a select over files that ship with the app, not a free URL field.
//     An admin-supplied remote URL would be fetched by every visitor's browser —
//     it can spoof an institution's imagery and it leaks visitor IPs to a third
//     party (rules/03 §File Uploads). Same rule as organization logos.
//  2. Nothing here is authorisation. The screen is reachable only in coordinator
//     mode, but the write itself is authorised by RLS on `banner_slides`; hiding a
//     button is not a permission check (rules/03 §Server-Side Authorization).
//
// Uploading new images from the browser needs a storage bucket and is NOT
// implemented — drop files into app/public/banners/ and they appear in this list.
const IMAGE_CHOICES = [
  { value: '', label: tr.slider.fImageNone },
  { value: '/banners/wildfire.webp', label: 'wildfire.webp' },
  { value: '/banners/coordination.webp', label: 'coordination.webp' },
  { value: '/banners/volunteers.webp', label: 'volunteers.webp' },
];
const TINTS = [
  { value: '#D9363E', label: 'Kırmızı' },
  { value: '#F97316', label: 'Turuncu' },
  { value: '#159947', label: 'Yeşil' },
  { value: '#2A6FB0', label: 'Mavi' },
  { value: '#0F766E', label: 'Turkuaz' },
  { value: '#102A43', label: 'Lacivert' },
];

const blank = (order: number): BannerSlideInput => ({
  title: '', body: '', ctaLabel: '', action: 'reportDisaster',
  image: '', tint: '#D9363E', active: true, sortOrder: order,
});

export function CoordSlider() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';

  const [editing, setEditing] = useState<string | null>(null);   // slide id, or '' for a new one
  const [draft, setDraft] = useState<BannerSlideInput>(blank(1));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    const next = a.slides.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1;
    setDraft(blank(next)); setEditing(''); setErr('');
  };
  const openEdit = (s: BannerSlide) => {
    setDraft({
      title: s.title, body: s.body, ctaLabel: s.ctaLabel, action: s.action,
      image: s.image, tint: s.tint, active: s.active, sortOrder: s.sortOrder,
    });
    setEditing(s.id); setErr('');
  };
  const set = <K extends keyof BannerSlideInput>(k: K, v: BannerSlideInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.title.trim()) { setErr(tr.slider.errTitle); return; }
    if (!draft.body.trim()) { setErr(tr.slider.errBody); return; }
    if (!draft.ctaLabel.trim()) { setErr(tr.slider.errCta); return; }
    if (!isLocalSlideImage(draft.image)) { setErr(tr.slider.fImageHint); return; }
    setErr(''); setBusy(true);
    const ok = await a.saveSlide(editing === '' ? null : editing, draft);
    setBusy(false);
    if (ok) setEditing(null);
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <span style={eyebrow}>{tr.nav.contentGroup}</span>
          <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.slider.title}</h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '5px 0 0', maxWidth: '76ch' }}>{tr.slider.subtitle}</p>
        </div>
        <button onClick={openNew} style={{
          background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
          height: 46, padding: '0 17px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7,
        }}><Ico n="plus" size={16} color="#fff" />{tr.slider.add}</button>
      </div>

      {/* Honesty: in local mode there is no database, so edits cannot survive a reload. */}
      {a.backend === 'local' && (
        <div style={{
          background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.slider.localNote}</div>
      )}

      {editing !== null && (
        <section style={{ ...card, borderTop: `3px solid ${C.navy}`, padding: mob ? 15 : 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: C.navy }}>
            {editing === '' ? tr.slider.add : tr.slider.edit}
          </h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))' }}>
            <Field label={tr.slider.fTitle} full>
              <input value={draft.title} onChange={(e) => set('title', e.target.value)} maxLength={90}
                autoComplete="off" style={inputStyle} />
            </Field>
            <Field label={tr.slider.fBody} full>
              <textarea value={draft.body} onChange={(e) => set('body', e.target.value)} maxLength={400} rows={3}
                style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} />
            </Field>
            <Field label={tr.slider.fCta}>
              <input value={draft.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} maxLength={40}
                autoComplete="off" style={inputStyle} />
            </Field>
            <Field label={tr.slider.fAction}>
              <select value={draft.action} onChange={(e) => set('action', e.target.value as SlideAction)} style={inputStyle}>
                {SLIDE_ACTIONS.map((v) => (
                  <option key={v} value={v}>{tr.slider.actionLabels[v]}</option>
                ))}
              </select>
            </Field>
            <Field label={tr.slider.fImage} hint={`· ${tr.slider.fImageHint}`}>
              <select value={draft.image} onChange={(e) => set('image', e.target.value)} style={inputStyle}>
                {IMAGE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={tr.slider.fTint}>
              <select value={draft.tint} onChange={(e) => set('tint', e.target.value)} style={inputStyle}>
                {TINTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={tr.slider.fOrder}>
              <input type="number" min={1} max={99} value={draft.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value) || 1)} style={inputStyle} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, alignSelf: 'end', minHeight: 46 }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)}
                style={{ width: 18, height: 18 }} />
              <span style={labelText}>{tr.slider.fActive}</span>
            </label>
          </div>

          {err && (
            <div role="alert" style={{
              marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`,
              borderRadius: 9, padding: '9px 12px', fontSize: 13, color: C.errorText, fontWeight: 600,
            }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => void submit()} disabled={busy || !auth.enabled && false} style={{
              background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
              height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
              opacity: busy ? .7 : 1,
            }}>{busy ? tr.auth.working : tr.slider.save}</button>
            <button onClick={() => setEditing(null)} className="hv-navy" style={{
              background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
              height: 46, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{tr.slider.cancel}</button>
          </div>
        </section>
      )}

      {a.slides.length === 0 ? (
        <div style={{ ...card, border: `1px dashed ${C.borderSoft}`, padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.heading2 }}>{tr.slider.empty}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {a.slides.slice().sort((x, y) => x.sortOrder - y.sortOrder).map((s) => (
            <article key={s.id} style={{
              ...card, borderLeft: `3px solid ${s.active ? s.tint : C.muted3}`,
              padding: 13, display: 'grid',
              gridTemplateColumns: mob ? '1fr' : '92px minmax(0,1fr) auto', gap: 13, alignItems: 'center',
              opacity: s.active ? 1 : .72,
            }}>
              {/* Thumbnail doubles as the "which image is this" answer. */}
              <span style={{
                width: mob ? '100%' : 92, height: 56, borderRadius: 9, overflow: 'hidden',
                border: `1px solid ${C.borderFaint}`, display: 'block',
                background: s.image ? `center/cover no-repeat url(${s.image})` : `color-mix(in srgb, ${s.tint} 12%, #EAF0F5)`,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="tnum" style={{
                    fontSize: 11.5, fontWeight: 700, color: C.muted, background: C.chipNavyBg,
                    border: `1px solid ${C.borderFaint}`, borderRadius: 5, padding: '2px 7px',
                  }}>{s.sortOrder}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{s.title}</span>
                  {!s.active && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                      color: C.muted, background: C.chipNavyBg, border: `1px solid ${C.borderSoft}`,
                      borderRadius: 5, padding: '3px 7px',
                    }}>{tr.slider.inactive}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: C.text, margin: '4px 0 0' }}>{s.body}</p>
                <div style={{ fontSize: 12, color: C.muted2, marginTop: 4 }}>
                  {s.ctaLabel} → {tr.slider.actionLabels[s.action]}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => openEdit(s)} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
                  height: 40, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{tr.slider.edit}</button>
                {/* Destructive: consequence stated before it happens (rules/04). */}
                <button onClick={() => { if (window.confirm(tr.slider.removeConfirm)) void a.deleteSlide(s.id); }} style={{
                  background: C.surface, border: `1px solid ${C.errorBorder}`, color: C.errorText, borderRadius: 9,
                  height: 40, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{tr.slider.remove}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
