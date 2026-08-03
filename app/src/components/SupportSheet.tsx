import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';
import { enrich } from '../select';
import { PLEDGE_NOTE_MAX } from '../data';
import type { DeliveryPledgeInput } from '../types';

// ---------------------------------------------------------------------------
// Faz 3-B — "Destek Ol": iki niyeti ayıran seçim + teslim sözü formu.
//
// Neden ayrılıyor: tek bir "Bunu teslim ettim" düğmesi, yola çıkmayı PLANLAYAN
// kişiyi ya yalan söylemeye ya vazgeçmeye zorluyordu. İki kayıt tipi farklı şeyler:
//
//   Teslim sözü  → niyet.  HİÇBİR miktarı değiştirmez.
//   Teslimat     → iddia.  Bekleyen miktara girer, koordinatör doğrulayana kadar
//                          kalan miktar DEĞİŞMEZ.
//
// Bu dosya yalnızca teslim sözünü yazar (`create_delivery_pledge` RPC'si).
// "Teslim Ettim" seçeneği mevcut bildirim akışını açar — yeni bir paralel yol
// kurulmuyor (rules/06 §Avoid creating duplicate systems).
// ---------------------------------------------------------------------------

const OVERLAY = {
  position: 'fixed' as const, inset: 0, background: 'rgba(11,30,48,.45)', zIndex: 80,
  display: 'flex', justifyContent: 'center', overflowY: 'auto' as const,
};
const LABEL = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.heading2, marginBottom: 5 };
const FIELD = {
  width: '100%', border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '11px 12px',
  fontSize: 15, color: C.navy, background: C.surface, minHeight: 48, font: 'inherit' as const,
};
const BTN_PRIMARY = {
  background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
  padding: '14px 18px', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 48,
};
const BTN_QUIET = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  padding: '14px 18px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', minHeight: 48,
};

// Çift gönderim kilidi — Faz 3-A'da ölçülen kusurun aynısı burada da olmasın diye
// `useRef`: React state'i asenkron, aynı tick'teki ikinci tıklamayı durduramıyor.
function useSubmitLock() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await fn(); } finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}

// Odak tuzağı + Escape + odağın tetikleyiciye dönmesi + arka plan kaydırma kilidi.
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
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
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);
  return ref;
}

function Shell({ title, onClose, children, mob }: {
  title: string; onClose: () => void; children: React.ReactNode; mob: boolean;
}) {
  const ref = useDialog(onClose);
  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        ref={ref} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
        style={{
          background: C.surface, width: '100%', maxWidth: mob ? '100%' : 640,
          // Telefonda alt sayfa (bottom sheet), masaüstünde ortada pencere.
          margin: mob ? 'auto 0 0' : '40px auto',
          borderRadius: mob ? '16px 16px 0 0' : 14,
          boxShadow: '0 18px 48px rgba(11,30,48,.28)',
          maxHeight: mob ? '92vh' : 'none', overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '18px 20px 0',
        }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.navy }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr.support.close} style={{
            background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9,
            width: 44, height: 44, fontSize: 16, color: C.muted, cursor: 'pointer', flex: '0 0 44px',
          }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px 22px' }}>{children}</div>
      </div>
    </div>
  );
}

