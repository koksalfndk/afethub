import { useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { VOLUNTEER_SKILLS, VOLUNTEER_AVAILABILITY } from '../data/repo';
import { DIAL_COUNTRIES, dialLabel } from '../data/dialCodes';
import { DEFAULT_DIAL, joinPhone } from '../util';
import type { VolunteerInput } from '../types';

// Public volunteer application. No account required — applying to help is one of the
// actions that must never sit behind a registration gate (CLAUDE.md §Primary Product
// Rule, rules/08 lists "Applying as a volunteer").
//
// Three steps rather than one long column: the form asks for a location, contact
// details, skills, availability, a note and a consent decision, and on a phone that was
// a single scroll with no sense of how much was left. Progressive disclosure is the
// stated preference for public emergency forms (rules/04 §Forms). Nothing is lost
// between steps — the state lives above them, so going back never clears an answer.
//
// What this screen is careful about:
//   * It never says an approved application is a duty assignment. "Onaylandı" here means
//     a coordinator agreed to call this person when a need comes up (rules/07 §Critical
//     Distinctions — do not imply completion).
//   * Consent is a real checkbox, not implied by submitting: the row keeps a phone
//     number and a district (rules/03 §Data Minimization).
//   * A signed-in visitor gets their own details pre-filled, and their e-mail is shown
//     as the account's address rather than as an editable field: the application is
//     attached to that account either way, so an editable copy would only be a second
//     address nobody verified.

const STEPS = 3;

export function Volunteer() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const loggedIn = auth.enabled && !!auth.user;

  const active = (a.snap?.disasters ?? []).filter((d) => d.status === 'Active');
  const [step, setStep] = useState(0);
  const [v, setV] = useState<VolunteerInput>({
    // Deliberately the general pool, not the loaded snapshot's operation. `a.snap`
    // defaults to whichever operation happens to be active, so preselecting it would
    // put someone who arrived from the footer into an operation they never chose — and
    // a volunteer routed to the wrong province is a real coordination cost.
    disasterId: null,
    fullName: auth.profile?.fullName ?? '',
    phone: '',
    email: auth.user?.email ?? '',
    province: auth.profile?.city ?? '',
    district: auth.profile?.district ?? '',
    skills: [],
    availability: '',
    note: '',
    consent: false,
  });
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof VolunteerInput>(k: K, val: VolunteerInput[K]) =>
    setV((d) => ({ ...d, [k]: val }));
  const toggleSkill = (s: string) =>
    setV((d) => ({ ...d, skills: d.skills.includes(s) ? d.skills.filter((x) => x !== s) : [...d.skills, s] }));

  const next = () => {
    if (step === 0) {
      if (!v.province) { setErr(tr.volunteerForm.errProvince); return; }
      setErr(''); setStep(1); return;
    }
    if (step === 1) {
      if (v.fullName.trim().length < 2) { setErr(tr.volunteerForm.errName); return; }
      if (!v.phone.trim() && !v.email.trim()) { setErr(tr.volunteerForm.errContact); return; }
      setErr(''); setStep(2); return;
    }
  };

  const submit = async () => {
    if (v.skills.length === 0) { setErr(tr.volunteerForm.errSkills); return; }
    if (!v.consent) { setErr(tr.volunteerForm.errConsent); return; }
    setErr(''); setBusy(true);
    const ok = await a.submitVolunteer({
      ...v,
      // Empty select value means the general pool; '' is not a valid id.
      disasterId: v.disasterId ? v.disasterId : null,
      phone: v.phone.trim() ? joinPhone(dial, v.phone) : '',
    });
    setBusy(false);
    if (ok) setDone(true);
    else setErr(tr.volunteerForm.errSubmit);
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;
  const primary = {
    background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
    height: 50, padding: '0 22px', fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  };
  const secondary = {
    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
    height: 50, padding: '0 18px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  };

  if (done) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, borderTop: `3px solid ${C.success}`, padding: mob ? 18 : 26, textAlign: 'center' }}>
          <span style={{
            width: 46, height: 46, borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', background: '#EAF7EE', border: '1px solid #BFE3CB', color: C.success,
          }}><Ico n="verified" size={22} /></span>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: '12px 0 0', color: C.navy }}>{tr.volunteerForm.doneTitle}</h1>
          <p style={{ fontSize: 14.5, color: C.text, margin: '8px auto 0', maxWidth: '52ch' }}>{tr.volunteerForm.doneBody}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => {
              setDone(false); setStep(0);
              setV((d) => ({ ...d, skills: [], note: '', consent: false }));
            }} style={secondary}>{tr.volunteerForm.doneAgain}</button>
            <button onClick={() => a.go('home')} style={{
              background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
              height: 50, padding: '0 18px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr.volunteerForm.doneHome}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={eyebrow}>{tr.nav.volunteer}</span>
        <h1 style={{ fontSize: mob ? 24 : 28, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
          {tr.volunteerForm.title}
        </h1>
        <p style={{ fontSize: 14.5, color: C.text, margin: '8px 0 0' }}>{tr.volunteerForm.lead}</p>
      </div>

      {/* Said before the form, not after: what approval does and does not mean. */}
      <div style={{
        background: G.chip, border: `1px solid ${C.borderFaint}`, borderLeft: `3px solid ${C.info}`,
        borderRadius: 10, padding: '11px 13px', fontSize: 13.5, color: C.text,
      }}>{tr.volunteerForm.honestNote}</div>

      <section style={{ ...card, padding: mob ? 15 : 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Where the visitor is, and how much is left. A bar with no words would be
            decoration (rules/04 §Quantity Display, same principle). */}
        <div>
          <div className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>
            {tr.volunteerForm.stepOf(step + 1, STEPS)} · {tr.volunteerForm.steps[step]}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= step ? C.emergency : C.borderFaint }} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <>
            <Field label={tr.volunteerForm.fDisaster} hint={tr.volunteerForm.disasterHint} full>
              <Picker
                value={v.disasterId ?? ''}
                onChange={(x) => set('disasterId', x || null)}
                ariaLabel={tr.volunteerForm.fDisaster}
                options={[{ value: '', label: tr.volunteerForm.fDisasterAny }, ...active.map((d) => ({ value: d.id, label: d.name }))]}
              />
            </Field>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', alignItems: 'start' }}>
              <Field label={tr.volunteerForm.fProvince}>
                <Picker value={v.province} ariaLabel={tr.volunteerForm.fProvince}
                  onChange={(x) => { set('province', x); set('district', ''); }}
                  placeholder={tr.orgs.pickProvince}
                  options={toOptions(PROVINCES)} />
              </Field>
              <Field label={tr.volunteerForm.fDistrict}>
                <Picker value={v.district} ariaLabel={tr.volunteerForm.fDistrict}
                  onChange={(x) => set('district', x)}
                  disabled={!v.province}
                  placeholder={v.province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}
                  options={toOptions(districtsOf(v.province))} />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={tr.volunteerForm.fName} full>
              <input name="volunteer-name" autoComplete="name" value={v.fullName} autoFocus
                onChange={(e) => set('fullName', e.target.value)} placeholder={tr.volunteerForm.fNamePh} style={inputStyle} />
            </Field>

            {/* Phone and e-mail sit on one row and stay on one row: the hint that used to
                live in the e-mail label wrapped to two lines and pushed its input a line
                below the phone field next to it. It is one sentence about both fields,
                so it belongs under both. */}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', alignItems: 'start' }}>
              {/* Country code is a separate picker so the number itself stays a plain
                  national number — a free-text +90 was the most common malformed value. */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelText}>{tr.volunteerForm.fPhone}</span>
                <span style={{ display: 'grid', gridTemplateColumns: '132px minmax(0,1fr)', gap: 8 }}>
                  <Picker
                    value={dial} onChange={setDial} ariaLabel={tr.volunteerForm.fPhoneCode}
                    options={DIAL_COUNTRIES.map((c) => ({ value: c.dial, label: dialLabel(c) }))}
                    // The trigger only has room for the code; the full country name is in
                    // the list, which is searchable by name.
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                    searchable
                  />
                  <input name="volunteer-phone" autoComplete="tel-national" inputMode="tel" value={v.phone}
                    onChange={(e) => set('phone', e.target.value)} placeholder="5xx xxx xx xx" style={inputStyle} />
                </span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelText}>{tr.volunteerForm.fEmail}</span>
                {loggedIn ? (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 8, background: C.canvas,
                    border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '0 12px', minHeight: 46,
                    fontSize: 14, color: C.navy, fontWeight: 500,
                  }}>
                    <Ico n="shield" size={14} color={C.muted2} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.email}</span>
                  </span>
                ) : (
                  <input name="volunteer-email" autoComplete="email" type="email" value={v.email}
                    onChange={(e) => set('email', e.target.value)} style={inputStyle} />
                )}
              </label>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted3, marginTop: -4 }}>
              {loggedIn ? tr.volunteerForm.emailLocked : tr.volunteerForm.contactHint}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span style={labelText}>{tr.volunteerForm.fSkills}</span>
              <div style={{ fontSize: 12.5, color: C.muted3, marginTop: 2 }}>{tr.volunteerForm.skillsHint}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                {VOLUNTEER_SKILLS.map((s) => {
                  const on = v.skills.includes(s);
                  return (
                    <button key={s} onClick={() => toggleSkill(s)} aria-pressed={on} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: on ? C.navy : C.surface, color: on ? '#fff' : C.heading2,
                      border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
                      minHeight: 40, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                      {/* The tick's space is reserved whether or not it is shown. Adding
                          the icon on selection changed the chip's width, which reflowed
                          the whole row and moved every other chip out from under the
                          pointer. */}
                      <span style={{ display: 'inline-flex', width: 13, flex: '0 0 13px', justifyContent: 'center' }}>
                        {on && <Ico n="completed" size={13} color="#fff" />}
                      </span>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label={tr.volunteerForm.fAvailability} full>
              <Picker value={v.availability} onChange={(x) => set('availability', x)}
                ariaLabel={tr.volunteerForm.fAvailability}
                options={toOptions(VOLUNTEER_AVAILABILITY)} />
            </Field>

            <Field label={tr.volunteerForm.fNote} full>
              <textarea value={v.note} onChange={(e) => set('note', e.target.value)} rows={3}
                placeholder={tr.volunteerForm.fNotePh} maxLength={1200}
                style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }} />
            </Field>

            <label style={{
              display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 10, alignItems: 'start',
              background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '12px 13px', cursor: 'pointer',
            }}>
              <input type="checkbox" checked={v.consent} onChange={(e) => set('consent', e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: C.navy }} />
              <span>
                <span style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{tr.volunteerForm.consent}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.muted3, marginTop: 3 }}>{tr.volunteerForm.consentHint}</span>
              </span>
            </label>
          </>
        )}

        {err && (
          <div role="alert" style={{
            background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9,
            padding: '10px 12px', fontSize: 13.5, color: C.errorText, fontWeight: 600,
          }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {step > 0 && (
            <button onClick={() => { setErr(''); setStep((x) => x - 1); }} className="hv-navy" style={secondary}>
              {tr.volunteerForm.back}
            </button>
          )}
          {step < STEPS - 1 ? (
            <button onClick={next} className="hv-emergency" style={{ ...primary, flex: mob ? '1 1 160px' : undefined }}>
              {tr.volunteerForm.next}
            </button>
          ) : (
            <button onClick={submit} disabled={busy} className="hv-emergency"
              style={{ ...primary, flex: mob ? '1 1 160px' : undefined, opacity: busy ? .7 : 1 }}>
              {busy ? tr.volunteerForm.submitting : tr.volunteerForm.submit}
            </button>
          )}
        </div>
      </section>

      <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>{tr.volunteerForm.emergencyNote}</p>
    </div>
  );
}
