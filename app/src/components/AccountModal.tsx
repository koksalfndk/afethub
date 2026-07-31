import { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../data/supabaseClient';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { inputStyle, labelText } from '../ui';
import type { UserRole } from '../types';

const MAX = 2 * 1024 * 1024;
const OK = ['image/jpeg', 'image/png', 'image/webp'];
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
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState(false);
  if (!open || !auth.user) return null;

  const changePw = async () => {
    setPwErr(''); setPwOk(false);
    if (newPw.length < 6) return setPwErr(tr.auth.errPasswordShort);
    if (newPw !== newPw2) return setPwErr(tr.auth.errPasswordMismatch);
    const r = await auth.changePassword(curPw, newPw);
    if (r === 'bad-current') return setPwErr(tr.auth.errCurrentPassword);
    if (r === 'error') return setPwErr(auth.error || tr.auth.genericError);
    setPwOk(true); setCurPw(''); setNewPw(''); setNewPw2('');
  };

  const name = auth.profile?.fullName || '';
  const role = (auth.profile?.role ?? 'volunteer') as UserRole;
  const avatar = auth.profile?.avatarUrl;

  const onFile = async (file: File | undefined) => {
    if (!file || !supabase || !auth.user) return;
    setErr('');
    if (!OK.includes(file.type) || file.size > MAX) { setErr(tr.auth.photoError); return; }
    setBusy(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${auth.user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
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
          <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
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

          {/* Parola değiştirme */}
          <div style={{ alignSelf: 'stretch' }}>
            <button onClick={() => { setPwOpen((o) => !o); setPwErr(''); setPwOk(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 44 }}>
              <span>{tr.auth.changePasswordTitle}</span>
              <span style={{ color: C.muted, fontSize: 12 }}>{pwOpen ? '▲' : '▼'}</span>
            </button>
            {pwOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={labelText}>{tr.auth.currentPassword}</span>
                  <input value={curPw} onChange={(e) => setCurPw(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={labelText}>{tr.auth.newPassword} <span style={{ color: C.muted3, fontWeight: 500 }}>· {tr.auth.passwordHint}</span></span>
                  <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={labelText}>{tr.auth.newPasswordConfirm}</span>
                  <input value={newPw2} onChange={(e) => setNewPw2(e.target.value)} type="password" autoComplete="new-password" placeholder="••••••••" style={inputStyle}
                    onKeyDown={(e) => { if (e.key === 'Enter') void changePw(); }} />
                </label>
                {pwOk && <div style={{ fontSize: 12.5, color: C.successText, fontWeight: 600 }}>{tr.auth.passwordUpdated}</div>}
                {pwErr && <div style={{ fontSize: 12.5, color: C.errorText }}>{pwErr}</div>}
                <button onClick={() => void changePw()} disabled={auth.working} style={{ background: auth.working ? C.muted3 : C.navy, border: `1px solid ${auth.working ? C.muted3 : C.navy}`, color: '#fff', borderRadius: 9, padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: auth.working ? 'default' : 'pointer', minHeight: 44 }}>{auth.working ? tr.auth.working : tr.auth.changePasswordBtn}</button>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: C.border, alignSelf: 'stretch' }} />
          <button onClick={() => { onClose(); void auth.signOut(); }} style={{ background: C.surface, border: '1px solid #F6C9C9', borderRadius: 9, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: C.emergency, cursor: 'pointer', minHeight: 44, alignSelf: 'stretch' }}>{tr.header.logout}</button>
        </div>
      </div>
    </div>
  );
}
