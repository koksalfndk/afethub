import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { trUpdates, REPORT_REASON_LABEL } from '../i18n/operationUpdates';
import { C } from '../theme';
import { Ico, inputStyle } from '../ui';
import { repo } from '../data';
import type { UpdateReportReason } from '../types';

// Yayımlanmış bir güncellemeyi bildirme.
//
// Bildiren kişinin kimliği herkese açık HİÇBİR yerde görünmüyor; sunucu
// (`report_operation_update`) yalnızca moderasyon kuyruğuna sayı ve neden
// taşıyor. Aynı kişinin aynı kaydı tekrar bildirmesi ikinci bir kayıt üretmiyor
// ve hız sınırı sunucuda (migration 0038).
const REASONS: UpdateReportReason[] = [
  'wrong_info', 'personal_data', 'safety_risk', 'spam', 'duplicate', 'off_topic', 'inappropriate',
];

export function UpdateReportModal({ updateId, onClose }: { updateId: string; onClose: () => void }) {
  const a = useApp();
  const [reason, setReason] = useState<UpdateReportReason>('wrong_info');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('select')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const gonder = async () => {
    if (lock.current) return;
    lock.current = true;
    setSending(true);
    setError('');
    try {
      await repo.reportOperationUpdate(updateId, reason, note.trim());
      a.showToast(trUpdates.reportDone);
      onClose();
    } catch {
      setError(trUpdates.reportFailed);
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={trUpdates.reportTitle} style={{
      position: 'fixed', inset: 0, zIndex: 71, background: 'rgba(11,30,48,.44)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="anim-in" style={{
        background: C.surface, width: '100%', maxWidth: 460, borderRadius: 14, padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700 }}>{trUpdates.reportTitle}</h2>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{trUpdates.reportLead}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={trUpdates.cancel} style={{
            width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.borderSoft}`,
            background: C.surface, cursor: 'pointer', flex: '0 0 44px',
          }}><Ico n="close" size={16} color={C.navy} /></button>
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.heading2, marginBottom: 5 }}>
            {trUpdates.reportReason}
          </span>
          <select value={reason} onChange={(e) => setReason(e.target.value as UpdateReportReason)} style={inputStyle}>
            {REASONS.map((r) => <option key={r} value={r}>{REPORT_REASON_LABEL[r]}</option>)}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.heading2, marginBottom: 5 }}>
            {trUpdates.reportNote}
          </span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={400}
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
        </label>

        {error && (
          <div role="alert" style={{
            background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 9,
            padding: 10, fontSize: 13, color: C.errorText, fontWeight: 600, marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => void gonder()} disabled={sending} style={{
            background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
            minHeight: 48, padding: '0 18px', fontSize: 14, fontWeight: 600,
            cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
          }}>{sending ? trUpdates.sending : trUpdates.reportSend}</button>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 0, color: C.muted, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', minHeight: 48, padding: '0 8px',
          }}>{trUpdates.cancel}</button>
        </div>
      </div>
    </div>
  );
}
