import { useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { cols } from '../select';
import { Field, Ico, inputStyle, eyebrow, type IcoName } from '../ui';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { formatDate } from '../util';
import type { DisasterReport, DisasterReportInput, DisasterType } from '../types';

const TYPES: { key: DisasterType; icon: IcoName }[] = [
  { key: 'Wildfire', icon: 'critical' }, { key: 'Earthquake', icon: 'activity' },
  { key: 'Flood', icon: 'activity' }, { key: 'Storm', icon: 'activity' },
  { key: 'Evacuation', icon: 'people' }, { key: 'Other', icon: 'need' },
];
const today = () => new Date().toISOString().slice(0, 10);
const STEPS = 3;

const btn = (primary: boolean) => (primary
  ? { background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
      padding: '0 20px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
  : { background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
      padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const });

// The form itself, shell-agnostic: the same steps render inside the modal and on the
// standalone /afet-bildir page, so a shared link and a CTA lead to identical flows.
export function ReportDisasterForm({ onClose }: { onClose?: () => void }) {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;
  const mob = a.device === 'mobile';
  const L = cols(mob);

  const [step, setStep] = useState(0);
  const [type, setType] = useState<DisasterType | ''>('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [similar, setSimilar] = useState<DisasterReport[] | null>(null);
  const [done, setDone] = useState<{ report: DisasterReport; merged: boolean } | null>(null);

  const byName = loggedIn ? (auth.profile?.fullName || 'Gönüllü') : name;
  const byEmail = loggedIn ? (auth.user?.email || '') : email;
  const input = (): DisasterReportInput => ({
    type: type as DisasterType, province, district, locationNote, occurredOn, description,
    name: byName, email: byEmail, phone,
  });

  const next = async () => {
    if (step === 0) {
      if (!type) return setErr(tr.reportDisaster.errType);
      setErr(''); return setStep(1);
    }
    if (step === 1) {
      if (!province) return setErr(tr.reportDisaster.errProvince);
      setErr(''); return setStep(2);
    }
    if (description.trim().length < 5) return setErr(tr.reportDisaster.errDescription);
    if (!byName.trim() || !byEmail.trim()) return setErr(tr.reportDisaster.errContact);
    setErr('');
    // Suggest before writing so the reporter can confirm an existing report; the merge
    // rule is applied again on write, so skipping this step cannot create a duplicate.
    const found = await a.findSimilarReports(input());
    if (found.length > 0) return setSimilar(found);
    const res = await a.submitDisasterReport(input());
    if (res) setDone(res);
  };

  const reset = () => {
    setStep(0); setType(''); setProvince(''); setDistrict(''); setLocationNote('');
    setOccurredOn(today()); setDescription(''); setSimilar(null); setDone(null); setErr('');
  };

  if (done) {
    const r = done.report;
    return (
      <div className="anim-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.successText }}>{tr.reportDisaster.doneTitle}</div>
          <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 5 }}>{tr.reportDisaster.doneBody}</div>
          <div style={{ marginTop: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 13 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
              {disasterTypeLabel[r.type]} · {[r.province, r.district].filter(Boolean).join(' / ')}
            </div>
            <div className="tnum" style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{tr.reportDisaster.observedOn(formatDate(r.occurredOn))}</div>
            <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: C.warningText, marginTop: 7 }}>
              {tr.reportDisaster.reportedBy(r.reportCount)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button onClick={reset} className="hv-navy" style={btn(false)}>{tr.reportDisaster.another}</button>
          <button onClick={() => (onClose ? onClose() : a.go('home'))} style={btn(true)}>
            {onClose ? tr.orgs.cancel : tr.reportDisaster.backHome}
          </button>
        </div>
      </div>
    );
  }

  if (similar) {
    return (
      <div className="anim-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.reportDisaster.similarTitle}</div>
          <p style={{ fontSize: 13.5, color: C.heading2, margin: '5px 0 0' }}>{tr.reportDisaster.similarBody}</p>
        </div>
        {similar.map((r) => (
          <div key={r.id} style={{ background: G.criticalPanel, border: '1px solid #F1DEDE', borderRadius: 11, padding: 13, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
                {disasterTypeLabel[r.type]} · {[r.province, r.district].filter(Boolean).join(' / ')}
              </span>
              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.warningText, whiteSpace: 'nowrap' }}>
                {tr.reportDisaster.reportedBy(r.reportCount)}
              </span>
            </div>
            {r.description && <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{r.description}</p>}
            <div className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
              {tr.reportDisaster.observedOn(formatDate(r.occurredOn))} · {tr.reportDisaster.lastReport(r.lastReportLabel)}
            </div>
            {/* The reporter has already given their name, e-mail and location in this
                form, so confirming an existing report reuses them instead of asking
                again (rules/01 §Registration Must Be Optional). */}
            <button onClick={() => void a.confirmDisasterReport(r.id, {
              name: byName, email: byEmail, province, district,
            }).then((res) => res && setDone({ report: res.report, merged: true }))}
              style={{ ...btn(true), alignSelf: 'flex-start' }}>{tr.reportDisaster.similarConfirm}</button>
          </div>
        ))}
        <button onClick={() => void a.submitDisasterReport(input()).then((res) => { if (res) setDone(res); setSimilar(null); })}
          className="hv-navy" style={{ ...btn(false), alignSelf: 'flex-start' }}>{tr.reportDisaster.similarNew}</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="tnum" style={{ fontSize: 12, color: C.muted2 }}>
          {tr.orgs.stepOf(step + 1, STEPS)} · {tr.reportDisaster.stepNames[step]}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= step ? C.emergency : C.borderFaint }} />
          ))}
        </div>
      </div>

      <div style={{
        background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderLeft: `3px solid ${C.emergency}`,
        borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: C.errorText, fontWeight: 600,
      }}>{tr.reportDisaster.notAuthority}</div>

      {step === 0 && (
        <>
          <div style={eyebrow}>{tr.reportDisaster.chooseType}</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))' }}>
            {TYPES.map((t) => {
              const on = type === t.key;
              return (
                <button key={t.key} onClick={() => { setType(t.key); setErr(''); }} aria-pressed={on} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '13px', borderRadius: 11,
                  border: `1px solid ${on ? C.navy : C.borderSoft}`, background: on ? G.navyBtn : C.surface,
                  color: on ? '#fff' : C.navy, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 54, textAlign: 'left',
                }}>
                  <Ico n={t.icon} size={18} color={on ? '#fff' : C.emergency} />{disasterTypeLabel[t.key]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 1 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
          <Field label={tr.reportDisaster.fProvince}>
            <select name="report-province" autoComplete="off" value={province} onChange={(e) => { setProvince(e.target.value); setDistrict(''); }} autoFocus style={inputStyle}>
              <option value="">{tr.orgs.pickProvince}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={tr.reportDisaster.fDistrict}>
            <select name="report-district" autoComplete="off" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!province} style={{ ...inputStyle, opacity: province ? 1 : .6 }}>
              <option value="">{province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}</option>
              {districtsOf(province).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label={tr.reportDisaster.fLocation} full>
            <input name="report-location" autoComplete="off" value={locationNote} onChange={(e) => setLocationNote(e.target.value)} placeholder={tr.reportDisaster.fLocationPh} style={inputStyle} />
          </Field>
          <Field label={tr.reportDisaster.fDate}>
            <input type="date" name="report-date" autoComplete="off" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} max={today()} style={inputStyle} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <>
          <Field label={tr.reportDisaster.fDescription} full>
            <textarea name="report-description" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} autoFocus placeholder={tr.reportDisaster.fDescriptionPh} style={{ ...inputStyle, minHeight: 88 }} />
          </Field>
          {loggedIn ? (
            <div style={{ background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '11px 13px', fontSize: 12.5, color: C.heading2 }}>
              {tr.orgs.submitterKnown(auth.profile?.fullName || auth.user?.email || '')}
            </div>
          ) : (
            <>
              <div style={eyebrow}>{tr.reportDisaster.contactSection}</div>
              <div style={{ fontSize: 12.5, color: C.muted2, marginTop: -8 }}>{tr.reportDisaster.contactHint}</div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
                <Field label={tr.reportDisaster.fName} full><input name="reporter-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
                <Field label={tr.reportDisaster.fEmail}><input type="email" name="reporter-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
                <Field label={tr.reportDisaster.fPhone}><input name="reporter-phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
              </div>
            </>
          )}
        </>
      )}

      {err && (
        <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, color: C.errorText, borderRadius: 9, padding: '10px 12px', fontSize: 13.5 }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        {step > 0 && <button onClick={() => { setErr(''); setStep((v) => v - 1); }} className="hv-navy" style={btn(false)}>{tr.orgs.back}</button>}
        <button onClick={() => void next()} className="hv-emergency" style={{ ...btn(true), flex: '1 1 160px' }}>
          {step === STEPS - 1 ? tr.reportDisaster.submit : tr.orgs.next}
        </button>
      </div>
    </div>
  );
}

// Standalone page (shared link / direct URL): the same steps, centred.
export function ReportDisaster() {
  const a = useApp();
  const L = cols(a.device === 'mobile');
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0, color: C.navy }}>{tr.reportDisaster.title}</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '8px auto 0', maxWidth: '54ch' }}>{tr.reportDisaster.intro}</p>
        </div>
        <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.emergency}`, borderRadius: 14, padding: 18 }}>
          <ReportDisasterForm />
        </section>
      </div>
    </div>
  );
}
