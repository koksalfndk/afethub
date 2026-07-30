import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { Field, inputStyle, eyebrow, StatusBadge } from '../ui';
import { PhotoUploader } from '../components/PhotoUploader';
import { defaultEta, halfHourSlots, UNIT_PRESETS, DIAL_CODES, splitPhone, joinPhone } from '../util';

export function Report({ inModal = false }: { inModal?: boolean }) {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;

  const [step, setStep] = useState(0);
  const [localErr, setLocalErr] = useState('');
  const [dial, setDial] = useState(() => splitPhone(a.form.phone).dial);
  const [phoneRest, setPhoneRest] = useState(() => splitPhone(a.form.phone).rest);

  // Fresh estimated-arrival default each time the form opens: now + 30 min, rounded up.
  useEffect(() => { a.setForm('eta', defaultEta()); /* eslint-disable-next-line */ }, []);

  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const f = a.form;
  const wrap = inModal ? {} : { maxWidth: 720, margin: '0 auto' };

  if (a.reportStage === 'done') {
    const needName = a.snap.needs.find((n) => n.id === f.needId)?.name ?? 'yardım';
    const summary = tr.report.summary(f.qty || '', f.unit || 'adet', needName, f.loc);
    return (
      <div style={wrap}>
        <div className="anim-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#EAF7EF', border: '1px solid #C9E9D6', color: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700 }}>✓</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: '16px 0 6px' }}>{tr.report.doneTitle}</h1>
          <p style={{ fontSize: 15, color: C.text, margin: 0 }}>{tr.report.doneBody}</p>
          <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted2 }}>{tr.report.trackingCode}</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '.06em', color: C.navy, fontVariantNumeric: 'tabular-nums' }}>{a.lastCode}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted2 }}>{tr.report.status}</div>
                <div style={{ marginTop: 4 }}><StatusBadge s="Pending verification" /></div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>{tr.report.emailOnWay(summary, loggedIn ? (auth.user?.email ?? 'gelen kutunuz') : (f.email || 'gelen kutunuz'))}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <button onClick={a.copyCode} style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46 }}>{a.copied ? tr.report.copied : tr.report.copy}</button>
            <button onClick={() => a.go('track')} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46 }}>{tr.report.trackSubmission}</button>
            <button onClick={a.reportAnother} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46 }}>{tr.report.reportAnother}</button>
          </div>
          {!loggedIn && (
            <div style={{ marginTop: 20, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{tr.report.createAccount}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{tr.report.createAccountBody}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => auth.openModal('signUp')} style={{ background: C.success, border: `1px solid ${C.success}`, color: '#fff', borderRadius: 9, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.report.createAccountBtn}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const needOptions = enrichSorted(a.snap.needs).map((n) => ({ id: n.id, label: `${n.name} — ${n.remaining} ${n.unit} kalan` }));

  // Step-by-step: the form asks for one thing at a time. A delivery report is filled in
  // at a drop-off point, one-handed, often on a weak connection (rules/01, rules/04
  // §Forms — progressive disclosure). Nothing is submitted until the last step, and
  // moving between steps never clears a field.
  // Signed in, the contact step is still offered: a coordinator frequently records a
  // delivery someone else brought, and that person's own details are what matter for
  // the audit trail and for the record showing up in THEIR "Gönderilerim".
  const stepKeys: Array<'delivery' | 'note' | 'contact'> = ['delivery', 'note', 'contact'];
  const stepKey = stepKeys[Math.min(step, stepKeys.length - 1)];
  const lastStep = step >= stepKeys.length - 1;

  const stepError = (which: string): string => {
    if (which === 'delivery') {
      if (!f.needId) return tr.report.errNeed;
      if (!(parseInt(f.qty, 10) > 0)) return tr.report.errQty;
      if (!f.loc) return tr.report.errLoc;
    }
    // Signed in: the contact step is optional (falls back to the account). A guest must
    // fill it, because there would otherwise be no way to reach them about the delivery.
    if (which === 'contact' && !loggedIn && (!f.name || !f.email || !phoneRest || !f.city)) return tr.report.errContact;
    return '';
  };

  const goNext = () => {
    const e = stepError(stepKey);
    if (e) { setLocalErr(e); return; }
    setLocalErr('');
    setStep((v) => Math.min(v + 1, stepKeys.length - 1));
  };

  const submit = () => {
    const e = stepError(stepKey);
    if (e) { setLocalErr(e); return; }
    setLocalErr('');
    // The phone is stored as one string; the dial code is only a UI split.
    a.setForm('phone', joinPhone(dial, phoneRest));
    a.submitDelivery();
  };

  return (
    <div style={wrap}>
      {!inModal && <button onClick={() => a.go('disaster', { tab: 'needs' })} style={{ background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>{tr.report.backToNeeds}</button>}
      {!inModal && <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '8px 0 4px' }}>{tr.report.title}</h1>}
      {!inModal && <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 18px' }}>{tr.report.intro}</p>}

      <div style={{ background: C.surface, border: inModal ? '0' : `1px solid ${C.border}`, borderRadius: 12, padding: inModal ? 0 : 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* stepper */}
        <div>
          <div style={{ display: 'flex', gap: 5 }}>
            {stepKeys.map((k, i) => (
              <span key={k} style={{ flex: 1, height: 4, borderRadius: 3, background: i <= step ? C.navy : C.border }} />
            ))}
          </div>
          <div className="tnum" style={{ ...eyebrow, marginTop: 8 }}>
            {tr.report.stepOf(step + 1, stepKeys.length)} · {tr.report.stepNames[stepKey]}
          </div>
        </div>

        {stepKey === 'delivery' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
            <Field label={tr.report.fields.need} full>
              <select value={f.needId} onChange={(e) => a.setForm('needId', e.target.value)} style={inputStyle}>
                <option value="">{tr.report.pickNeed}</option>
                {needOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label={tr.report.fields.quantity}>
              <input value={f.qty} onChange={(e) => a.setForm('qty', e.target.value)} type="number" min={1} inputMode="numeric" placeholder="30" style={inputStyle} />
            </Field>
            <Field label={tr.report.fields.unit}>
              {/* Closed list: mixed spellings of the same unit cannot be added up. */}
              <select value={f.unit} onChange={(e) => a.setForm('unit', e.target.value)} style={inputStyle}>
                <option value="">{tr.wizard.unitPick}</option>
                {UNIT_PRESETS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label={tr.report.fields.location} full>
              <select value={f.loc} onChange={(e) => a.setForm('loc', e.target.value)} style={inputStyle}>
                <option value="">{tr.report.pickLoc}</option>
                {/* Delivery points follow the loaded operation instead of a fixed list. */}
                {(a.snap?.locations ?? []).map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </Field>
            <Field label={tr.report.fields.date}>
              <input value={f.date} onChange={(e) => a.setForm('date', e.target.value)} type="date" style={inputStyle} />
            </Field>
            <Field label={tr.report.fields.eta}>
              <select value={f.eta} onChange={(e) => a.setForm('eta', e.target.value)} style={inputStyle}>
                {halfHourSlots().map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        )}

        {stepKey === 'note' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
            <Field label={tr.report.fields.notes} hint={tr.report.fields.optional} full>
              <textarea value={f.notes} onChange={(e) => a.setForm('notes', e.target.value)} rows={3} placeholder={tr.report.fields.notesPh} style={{ ...inputStyle, minHeight: undefined, resize: 'vertical' }} />
            </Field>
            <PhotoUploader value={f.photoUrl} onChange={(url) => a.setForm('photoUrl', url)} />
          </div>
        )}

        {stepKey === 'contact' && (
          <div>
            {loggedIn ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{tr.report.onBehalfTitle}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{tr.report.onBehalfHint}</div>
                <div style={{
                  marginTop: 9, background: C.canvas, border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${C.info}`, borderRadius: 9, padding: '9px 11px',
                  fontSize: 12.5, color: C.heading2,
                }}>{tr.report.onBehalfMatch}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{tr.report.contactWhy}</div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form, alignItems: 'start' }}>
              <Field label={loggedIn ? tr.report.onBehalfName : tr.report.fields.fullName}>
                <input value={f.name} onChange={(e) => a.setForm('name', e.target.value)} name="contact-name" autoComplete="name" placeholder="Ayşe Yılmaz" style={inputStyle} />
              </Field>
              <Field label={loggedIn ? tr.report.onBehalfEmail : tr.report.fields.email}>
                <input value={f.email} onChange={(e) => a.setForm('email', e.target.value)} name="contact-email" autoComplete="email" type="email" placeholder="siz@example.com" style={inputStyle} />
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.heading2 }}>{loggedIn ? tr.report.onBehalfPhone : tr.report.fields.phone}</span>
                {/* Dial code as a prefix so the number field holds digits only. */}
                <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr)', gap: 8 }}>
                  <select value={dial} onChange={(e) => setDial(e.target.value)} aria-label={tr.account.fPhoneCode} className="tnum" style={{ ...inputStyle, padding: '11px 8px' }}>
                    {DIAL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input value={phoneRest} onChange={(e) => setPhoneRest(e.target.value)} name="contact-phone" autoComplete="tel-national" inputMode="tel" placeholder="5xx xxx xx xx" style={inputStyle} />
                </div>
              </div>
              {/* City splits into il + ilçe as soon as a province is chosen: the district
                  list only exists once we know the province. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.heading2 }}>{tr.report.fields.city}</span>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: f.city ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr' }}>
                  <select name="contact-city" autoComplete="address-level1" value={f.city}
                    onChange={(e) => { a.setForm('city', e.target.value); a.setForm('district', ''); }} style={inputStyle}>
                    <option value="">{tr.orgs.pickProvince}</option>
                    {PROVINCES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </select>
                  {f.city && (
                    <select name="contact-district" autoComplete="address-level2" value={f.district}
                      onChange={(e) => a.setForm('district', e.target.value)} aria-label={tr.orgs.fDistrict} style={inputStyle}>
                      <option value="">{tr.orgs.allDistricts}</option>
                      {districtsOf(f.city).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {lastStep && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: 13 }}>
            <input checked={f.confirm} onChange={(e) => a.setForm('confirm', e.target.checked)} type="checkbox" style={{ width: 18, height: 18, marginTop: 1, accentColor: C.navy }} />
            <span style={{ fontSize: 13.5, color: C.heading2 }}>{tr.report.confirm}</span>
          </label>
        )}

        {(localErr || a.formError) && (
          <div role="alert" style={{ display: 'flex', gap: 10, background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 10, padding: '12px 13px' }}>
            <span style={{ color: C.emergency, fontWeight: 700, fontSize: 14 }}>!</span>
            <span style={{ fontSize: 13.5, color: C.errorText }}>{localErr || a.formError}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {step > 0 && (
            <button onClick={() => { setLocalErr(''); setStep((v) => Math.max(0, v - 1)); }} className="hv-navy" style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10, padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{tr.wizard.back}</button>
          )}
          {lastStep ? (
            <>
              <button onClick={submit} className="hv-emergency" style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 10, padding: '0 20px', height: 48, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr.report.submit}</button>
              <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.report.pendingNote}</span>
            </>
          ) : (
            <button onClick={goNext} className="hv-emergency" style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 10, padding: '0 20px', height: 48, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr.wizard.next}</button>
          )}
        </div>
      </div>
    </div>
  );
}
