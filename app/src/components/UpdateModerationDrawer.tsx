import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { trModeration } from '../i18n/coordUpdates';
import { UPDATE_TYPE_LABEL } from '../i18n/operationUpdates';
import { C } from '../theme';
import { inputStyle, eyebrow } from '../ui';
import { repo } from '../data';
import { sureOnce, FlagBadges } from '../screens/CoordUpdates';
import type { UpdateQueueRow, UpdateContact } from '../types';

// ---------------------------------------------------------------------------
// Saha güncellemesi inceleme çekmecesi (Faz 4-A)
//
// Yapı PledgeDrawer ile aynı: kayıt + kararlar + iletişim erişimi tek yüzeyde.
// İki kural bu dosyanın omurgası:
//
//   1. TAM İLETİŞİM BİLGİSİ BURAYA ÖNCEDEN GELMİYOR. Liste maskeli; tam değer
//      `get_operation_update_contact` ile, yazılı gerekçeyle alınıyor ve her
//      erişim sunucuda denetim kaydına düşüyor. Çekmece kapanınca bellekten
//      temizleniyor (rules/03 §Contact Information).
//   2. YAYINLAMAK ≠ DOĞRULAMAK. Yayın panelindeki "Bu bilgiyi ayrıca doğruladım"
//      kutusu işaretlenmedikçe misafir/kullanıcı bildirimi "Doğrulama bekleniyor"
//      rozetiyle yayımlanır (migration 0049, rules/07 §Critical Distinctions).
// ---------------------------------------------------------------------------

const PANEL_W = 560;

