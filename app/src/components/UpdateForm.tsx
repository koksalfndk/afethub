import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { trUpdates, UPDATE_TYPE_LABEL } from '../i18n/operationUpdates';
import { C } from '../theme';
import { Ico, inputStyle } from '../ui';
import { repo, PUBLIC_UPDATE_TYPES, COORD_UPDATE_TYPES, UPDATE_PII_RE } from '../data';
import type { OperationUpdateType } from '../types';

// Saha güncellemesi gönderimi — ROLE GÖRE İKİ AYRI SÖZLEŞME.
//
// Sunucuda (`submit_operation_update`) koordinatörün gönderimi DOĞRUDAN yayına
// girer; misafirinki moderasyona düşer. Form eskiden herkese aynı cümleyi
// söylüyordu ("incelemeden sonra yayımlanır") ve bu, koordinatör için yanlıştı —
// 3 Ağustos üretim doğrulamasında koordinatör hesabıyla atılan test kaydı anında
// yayımlandı. Çözüm sunucuyu değiştirmek değil (koordinatörün hızlı duyuru yolu
// operasyonda gerekli), formun rolüne göre dürüst olması (rules/07 §Tone,
// rules/04 §Destructive Actions: sonucu onaydan önce göster).
//
// `public_comment` HİÇBİR rolde sunulmuyor: bu modül bir yorum alanı değil.
const FORM_TYPES: OperationUpdateType[] = PUBLIC_UPDATE_TYPES.filter((t) => t !== 'public_comment');


export function UpdateForm({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const a = useApp();
  const snap = a.snap;
  const mob = a.device === 'mobile';
  // Rol yalnızca formun DİLİNİ ve tür listesini seçiyor; yayın kararını sunucu
  // veriyor (`is_coordinator()`). Tarayıcıdaki role güvenilmiyor — buradaki
  // dallanma yanlışsa en kötü sonuç yanlış bir metin, yanlış bir yayın değil.
  const koord = a.role === 'coordinator';
  const tipler = koord ? COORD_UPDATE_TYPES : FORM_TYPES;
  const [type, setType] = useState<OperationUpdateType>(tipler[0] ?? 'field_report');
  // Koordinatörde onay adımı: "Yayınla"ya ilk basış sonucu gösterir, ikincisi
  // gönderir. Misafirde bu adım yok — onun gönderisi zaten incelemeye gidiyor.
  const [confirming, setConfirming] = useState(false);
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
  const piiVar = UPDATE_PII_RE.test(body);

  const gonder = async () => {
    if (lock.current) return;
    // Hata durumunda form SIFIRLANMIYOR (rules/04 §Forms).
    if (body.trim().length < 3) { setError(trUpdates.formTooShort); return; }
    // E-posta yalnızca misafir sözleşmesinin parçası: sunucu koordinatörden
    // istemiyor ve moderasyon geri dönüşü diye bir adım yok.
    if (!koord && !email.trim()) { setError(trUpdates.formNeedsEmail); return; }
    if (!koord && (!okTruth || !okPrivacy)) { setError(trUpdates.formNeedsConsent); return; }
    // Koordinatör sonucu görmeden yayınlamıyor: ilk basış onay bloğunu açar.
    if (koord && !confirming) { setConfirming(true); setError(''); return; }

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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {koord ? trUpdates.coordSuccessTitle : trUpdates.successTitle}
              </h2>
            </div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55 }}>
              {koord ? trUpdates.coordSuccessBody : trUpdates.successBody}
            </p>
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
                {/* Dürüst vaat: koordinatörün gönderimi incelemeden GEÇMEZ. */}
                <p style={{ margin: 0, fontSize: 13, color: koord ? '#8A4A00' : C.muted, fontWeight: koord ? 600 : 400 }}>
                  {koord ? trUpdates.coordLead : trUpdates.formLead}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label={trUpdates.cancel} style={{
                width: 44, height: 44, borderRadius: 10, border: `1px solid ${C.borderSoft}`,
                background: C.surface, cursor: 'pointer', flex: '0 0 44px',
              }}><Ico n="close" size={16} color={C.navy} /></button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {tipler.length > 1 && (
                <label>{label(trUpdates.fType)}
                  <select value={type} onChange={(e) => setType(e.target.value as OperationUpdateType)} style={inputStyle}>
                    {tipler.map((t) => <option key={t} value={t}>{UPDATE_TYPE_LABEL[t]}</option>)}
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

              {/* İletişim alanları ve onay kutuları MİSAFİR sözleşmesinin parçası:
                  moderasyon geri dönüşü ve kötüye kullanım sınırı için. Koordinatörün
                  kimliği oturumdan geliyor; burada ad/e-posta sormak veri toplamak
                  olurdu (rules/03 §Data Minimization). */}
              {!koord && (
                <>
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
                </>
              )}

              {error && (
                <div role="alert" style={{
                  background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 9,
                  padding: 10, fontSize: 13, color: C.errorText, fontWeight: 600,
                }}>{error}</div>
              )}

              <p style={{ margin: 0, fontSize: 12, color: C.muted2, lineHeight: 1.5 }}>{trUpdates.emergency}</p>

              {/* Yayın öncesi sonuç: metin herkese açık akışta HEMEN görünecek.
                  Onay bloğu açıkken düğme gönderir; kapalıyken açar. */}
              {koord && confirming && (
                <div style={{ background: '#FFF8E5', border: '1px solid #F2DFA8', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#8A4A00' }}>{trUpdates.coordConfirmTitle}</div>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8A6100', lineHeight: 1.5 }}>
                    {trUpdates.coordConfirm(UPDATE_TYPE_LABEL[type])}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void gonder()} disabled={sending} className="hv-emergency" style={{
                  background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
                  minHeight: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 600,
                  cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
                }}>{sending ? trUpdates.sending
                  : koord ? (confirming ? trUpdates.coordConfirmGo : trUpdates.coordPublish)
                  : trUpdates.send}</button>
                {koord && confirming && !sending && (
                  <button type="button" onClick={() => setConfirming(false)} style={{
                    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                    borderRadius: 9, minHeight: 48, padding: '0 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>{trUpdates.cancel}</button>
                )}
                {!(koord && confirming) && (
                  <button type="button" onClick={onClose} style={{
                    background: 'none', border: 0, color: C.muted, fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', minHeight: 48, padding: '0 8px',
                  }}>{trUpdates.cancel}</button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
