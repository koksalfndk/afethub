import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { VOLUNTEER_SKILLS, VOLUNTEER_AVAILABILITY } from '../data/repo';
import { DIAL_COUNTRIES, dialLabel } from '../data/dialCodes';
import { DEFAULT_DIAL, joinPhone, splitPhone } from '../util';
import type { VolunteerApplication, VolunteerInput, VolunteerStatus } from '../types';

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
// A signed-in visitor also sees their own applications above the form and can edit or
// withdraw them. Guests cannot: without an account there is nothing to match rows on
// except a typed address, and "show me the applications filed with this address" is an
// information-disclosure endpoint (see migration 0018).
//
// What this screen is careful about:
//   * It never says an approved application is a duty assignment. "Onaylandı" here means
//     a coordinator agreed to call this person when a need comes up (rules/07 §Critical
//     Distinctions — do not imply completion).
//   * Consent is a real checkbox, not implied by submitting: the row keeps a phone
//     number and a district (rules/03 §Data Minimization).
//   * An approved application cannot be edited at all: changing the terms of something
//     a coordinator already accepted would undo their decision without telling them.
//     Withdrawing stays available, and the database refuses the edit either way
//     (migration 0019, rules/02 §Status Transitions).

const STEPS = 3;

const STATUS_TONE: Record<string, { fg: string; bg: string; bd: string }> = {
  'Pending review': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Approved: { fg: C.successText, bg: '#EAF7EE', bd: '#BFE3CB' },
  'On hold': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Rejected: { fg: C.emergency, bg: C.errorSurface, bd: C.errorBorder },
  Withdrawn: { fg: C.muted, bg: C.canvas, bd: C.borderSoft },
};

