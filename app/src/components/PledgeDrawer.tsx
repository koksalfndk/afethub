import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { trPledges } from '../i18n/coordPledges';
import { C } from '../theme';
import { Ico, inputStyle, eyebrow } from '../ui';
import { PLEDGE_TRANSITIONS, overdueLabel } from '../data';
import { PledgeStatusBadge, etaText } from '../screens/CoordPledges';
import type { PledgeStatus } from '../types';

// ---------------------------------------------------------------------------
// Teslim sözü detay çekmecesi (Faz 3-C)
//
// Üç şey burada bir arada: kaydın kendisi, durum geçişleri ve iletişim erişimi.
// İkisi ayrı ekran olsaydı koordinatör telefonu açmak için sayfa değiştirecekti.
//
// Gizlilik kuralı bu dosyanın en önemli parçası: tam iletişim bilgisi buraya
// ÖNCEDEN gelmiyor. Ayrı bir çağrı, ayrı bir gerekçe, ayrı bir denetim kaydı
// (direktif §13). Çekmece kapanınca da bellekten düşüyor.
// ---------------------------------------------------------------------------

const PANEL_W = 520;

// Odak tuzağı + Escape + odağın tetikleyiciye dönmesi. Faz 3-B'deki `useDialog`
// ile aynı davranış; oradaki kopya bir alt sayfa için yazılmıştı ve bu çekmecenin
// ölçüleri farklı.
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

