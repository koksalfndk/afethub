import { useState } from 'react';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { inputStyle, labelText } from '../ui';

export function AuthModal() {
  const auth = useAuth();
  // Opened from "Kayıt Ol" → the sign-up tab is already active.
  const [mode, setMode] = useState<'signIn' | 'signUp'>(auth.modalMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  if (!auth.modalOpen) return null;

  const submit = async () => {
    setLocalErr(''); setConfirmMsg('');
    if (mode === 'signUp' && !fullName.trim()) return setLocalErr(tr.auth.errNameRequired);
    if (!email.trim()) return setLocalErr(tr.auth.errEmailRequired);
    if (password.length < 6) return setLocalErr(tr.auth.errPasswordShort);
    if (mode === 'signIn') {
      await auth.signIn(email, password);
    } else {
      const r = await auth.signUp(email, password, fullName);
      if (r === 'ok') { /* modal closes via auth state */ }
      else if (r === 'confirm') { setConfirmMsg(tr.auth.signUpDone); setMode('signIn'); }
    }
  };

  const tab = (m: 'signIn' | 'signUp', label: string) => (
    <button onClick={() => { setMode(m); setLocalErr(''); setConfirmMsg(''); auth.clearError(); }} style={{
      flex: 1, padding: '10px 12px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
      background: mode === m ? C.surface : 'transparent', color: mode === m ? C.navy : C.muted,
      boxShadow: mode === m ? '0 1px 3px rgba(16,42,67,.12)' : 'none',
    }}>{label}</button>
  );

  const err = localErr || auth.error;

  return (
    <div onClick={auth.closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in" style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 18px 48px rgba(11,30,48,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 0' }}>
          <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: 26, marginBottom: 12, display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{mode === 'signIn' ? tr.auth.signInTitle : tr.auth.signUpTitle}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{tr.auth.intro}</div>
          <div style={{ display: 'flex', gap: 4, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginTop: 14 }}>
            {tab('signIn', tr.auth.signInTab)}
            {tab('signUp', tr.auth.signUpTab)}
          </div>
        </div>
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signUp' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelText}>{tr.auth.fullName}</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Elif Kaya" style={inputStyle} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelText}>{tr.auth.email}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="siz@example.com" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelText}>{tr.auth.password} <span style={{ color: C.muted3, fontWeight: 500 }}>· {tr.auth.passwordHint}</span></span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" style={inputStyle}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
          </label>

          {confirmMsg && <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 10, padding: '11px 12px', fontSize: 13.5, color: C.successText }}>{confirmMsg}</div>}
          {err && <div style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 10, padding: '11px 12px', fontSize: 13.5, color: C.errorText }}>{err}</div>}

          <button onClick={() => void submit()} disabled={auth.working} style={{
            background: auth.working ? C.muted3 : C.navy, border: `1px solid ${auth.working ? C.muted3 : C.navy}`, color: '#fff',
            borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 600, cursor: auth.working ? 'default' : 'pointer', minHeight: 48,
          }}>{auth.working ? tr.auth.working : (mode === 'signIn' ? tr.auth.signInBtn : tr.auth.signUpBtn)}</button>

          <button onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setLocalErr(''); setConfirmMsg(''); auth.clearError(); }} style={{ background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {mode === 'signIn' ? tr.auth.switchToSignUp : tr.auth.switchToSignIn}
          </button>
        </div>
      </div>
    </div>
  );
}
