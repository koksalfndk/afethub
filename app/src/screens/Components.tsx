import { useApp } from '../store';
import { tr, priorityLabel, statusLabel } from '../i18n/strings';
import { C, PRI, STATUS, type PriorityKey, type StatusKey } from '../theme';
import { cols } from '../select';
import { eyebrow } from '../ui';

const PALETTE: { key: keyof typeof tr.componentsScreen.paletteNames; hex: string }[] = [
  { key: 'Navy', hex: '#102A43' }, { key: 'Emergency', hex: '#D9363E' }, { key: 'Orange', hex: '#F97316' },
  { key: 'Success', hex: '#159947' }, { key: 'Warning', hex: '#E6A700' }, { key: 'Background', hex: '#F6F8FA' },
  { key: 'Border', hex: '#E2E8F0' }, { key: 'Muted', hex: '#627D98' },
];
const PRIO_KEYS: PriorityKey[] = ['Critical', 'Urgent', 'Normal', 'Completed', 'Paused'];
const STATUS_KEYS: StatusKey[] = ['Pending verification', 'Verified', 'Partially verified', 'Rejected', 'Information requested'];
const shimmer = { background: 'linear-gradient(90deg,#EEF2F6,#E2E8F0,#EEF2F6)', backgroundSize: '220px 100%', animation: 'afetShimmer 1.2s linear infinite', borderRadius: 6, height: 12 } as const;

export function Components() {
  const a = useApp();
  const t = tr.componentsScreen;
  const L = cols(a.device === 'mobile');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{t.title}</h1>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{t.subtitle}</div>
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={eyebrow}>{t.palette}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, marginTop: 12 }}>
            {PALETTE.map((p) => (
              <div key={p.key}>
                <div style={{ height: 46, borderRadius: 8, border: `1px solid ${C.border}`, background: p.hex }} />
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 5, color: C.heading2 }}>{t.paletteNames[p.key]}</div>
                <div style={{ fontSize: 11, color: C.muted3, fontVariantNumeric: 'tabular-nums' }}>{p.hex}</div>
              </div>
            ))}
          </div>
          <div style={{ ...eyebrow, marginTop: 20 }}>{t.typeScale}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em' }}>{t.displayType}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{t.headingType}</div>
            <div style={{ fontSize: 15 }}>{t.bodyType}</div>
            <div style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{t.metaType}</div>
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={eyebrow}>{t.buttons}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, minHeight: 44, cursor: 'pointer' }}>{t.btnEmergency}</button>
              <button style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, minHeight: 44, cursor: 'pointer' }}>{t.btnPrimary}</button>
              <button style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, minHeight: 44, cursor: 'pointer' }}>{t.btnSecondary}</button>
              <button style={{ background: C.success, border: `1px solid ${C.success}`, color: '#fff', borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, minHeight: 44, cursor: 'pointer' }}>{t.btnApprove}</button>
              <button disabled style={{ background: '#F0F4F8', border: `1px solid ${C.border}`, color: C.muted3, borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, minHeight: 44 }}>{t.btnDisabled}</button>
            </div>
          </div>
          <div>
            <div style={eyebrow}>{t.badges}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {PRIO_KEYS.map((k) => (
                <span key={k} style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: PRI[k].fg, background: PRI[k].bg, border: `1px solid ${PRI[k].border}`, borderRadius: 6, padding: '5px 8px' }}>{priorityLabel[k]}</span>
              ))}
              {STATUS_KEYS.map((k) => (
                <span key={k} style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: STATUS[k].fg, background: STATUS[k].bg, border: `1px solid ${STATUS[k].border}`, borderRadius: 6, padding: '5px 8px' }}>{statusLabel[k]}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={eyebrow}>{t.states}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...shimmer, width: '55%' }} />
                <div style={{ ...shimmer, width: '80%' }} />
                <div style={{ fontSize: 12, color: C.muted3 }}>{t.loading}</div>
              </div>
              <div style={{ border: `1px dashed ${C.borderSoft}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.heading2 }}>{t.emptyTitle}</div>
                <div style={{ fontSize: 12.5, color: C.muted2 }}>{t.emptyState}</div>
              </div>
              <div style={{ border: '1px solid #F6C9C9', background: '#FEF3F2', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.errorText }}>{t.errorTitle}</div>
                <div style={{ fontSize: 12.5, color: '#B4585D' }}>{t.errorState}</div>
              </div>
              <div style={{ border: '1px solid #C9E9D6', background: '#EAF7EF', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.success, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.successText }}>{t.notif}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