export function Volunteer() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const loggedIn = auth.enabled && !!auth.user;

  const active = (a.snap?.disasters ?? []).filter((d) => d.status === 'Active');
  // The account's phone is already stored as one string ("+90 5xx …"); the form keeps
  // the code and the national number apart, so it is split on the way in and joined on
  // the way out. Nobody should retype a number the platform already holds
  // (rules/01 §Registration Must Be Optional).
  const savedPhone = splitPhone(auth.profile?.phone ?? '');

  const blank = (): VolunteerInput => ({
    // Deliberately the general pool, not the loaded snapshot's operation. `a.snap`
    // defaults to whichever operation happens to be active, so preselecting it would
    // put someone who arrived from the footer into an operation they never chose — and
    // a volunteer routed to the wrong province is a real coordination cost.
    disasterId: null,
    fullName: auth.profile?.fullName ?? '',
    phone: savedPhone.rest,
    email: auth.user?.email ?? '',
    province: auth.profile?.city ?? '',
    district: auth.profile?.district ?? '',
    skills: [],
    availability: '',
    note: '',
    consent: false,
    standingConsent: false,
  });

  const [step, setStep] = useState(0);
  const [v, setV] = useState<VolunteerInput>(blank);
  const [dial, setDial] = useState(savedPhone.dial || DEFAULT_DIAL);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  // The list and the form are alternatives, not a stack: with applications on file the
  // visitor came back to check on something, so that is what they land on.
  const [view, setView] = useState<'list' | 'form'>('form');
  // '' while nothing is moving; otherwise the class the arriving card animates with.
  const [anim, setAnim] = useState<'' | 'fwd' | 'back'>('');
  const [leaving, setLeaving] = useState(false);
  // Set once the first load has answered "does this account have applications". Without
  // it the empty first render would decide, and the list would never get a chance.
  const settled = useRef(false);

  const mine = a.myVolunteer;
  const openCount = mine.filter((x) => x.status === 'Pending review' || x.status === 'On hold' || x.status === 'Approved').length;
  // The permission is person-level; every row carries the same value, so any row answers.
  const standingOn = mine.some((x) => x.standingConsent);

  useEffect(() => { if (auth.ready) a.reloadMyVolunteer(); }, [loggedIn, auth.ready]);

  // Which card this page opens on is decided ONCE, and only after two questions have
  // actually been answered: is there a session, and does it have applications.
  //
  // The bug this fixes: the first render happens before the session resolves, so
  // `loggedIn` was false, the effect settled on the form and never looked again — which
  // is what sent someone arriving from the receipt e-mail into a blank application form
  // instead of their own list. Waiting for `auth.ready` AND for the first fetch to
  // finish (loaded, not merely "not loading") is what makes the answer meaningful.
  useEffect(() => {
    if (!auth.ready || settled.current) return;
    if (!loggedIn) { setView('form'); settled.current = true; return; }
    if (!a.myVolunteerLoaded) return;
    settled.current = true;
    setView(mine.length > 0 ? 'list' : 'form');
  }, [auth.ready, loggedIn, a.myVolunteerLoaded, mine.length]);

  // One card leaves before the other arrives, so the two never overlap. 160ms matches
  // the outgoing keyframe in index.css; reduced-motion collapses both to nothing.
  const swapTo = (next: 'list' | 'form', dir: 'fwd' | 'back', prepare?: () => void) => {
    prepare?.();
    setLeaving(true);
    toTop();
    window.setTimeout(() => {
      setView(next);
      setAnim(dir);
      setLeaving(false);
    }, 160);
  };
  // The card that replaces the current one starts at the top of the page. Without this
  // the visitor stayed at their old scroll offset and landed in the footer of a much
  // shorter card (rules/04 §Forms — a clear success state has to be visible).
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const cardClass = (which: 'list' | 'form') => {
    if (leaving && view === which) return anim === 'back' ? 'card-out-right' : 'card-out-left';
    if (view === which && anim) return anim === 'fwd' ? 'card-in-right' : 'card-in-left';
    return undefined;
  };

  const set = <K extends keyof VolunteerInput>(k: K, val: VolunteerInput[K]) =>
    setV((d) => ({ ...d, [k]: val }));
  const toggleSkill = (s: string) =>
    setV((d) => ({ ...d, skills: d.skills.includes(s) ? d.skills.filter((x) => x !== s) : [...d.skills, s] }));

  const startEdit = (app: VolunteerApplication) => {
    const p = splitPhone(app.phone);
    setEditV(app, p);
  };
  const setEditV = (app: VolunteerApplication, p: { dial: string; rest: string }) => {
    setV({
      disasterId: app.disasterId, fullName: app.fullName, phone: p.rest, email: app.email,
      province: app.province, district: app.district, skills: app.skills.slice(),
      availability: app.availability, note: app.note,
      // Consent was given when the application was filed; editing does not withdraw it.
      consent: true,
      standingConsent: app.standingConsent,
    });
    setDial(p.dial || DEFAULT_DIAL);
    setEditingId(app.id); setStep(0); setErr(''); setDone(false);
    swapTo('form', 'fwd');
  };
  const startNew = () => {
    swapTo('form', 'fwd', () => {
      setV(blank()); setDial(savedPhone.dial || DEFAULT_DIAL);
      setEditingId(null); setStep(0); setErr(''); setDone(false);
    });
  };
  const backToList = () => {
    swapTo('list', 'back', () => { setEditingId(null); setErr(''); });
  };

  const next = () => {
    if (step === 0) {
      if (!v.province) { setErr(tr.volunteerForm.errProvince); return; }
      setErr(''); setStep(1); toTop(); return;
    }
    if (step === 1) {
      if (v.fullName.trim().length < 2) { setErr(tr.volunteerForm.errName); return; }
      if (!v.phone.trim() && !v.email.trim()) { setErr(tr.volunteerForm.errContact); return; }
      setErr(''); setStep(2); toTop();
    }
  };

  const submit = async () => {
    if (v.skills.length === 0) { setErr(tr.volunteerForm.errSkills); return; }
    if (!editingId && !v.consent) { setErr(tr.volunteerForm.errConsent); return; }
    setErr(''); setBusy(true);
    const payload: VolunteerInput = {
      ...v,
      // Empty select value means the general pool; '' is not a valid id.
      disasterId: v.disasterId ? v.disasterId : null,
      phone: v.phone.trim() ? joinPhone(dial, v.phone) : '',
    };
    const ok = editingId
      ? await a.updateMyVolunteer(editingId, payload)
      : await a.submitVolunteer(payload);
    setBusy(false);
    if (!ok) { setErr(tr.volunteerForm.errSubmit); return; }
    if (editingId) backToList();
    else { setDone(true); toTop(); }
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
  const smallBtn = {
    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
    height: 40, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
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
          <p style={{ fontSize: 13, color: C.muted, margin: '8px auto 0', maxWidth: '52ch' }}>{tr.volunteerForm.doneMail}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            {/* A signed-in visitor has somewhere to go back to, and it is the list that
                now contains what they just filed — offering "yeni başvuru" first would
                push them into filling the same form again. */}
            {loggedIn ? (
              <button onClick={() => { setDone(false); setView('list'); setAnim('back'); toTop(); a.reloadMyVolunteer(); }}
                className="hv-navy" style={secondary}>{tr.volunteerMine.viewMine}</button>
            ) : (
              <button onClick={() => { setDone(false); startNew(); }} style={secondary}>{tr.volunteerForm.doneAgain}</button>
            )}
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

      {/* ---- Own applications, above the form ---- */}
      {loggedIn && mine.length > 0 && view === 'list' && (
        <section className={cardClass('list')} style={{ ...card, padding: mob ? 14 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.navy }}>{tr.volunteerMine.title}</h2>
              <p style={{ fontSize: 12.5, color: C.muted2, margin: '3px 0 0', maxWidth: '62ch' }}>{tr.volunteerMine.subtitle}</p>
            </div>
            <span className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>{tr.volunteerMine.openCount(openCount)}</span>
          </div>

          {/* One switch, not one per application: "may we call you about a disaster near
              you" is a question about the person. It stays available whatever the
              statuses are — the one control an approved volunteer keeps, because a
              consent that cannot be taken back is not a consent (migration 0022). */}
          <label style={{
            display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 10, alignItems: 'start',
            cursor: 'pointer', background: standingOn ? '#EAF7EE' : C.canvas,
            border: `1px solid ${standingOn ? '#BFE3CB' : C.borderFaint}`,
            borderRadius: 10, padding: '11px 13px',
          }}>
            <input type="checkbox" checked={standingOn} style={{ width: 18, height: 18, marginTop: 1, accentColor: C.success }}
              onChange={(e) => { void a.setMyVolunteerConsent(e.target.checked); }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.navy }}>
                {tr.volunteerMine.consentTitle} · {standingOn ? tr.volunteerMine.consentOn : tr.volunteerMine.consentOff}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.text, marginTop: 2 }}>{tr.volunteerMine.consentLabel}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted3, marginTop: 3 }}>{tr.volunteerMine.consentAllHint}</span>
            </span>
          </label>

          {mine.map((app) => {
            const tone = STATUS_TONE[app.status] ?? STATUS_TONE['Pending review'];
            const closed = app.status === 'Rejected' || app.status === 'Withdrawn';
            const place = [app.district, app.province].filter(Boolean).join(', ');
            return (
              <div key={app.id} style={{
                border: `1px solid ${C.borderFaint}`, borderRadius: 11, padding: 13,
                display: 'flex', flexDirection: 'column', gap: 8, opacity: closed ? .75 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>
                        {app.disasterName || tr.volunteerMine.generalPool}
                      </span>
                      {app.code && (
                        <span className="tnum" style={{
                          fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', color: C.muted,
                          background: C.canvas, border: `1px solid ${C.borderFaint}`,
                          borderRadius: 6, padding: '2px 7px',
                        }}>{app.code}</span>
                      )}
                    </div>
                    <div className="tnum" style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>
                      {[place, tr.volunteerMine.appliedAt(app.createdLabel)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {/* Status as a sentence, not a colour: "Onaylandı" alone has been read
                      as "you are on duty" (rules/07 §Critical Distinctions). */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
                    color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}`,
                    borderRadius: 20, padding: '3px 10px',
                  }}>{tr.volunteerMine.statusLabels[app.status as VolunteerStatus] ?? app.status}</span>
                </div>

                {app.skills.length > 0 && (
                  <div style={{ fontSize: 12.5, color: C.text }}>{app.skills.join(' · ')}</div>
                )}
                {app.onShift && (
                  <div style={{ fontSize: 12.5, color: C.successText, fontWeight: 600 }}>
                    {tr.volunteerMine.onShift}{app.shiftSinceLabel ? ` · ${app.shiftSinceLabel}` : ''}
                  </div>
                )}
                {app.reviewNote && (
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    <strong style={{ color: C.navy, fontWeight: 600 }}>{tr.volunteerMine.reviewNote}:</strong> {app.reviewNote}
                  </div>
                )}

                {/* An approved application can be neither edited nor withdrawn here:
                    changing or removing what a coordinator already accepted would alter
                    the roster they are counting on without telling them. Both rules are
                    enforced by the database (migrations 0019 and 0021); the reason is
                    written out rather than left as two missing buttons. */}
                {app.status === 'Approved' && (
                  <div style={{ fontSize: 12, color: C.muted2 }}>{tr.volunteerMine.approvedNoWithdraw}</div>
                )}
                {!closed && app.status !== 'Approved' && withdrawing !== app.id && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => startEdit(app)} className="hv-navy" style={smallBtn}>{tr.volunteerMine.edit}</button>
                    <button onClick={() => setWithdrawing(app.id)} style={{ ...smallBtn, color: C.emergency }}>
                      {tr.volunteerMine.withdraw}
                    </button>
                  </div>
                )}
                {/* The consequence before the confirmation (rules/04 §Destructive Actions). */}
                {withdrawing === app.id && (
                  <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9, padding: 11 }}>
                    <div style={{ fontSize: 13, color: C.errorText }}>{tr.volunteerMine.withdrawConfirm}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                      <button onClick={() => { void a.withdrawMyVolunteer(app.id).then(() => setWithdrawing(null)); }}
                        style={{ ...smallBtn, background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff' }}>
                        {tr.volunteerMine.withdrawYes}
                      </button>
                      <button onClick={() => setWithdrawing(null)} style={smallBtn}>{tr.volunteerMine.cancel}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={startNew} className="hv-navy" style={{ ...smallBtn, alignSelf: 'flex-start', height: 46 }}>
            {tr.volunteerMine.newApplication}
          </button>
        </section>
      )}

      {/* Said before the form, not after: what approval does and does not mean. */}
      {view === 'form' && (
        <div className={cardClass('form')} style={{
          background: G.chip, border: `1px solid ${C.borderFaint}`, borderLeft: `3px solid ${C.info}`,
          borderRadius: 10, padding: '11px 13px', fontSize: 13.5, color: C.text,
        }}>{tr.volunteerForm.honestNote}</div>
      )}

      {view === 'form' && (
      <section className={cardClass('form')} style={{ ...card, padding: mob ? 15 : 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Where the visitor is, and how much is left. A bar with no words would be
            decoration (rules/04 §Quantity Display, same principle). */}
        <div>
          <div className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>
            {tr.volunteerForm.stepOf(step + 1, STEPS)} · {tr.volunteerForm.steps[step]}
          </div>
          {/* Which record is being changed, by its number. Editing a form that looks
              identical to the "new application" form without saying so is how someone
              overwrites the wrong record. */}
          {editingId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, marginTop: 8,
              background: C.chipNavyBg, border: `1px solid ${C.borderFaint}`, borderRadius: 9,
              padding: '8px 11px', fontSize: 13, color: C.navy, fontWeight: 600,
            }}>
              <Ico n="need" size={14} color={C.muted2} />
              {tr.volunteerMine.editing(mine.find((x) => x.id === editingId)?.code ?? '')}
            </div>
          )}
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
                {VOLUNTEER_SKILLS.map((s) => <SkillChip key={s} label={s} on={v.skills.includes(s)} onClick={() => toggleSkill(s)} />)}
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

            {/* A second, separate permission. It is not bundled into the storage consent
                on purpose: "you may keep my number" and "you may call me about any
                nearby disaster without asking" are different things to agree to
                (rules/03 §Data Minimization). Off by default. */}
            <label style={{
              display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 10, alignItems: 'start',
              background: C.surface, border: `1px solid ${v.standingConsent ? C.navy : C.borderFaint}`,
              borderRadius: 10, padding: '12px 13px', cursor: 'pointer',
            }}>
              <input type="checkbox" checked={v.standingConsent}
                onChange={(e) => set('standingConsent', e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: C.navy }} />
              <span>
                <span style={{ fontSize: 13.5, color: C.navy, fontWeight: 700 }}>{tr.volunteerMine.consentTitle}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.text, marginTop: 2 }}>{tr.volunteerMine.consentLabel}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.muted3, marginTop: 3 }}>
                  {tr.volunteerMine.consentHint} {tr.volunteerMine.consentAllHint}
                </span>
              </span>
            </label>

            {!editingId && (
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
            )}
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
            <button onClick={() => { setErr(''); setStep((x) => x - 1); toTop(); }} className="hv-navy" style={secondary}>
              {tr.volunteerForm.back}
            </button>
          )}
          {step < STEPS - 1 ? (
            <button onClick={next} className="hv-emergency" style={{ ...primary, flex: mob ? '1 1 160px' : undefined }}>
              {tr.volunteerForm.next}
            </button>
          ) : (
            <button onClick={() => void submit()} disabled={busy} className="hv-emergency"
              style={{ ...primary, flex: mob ? '1 1 160px' : undefined, opacity: busy ? .7 : 1 }}>
              {busy ? tr.volunteerForm.submitting : editingId ? tr.volunteerMine.save : tr.volunteerForm.submit}
            </button>
          )}
          {loggedIn && mine.length > 0 && (
            <button onClick={backToList} style={secondary}>
              {editingId ? tr.volunteerMine.cancel : tr.volunteerMine.hideForm}
            </button>
          )}
        </div>
      </section>
      )}

      {/* Guests keep the full form, and are told what an account would add — after the
          form, never as a gate in front of it (rules/01). */}
      {!loggedIn && (
        <div style={{ fontSize: 12.5, color: C.muted2 }}>{tr.volunteerMine.guestNote}</div>
      )}

      <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>{tr.volunteerForm.emergencyNote}</p>
    </div>
  );
}

// A skill chip whose width never changes between states.
//
// The tick is not added next to the label — that grew the chip, which reflowed the whole
// row and moved every other chip out from under the pointer. Instead a fixed 19px of
// space is reserved and merely redistributed: unselected it is split either side so the
// label sits centred, selected it all moves to the left and the tick fades into it, so
// the label slides right by half a slot. Total width is identical in both states.
//
// The transition is inline, and the global reduced-motion rule in index.css turns it off
// for anyone who asks for that (rules/04 §Accessibility).
const SLOT = 19;

function SkillChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: on ? C.navy : C.surface, color: on ? '#fff' : C.heading2,
      border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
      minHeight: 40, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      transition: 'background .16s ease-out, color .16s ease-out, border-color .16s ease-out',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
        width: on ? SLOT : SLOT / 2, flex: `0 0 ${on ? SLOT : SLOT / 2}px`,
        overflow: 'hidden', transition: 'width .16s ease-out, flex-basis .16s ease-out',
      }}>
        <span style={{
          display: 'inline-flex', paddingRight: 6,
          opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(.6)',
          transition: 'opacity .16s ease-out, transform .16s ease-out',
        }}><Ico n="completed" size={13} color="#fff" /></span>
      </span>
      {label}
      <span style={{
        width: on ? 0 : SLOT / 2, flex: `0 0 ${on ? 0 : SLOT / 2}px`,
        transition: 'width .16s ease-out, flex-basis .16s ease-out',
      }} />
    </button>
  );
}
