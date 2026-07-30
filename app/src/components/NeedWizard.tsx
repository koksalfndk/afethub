import { useMemo, useState } from 'react';
import { useApp, type WizardMode } from '../store';
import { useAuth } from '../auth';
import { tr, priorityLabel } from '../i18n/strings';
import { C } from '../theme';
import { Field, inputStyle, Btn, Chip } from '../ui';
import { UNIT_PRESETS } from '../util';
import { PROVINCES } from '../data/trLocations';
import {
  CATEGORIES, PRIORITIES, PASSENGER_VEHICLES, CARGO_VEHICLES, ANIMALS, PET_NEEDS,
  emptyWizard, buildPayload, detailPairs, type WizardValues,
} from '../needForm';

// Step-by-step need wizard, used both by coordinators (publish) and the public
// (submit a request). The form adapts to the chosen category.
export function NeedWizard() {
  const a = useApp();
  if (!a.wizardMode) return null;
  // Fresh state per open: key remounts the inner form.
  return <WizardInner key={a.wizardMode} mode={a.wizardMode} />;
}

function WizardInner({ mode }: { mode: WizardMode }) {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;
  const isPublic = mode === 'public';
  const needContact = isPublic && !loggedIn;

  const defaultLoc = mode === 'coord'
    ? (a.snap?.locations[0]?.name ?? '')
    : '';
  const [v, setV] = useState<WizardValues>(() => emptyWizard(defaultLoc));
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [doneCode, setDoneCode] = useState('');
  const [busy, setBusy] = useState(false);

  const steps = useMemo(() => {
    const s: Array<'category' | 'details' | 'location' | 'contact' | 'review'> =
      ['category', 'details', 'location'];
    if (needContact) s.push('contact');
    s.push('review');
    return s;
  }, [needContact]);

  const cat = CATEGORIES.find((c) => c.key === v.category);
  const set = (k: keyof WizardValues, val: string | string[]) =>
    setV((p) => ({ ...p, [k]: val }));
  const togglePetNeed = (n: string) =>
    setV((p) => ({ ...p, petNeeds: p.petNeeds.includes(n) ? p.petNeeds.filter((x) => x !== n) : [...p.petNeeds, n] }));

  const close = () => a.closeWizard();

  const validate = (which: string): string => {
    if (which === 'category' && !v.category) return tr.wizard.errCategory;
    if (which === 'details') {
      if (v.category === 'Ulaşım') { if (!(parseInt(v.capacity, 10) > 0)) return tr.wizard.errCapacity; }
      else if (v.category === 'Taşıma') { if (!(parseInt(v.required, 10) > 0)) return tr.wizard.errRequired; }
      else if (v.category === 'Evcil Hayvanlar') { if (!(parseInt(v.count, 10) > 0)) return tr.wizard.errAnimal; }
      else { if (!v.title.trim()) return tr.wizard.errTitle; if (!(parseInt(v.required, 10) > 0)) return tr.wizard.errRequired; }
    }
    if (which === 'contact' && (!v.name || !v.email || !v.phone || !v.city)) return tr.wizard.errContact;
    return '';
  };

  const next = () => {
    const e = validate(steps[step]);
    if (e) return setErr(e);
    setErr('');
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const back = () => { setErr(''); setStep((s) => Math.max(0, s - 1)); };

  const submit = async () => {
    if (busy) return;
    const payload = buildPayload(v);
    setBusy(true);
    try {
      if (mode === 'coord') {
        const ok = await a.publishNeed(payload);
        if (ok) close(); else setErr(tr.auth.verifyFirst);
      } else {
        const code = await a.requestNeed(payload, { name: v.name, email: v.email, phone: v.phone, city: v.city });
        if (code) setDoneCode(code);
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'coord' ? tr.wizard.coordTitle : tr.wizard.publicTitle;
  const intro = mode === 'coord' ? tr.wizard.coordIntro : tr.wizard.publicIntro;
  const current = steps[step];

  return (
    <div onClick={close} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in" style={sheet}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.navy }}>{title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>{intro}</p>
          </div>
          <button onClick={close} aria-label={tr.wizard.close} style={xBtn}>✕</button>
        </div>

        {!doneCode && (
          <>
            {/* stepper */}
            <div style={{ display: 'flex', gap: 6, padding: '14px 24px 0', flexWrap: 'wrap' }}>
              {steps.map((s, i) => (
                <div key={s} style={{
                  flex: '1 1 40px', height: 5, borderRadius: 3,
                  background: i <= step ? C.navy : C.border,
                }} />
              ))}
            </div>
            <div style={{ padding: '6px 24px 0', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted2 }}>
              {tr.wizard.stepOf(step + 1, steps.length)} · {tr.wizard.steps[current]}
            </div>
          </>
        )}

        {/* body */}
        <div style={{ padding: '16px 24px 8px' }}>
          {doneCode ? (
            <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.successText }}>{tr.wizard.doneTitle}</h3>
              <p style={{ margin: 0, fontSize: 14, color: C.heading2 }}>{tr.wizard.doneBody(doneCode)}</p>
            </div>
          ) : current === 'category' ? (
            <CategoryStep value={v.category} onPick={(k) => { set('category', k); setErr(''); }} />
          ) : current === 'details' ? (
            <DetailsStep v={v} set={set} togglePetNeed={togglePetNeed} cat={cat} />
          ) : current === 'location' ? (
            <LocationStep v={v} set={set} coordLocs={mode === 'coord' ? (a.snap?.locations.map((l) => l.name) ?? []) : []} />
          ) : current === 'contact' ? (
            <ContactStep v={v} set={set} />
          ) : (
            <ReviewStep v={v} needContact={needContact} />
          )}

          {err && <div style={errBox}>{err}</div>}
        </div>

        {/* footer */}
        {!doneCode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 24px 22px' }}>
            <Btn variant="secondary" onClick={step === 0 ? close : back}>
              {step === 0 ? tr.common.cancel : tr.wizard.back}
            </Btn>
            {current === 'review' ? (
              <Btn variant="primary" onClick={submit} disabled={busy}>
                {busy ? tr.auth.working : (mode === 'coord' ? tr.wizard.publish : tr.wizard.submit)}
              </Btn>
            ) : (
              <Btn variant="primary" onClick={next}>{tr.wizard.next}</Btn>
            )}
          </div>
        )}
        {doneCode && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 24px 22px' }}>
            <Btn variant="primary" onClick={close}>{tr.wizard.close}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryStep({ value, onPick }: { value: string; onPick: (k: string) => void }) {
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 600, color: C.heading2 }}>{tr.wizard.chooseCategory}</p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
        {CATEGORIES.map((c) => {
          const active = c.key === value;
          return (
            <button key={c.key} onClick={() => onPick(c.key)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
              background: active ? C.chipNavyBg : C.surface,
              border: `1.5px solid ${active ? C.navy : C.borderSoft}`,
              borderRadius: 12, padding: 14, cursor: 'pointer', textAlign: 'left', minHeight: 74,
            }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{c.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>{children}</div>;
}

type SetFn = (k: keyof WizardValues, val: string | string[]) => void;

function PrioritySelect({ v, set }: { v: WizardValues; set: SetFn }) {
  return (
    <Field label={tr.wizard.fPriority}>
      <select value={v.priority} onChange={(e) => set('priority', e.target.value)} style={inputStyle}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
      </select>
    </Field>
  );
}

function DetailsStep({ v, set, togglePetNeed, cat }: {
  v: WizardValues; set: SetFn; togglePetNeed: (n: string) => void; cat?: { key: string };
}) {
  const unitList = (
    <datalist id="unit-presets-wz">{UNIT_PRESETS.map((u) => <option key={u} value={u} />)}</datalist>
  );

  if (cat?.key === 'Ulaşım') {
    return (
      <Grid>
        <Field label={tr.wizard.fVehicle}>
          <select value={v.vehicle} onChange={(e) => set('vehicle', e.target.value)} style={inputStyle}>
            <option value="">{tr.wizard.none}</option>
            {PASSENGER_VEHICLES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label={tr.wizard.fCapacity}>
          <input value={v.capacity} onChange={(e) => set('capacity', e.target.value)} type="number" placeholder="45" style={inputStyle} />
        </Field>
        <Field label={tr.wizard.fFrom}><input value={v.from} onChange={(e) => set('from', e.target.value)} placeholder="Kuzey sırtı" style={inputStyle} /></Field>
        <Field label={tr.wizard.fTo}><input value={v.to} onChange={(e) => set('to', e.target.value)} placeholder="İlçe merkezi" style={inputStyle} /></Field>
        <Field label={tr.wizard.fWhen} full><input value={v.when} onChange={(e) => set('when', e.target.value)} placeholder="Bugün 18:00" style={inputStyle} /></Field>
        <PrioritySelect v={v} set={set} />
      </Grid>
    );
  }
  if (cat?.key === 'Taşıma') {
    return (
      <Grid>
        <Field label={tr.wizard.fVehicle}>
          <select value={v.vehicle} onChange={(e) => set('vehicle', e.target.value)} style={inputStyle}>
            <option value="">{tr.wizard.none}</option>
            {CARGO_VEHICLES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label={tr.wizard.fTrips}>
          <input value={v.required} onChange={(e) => set('required', e.target.value)} type="number" placeholder="1" style={inputStyle} />
        </Field>
        <Field label={tr.wizard.fLoad} full>
          <input value={v.load} onChange={(e) => set('load', e.target.value)} placeholder={tr.wizard.fLoadPh} style={inputStyle} />
        </Field>
        <Field label={tr.wizard.fFrom}><input value={v.from} onChange={(e) => set('from', e.target.value)} placeholder="Depo" style={inputStyle} /></Field>
        <Field label={tr.wizard.fTo}><input value={v.to} onChange={(e) => set('to', e.target.value)} placeholder="Teslim noktası" style={inputStyle} /></Field>
        <Field label={tr.wizard.fWhen}><input value={v.when} onChange={(e) => set('when', e.target.value)} placeholder="Bugün" style={inputStyle} /></Field>
        <PrioritySelect v={v} set={set} />
      </Grid>
    );
  }
  if (cat?.key === 'Evcil Hayvanlar') {
    return (
      <Grid>
        <Field label={tr.wizard.fAnimal}>
          <select value={v.animal} onChange={(e) => set('animal', e.target.value)} style={inputStyle}>
            <option value="">{tr.wizard.none}</option>
            {ANIMALS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label={tr.wizard.fCount}>
          <input value={v.count} onChange={(e) => set('count', e.target.value)} type="number" placeholder="3" style={inputStyle} />
        </Field>
        <Field label={tr.wizard.fPetNeeds} full>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
            {PET_NEEDS.map((n) => (
              <Chip key={n} label={n} active={v.petNeeds.includes(n)} onClick={() => togglePetNeed(n)} />
            ))}
          </div>
        </Field>
        <PrioritySelect v={v} set={set} />
      </Grid>
    );
  }
  // standard supply category
  return (
    <Grid>
      <Field label={tr.wizard.fTitle} full>
        <input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder={tr.wizard.fTitlePh} style={inputStyle} />
      </Field>
      <Field label={tr.wizard.fRequired}>
        <input value={v.required} onChange={(e) => set('required', e.target.value)} type="number" placeholder="100" style={inputStyle} />
      </Field>
      <Field label={tr.wizard.fUnit}>
        <input value={v.unit} onChange={(e) => set('unit', e.target.value)} placeholder="paket" list="unit-presets-wz" style={inputStyle} />
        {unitList}
      </Field>
      <PrioritySelect v={v} set={set} />
    </Grid>
  );
}

function LocationStep({ v, set, coordLocs }: { v: WizardValues; set: SetFn; coordLocs: string[] }) {
  return (
    <Grid>
      <Field label={tr.wizard.fLocation} full>
        {coordLocs.length > 0 ? (
          <select value={v.loc} onChange={(e) => set('loc', e.target.value)} style={inputStyle}>
            {coordLocs.map((l) => <option key={l}>{l}</option>)}
          </select>
        ) : (
          <input value={v.loc} onChange={(e) => set('loc', e.target.value)} placeholder="Saha kliniği, kuzey sırtı" style={inputStyle} />
        )}
      </Field>
      <Field label={tr.wizard.fDeadline} full>
        <input value={v.deadline} onChange={(e) => set('deadline', e.target.value)} type="date" style={inputStyle} />
      </Field>
    </Grid>
  );
}

function ContactStep({ v, set }: { v: WizardValues; set: SetFn }) {
  return (
    <>
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.muted }}>{tr.wizard.contactIntro}</p>
      <Grid>
        <Field label={tr.wizard.fName}><input value={v.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} /></Field>
        <Field label={tr.wizard.fEmail}><input value={v.email} onChange={(e) => set('email', e.target.value)} type="email" style={inputStyle} /></Field>
        <Field label={tr.wizard.fPhone}><input value={v.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} /></Field>
        <Field label={tr.wizard.fCity}>
          <select name="city" autoComplete="address-level1" value={v.city} onChange={(e) => set('city', e.target.value)} style={inputStyle}>
            <option value="">{tr.orgs.pickProvince}</option>
            {PROVINCES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
          </select>
        </Field>
      </Grid>
    </>
  );
}

function ReviewStep({ v, needContact }: { v: WizardValues; needContact: boolean }) {
  const p = buildPayload(v);
  const rows: [string, string][] = [
    [tr.wizard.steps.category, v.category],
    [tr.wizard.fTitle, p.title],
    [tr.wizard.fRequired, `${p.required} ${p.unit}`],
    [tr.wizard.fPriority, priorityLabel[p.priority]],
    ...detailPairs(p.details),
    [tr.wizard.fLocation, p.loc || tr.wizard.none],
    [tr.wizard.fDeadline, p.deadline || tr.wizard.none],
  ];
  if (needContact) rows.push([tr.wizard.fName, v.name], [tr.wizard.fPhone, v.phone]);
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 14.5, fontWeight: 600, color: C.heading2 }}>{tr.wizard.reviewTitle}</p>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map(([k, val], i) => (
          <div key={`${k}-${i}`} style={{
            display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 14px',
            borderTop: i === 0 ? 'none' : `1px solid ${C.borderFaint}`, fontSize: 13.5,
          }}>
            <span style={{ color: C.muted, fontWeight: 500 }}>{k}</span>
            <span style={{ color: C.navy, fontWeight: 600, textAlign: 'right' }}>{val || tr.wizard.none}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', display: 'flex',
  alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 80, overflowY: 'auto',
};
const sheet: React.CSSProperties = {
  background: C.surface, borderRadius: 14, width: '100%', maxWidth: 640,
  boxShadow: '0 18px 48px rgba(11,30,48,.28)', margin: 'auto',
};
const xBtn: React.CSSProperties = {
  background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34,
  fontSize: 15, color: C.muted, cursor: 'pointer', flex: '0 0 34px',
};
const errBox: React.CSSProperties = {
  marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9,
  padding: '10px 12px', fontSize: 13, color: C.errorText, fontWeight: 600,
};
