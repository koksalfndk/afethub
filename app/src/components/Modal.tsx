import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { remaining } from '../data';
import { inputStyle, labelText } from '../ui';

// Verification modal: approve / partial / reject / request-info, with the
// before/after remaining math shown live. Confirm routes through the data layer.
export function Modal() {
  const a = useApp();
  if (!a.modal || !a.snap) return null;
  const m = a.modal;
  const sub = a.snap.subs.find((s) => s.id === m.subId);
  if (!sub) return null;
  const need = a.snap.needs.find((n) => n.id === sub.needId)!;
  const remNow = remaining(need);
  const qty = Math.max(0, Math.min(parseInt(m.qty, 10) || 0, sub.qty));
  const isApprove = m.kind === 'approve' || m.kind === 'partial';
  const remAfter = isApprove ? Math.max(0, remNow - qty) : remNow;

  const title = m.kind === 'reject' ? tr.modal.titleReject : m.kind === 'info' ? tr.modal.titleInfo : tr.modal.titleVerify(need.name);
  const reasonLabel = m.kind === 'reject' ? tr.modal.reasonReject : m.kind === 'info' ? tr.modal.reasonInfo : (qty < sub.qty ? tr.modal.reasonNoteWhy : tr.modal.reasonNoteOpt);
  const cta = m.kind === 'reject' ? tr.modal.ctaReject : m.kind === 'info' ? tr.modal.ctaInfo : tr.modal.ctaApprove(qty);
  const ctaBg = m.kind === 'reject' ? C.emergency : m.kind === 'info' ? C.navy : C.success;
  const warn = isApprove && qty < sub.qty ? tr.modal.warn(sub.qty - qty, sub.unit) : '';

  const statCard = (label: string, value: string, tone?: 'green') => (
    <div style={{ background: tone ? '#EAF7EF' : C.canvas, border: `1px solid ${tone ? '#C9E9D6' : C.border}`, borderRadius: 9, padding: 10 }}>
      <div style={{ fontSize: 11.5, color: tone ? C.successText : C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone ? C.successText : C.navy }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 70 }}>
      <div className="anim-in" style={{ background: C.surface, borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 18px 48px rgba(11,30,48,.25)', maxHeight: '90%', overflowY: 'auto' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted2 }}>{sub.code} · {sub.contributor}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: C.navy }}>{title}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{tr.modal.subReported(sub.qty, sub.unit, sub.loc, sub.submitted)}</div>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {statCard(tr.modal.reported, `${sub.qty} ${sub.unit}`)}
            {statCard(tr.modal.remainingNow, `${remNow} ${need.unit}`)}
            {statCard(tr.modal.afterApproval, `${remAfter} ${need.unit}`, 'green')}
          </div>
          {sub.photoUrl && (
            <a href={sub.photoUrl} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              <img src={sub.photoUrl} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />
            </a>
          )}
          {isApprove && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelText}>{tr.modal.verifiedQty}</span>
              <input value={m.qty} onChange={(e) => a.setModalQty(e.target.value)} type="number" min={0} style={{ ...inputStyle, fontSize: 15, fontWeight: 600 }} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelText}>{reasonLabel}</span>
            <textarea value={m.reason} onChange={(e) => a.setModalReason(e.target.value)} rows={2} placeholder={tr.modal.reasonPh} style={{ ...inputStyle, minHeight: undefined, resize: 'vertical' }} />
          </label>
          {warn && <div style={{ background: '#FFF8E5', border: '1px solid #F2DFA8', borderRadius: 9, padding: 11, fontSize: 13, color: C.warningText }}>{warn}</div>}
          {/* Yazma başarısız olduğunda pencere kapanmaz ve sebep BURADA durur.
              Kaybolan bir toast, "bastım, kaydedildi sandım" ile sonuçlanıyordu. */}
          {m.error && (
            <div role="alert" style={{
              background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9,
              padding: 11, fontSize: 13, color: C.errorText, fontWeight: 600,
            }}>{m.error}</div>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={a.closeModal} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.heading2, borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.cancel ?? 'Vazgeç'}</button>
          <button onClick={a.confirmModal} style={{ background: ctaBg, border: `1px solid ${ctaBg}`, color: '#fff', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{cta}</button>
        </div>
      </div>
    </div>
  );
}
