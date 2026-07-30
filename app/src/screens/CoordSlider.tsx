import { useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { SLIDE_ACTIONS, isLocalSlideImage } from '../data/repo';
import { supabase } from '../data/supabaseClient';
import {
  toWebp, slideImageSrc, isUploadRef, BANNER_BUCKET, BANNER_MAX_EDGE, UPLOAD_PREFIX, ImageError,
} from '../imageUpload';
import type { BannerSlide, BannerSlideInput, SlideAction } from '../types';

// Coordinator screen: manage the home banner slides.
//
// Images: pick one of the files that ship with the app, or upload one. What is never
// accepted is a free-text URL — an admin-supplied remote address would be fetched by
// every visitor's browser, which lets it impersonate an institution's imagery and leaks
// visitor IPs to a third party (rules/03 §File Uploads). An upload is stored in our own
// bucket and recorded as 'upload:<object>', so the database holds no host at all.
//
// Uploads are re-encoded to WebP at 1600 px in the browser before they leave the device
// (src/imageUpload.ts); that also strips the camera's EXIF/GPS tags. The bucket only
// accepts image/webp, so a client that skips the conversion still cannot store a JPEG.
//
// Nothing on this screen is authorisation. It is reachable only in coordinator mode, but
// the write itself is authorised by RLS on `banner_slides` and on storage.objects;
// hiding a button is not a permission check (rules/03 §Server-Side Authorization).
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
  const [uploading, setUploading] = useState(false);
  // Drag state for reordering. Keyboard arrows do the same thing — a drag-only control
  // is unusable without a mouse (rules/04 §Accessibility).
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Upload path: decode → cap at 1600 px → re-encode WebP → put in the bucket, and
  // store only 'upload:<object>'. The database never learns a host, so the banner can
  // never be pointed at a third-party server (see src/imageUpload.ts).
  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!supabase) { setErr(tr.slider.uploadNeedsAuth); return; }
    setErr(''); setUploading(true);
    try {
      const { blob } = await toWebp(file, BANNER_MAX_EDGE);
      const object = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const { error: upErr } = await supabase.storage
        .from(BANNER_BUCKET)
        .upload(object, blob, { contentType: 'image/webp', upsert: false });
      if (upErr) throw upErr;
      set('image', `${UPLOAD_PREFIX}${object}`);
    } catch (e) {
      if (e instanceof ImageError) {
        setErr(e.message === 'no-webp-encoder' ? tr.slider.uploadFailedEncode : tr.slider.uploadFailedType);
      } else {
        setErr(tr.slider.uploadFailedStore);
      }
    } finally {
      setUploading(false);
      // Let the same file be re-picked after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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

  const ordered = a.slides.slice().sort((x, y) => x.sortOrder - y.sortOrder);

  // Reordering always writes 1..n for the whole list, so the number in the editor is
  // the position in the list by construction.
  const commitOrder = (ids: string[]) => { void a.reorderSlides(ids); };
  const moveBy = (id: string, delta: number) => {
    const ids = ordered.map((x) => x.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    commitOrder(ids);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = ordered.map((x) => x.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null); setOverId(null);
    commitOrder(ids);
  };

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
            <Field label={tr.slider.fImage} hint={`· ${tr.slider.fImageHint}`} full>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{
                  width: 92, height: 56, flex: '0 0 92px', borderRadius: 9, overflow: 'hidden',
                  border: `1px solid ${C.borderFaint}`, display: 'block',
                  background: draft.image
                    ? `center/cover no-repeat url(${slideImageSrc(draft.image, supabase)})`
                    : `color-mix(in srgb, ${draft.tint} 12%, #EAF0F5)`,
                }} />
                <div style={{ flex: '1 1 220px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select value={isUploadRef(draft.image) ? draft.image : draft.image}
                    onChange={(e) => set('image', e.target.value)} style={inputStyle}>
                    {isUploadRef(draft.image) && (
                      <option value={draft.image}>{tr.slider.fImageUploaded}</option>
                    )}
                    {IMAGE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif"
                    style={{ display: 'none' }} onChange={(e) => void onPickFile(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="hv-navy" style={{
                    alignSelf: 'flex-start', background: C.surface, border: `1px solid ${C.borderSoft}`,
                    color: C.navy, borderRadius: 9, height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600,
                    cursor: uploading ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
                  }}>
                    <Ico n="plus" size={15} color={C.muted} />
                    {uploading ? tr.slider.uploading : tr.slider.upload}
                  </button>
                  <span style={{ fontSize: 11.5, color: C.muted2, lineHeight: 1.45 }}>{tr.slider.uploadHint}</span>
                </div>
              </div>
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
          <div style={{ fontSize: 12.5, color: C.muted2, paddingBottom: 2 }}>{tr.slider.dragHint}</div>
          {ordered.map((s, idx) => (
            <article key={s.id}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== s.id) setOverId(s.id); }}
              onDrop={(e) => { e.preventDefault(); dropOn(s.id); }}
              style={{
              ...card, borderLeft: `3px solid ${s.active ? s.tint : C.muted3}`,
              borderTop: overId === s.id && dragId && dragId !== s.id ? `2px solid ${C.navy}` : card.border,
              padding: 13, display: 'grid',
              gridTemplateColumns: mob ? '1fr' : '26px 92px minmax(0,1fr) auto', gap: 13, alignItems: 'center',
              opacity: dragId === s.id ? .45 : s.active ? 1 : .72,
              cursor: 'grab',
            }}>
              {!mob && (
                <span aria-hidden="true" title={tr.slider.dragHandle} style={{
                  display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
                  color: C.muted3, cursor: 'grab',
                }}>
                  {[0, 1, 2].map((r) => (
                    <span key={r} style={{ display: 'flex', gap: 3 }}>
                      <i style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted3, display: 'block' }} />
                      <i style={{ width: 3, height: 3, borderRadius: '50%', background: C.muted3, display: 'block' }} />
                    </span>
                  ))}
                </span>
              )}
              {/* Thumbnail doubles as the "which image is this" answer. */}
              <span style={{
                width: mob ? '100%' : 92, height: 56, borderRadius: 9, overflow: 'hidden',
                border: `1px solid ${C.borderFaint}`, display: 'block',
                background: s.image ? `center/cover no-repeat url(${slideImageSrc(s.image, supabase)})` : `color-mix(in srgb, ${s.tint} 12%, #EAF0F5)`,
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Keyboard path for the same reorder. */}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <button onClick={() => moveBy(s.id, -1)} disabled={idx === 0} aria-label={tr.slider.moveUp} title={tr.slider.moveUp} style={{
                    width: 30, height: 20, borderRadius: 6, border: `1px solid ${C.borderSoft}`, background: C.surface,
                    color: idx === 0 ? C.muted3 : C.navy, cursor: idx === 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}><span style={{ display: 'block', transform: 'rotate(180deg)' }}><Ico n="down" size={13} /></span></button>
                  <button onClick={() => moveBy(s.id, 1)} disabled={idx === ordered.length - 1} aria-label={tr.slider.moveDown} title={tr.slider.moveDown} style={{
                    width: 30, height: 20, borderRadius: 6, border: `1px solid ${C.borderSoft}`, background: C.surface,
                    color: idx === ordered.length - 1 ? C.muted3 : C.navy,
                    cursor: idx === ordered.length - 1 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}><Ico n="down" size={13} /></button>
                </span>
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
