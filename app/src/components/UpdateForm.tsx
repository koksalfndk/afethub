import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { trUpdates, UPDATE_TYPE_LABEL } from '../i18n/operationUpdates';
import { C } from '../theme';
import { Ico, inputStyle } from '../ui';
import { repo, PUBLIC_UPDATE_TYPES } from '../data';
import type { OperationUpdateType } from '../types';

// Misafir saha güncellemesi gönderimi.
//
// Doğrulamanın TAMAMI sunucuda (`submit_operation_update`): uzunluk, tür izni,
// ilgili kaydın aynı operasyona ait olması, tekrar gönderim, hız sınırı, PII
// bayrağı. Buradaki kontroller yalnızca kişiyi reddedileceği bir gönderiden
// önce uyarmak için (rules/03 §Input Validation).
//
// `public_comment` FORMDA SUNULMUYOR. Sunucu onu hâlâ kabul ediyor ve mevcut
// hiçbir yol bozulmuyor; ama bu modül bir yorum alanı değil ve bir seçenek
// olarak sunmak onu öyle yapardı. Kullanıcıya açık tek tür `field_report`:
// yapılandırılmış saha bildirimi.
const FORM_TYPES: OperationUpdateType[] = PUBLIC_UPDATE_TYPES.filter((t) => t !== 'public_comment');

// Sunucudaki `operation_update_pii_flag` ile aynı sınıf desen. Burada amaç
// engellemek DEĞİL, uyarmak: metinde telefon ya da e-posta görünüyorsa kişi
// bunu bilerek göndersin.
const PII_RE = /(\+?90[\s-]?)?0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i;

