import { useRef, useState } from 'react';
import { supabase, hasSupabaseEnv } from '../data/supabaseClient';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { toWebp } from '../imageUpload';

// Delivery evidence: 1600 px is plenty for a coordinator to read a label or a pallet
// count, and it keeps the upload small on a weak network at a delivery point.
const EVIDENCE_MAX_EDGE = 1600;

// Uploads a delivery photo to Supabase Storage (public bucket) and returns its
// public URL. In local mode it just shows a client-side preview.
export function PhotoUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const local = !hasSupabaseEnv;

  const pick = () => ref.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr('');
    setBusy(true);
    // Re-encode before anything leaves the device: WebP instead of a multi-megabyte
    // phone JPEG, and drawing through a canvas drops the camera's EXIF/GPS tags
    // (src/imageUpload.ts).
    let webp: Blob;
    try {
      webp = (await toWebp(file, EVIDENCE_MAX_EDGE)).blob;
    } catch {
      setBusy(false); setErr(tr.report.photoError); return;
    }
    if (local || !supabase) { setBusy(false); onChange(URL.createObjectURL(webp)); return; }
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
    const { error } = await supabase.storage.from('delivery-photos').upload(path, webp, { contentType: 'image/webp', upsert: false });
    if (error) { setBusy(false); setErr(tr.report.photoError); return; }
    const { data } = supabase.storage.from('delivery-photos').getPublicUrl(path);
    setBusy(false);
    onChange(data.publicUrl);
  };

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: 'none' }}
        onChange={(e) => void onFile(e.target.files?.[0])} />
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, background: C.canvas }}>
          <img src={value} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.borderSoft}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.heading2 }}>{tr.report.photoLabel}</div>
            {local && <div style={{ fontSize: 12, color: C.muted2 }}>{tr.report.photoLocalNote}</div>}
          </div>
          <button type="button" onClick={pick} title={tr.report.photoTitle} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: '8px 12px', fontSize: 15, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 40 }}>↻</button>
          <button type="button" onClick={() => onChange('')} style={{ background: C.surface, border: '1px solid #F6C9C9', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: C.emergency, cursor: 'pointer', minHeight: 40 }}>{tr.report.photoRemove}</button>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy} style={{ width: '100%', textAlign: 'left', border: `1px dashed ${C.borderSoft}`, borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12, background: C.canvas, cursor: busy ? 'default' : 'pointer' }}>
          <span style={{ width: 38, height: 38, borderRadius: 8, background: '#E4EBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: C.muted, fontWeight: 700 }}>{busy ? '…' : '+'}</span>
          <span>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.heading2 }}>{busy ? tr.report.photoUploading : tr.report.photoTitle}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>{tr.report.photoBody}</span>
          </span>
        </button>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 12.5, color: C.errorText }}>{err}</div>}
    </div>
  );
}
