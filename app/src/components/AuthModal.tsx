import { useState } from 'react';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { inputStyle, labelText } from '../ui';

type Mode = 'signIn' | 'signUp' | 'forgot';

export function AuthModal() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [info, setInfo] = useState('');

  if (!auth.modalOpen) return null;

  // Password-recovery view takes over the modal when the user arrives via the
  // reset link, regardless of the tab state.
  const recovery = auth.recovery;

  const reset = () => { setLocalErr(''); setInfo(''); };
  const close = () => { reset(); setPassword(''); setPassword2(''); auth.closeModal(); };

  const submit = async () => {
    reset();

    if (recovery) {
      if (password.length < 6) return setLocalErr(tr.auth.errPasswordShort);
      if (password !== password2) return setLocalErr(tr.auth.errPasswordMismatch);
      const ok = await auth.updatePassword(password);
      if (ok) { setInfo(tr.auth.passwordUpdated); setPassword(''); setPassword2(''); }
      return;
    }

    if (mode === 'forgot') {
      if (!email.trim()) return setLocalErr(tr.auth.errEmailRequired);
      const ok = await auth.requestPasswordReset(email);
      if (ok) setInfo(tr.auth.forgotSent);
      return;
    }

    if (mode === 'signUp' && !fullName.trim()) return setLocalErr(tr.auth.errNameRequired);
    if (!email.trim()) return setLocalErr(tr.auth.errEmailRequired);
    if (password.length < 6) return setLocalErr(tr.auth.errPasswordShort);
    if (mode === 'signIn') {
      await auth.signIn(email, password);
    } else {
      const r = await auth.signUp(email, password, fullName);
      if (r === 'confirm') { setInfo(tr.auth.signUpDone); setMode('signIn'); }
    }
  };

  const switchMode = (m: Mode) => { setMode(m); reset(); auth.clearError(); };

  const tab = (m: 'signIn' | 'signUp', label: string) => (
    <button onClick={() => switchMode(m)} style={{
      flex: 1, padding: '10px 12px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
      background: mode === m ? C.surface : 'transparent', color: mode === m ? C.navy : C.muted,
      boxShadow: mode === m ? '0 1px 3px rgba(16,42,67,.12)' : 'none',
    }}>{label}</button>
  );

  const err = localErr || auth.error;

  const title = recovery ? tr.auth.recoveryTitle
    : mode === 'forgot' ? tr.auth.forgotTitle
    : mode === 'signIn' ? tr.auth.signInTitle : tr.auth.signUpTitle;
  const intro = recovery ? tr.auth.recoveryIntro
    : mode === 'forgot' ? tr.auth.forgotIntro : tr.auth.intro;

  const cta = recovery ? tr.auth.updatePasswordBtn
    : mode === 'forgot' ? tr.auth.forgotSend
    : mode === 'signIn' ? tr.auth.signInBtn : tr.auth.signUpBtn;

  // In recovery mode, hide the close-to-dismiss behaviour on the backdrop so the
  // user doesn't accidentally lose the reset session before setting a password.
  const onBackdrop = recovery ? undefined : close;

  return (
    <div onClick={onBackdrop} style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in" style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 18px 48px rgba(11,30,48,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 0' }}>
          <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: 26, marginBottom: 12, display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{title}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{intro}</div>
          {!recovery && mode !== 'forgot' && (
            <div style={{ display: 'flex', gap: 4, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginTop: 14 }}>
              {tab('signIn', tr.auth.signInTab)}
              {tab('signUp', tr.auth.signUpTab)}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recovery ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelText}>{tr.auth.newPassword} <span style={{ color: C.muted3, fontWeight: 500 }}>· {tr.auth.passwordHint}</span></span>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelText}>{tr.auth.newPasswordConfirm}</span>
                <input value={password2} onChange={(e) => setPassword2(e.target.value)} type="password" placeholder="••••••••" style={inputStyle}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
              </label>
            </>
          ) : (
            <>
              {mode === 'signUp' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelText}>{tr.auth.fullName}</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Elif Kaya" style={inputStyle} />
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelText}>{tr.auth.email}</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="siz@example.com" style={inputStyle}
                  onKeyDown={(e) => { if (mode === 'forgot' && e.key === 'Enter') void submit(); }} />
              </label>
              {mode !== 'forgot' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelText}>{tr.auth.password} <span style={{ color: C.muted3, fontWeight: 500 }}>· {tr.auth.passwordHint}</span></span>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" style={inputStyle}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
                </label>
              )}
              {mode === 'signIn' && (
                <button onClick={() => switchMode('forgot')} style={{ alignSelf: 'flex-start', background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  {tr.auth.forgotLink}
                </button>
              )}
            </>
          )}

          {info && <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 10, padding: '11px 12px', fontSize: 13.5, color: C.successText }}>{info}</div>}
          {err && <div style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 10, padding: '11px 12px', fontSize: 13.5, color: C.errorText }}>{err}</div>}

          <button onClick={() => void submit()} disabled={auth.working} style={{
            background: auth.working ? C.muted3 : C.navy, border: `1px solid ${auth.working ? C.muted3 : C.navy}`, color: '#fff',
            borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 600, cursor: auth.working ? 'default' : 'pointer', minHeight: 48,
          }}>{auth.working ? tr.auth.working : cta}</button>

          {mode === 'forgot' && !recovery && (
            <button onClick={() => switchMode('signIn')} style={{ background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {tr.auth.backToSignIn}
            </button>
          )}
          {!recovery && mode !== 'forgot' && (
            <button onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')} style={{ background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {mode === 'signIn' ? tr.auth.switchToSignUp : tr.auth.switchToSignIn}
            </button>
          )}
          {recovery && info && (
            <button onClick={close} style={{ background: 'none', border: 0, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {tr.wizard.close}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
