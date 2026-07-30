import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { Picker } from '../components/Picker';
import { supabase } from '../data/supabaseClient';
import {
  toWebp, ImageError, ACCEPTED_TYPES,
  ANNOUNCEMENT_BUCKET, ANNOUNCEMENT_MAX_EDGE, UPLOAD_PREFIX, announcementImageSrc,
} from '../imageUpload';
import type { Announcement, AnnouncementInput, Location, LocationInput } from '../types';

// Coordinator screen: the two kinds of public content an operation has beyond its needs
// — what people are told is happening (announcements) and where they are told to go
// (delivery points).
//
// Both are audited by triggers in the database rather than by a second call from here:
// a client that forgot the audit write would leave an unexplained change to a page that
// sends people somewhere with a car full of supplies (rules/03 §Audit Log).
//
// Authorisation is the coordinator RLS policy on `announcements` and `locations`.

const ANN_KINDS: { kind: string; accent: string }[] = [
  { kind: 'Kritik güncelleme', accent: '#D9363E' },
  { kind: 'Lojistik', accent: '#F97316' },
  { kind: 'Bilgilendirme', accent: '#2A6FB0' },
  { kind: 'Çözüldü', accent: '#159947' },
];

const ghost = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  height: 42, padding: '0 13px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
};

const blankAnn = (disasterId: string): AnnouncementInput => ({
  disasterId, kind: ANN_KINDS[2].kind, accent: ANN_KINDS[2].accent, title: '', body: '', image: '',
});

const blankLoc = (disasterId: string): LocationInput => ({
  disasterId, name: '', address: '', hours: '', accepts: '',
  contact: '', phone: '', status: '', lat: null, lng: null,
});