function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  const warn = tone === 'warn';
  return (
    <p style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 14px',
      background: warn ? '#FFFDF4' : C.canvas,
      border: `1px solid ${warn ? '#F2DFA8' : C.borderFaint}`,
      borderLeft: `3px solid ${warn ? C.warning : C.info}`,
      borderRadius: 10, padding: '11px 13px', fontSize: 13, color: C.heading2, lineHeight: 1.5,
    }}>
      <span style={{ paddingTop: 1 }}><Ico n={warn ? 'critical' : 'shield'} size={14} color={warn ? C.warningText : C.info} /></span>
      {text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Adım 1 — niyet seçimi
// ---------------------------------------------------------------------------
function Choice({ onPledge, onReport }: { onPledge: () => void; onReport: () => void }) {
  const card = (title: string, desc: string, note: string, onClick: () => void, accent: string) => (
    <button type="button" onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: C.surface, border: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: '16px 18px', minHeight: 48,
    }}>
      <span style={{ display: 'block', fontSize: 17, fontWeight: 700, color: C.navy }}>{title}</span>
      <span style={{ display: 'block', fontSize: 14, color: C.text, marginTop: 4 }}>{desc}</span>
      {/* Miktara ne olduğu her iki seçenekte de YAZILI — rengin taşıyamayacağı bilgi. */}
      <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 8 }}>{note}</span>
    </button>
  );
  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: C.muted }}>{tr.support.chooseLead}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {card(tr.support.willDeliver, tr.support.willDeliverDesc, tr.support.willDeliverNote, onPledge, C.info)}
        {card(tr.support.didDeliver, tr.support.didDeliverDesc, tr.support.didDeliverNote, onReport, C.success)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Adım 2 — teslim sözü formu
// ---------------------------------------------------------------------------
const NAME_MAX = 120, CITY_MAX = 100, PHONE_MAX = 30;

function PledgeForm({ needId, onDone }: { needId: string; onDone: (code: string, email: string) => void }) {
  const a = useApp();
  const auth = useAuth();
  const uid = useId();
  const { busy, run } = useSubmitLock();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const need = useMemo(() => {
    const n = a.snap?.needs.find((x) => x.id === needId);
    return n ? enrich(n) : null;
  }, [a.snap?.needs, needId]);
  const locations = a.snap?.locations ?? [];

  const [qty, setQty] = useState('');
  const [locId, setLocId] = useState<string>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  // Giriş yapan kişinin bilgileri ÖNCEDEN dolu ama düzenlenebilir; hesap zorunlu değil.
  const [name, setName] = useState(auth.profile?.fullName ?? '');
  const [email, setEmail] = useState(auth.user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [okTruth, setOkTruth] = useState(false);
  const [okContact, setOkContact] = useState(false);

  if (!need) return <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{tr.support.errClosed}</p>;

  const qtyNum = Number(qty.replace(',', '.'));
  const over = qtyNum > 0 && need.remaining > 0 && qtyNum > need.remaining;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!(qtyNum > 0)) e.qty = tr.support.errQty;
    if (name.trim().length < 2) e.name = tr.support.errName;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) e.email = tr.support.errEmail;
    if (city.trim().length < 2) e.city = tr.support.errCity;
    if (date && new Date(`${date}T${time || '23:59'}`).getTime() < Date.now() - 3600_000) e.date = tr.support.errPast;
    if (!okTruth || !okContact) e.consent = tr.support.errConsent;
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length > 0) {
      setSummary(tr.support.errSummary);
      summaryRef.current?.focus();
      return;
    }
    setSummary('');
    await run(async () => {
      const input: DeliveryPledgeInput = {
        needId, qty: qtyNum, unit: need.unit, locationId: locId || null,
        estimatedDeliveryAt: date ? new Date(`${date}T${time || '12:00'}`).toISOString() : '',
        name: name.trim(), email: email.trim(), phone: phone.trim(), city: city.trim(),
        notes: notes.trim(),
      };
      const code = await a.createDeliveryPledge(input);
      // Hata durumunda form KAPANMAZ ve alanlar durur (rules/04 §Forms).
      if (code) onDone(code, input.email);
      else setSummary(a.formError || tr.support.errGeneric);
    });
  };

  const field = (key: string, label: string, node: React.ReactNode, help?: string) => (
    <div>
      <label style={LABEL} htmlFor={`${uid}-${key}`}>{label}</label>
      {node}
      {help ? <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted2 }}>{help}</p> : null}
      {errs[key] ? (
        <p id={`${uid}-${key}-e`} role="alert" style={{ margin: '5px 0 0', fontSize: 12.5, color: C.errorText }}>{errs[key]}</p>
      ) : null}
    </div>
  );

  return (
    <>
      <Notice text={tr.support.notice} />
      {summary ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" style={{
          margin: '0 0 14px', background: '#FEF3F2', border: '1px solid #F6C9C9',
          borderRadius: 10, padding: '11px 13px', fontSize: 13.5, color: C.errorText,
        }}>{summary}</div>
      ) : null}

      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={busy}>
        <legend style={{ ...LABEL, fontSize: 13, marginBottom: 10 }}>{tr.support.planTitle}</legend>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <span style={LABEL}>{tr.support.need}</span>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.navy }}>
              {need.name}
              <span className="tnum" style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: need.barColor }}>
                {tr.disaster.remainingWithUnit(need.remaining, need.unit)}
              </span>
            </p>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))' }}>
            {field('qty', `${tr.support.qty} (${need.unit})`, (
              <input id={`${uid}-qty`} value={qty} onChange={(e) => setQty(e.target.value)}
                inputMode="decimal" type="text" autoComplete="off"
                aria-invalid={errs.qty ? true : undefined}
                aria-describedby={errs.qty ? `${uid}-qty-e` : undefined}
                style={FIELD} />
            ))}
            {field('loc', tr.support.location, (
              <select id={`${uid}-loc`} value={locId} onChange={(e) => setLocId(e.target.value)} style={FIELD}>
                <option value="">{tr.support.locationAny}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            ))}
          </div>
          {over ? <Notice tone="warn" text={tr.support.overRemaining(need.remaining, need.unit)} /> : null}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))' }}>
            {field('date', tr.support.date, (
              <input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} style={FIELD} />
            ))}
            {field('time', tr.support.time, (
              <input id={`${uid}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} style={FIELD} />
            ))}
          </div>
          {field('notes', tr.support.notes, (
            <textarea id={`${uid}-notes`} value={notes} rows={2} maxLength={PLEDGE_NOTE_MAX}
              onChange={(e) => setNotes(e.target.value)} style={{ ...FIELD, resize: 'vertical' }} />
          ))}
        </div>

        <legend style={{ ...LABEL, fontSize: 13, margin: '18px 0 10px' }}>{tr.support.contactTitle}</legend>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.muted2 }}>{tr.support.whyContact}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))' }}>
          {field('name', tr.support.name, (
            <input id={`${uid}-name`} value={name} maxLength={NAME_MAX} autoComplete="name"
              onChange={(e) => setName(e.target.value)} aria-invalid={errs.name ? true : undefined} style={FIELD} />
          ))}
          {field('email', tr.support.email, (
            <input id={`${uid}-email`} value={email} type="email" maxLength={254} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} aria-invalid={errs.email ? true : undefined} style={FIELD} />
          ))}
          {field('phone', tr.support.phone, (
            <input id={`${uid}-phone`} value={phone} type="tel" maxLength={PHONE_MAX} autoComplete="tel"
              onChange={(e) => setPhone(e.target.value)} style={FIELD} />
          ))}
          {field('city', tr.support.city, (
            <input id={`${uid}-city`} value={city} maxLength={CITY_MAX} autoComplete="address-level2"
              onChange={(e) => setCity(e.target.value)} aria-invalid={errs.city ? true : undefined} style={FIELD} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {[[okTruth, setOkTruth, tr.support.confirmTruth, 'truth'] as const,
            [okContact, setOkContact, tr.support.confirmContact, 'contact'] as const].map(([val, set, text, key]) => (
            <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: C.heading2, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, flex: '0 0 20px' }} />
              <span>{text}</span>
            </label>
          ))}
          {errs.consent ? <p role="alert" style={{ margin: 0, fontSize: 12.5, color: C.errorText }}>{errs.consent}</p> : null}
        </div>

        {a.backend === 'local' ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: C.warningText }}>{tr.support.demoNote}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={submit} style={{ ...BTN_PRIMARY, flex: '1 1 200px' }}>
            {busy ? tr.support.submitting : tr.support.submit}
          </button>
          <button type="button" onClick={a.closeSupport} style={BTN_QUIET}>{tr.support.cancel}</button>
        </div>
      </fieldset>
    </>
  );
}

// ---------------------------------------------------------------------------
// Adım 3 — başarı
// ---------------------------------------------------------------------------
function Done({ code, email, needName }: { code: string; email: string; needName: string }) {
  const a = useApp();
  const [copied, setCopied] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(tr.support.copied); }
    catch { setCopied(tr.support.copyFailed); }
  };
  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: C.text, lineHeight: 1.55 }}>{tr.support.doneLead}</p>
      <div style={{ background: G.heroCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted2 }}>
          {tr.support.trackingCode}
        </div>
        {/* Kod SEÇİLEBİLİR: pano API'si engellenmiş bir tarayıcıda elle kopyalanabilsin. */}
        <div className="tnum" style={{ fontSize: 26, fontWeight: 700, color: C.navy, letterSpacing: '.06em', userSelect: 'all', marginTop: 4 }}>
          {code}
        </div>
        <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 8 }}>{needName}</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
          background: '#EFF6FB', border: '1px solid #CBE0F0', borderRadius: 20,
          padding: '4px 11px', fontSize: 12.5, fontWeight: 700, color: C.info,
        }}>
          <Ico n="pending" size={13} color={C.info} />{tr.support.statusLabel.pledged}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" onClick={copy} style={BTN_QUIET}>{tr.support.copyCode}</button>
          {/* Takip formu koddan ve e-postadan ÖNCEDEN dolduruluyor; kişi az önce
              yazdığı iki bilgiyi ekran değişince yeniden yazmak zorunda kalmasın
              (rules/01 §Registration Must Be Optional). Sorgu yine kullanıcı
              başlatıyor. */}
          <button type="button" onClick={() => { a.setTrack('code', code); a.setTrack('email', email); a.closeSupport(); a.go('track'); }} style={BTN_QUIET}>
            {tr.support.viewPlan}
          </button>
        </div>
        {copied ? <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, color: C.successText }}>{copied}</p> : null}
      </div>
      {/* Yerel önizlemede kod SUNUCUDA YOK. Bu satır başarı ekranında da yazılıyor:
          form ekranındaki uyarıyı görmeden buraya gelen biri (ör. doğrudan bağlantı)
          elindeki kodu gerçek bir kayıt sanmamalı (CLAUDE.md §No Fabricated Completion). */}
      {a.backend === 'local' ? (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: C.warningText }}>{tr.support.demoNote}</p>
      ) : null}
      <p style={{ margin: '14px 0 0', fontSize: 12.5, color: C.muted2 }}>{tr.support.accountOffer}</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={a.closeSupport} style={BTN_PRIMARY}>{tr.support.supportAnother}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function SupportSheet() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [step, setStep] = useState<'choose' | 'pledge' | 'done'>('choose');
  const [code, setCode] = useState('');
  const [doneEmail, setDoneEmail] = useState('');
  const needId = a.supportNeedId;
  const need = a.snap?.needs.find((n) => n.id === needId);

  // Yeni bir kalem için açıldığında baştan başla.
  useEffect(() => { setStep('choose'); setCode(''); setDoneEmail(''); }, [needId]);

  if (!needId || !need) return null;

  const title = step === 'done' ? tr.support.doneTitle
    : step === 'pledge' ? tr.support.formTitle
      : tr.support.chooseTitle;

  return (
    <Shell title={title} onClose={a.closeSupport} mob={mob}>
      {step === 'choose' && (
        <Choice
          onPledge={() => setStep('pledge')}
          onReport={() => {
            // MEVCUT akış: yeni bir paralel form kurulmuyor. Teslim sözü de
            // oluşturulmuyor — kişi zaten teslim etmiş.
            a.closeSupport();
            a.prefillReport(need.id, need.unit, need.loc);
          }}
        />
      )}
      {step === 'pledge' && <PledgeForm needId={needId} onDone={(c, e) => { setCode(c); setDoneEmail(e); setStep('done'); }} />}
      {step === 'done' && <Done code={code} email={doneEmail} needName={need.name} />}
    </Shell>
  );
}
