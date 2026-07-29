import { useEffect } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { cols } from '../select';
import { Btn } from '../ui';
import { CATEGORIES } from '../needForm';

// The public "İhtiyaç bildir" route now opens the step-by-step wizard directly.
export function NeedRequest() {
  const a = useApp();
  const L = cols(a.device === 'mobile');

  // Opening this route opens the wizard in public mode.
  useEffect(() => {
    if (!a.wizardMode) a.openWizard('public');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>{tr.needReq.title}</h1>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 18px' }}>{tr.needReq.intro}</p>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.chipNavyBg, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: C.heading2 }}>
              <span style={{ fontSize: 15 }}>{c.icon}</span>{c.label}
            </span>
          ))}
        </div>
        <Btn variant="primary" onClick={() => a.openWizard('public')}>{tr.needReq.title}</Btn>
      </div>
    </div>
  );
}