export function UpdateForm({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const a = useApp();
  const snap = a.snap;
  const mob = a.device === 'mobile';
  const [type, setType] = useState<OperationUpdateType>(FORM_TYPES[0] ?? 'field_report');
  const [body, setBody] = useState('');
  const [needId, setNeedId] = useState('');
  const [locId, setLocId] = useState('');
  const [area, setArea] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [okTruth, setOkTruth] = useState(false);
  const [okPrivacy, setOkPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // Senkron kilit — `disabled` bir sonraki render'da uygulanıyor.
  const lock = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('select, textarea, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!snap) return null;
  const piiVar = PII_RE.test(body);

  const gonder = async () => {
    if (lock.current) return;
    // Hata durumunda form SIFIRLANMIYOR (rules/04 §Forms).
    if (body.trim().length < 3) { setError(trUpdates.formTooShort); return; }
    if (!email.trim()) { setError(trUpdates.formNeedsEmail); return; }
    if (!okTruth || !okPrivacy) { setError(trUpdates.formNeedsConsent); return; }

    lock.current = true;
    setSending(true);
    setError('');
    try {
      await repo.submitOperationUpdate({
        disasterId: snap.disaster.id, type, body: body.trim(),
        relatedNeedId: needId || null, relatedLocationId: locId || null,
        approximateLocation: area.trim(), name: name.trim(), email: email.trim(), phone: phone.trim(),
      });
      setDone(true);
    } catch {
      setError(trUpdates.formFailed);
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  const label = (t: string) => (
    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.heading2, marginBottom: 5 }}>{t}</span>
  );

  return (
    // z-index 70: mobil alt gezinme çubuğu (BottomNav) 60'ta ve aynı katmanda
    // kalan bir form panelinin "Gönder" düğmesini ÖRTÜYORDU — Playwright tıklamayı
    // deneyip "nav subtree intercepts pointer events" ile düştü, yani gerçek bir
    // parmak da düğmeye ulaşamazdı.
    <div role="dialog" aria-modal="true" aria-label={trUpdates.formTitle} style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(11,30,48,.44)',
      display: 'flex', alignItems: mob ? 'stretch' : 'flex-end', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="anim-in" style={{
        background: C.surface, width: '100%', maxWidth: mob ? 'none' : 640,
        // Telefonda TAM EKRAN: klavye açıldığında alan daralıyor ve yarı yükseklikte
        // bir sayfada son alanlar klavyenin altında kalıyordu (rules/04 §Forms).
        maxHeight: mob ? '100vh' : '92vh', overflowY: 'auto',
        borderRadius: mob ? 0 : '16px 16px 0 0',
        padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
      }}>
        {done ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <Ico n="verified" size={20} color="#157F3E" />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{trUpdates.successTitle}</h2>
            </div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55 }}>{trUpdates.successBody}</p>
            <button type="button" onClick={() => { onSent(); }} className="hv-navy" style={{
              marginTop: 12, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
              borderRadius: 9, minHeight: 48, padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{trUpdates.successClose}</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{trUpdates.formTitle}</h2>
                <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{trUpdates.formLead}</p>
              </div>
              <button type="button" onClick={onClose} aria-label={trUpdates.cancel} style={{
                width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.borderSoft}`,
                background: C.surface, cursor: 'pointer', flex: '0 0 44px',
              }}><Ico n="close" size={16} color={C.navy} /></button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {FORM_TYPES.length > 1 && (
                <label>{label(trUpdates.fType)}
                  <select value={type} onChange={(e) => setType(e.target.value as OperationUpdateType)} style={inputStyle}>
                    {FORM_TYPES.map((t) => <option key={t} value={t}>{UPDATE_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
              )}

              <label>{label(trUpdates.fBody)}
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1200}
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical', lineHeight: 1.5 }} />
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
                  {trUpdates.fBodyHint} · {body.trim().length}/1200
                </span>
              </label>

              {piiVar && (
                <div role="status" style={{
                  background: '#FFF8E5', border: '1px solid #F2DFA8', borderRadius: 9,
                  padding: 10, fontSize: 12.5, color: '#8A6100',
                }}>{trUpdates.piiWarning}</div>
              )}

              <label>{label(trUpdates.fNeed)}
                <select value={needId} onChange={(e) => setNeedId(e.target.value)} style={inputStyle}>
                  <option value="">{trUpdates.fNone}</option>
                  {snap.needs.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </label>

              <label>{label(trUpdates.fLocation)}
                <select value={locId} onChange={(e) => setLocId(e.target.value)} style={inputStyle}>
                  <option value="">{trUpdates.fNone}</option>
                  {snap.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>

              <label>{label(trUpdates.fArea)}
                <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={120} style={inputStyle} />
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>{trUpdates.fAreaHint}</span>
              </label>

              <label>{label(trUpdates.fName)}
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" style={inputStyle} />
              </label>

              <label>{label(trUpdates.fEmail)}
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" style={inputStyle} />
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>{trUpdates.fEmailHint}</span>
              </label>

              <label>{label(trUpdates.fPhone)}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" style={inputStyle} />
              </label>

              {[
                { on: okTruth, set: setOkTruth, text: trUpdates.okTruth },
                { on: okPrivacy, set: setOkPrivacy, text: trUpdates.okPrivacy },
              ].map((c) => (
                <label key={c.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', minHeight: 44 }}>
                  <input type="checkbox" checked={c.on} onChange={(e) => c.set(e.target.checked)}
                    style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 20px' }} />
                  <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>{c.text}</span>
                </label>
              ))}

              {error && (
                <div role="alert" style={{
                  background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 9,
                  padding: 10, fontSize: 13, color: C.errorText, fontWeight: 600,
                }}>{error}</div>
              )}

              <p style={{ margin: 0, fontSize: 12, color: C.muted2, lineHeight: 1.5 }}>{trUpdates.emergency}</p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void gonder()} disabled={sending} className="hv-emergency" style={{
                  background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
                  minHeight: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 600,
                  cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
                }}>{sending ? trUpdates.sending : trUpdates.send}</button>
                <button type="button" onClick={onClose} style={{
                  background: 'none', border: 0, color: C.muted, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', minHeight: 48, padding: '0 8px',
                }}>{trUpdates.cancel}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
