import { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../data/supabaseClient';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import type { UserRole } from '../types';
import { toWebp, AVATAR_MAX_EDGE } from '../imageUpload';


const roleLabel: Record<UserRole, string> = {
  volunteer: tr.auth.roleVolunteerLabel, coordinator: tr.auth.roleCoordinatorLabel, admin: tr.auth.roleAdminLabel,
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || 'AH';
}

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open || !auth.user) return null;

  const name = auth.profile?.fullName || '';
  const role = (auth.profile?.role ?? 'volunteer') as UserRole;
  const avatar = auth.profile?.avatarUrl;

  const onFile = async (file: File | undefined) => {
    if (!file || !supabase || !auth.user) return;
    setErr(''); setBusy(true);
    // Avatars were being stored exactly as the camera produced them — an unoptimised
    // JPEG with EXIF, rendered into a 28 px circle. Re-encode to WebP at 512 px first.
    let webp: Blob;
    try {
      webp = (await toWebp(file, AVATAR_MAX_EDGE, 0.85)).blob;
    } catch {
      setBusy(false); setErr(tr.auth.photoError); return;
    }
    const path = `${auth.user.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from('avatars').upload(path, webp, { contentType: 'image/webp', upsert: true });
    if (error) { setBusy(false); setErr(tr.auth.photoError); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    await auth.setAvatar(data.publicUrl);
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 95 }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in" style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 400, boxShadow: '0 18px 48px rgba(11,30,48,.28)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{tr.auth.accountTitle}</div>
          <button onClick={onClose} aria-label="Kapat" style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, fontSize: 14, color: C.muted, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
          <button onClick={() => ref.current?.click()} title={tr.auth.changePhoto} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', position: 'relative' }}>
            {avatar
              ? <img src={avatar} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.borderSoft}` }} />
              : <span style={{ width: 84, height: 84, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 28, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(name)}</span>}
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: C.navy, color: '#fff', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{busy ? '…' : '✎'}</span>
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{name || auth.user.email}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{auth.user.email}</div>
            <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.heading2, background: C.chipNavyBg, borderRadius: 6, padding: '4px 9px' }}>{roleLabel[role]}</span>
          </div>
          <button onClick={() => ref.current?.click()} disabled={busy} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: busy ? 'default' : 'pointer', minHeight: 44 }}>{busy ? tr.auth.photoUploading : tr.auth.changePhotoBtn}</button>
          {err && <div style={{ fontSize: 12.5, color: C.errorText }}>{err}</div>}
          <div style={{ height: 1, background: C.border, alignSelf: 'stretch' }} />
          <button onClick={() => { onClose(); void auth.signOut(); }} style={{ background: C.surface, border: '1px solid #F6C9C9', borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: C.emergency, cursor: 'pointer', minHeight: 44, alignSelf: 'stretch' }}>{tr.header.logout}</button>
        </div>
      </div>
    </div>
  );
}