// Odak tuzağı + Escape + odağın tetikleyiciye dönmesi (PledgeDrawer ile aynı).
function useDrawer(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(
      ref.current?.querySelectorAll<HTMLElement>('button,select,input,textarea,a[href],[tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [onClose]);
  return ref;
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: C.muted2, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.heading2 }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: `1px solid ${C.borderFaint}`, paddingTop: 14, marginTop: 14 }}>
      <h3 style={{ ...eyebrow, margin: '0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}

// Hangi karar paneli açık. Tek seferde tek panel: iki yarı doldurulmuş form,
// hangisinin onaylanacağı belirsiz bir ekran demek.
type Panel = 'publish' | 'edit' | 'info' | 'reject' | 'hide' | 'correct' | null;

export function UpdateModerationDrawer({ row, onClose, onChanged }: {
  row: UpdateQueueRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const a = useApp();
  const ref = useDrawer(onClose);

  // Senkron kilit — `disabled` bir sonraki render'da uygulanıyor (Faz 3-A'da
  // üretimde ölçülen çift gönderim kusuru).
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');

  // Panel alanları. HATA SONRASI SIFIRLANMAZ (rules/04 §Forms).
  const [reason, setReason] = useState('');
  const [editBody, setEditBody] = useState(row.body);
  const [infoMsg, setInfoMsg] = useState('');
  const [verifyChecked, setVerifyChecked] = useState(false);

  // İletişim erişimi. Kapatınca temizlenir.
  const [contact, setContact] = useState<UpdateContact | null>(null);
  const [askContact, setAskContact] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [copied, setCopied] = useState('');

  // Sabitleme durumu kuyruk satırında YOK (0049 kuyruğu moderasyon alanlarını
  // taşıyor); yayımlanmış kayıt için herkese açık okumadan alınıyor — istemci
  // zaten aynı yolu Realtime olayı sonrası da kullanıyor. `null` = bilinmiyor,
  // düğme o sırada çizilmiyor.
  const [pinned, setPinned] = useState<boolean | null>(null);
  useEffect(() => {
    if (row.status !== 'published') return;
    let gecerli = true;
    repo.getOperationUpdate(row.id)
      .then((u) => { if (gecerli) setPinned(u ? u.pinned : null); })
      .catch(() => { /* sabitleme düğmesi çizilmez; kayıt yine yönetilebilir */ });
    return () => { gecerli = false; };
  }, [row.id, row.status]);

  const run = async (fn: () => Promise<void>, done: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await fn();
      a.showToast(done);
      onChanged();
    } catch {
      // Ham sunucu iletisi gösterilmiyor (rules/03 §Error Handling).
      setError(trModeration.actionFailed);
    } finally {
      lock.current = false; setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(trModeration.copied); }
    catch { setCopied(trModeration.copyFailed); }
  };

  const acilPanel = (p: Panel) => { setPanel(p); setError(''); };
  const beklemede = row.status === 'moderation_pending';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', zIndex: 85,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        ref={ref} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={trModeration.detailTitle}
        className="anim-in"
        style={{
          background: C.surface, width: '100%', maxWidth: PANEL_W, height: '100%',
          overflowY: 'auto', boxShadow: '-18px 0 48px rgba(11,30,48,.22)',
        }}
      >
        <div style={{
          position: 'sticky', top: 0, background: C.surface, zIndex: 1,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '18px 20px 12px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.muted2 }}>
              {[UPDATE_TYPE_LABEL[row.type], trModeration.authorLabel[row.authorType] ?? row.authorType].join(' · ')}
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: C.navy }}>
              {trModeration.detailTitle}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label={trModeration.close} style={{
            flex: '0 0 44px', width: 44, height: 44, background: C.canvas,
            border: `1px solid ${C.border}`, borderRadius: 9, cursor: 'pointer', color: C.muted,
          }}>✕</button>
        </div>

        <div style={{ padding: '14px 20px 28px' }}>
          <FlagBadges r={row} />

          {/* ---- Gönderi metni ------------------------------------------------ */}
          <Section title={trModeration.sectionBody}>
            <p style={{ margin: 0, fontSize: 14.5, color: C.heading2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {row.body}
            </p>
            {row.piiFlagged && beklemede && (
              <div role="status" style={{
                marginTop: 10, background: '#FFF8E5', border: '1px solid #F2DFA8',
                borderRadius: 9, padding: 10, fontSize: 12.5, color: '#8A6100', lineHeight: 1.5,
              }}>{trModeration.piiInBody}</div>
            )}
            {row.originalBody && row.originalBody !== row.body && (
              <div style={{ marginTop: 12, background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 12 }}>
                <div style={{ ...eyebrow, marginBottom: 5 }}>{trModeration.originalBody}</div>
                <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{trModeration.originalNote}</p>
                <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.heading2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                  {row.originalBody}
                </p>
              </div>
            )}
          </Section>

          {/* ---- Bağlam ------------------------------------------------------- */}
          <Section title={trModeration.sectionMeta}>
            <Row label={trModeration.metaOperation} value={row.disasterName} />
            <Row label={trModeration.metaType} value={UPDATE_TYPE_LABEL[row.type]} />
            <Row label={trModeration.metaNeed} value={row.relatedNeedName} />
            <Row label={trModeration.metaLocation} value={row.relatedLocationName} />
            <Row label={trModeration.metaArea} value={row.approximateLocation} />
            <Row label={trModeration.metaSubmitted} value={sureOnce(row.createdAt)} />
            {row.openReports > 0 && <Row label={trModeration.metaReports} value={String(row.openReports)} />}
            {(row.photoPending > 0 || row.photoApproved > 0) && (
              <Row label={trModeration.metaPhotos} value={trModeration.photoState(row.photoPending, row.photoApproved)} />
            )}
          </Section>

          {/* ---- Gönderen ----------------------------------------------------- */}
          <Section title={trModeration.sectionContact}>
            {!row.hasContact ? (
              <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{trModeration.noContact}</p>
            ) : !contact ? (
              <>
                <Row label={trModeration.colAuthor} value={row.contactMasked || '—'} />
                <Row label="E-posta" value={row.emailMasked || '—'} />
                <Row label="Telefon" value={row.phoneMasked || '—'} />
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted2, lineHeight: 1.5 }}>
                  {trModeration.contactMaskedNote}
                </p>
                {askContact ? (
                  <div style={{ marginTop: 10, background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 13 }}>
                    <label style={{ display: 'block' }}>
                      <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.revealPurpose}</span>
                      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={inputStyle} />
                      <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
                        {trModeration.revealPurposeHint}
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button type="button" disabled={busy || purpose.trim().length < 3}
                        onClick={async () => {
                          if (lock.current) return;
                          lock.current = true; setBusy(true);
                          try {
                            setContact(await repo.updateContact(row.id, purpose.trim()));
                            setAskContact(false); setPurpose('');
                          } catch {
                            setError(trModeration.actionFailed);
                          } finally { lock.current = false; setBusy(false); }
                        }}
                        style={{ ...primary, opacity: purpose.trim().length < 3 ? .5 : 1 }}>
                        {busy ? trModeration.saving : trModeration.revealConfirm}
                      </button>
                      <button type="button" onClick={() => { setAskContact(false); setPurpose(''); }} style={quiet}>
                        {trModeration.revealCancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAskContact(true)} style={{ ...primary, marginTop: 10 }}>
                    {trModeration.reveal}
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ background: '#FFFDF4', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '11px 13px', marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: C.heading2, lineHeight: 1.5 }}>
                    {trModeration.revealUse}
                  </p>
                </div>
                <Row label={trModeration.colAuthor} value={contact.fullName || '—'} />
                <Row label="E-posta" value={contact.email || '—'} />
                <Row label="Telefon" value={contact.phone || '—'} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {contact.email && (
                    <button type="button" onClick={() => copy(contact.email)} style={quiet}>{trModeration.copyEmail}</button>
                  )}
                  {contact.phone && (
                    <button type="button" onClick={() => copy(contact.phone)} style={quiet}>{trModeration.copyPhone}</button>
                  )}
                  {/* Gizlemek veriyi istemciden gerçekten düşürüyor. */}
                  <button type="button" onClick={() => { setContact(null); setCopied(''); }} style={quiet}>
                    {trModeration.hideContact}
                  </button>
                </div>
                {copied && <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, color: C.successText }}>{copied}</p>}
              </>
            )}
          </Section>

          {/* ---- Açık bilgi isteği ------------------------------------------- */}
          {row.infoRequestedAt && (
            <Section title={trModeration.sectionInfo}>
              <div style={{ background: '#EFF6FB', border: '1px solid #CBE0F0', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E5C93' }}>
                  {trModeration.infoRequested(sureOnce(row.infoRequestedAt))}
                </div>
                {row.infoRequestMessage && (
                  <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.heading2, lineHeight: 1.5 }}>
                    {row.infoRequestMessage}
                  </p>
                )}
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                  {trModeration.infoPendingNote}
                </p>
              </div>
            </Section>
          )}

          {/* ---- Karar -------------------------------------------------------- */}
          <Section title={trModeration.sectionDecision}>
            {error && (
              <div role="alert" style={{
                background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 9,
                padding: 10, fontSize: 13, color: C.errorText, fontWeight: 600, marginBottom: 12,
              }}>{error}</div>
            )}

            {panel === 'publish' && (
              <ConfirmPanel
                title={trModeration.publishTitle}
                consequence={trModeration.publishConsequence}
                busy={busy}
                onCancel={() => acilPanel(null)}
                onConfirm={() => void run(
                  () => repo.moderateOperationUpdate(row.id, 'publish', reason.trim(), verifyChecked || undefined),
                  trModeration.doneTitle.publish,
                )}
              >
                {/* Doğrulama kutusu yalnızca misafir/kullanıcı bildiriminde anlamlı;
                    koordinatör ve kurum güncellemeleri sunucuda zaten doğrulanmış
                    sayılıyor ve kutu yanlış bir seçim hissi verirdi. */}
                {(row.authorType === 'guest' || row.authorType === 'user' || row.authorType === 'volunteer') && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', minHeight: 44, marginBottom: 8 }}>
                    <input type="checkbox" checked={verifyChecked} onChange={(e) => setVerifyChecked(e.target.checked)}
                      style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 20px' }} />
                    <span style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                      <strong>{trModeration.publishVerify}</strong>
                      <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {trModeration.publishVerifyHint}
                      </span>
                    </span>
                  </label>
                )}
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.publishReason}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                </label>
              </ConfirmPanel>
            )}

            {panel === 'edit' && (
              <ConfirmPanel
                title={trModeration.editTitle}
                consequence={trModeration.editLead}
                busy={busy}
                disabled={editBody.trim().length < 3 || reason.trim().length < 3}
                onCancel={() => acilPanel(null)}
                onConfirm={() => {
                  if (editBody.trim().length < 3) { setError(trModeration.bodyTooShort); return; }
                  if (reason.trim().length < 3) { setError(trModeration.reasonRequired); return; }
                  void run(
                    () => repo.publishUpdateEdited(row.id, editBody.trim(), reason.trim()),
                    trModeration.doneTitle.publishEdited,
                  );
                }}
              >
                <label style={{ display: 'block', marginBottom: 10 }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.editBody}</span>
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} maxLength={1200}
                    style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.editReason}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
                    {trModeration.editReasonHint}
                  </span>
                </label>
              </ConfirmPanel>
            )}

            {panel === 'info' && (
              <ConfirmPanel
                title={trModeration.infoTitle}
                consequence={trModeration.infoLead}
                busy={busy}
                disabled={infoMsg.trim().length < 3}
                onCancel={() => acilPanel(null)}
                onConfirm={() => {
                  if (infoMsg.trim().length < 3) { setError(trModeration.msgTooShort); return; }
                  void run(
                    () => repo.requestUpdateInfo(row.id, infoMsg.trim()),
                    trModeration.doneTitle.info,
                  );
                }}
              >
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.infoMessage}</span>
                  <textarea value={infoMsg} onChange={(e) => setInfoMsg(e.target.value)} rows={3} maxLength={500}
                    style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
                </label>
              </ConfirmPanel>
            )}

            {panel === 'reject' && (
              <ConfirmPanel
                title={trModeration.rejectTitle}
                consequence={trModeration.rejectConsequence}
                busy={busy}
                danger
                disabled={reason.trim().length < 3}
                onCancel={() => acilPanel(null)}
                onConfirm={() => {
                  if (reason.trim().length < 3) { setError(trModeration.reasonRequired); return; }
                  void run(
                    () => repo.moderateOperationUpdate(row.id, 'reject', reason.trim()),
                    trModeration.doneTitle.reject,
                  );
                }}
              >
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.rejectReason}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                </label>
              </ConfirmPanel>
            )}

            {panel === 'hide' && (
              <ConfirmPanel
                title={trModeration.hideTitle}
                consequence={trModeration.hideConsequence}
                busy={busy}
                danger
                disabled={reason.trim().length < 3}
                onCancel={() => acilPanel(null)}
                onConfirm={() => {
                  if (reason.trim().length < 3) { setError(trModeration.reasonRequired); return; }
                  void run(
                    () => repo.moderateOperationUpdate(row.id, 'hide', reason.trim()),
                    trModeration.doneTitle.hide,
                  );
                }}
              >
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.hideReason}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                </label>
              </ConfirmPanel>
            )}

            {panel === 'correct' && (
              <ConfirmPanel
                title={trModeration.correctTitle}
                consequence={trModeration.correctLead}
                busy={busy}
                disabled={editBody.trim().length < 3 || reason.trim().length < 3}
                onCancel={() => acilPanel(null)}
                onConfirm={() => {
                  if (editBody.trim().length < 3) { setError(trModeration.bodyTooShort); return; }
                  if (reason.trim().length < 3) { setError(trModeration.reasonRequired); return; }
                  void run(
                    async () => { await repo.correctOperationUpdate(row.id, editBody.trim(), reason.trim()); },
                    trModeration.doneTitle.correct,
                  );
                }}
              >
                <label style={{ display: 'block', marginBottom: 10 }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.correctBody}</span>
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} maxLength={1200}
                    style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.correctReason}</span>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                </label>
              </ConfirmPanel>
            )}

            {panel === null && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {beklemede ? (
                  <>
                    <button type="button" onClick={() => acilPanel('publish')} style={primary}>{trModeration.actPublish}</button>
                    <button type="button" onClick={() => acilPanel('edit')} style={quiet}>{trModeration.actPublishEdited}</button>
                    <button type="button" onClick={() => acilPanel('info')} style={quiet}>{trModeration.actRequestInfo}</button>
                    <button type="button" onClick={() => acilPanel('reject')} style={quiet}>{trModeration.actReject}</button>
                  </>
                ) : row.status === 'published' ? (
                  // Yayımlanmış ama bildirim/fotoğraf yüzünden kuyruğa düşen kayıt.
                  // Düzelt YENİ bir kayıt açar (eskisi `corrected` olur, tablodan
                  // silinmez); Gizle akıştan kaldırır ama kaydı korur.
                  <>
                    <button type="button" onClick={() => acilPanel('correct')} style={primary}>{trModeration.actCorrect}</button>
                    <button type="button" onClick={() => acilPanel('hide')} style={quiet}>{trModeration.actHide}</button>
                    {pinned !== null && (
                      <button type="button" disabled={busy}
                        onClick={() => void run(
                          () => repo.pinOperationUpdate(row.id, !pinned, null),
                          pinned ? trModeration.doneTitle.unpin : trModeration.doneTitle.pin,
                        )}
                        style={quiet}>
                        {pinned ? trModeration.actUnpin : trModeration.actPin}
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// Sonucu gösteren onay paneli (rules/04 §Destructive Actions: eylemi değil,
// sonucunu söyle; onay tek tık ötede ama içerik görünür).
function ConfirmPanel({ title, consequence, busy, danger, disabled, onConfirm, onCancel, children }: {
  title: string; consequence: string; busy: boolean; danger?: boolean; disabled?: boolean;
  onConfirm: () => void; onCancel: () => void; children?: React.ReactNode;
}) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 13 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: danger ? C.errorText : C.navy }}>{title}</div>
      <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{consequence}</p>
      {children}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || disabled} onClick={onConfirm} style={{
          background: busy || disabled ? C.muted3 : (danger ? C.emergency : C.navy),
          border: 0, color: '#fff', borderRadius: 9, padding: '0 16px',
          minHeight: 48, fontSize: 14, fontWeight: 600, cursor: busy || disabled ? 'default' : 'pointer',
        }}>{busy ? trModeration.saving : trModeration.confirm}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={quiet}>
          {trModeration.cancel}
        </button>
      </div>
    </div>
  );
}

const primary: React.CSSProperties = {
  background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
  padding: '0 16px', minHeight: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const quiet: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
  padding: '0 16px', minHeight: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
