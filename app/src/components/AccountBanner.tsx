import { useState } from 'react';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C } from '../theme';

// Shown when a user is signed in but their email is not yet confirmed.
export function AccountBanner() {
  const auth = useAuth();
  const [sent, setSent] = useState(false);
  if (!auth.enabled || !auth.user || auth.emailVerified) return null;

  return (
    <div style={{ background: '#FFF8E5', borderBottom: '1px solid #F2DFA8', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.warning, flex: '0 0 8px' }} />
      <span style={{ fontSize: 13, color: C.warningText }}>
        <b style={{ fontWeight: 700 }}>{tr.auth.verifyBannerTitle}</b> — {tr.auth.verifyBannerBody}
      </span>
      <div style={{ flex: 1 }} />
      <button onClick={async () => { if (await auth.resendVerification()) setSent(true); }} disabled={sent} style={{
        background: sent ? 'transparent' : C.surface, border: `1px solid ${sent ? 'transparent' : '#F2DFA8'}`, borderRadius: 8,
        padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: C.warningText, cursor: sent ? 'default' : 'pointer',
      }}>{sent ? tr.auth.resendDone : tr.auth.resend}</button>
    </div>
  );
}