export function CoordOps() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  // Every hook is declared before the snapshot guard below: a hook after an early return
  // changes hook order between the loading and loaded renders.
  const currentId = a.snap?.disaster.id ?? '';

  // Announcement editor state
  const [annEditing, setAnnEditing] = useState<string | null>(null);
  const [annDraft, setAnnDraft] = useState<AnnouncementInput>(blankAnn(currentId));
  const [annErr, setAnnErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Location editor state
  const [locEditing, setLocEditing] = useState<string | null>(null);
  const [locDraft, setLocDraft] = useState<LocationInput>(blankLoc(currentId));
  const [locErr, setLocErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Switching operation closes both editors: a half-typed announcement carried across
  // operations is how content ends up on the wrong disaster page.
  useEffect(() => {
    setAnnEditing(null); setLocEditing(null); setAnnErr(''); setLocErr('');
  }, [currentId]);

  if (!a.snap) return null;
  const disasters = a.snap.disasters;
  const current = a.snap.disaster;

  const openAnnNew = () => { setAnnDraft(blankAnn(current.id)); setAnnEditing(''); setAnnErr(''); };
  const openAnnEdit = (x: Announcement) => {
    setAnnDraft({
      disasterId: x.disasterId, kind: x.kind, accent: x.accent,
      title: x.title, body: x.body, image: x.image,
    });
    setAnnEditing(x.id); setAnnErr('');
  };
  const setAnn = <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) =>
    setAnnDraft((d) => ({ ...d, [k]: v }));

  // Same pipeline as slides and avatars: decode → cap the long edge → re-encode WebP →
  // put it in our own bucket, and store only 'upload:<object>'. The database never learns
  // a host, and the canvas round-trip drops EXIF (including GPS) from whatever the phone
  // attached. `toWebp` also enforces type and size, so this handler only maps errors.
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!supabase) { setAnnErr(tr.slider.uploadNeedsAuth); return; }
    setAnnErr(''); setUploading(true);
    try {
      const { blob } = await toWebp(file, ANNOUNCEMENT_MAX_EDGE);
      const object = `${current.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      const { error } = await supabase.storage.from(ANNOUNCEMENT_BUCKET)
        .upload(object, blob, { contentType: 'image/webp', upsert: false });
      if (error) throw error;
      setAnn('image', `${UPLOAD_PREFIX}${object}`);
    } catch (e) {
      if (e instanceof ImageError) {
        setAnnErr(e.message === 'no-webp-encoder' ? tr.slider.uploadFailedEncode : tr.slider.uploadFailedType);
      } else {
        setAnnErr(tr.slider.uploadFailedStore);
      }
    } finally {
      setUploading(false);
      // Let the same file be re-picked after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submitAnn = async () => {
    if (!annDraft.title.trim()) { setAnnErr(tr.coordOps.annErrTitle); return; }
    setAnnErr(''); setBusy(true);
    const ok = await a.saveAnnouncement(annEditing === '' ? null : annEditing, annDraft);
    setBusy(false);
    if (ok) setAnnEditing(null);
  };

  const openLocNew = () => { setLocDraft(blankLoc(current.id)); setLocEditing(''); setLocErr(''); };
  const openLocEdit = (l: Location) => {
    setLocDraft({
      disasterId: l.disasterId, name: l.name, address: l.address, hours: l.hours,
      accepts: l.accepts, contact: l.contact, phone: l.phone, status: l.status,
      lat: l.lat || null, lng: l.lng || null,
    });
    setLocEditing(l.id); setLocErr('');
  };
  const setLoc = <K extends keyof LocationInput>(k: K, v: LocationInput[K]) =>
    setLocDraft((d) => ({ ...d, [k]: v }));

  const submitLoc = async () => {
    if (!locDraft.name.trim()) { setLocErr(tr.coordOps.locErrName); return; }
    // One coordinate without the other is not a location, it is a bug waiting to render
    // a marker in the sea.
    if ((locDraft.lat == null) !== (locDraft.lng == null)) { setLocErr(tr.coordOps.locErrCoord); return; }
    setLocErr(''); setBusy(true);
    const ok = await a.saveLocation(locEditing === '' ? null : locEditing, locDraft);
    setBusy(false);
    if (ok) setLocEditing(null);
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;
  const preview = announcementImageSrc(annDraft.image, supabase);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
          {tr.coordOps.title}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '72ch' }}>{tr.coordOps.subtitle}</p>
      </div>

      {a.backend === 'local' && (
        <div style={{
          background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.coordOps.localNote}</div>
      )}

      {/* Which operation is being edited is the first decision on this screen, not a
          detail: everything below writes to the public page of whatever is selected. */}
      <section style={{ ...card, padding: mob ? 14 : 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Field label={tr.coordOps.fOperation} full>
            <Picker value={current.slug} onChange={(x) => a.openDisaster(x, 'overview')}
              ariaLabel={tr.coordOps.fOperation}
              options={disasters.map((d) => ({
                value: d.slug,
                label: d.name + (d.status !== 'Active' ? ` · ${tr.coordDisasters.statusLabels[d.status]}` : ''),
              }))} />
          </Field>
        </div>
        <button onClick={() => a.openDisaster(current.slug, 'announcements')} style={{ ...ghost, height: 46 }}>
          {tr.coordOps.openPublic}
        </button>
      </section>

      <div style={{
        background: G.chip, border: `1px solid ${C.borderFaint}`, borderLeft: `3px solid ${C.info}`,
        borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.text,
      }}>{tr.coordOps.publicNote}</div>

      {/* ---------------- Announcements ---------------- */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.navy }}>{tr.coordOps.annTitle}</h2>
          <button onClick={openAnnNew} style={{
            display: 'flex', alignItems: 'center', gap: 7, background: G.navyBtn,
            border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10, height: 44,
            padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}><Ico n="plus" size={15} />{tr.coordOps.annAdd}</button>
        </div>

        {annEditing !== null && (
          <div style={{ ...card, borderTop: `3px solid ${annDraft.accent}`, padding: mob ? 14 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: C.navy }}>
              {annEditing === '' ? tr.coordOps.annFormNew : tr.coordOps.annFormEdit}
            </h3>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : '220px minmax(0,1fr)', alignItems: 'start' }}>
              <Field label={tr.coordOps.annFKind}>
                <Picker value={annDraft.kind} ariaLabel={tr.coordOps.annFKind}
                  onChange={(x) => {
                    const found = ANN_KINDS.find((k) => k.kind === x) ?? ANN_KINDS[2];
                    setAnnDraft((d) => ({ ...d, kind: found.kind, accent: found.accent }));
                  }}
                  options={ANN_KINDS.map((k) => ({ value: k.kind, label: k.kind }))} />
              </Field>
              <Field label={tr.coordOps.annFTitle}>
                <input value={annDraft.title} onChange={(e) => setAnn('title', e.target.value)}
                  placeholder={tr.coordOps.annFTitlePh} style={inputStyle} />
              </Field>
            </div>
            <Field label={tr.coordOps.annFBody} full>
              <textarea value={annDraft.body} onChange={(e) => setAnn('body', e.target.value)} rows={4}
                placeholder={tr.coordOps.annFBodyPh} style={{ ...inputStyle, minHeight: 104, resize: 'vertical' }} />
            </Field>

            <div>
              <span style={labelText}>{tr.coordOps.annFImage}</span>
              <div style={{ fontSize: 12.5, color: C.muted3, marginTop: 2 }}>{tr.coordOps.annImageHint}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {preview && (
                  <img src={preview} alt="" width={112} height={72}
                    style={{ width: 112, height: 72, objectFit: 'cover', borderRadius: 9, border: `1px solid ${C.borderSoft}`, display: 'block' }} />
                )}
                <input ref={fileRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={(e) => void pickImage(e.target.files?.[0])}
                  style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} style={ghost}>
                  {uploading ? tr.coordOps.annImageUploading : annDraft.image ? tr.coordOps.annImageChange : tr.coordOps.annImagePick}
                </button>
                {annDraft.image && !uploading && (
                  <button onClick={() => setAnn('image', '')} style={{ ...ghost, color: C.emergency }}>{tr.coordOps.annImageRemove}</button>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: C.muted3 }}>
              {tr.coordOps.annAuthorNote} {auth.profile?.fullName ? `· ${auth.profile.fullName}` : ''}
            </div>

            {annErr && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{annErr}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitAnn} disabled={busy || uploading} style={{
                background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
                height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>{annEditing === '' ? tr.coordOps.saveNew : tr.coordOps.save}</button>
              <button onClick={() => setAnnEditing(null)} style={{ ...ghost, height: 46 }}>{tr.coordOps.cancel}</button>
            </div>
          </div>
        )}

        {a.snap.announcements.length === 0 ? (
          <div style={{ ...card, padding: 22, textAlign: 'center', fontSize: 13.5, color: C.muted }}>{tr.coordOps.annEmpty}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {a.snap.announcements.map((x) => {
              const img = announcementImageSrc(x.image, supabase);
              return (
                <div key={x.id} style={{ ...card, borderLeft: `3px solid ${x.accent}`, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {img && (
                    <img src={img} alt="" width={92} height={64}
                      style={{ width: 92, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.borderFaint}`, display: 'block', flex: '0 0 auto' }} />
                  )}
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                        color: x.accent, background: `color-mix(in srgb, ${x.accent} 10%, #fff)`,
                        border: `1px solid color-mix(in srgb, ${x.accent} 28%, #fff)`,
                        borderRadius: 5, padding: '3px 7px',
                      }}>{x.kind}</span>
                      <span style={{ fontSize: 12.5, color: C.muted2 }}>{[x.author, x.time].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginTop: 4 }}>{x.title}</div>
                    {x.body && <p style={{ fontSize: 13.5, color: C.text, margin: '4px 0 0' }}>{x.body}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <button onClick={() => openAnnEdit(x)} style={ghost}>{tr.coordOps.edit}</button>
                    <button onClick={() => { if (window.confirm(tr.coordOps.annDeleteConfirm)) void a.deleteAnnouncement(x.id); }}
                      style={{ ...ghost, color: C.emergency }}>{tr.coordOps.remove}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- Delivery points ---------------- */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.navy }}>{tr.coordOps.locTitle}</h2>
          <button onClick={openLocNew} style={{
            display: 'flex', alignItems: 'center', gap: 7, background: G.navyBtn,
            border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10, height: 44,
            padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}><Ico n="plus" size={15} />{tr.coordOps.locAdd}</button>
        </div>

        {locEditing !== null && (
          <div style={{ ...card, borderTop: `3px solid ${C.info}`, padding: mob ? 14 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: C.navy }}>
              {locEditing === '' ? tr.coordOps.locFormNew : tr.coordOps.locFormEdit}
            </h3>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', alignItems: 'start' }}>
              <Field label={tr.coordOps.locFName} full>
                <input value={locDraft.name} onChange={(e) => setLoc('name', e.target.value)}
                  placeholder={tr.coordOps.locFNamePh} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFAddress} full>
                <input value={locDraft.address} onChange={(e) => setLoc('address', e.target.value)} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFHours}>
                <input value={locDraft.hours} onChange={(e) => setLoc('hours', e.target.value)}
                  placeholder={tr.coordOps.locFHoursPh} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFStatus} hint={tr.coordOps.locStatusHint}>
                <input value={locDraft.status} onChange={(e) => setLoc('status', e.target.value)}
                  placeholder={tr.coordOps.locFStatusPh} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFAccepts} full>
                <input value={locDraft.accepts} onChange={(e) => setLoc('accepts', e.target.value)}
                  placeholder={tr.coordOps.locFAcceptsPh} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFContact}>
                <input value={locDraft.contact} onChange={(e) => setLoc('contact', e.target.value)} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFPhone}>
                <input value={locDraft.phone} onChange={(e) => setLoc('phone', e.target.value)} inputMode="tel" style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFLat} hint={tr.coordOps.locCoordHint}>
                <input value={locDraft.lat ?? ''} inputMode="decimal"
                  onChange={(e) => setLoc('lat', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
              </Field>
              <Field label={tr.coordOps.locFLng}>
                <input value={locDraft.lng ?? ''} inputMode="decimal"
                  onChange={(e) => setLoc('lng', e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
              </Field>
            </div>

            {locErr && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{locErr}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitLoc} disabled={busy} style={{
                background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
                height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>{locEditing === '' ? tr.coordOps.saveNew : tr.coordOps.save}</button>
              <button onClick={() => setLocEditing(null)} style={{ ...ghost, height: 46 }}>{tr.coordOps.cancel}</button>
            </div>
          </div>
        )}

        {a.snap.locations.length === 0 ? (
          <div style={{ ...card, padding: 22, textAlign: 'center', fontSize: 13.5, color: C.muted }}>{tr.coordOps.locEmpty}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {a.snap.locations.map((l) => (
              <div key={l.id} style={{ ...card, padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Ico n="pin" size={15} color={C.info} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{l.name}</span>
                    {l.status && (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700,
                        color: l.statusTone === 'yellow' ? '#8A6A00' : C.success,
                        background: l.statusTone === 'yellow' ? '#FFF9E6' : '#EAF7EE',
                        border: `1px solid ${l.statusTone === 'yellow' ? '#F0DFA8' : '#BFE3CB'}`,
                        borderRadius: 20, padding: '3px 9px',
                      }}>{l.status}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
                    {[l.address, l.hours].filter(Boolean).join(' · ')}
                  </div>
                  {l.accepts && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{l.accepts}</div>}
                  {(l.contact || l.phone) && (
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{[l.contact, l.phone].filter(Boolean).join(' · ')}</div>
                  )}
                  {l.coords && <div style={{ fontSize: 12, color: C.muted3, marginTop: 2 }}>{l.coords}</div>}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <button onClick={() => openLocEdit(l)} style={ghost}>{tr.coordOps.edit}</button>
                  <button onClick={() => { if (window.confirm(tr.coordOps.locDeleteConfirm)) void a.deleteLocation(l.id); }}
                    style={{ ...ghost, color: C.emergency }}>{tr.coordOps.remove}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