export function PledgeDrawer() {
  const a = useApp();
  const d = a.pledgeDetail;
  const close = () => a.openPledge(null);
  const ref = useDrawer(close);

  // Senkron kilit: aynı tick içindeki ikinci tıklama ikinci bir RPC çağırmasın
  // (Faz 3-A'da üretimde ölçülen kusur).
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await fn(); } finally { lock.current = false; setBusy(false); }
  };

  const [pending, setPending] = useState<PledgeStatus | null>(null);
  const [reason, setReason] = useState('');
  const [purpose, setPurpose] = useState('');
  const [askContact, setAskContact] = useState(false);
  const [copied, setCopied] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const loading = a.pledgeDetailLoading && !d;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(trPledges.copied); }
    catch { setCopied(trPledges.copyFailed); }
  };

  const allowed = d ? (PLEDGE_TRANSITIONS[d.status] ?? []) : [];

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', zIndex: 85,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        ref={ref} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={trPledges.detailTitle}
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
            <div className="tnum" style={{ fontSize: 12, fontWeight: 600, color: C.muted2 }}>
              {d?.code ?? ''}
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: C.navy }}>
              {d ? `${d.qty} ${d.unit} · ${d.needName}` : trPledges.detailTitle}
            </h2>
          </div>
          <button type="button" onClick={close} aria-label={trPledges.close} style={{
            flex: '0 0 44px', width: 44, height: 44, background: C.canvas,
            border: `1px solid ${C.border}`, borderRadius: 9, cursor: 'pointer', color: C.muted,
          }}>✕</button>
        </div>

        <div style={{ padding: '14px 20px 28px' }}>
          {loading ? (
            <p style={{ fontSize: 14, color: C.muted }}>{tr.common.loading}</p>
          ) : !d ? (
            <p style={{ fontSize: 14, color: C.muted }}>{trPledges.loadFailed}</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <PledgeStatusBadge s={d.status} />
                {d.overdueMinutes != null && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 700, color: C.errorText, background: '#FEF3F2',
                    border: '1px solid #F6C9C9', borderRadius: 20, padding: '4px 9px',
                  }}>
                    <Ico n="critical" size={12} color={C.errorText} />
                    {overdueLabel(d.overdueMinutes)}
                  </span>
                )}
              </div>

              <Section title={trPledges.sectionDelivery}>
                <Row label={trPledges.colOperation} value={d.disasterName} />
                <Row label={trPledges.colNeed} value={d.needName} />
                <Row label={trPledges.colQty} value={`${d.qty} ${d.unit}`} />
                <Row label={trPledges.colLocation} value={d.locationName || '—'} />
                <Row label={trPledges.colEta} value={etaText(d.estimatedAt)} />
                <Row label={trPledges.colUpdated} value={etaText(d.updatedAt)} />
                {/* İhtiyacın kendi sayıları: koordinatör "bu kaleme fazla mı geliyor"
                    sorusunu burada cevaplıyor. */}
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                  {trPledges.needStat(d.needRequired, d.needVerified, d.needRemaining, d.needUnit)}
                </p>
                {d.notes && (
                  <div style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 12.5, color: C.muted2, fontWeight: 600 }}>{trPledges.notesLabel}</span>
                    <p style={{ margin: '3px 0 0', fontSize: 13.5, color: C.heading2, whiteSpace: 'pre-wrap' }}>{d.notes}</p>
                  </div>
                )}
              </Section>

              <Section title={trPledges.sectionStatus}>
                {d.cancelReason && <Row label={trPledges.cancelReasonLabel} value={d.cancelReason} />}
                {d.cancelledAt && <Row label={trPledges.cancelledAtLabel} value={etaText(d.cancelledAt)} />}
                {allowed.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{trPledges.readOnly}</p>
                ) : pending ? (
                  <div style={{ background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 13 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>
                      {pending === 'cancelled' ? trPledges.cancelTitle : trPledges.actions[pending]}
                    </div>
                    {pending === 'cancelled' && (
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.muted }}>{trPledges.cancelLead}</p>
                    )}
                    <label style={{ display: 'block', marginTop: 10 }}>
                      <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trPledges.actionReason}</span>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
                      <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
                        {trPledges.actionReasonHint}
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button type="button" disabled={busy} onClick={() => run(async () => {
                        const ok = await a.changePledgeStatus(d.id, pending, reason);
                        if (ok) { setPending(null); setReason(''); }
                      })} style={{
                        background: busy ? C.muted3 : (pending === 'cancelled' ? C.emergency : C.navy),
                        border: 0, color: '#fff', borderRadius: 9, padding: '0 16px',
                        minHeight: 48, fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                      }}>{busy ? trPledges.saving : trPledges.apply}</button>
                      <button type="button" disabled={busy} onClick={() => { setPending(null); setReason(''); }} style={quiet}>
                        {trPledges.revealCancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {allowed.map((st) => (
                      <button key={st} type="button" onClick={() => { setPending(st); setReason(''); }}
                        style={st === 'cancelled' ? quiet : primary}>
                        {trPledges.actions[st] ?? st}
                      </button>
                    ))}
                  </div>
                )}
              </Section>

              <Section title={trPledges.sectionContact}>
                {!a.pledgeContact ? (
                  <>
                    <Row label={trPledges.colContact} value={d.contactMasked || '—'} />
                    <Row label="E-posta" value={d.emailMasked || '—'} />
                    <Row label="Telefon" value={d.phoneMasked || trPledges.noPhone} />
                    <Row label="Şehir" value={d.city || '—'} />
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted2 }}>
                      {trPledges.contactMaskedNote}
                    </p>
                    {askContact ? (
                      <div style={{ marginTop: 10, background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10, padding: 13 }}>
                        <label style={{ display: 'block' }}>
                          <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trPledges.revealPurpose}</span>
                          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} style={inputStyle} />
                          <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 4 }}>
                            {trPledges.revealPurposeHint}
                          </span>
                        </label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          <button type="button" disabled={busy || purpose.trim().length < 3}
                            onClick={() => run(async () => {
                              const ok = await a.revealPledgeContact(d.id, purpose.trim());
                              if (ok) { setAskContact(false); setPurpose(''); }
                            })}
                            style={{ ...primary, opacity: purpose.trim().length < 3 ? .5 : 1 }}>
                            {busy ? trPledges.saving : trPledges.revealConfirm}
                          </button>
                          <button type="button" onClick={() => { setAskContact(false); setPurpose(''); }} style={quiet}>
                            {trPledges.revealCancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAskContact(true)} style={{ ...primary, marginTop: 10 }}>
                        {trPledges.reveal}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ background: '#FFFDF4', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '11px 13px', marginBottom: 10 }}>
                      <p style={{ margin: 0, fontSize: 12.5, color: C.heading2, lineHeight: 1.5 }}>
                        {trPledges.revealUse}
                      </p>
                    </div>
                    <Row label={trPledges.colContact} value={a.pledgeContact.fullName} />
                    <Row label="E-posta" value={a.pledgeContact.email} />
                    <Row label="Telefon" value={a.pledgeContact.phone || trPledges.noPhone} />
                    <Row label="Şehir" value={a.pledgeContact.city || '—'} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {a.pledgeContact.phone && (
                        <button type="button" onClick={() => copy(a.pledgeContact!.phone)} style={quiet}>
                          {trPledges.copyPhone}
                        </button>
                      )}
                      <button type="button" onClick={() => copy(a.pledgeContact!.email)} style={quiet}>
                        {trPledges.copyEmail}
                      </button>
                      {/* Gizlemek, veriyi istemciden gerçekten düşürüyor. */}
                      <button type="button" onClick={() => { a.clearPledgeContact(); setCopied(''); }} style={quiet}>
                        {trPledges.hideContact}
                      </button>
                    </div>
                    {copied && <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, color: C.successText }}>{copied}</p>}
                  </>
                )}
              </Section>

              <Section title={trPledges.sectionLink}>
                {d.submissionId ? (
                  <>
                    <Row label={trPledges.colCode} value={trPledges.linked(d.submissionCode)} />
                    <Row label={trPledges.colQty}
                      value={trPledges.linkedQty(d.submissionQty ?? 0, d.unit, d.submissionVerified)} />
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                      {trPledges.linkNote}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13.5, color: C.heading2 }}>{trPledges.linkNone}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.muted }}>{trPledges.linkNoneHint}</p>
                    {!linkOpen ? (
                      <button type="button" onClick={() => { setLinkOpen(true); a.loadLinkCandidates(d.id); }}
                        style={{ ...primary, marginTop: 10 }}>{trPledges.linkOpen}</button>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{trPledges.linkTitle}</div>
                        <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                          {trPledges.linkLead}
                        </p>
                        {a.linkCandidates.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{trPledges.linkEmpty}</p>
                        ) : (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {a.linkCandidates.map((s) => (
                              <div key={s.id} style={{
                                border: `1px solid ${s.qtyMatches ? '#C9E9D6' : C.borderSoft}`,
                                background: s.qtyMatches ? '#F5FBF7' : C.surface,
                                borderRadius: 10, padding: 12,
                              }}>
                                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
                                  {s.code} · {s.qty} {s.unit}
                                </div>
                                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                                  {[s.locationName, s.status, s.contributorMasked].filter(Boolean).join(' · ')}
                                </div>
                                {s.qtyMatches && (
                                  <div style={{ fontSize: 12, color: C.successText, fontWeight: 600, marginTop: 4 }}>
                                    {trPledges.linkQtyMatch}
                                  </div>
                                )}
                                {/* Sistem otomatik bağlamıyor: koordinatör açıkça seçiyor. */}
                                <button type="button" disabled={busy}
                                  onClick={() => run(async () => {
                                    const ok = await a.linkPledge(d.id, s.id);
                                    if (ok) setLinkOpen(false);
                                  })}
                                  style={{ ...primary, marginTop: 10 }}>
                                  {busy ? trPledges.saving : trPledges.linkPick}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                          {trPledges.linkNote}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Section>
            </>
          )}
        </div>
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
