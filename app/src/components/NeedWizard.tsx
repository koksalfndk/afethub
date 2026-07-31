import { useEffect, useMemo, useState } from 'react';
import { useApp, type WizardMode } from '../store';
import { useAuth } from '../auth';
import { tr, priorityLabel } from '../i18n/strings';
import { C } from '../theme';
import { Field, inputStyle, Btn, Chip, Ico } from '../ui';
import { Picker, toOptions } from './Picker';
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
  // Koordinatörün iki kipi de yayınlar; tek fark afet adımının sorulup sorulmadığı.
  const isCoord = mode === 'coord' || mode === 'coordScoped';
  const needContact = isPublic && !loggedIn;

  const defaultLoc = isCoord
    ? (a.snap?.locations[0]?.name ?? '')
    : '';
  // Prefill with the operation that is currently open — that is almost always the one
  // meant — but still make it an explicit, visible step the coordinator can change.
  const defaultSlug = a.snap?.disaster.slug ?? '';
  const [v, setV] = useState<WizardValues>(() => emptyWizard(defaultLoc, defaultSlug));
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [doneCode, setDoneCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Koordinatör birden çok operasyon yürütüyor olabilir, bu yüzden ihtiyacın hangisine
  // ait olduğu açıkça sorulur — AMA yalnızca soru gerçekten açıksa. Sihirbaz bir
  // operasyonun kendi sayfasından açıldıysa ('coordScoped') cevap zaten belli ve o adım
  // sorulmaz; ziyaretçi akışı da aynı sebeple kapsamlıdır.
  const steps = useMemo(() => {
    const s: Array<'disaster' | 'category' | 'details' | 'location' | 'contact' | 'review'> = [];
    if (mode === 'coord') s.push('disaster');
    s.push('category', 'details', 'location');
    if (needContact) s.push('contact');
    s.push('review');
    return s;
  }, [needContact, mode]);

  const cat = CATEGORIES.find((c) => c.key === v.category);
  const set = (k: keyof WizardValues, val: string | string[]) =>
    setV((p) => ({ ...p, [k]: val }));
  const togglePetNeed = (n: string) =>
    setV((p) => ({ ...p, petNeeds: p.petNeeds.includes(n) ? p.petNeeds.filter((x) => x !== n) : [...p.petNeeds, n] }));

  const close = () => a.closeWizard();

  // Escape kapatır. Zemine tıklamak zaten kapatıyordu; klavyeyle aynı şeyi yapmanın
  // yolu yoktu (rules/04 §Accessibility).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const validate = (which: string): string => {
    if (which === 'disaster' && !v.disasterSlug) return tr.wizard.errDisaster;
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
      if (isCoord) {
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

  const title = isCoord ? tr.wizard.coordTitle : tr.wizard.publicTitle;
  const intro = isCoord ? tr.wizard.coordIntro : tr.wizard.publicIntro;
  const current = steps[step];

  return (
    <div onClick={close} style={overlay}>
      {/* Rol ve etiket: sihirbaz bir pencere, ekran okuyucuya da öyle bildirilmeli
          (rules/04 §Accessibility). Eksikti. */}
      <div onClick={(e) => e.stopPropagation()} className="anim-in"
        role="dialog" aria-modal="true" aria-label={title} style={sheet}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.navy }}>{title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: C.muted }}>{intro}</p>
            {/* A coordinator/admin is the reviewer, so their own need is published
                straight away rather than queued. Say so, don't let it be a surprise. */}
            {isCoord && (
              <p style={{
                margin: '9px 0 0', fontSize: 12.5, fontWeight: 600, color: C.successText,
                background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 9, padding: '8px 11px',
              }}>{tr.wizard.coordDirectNotice}</p>
            )}
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
          ) : current === 'disaster' ? (
            <DisasterStep value={v.disasterSlug} onPick={(slug) => { set('disasterSlug', slug); setErr(''); }} />
          ) : current === 'category' ? (
            <CategoryStep value={v.category} onPick={(k) => { set('category', k); setErr(''); }} />
          ) : current === 'details' ? (
            <DetailsStep v={v} set={set} togglePetNeed={togglePetNeed} cat={cat} />
          ) : current === 'location' ? (
            <LocationStep v={v} set={set} coordLocs={
              // Delivery points belong to an operation. Only offer the open snapshot's
              // list when the coordinator is publishing into that same operation —
              // otherwise a free-text value is safer than a list from the wrong disaster.
              isCoord && v.disasterSlug === a.snap?.disaster.slug
                ? (a.snap?.locations.map((l) => l.name) ?? [])
                : []
            } />
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
                {busy ? tr.auth.working : (isCoord ? tr.wizard.publish : tr.wizard.submit)}
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

// Step 1 for coordinators: which operation. All operations are listed, not just the
// open one, because a coordinator may hold several at once — but a resolved operation is
// marked so a need is not published onto a closed one by accident.
function DisasterStep({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
  const a = useApp();
  const list = (a.snap?.disasters ?? []).slice().sort((x, y) => {
    const rank = (s: string) => (s === 'Active' ? 0 : 1);
    return rank(x.status) - rank(y.status) || x.name.localeCompare(y.name, 'tr');
  });

  if (list.length === 0) {
    return <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{tr.wizard.noDisasters}</p>;
  }

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 600, color: C.heading2 }}>{tr.wizard.chooseDisaster}</p>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.muted }}>{tr.wizard.disasterHint}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((d) => {
          const active = d.slug === value;
          const live = d.status === 'Active';
          return (
            <button key={d.id} onClick={() => onPick(d.slug)} aria-pressed={active} style={{
              display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 10, alignItems: 'center',
              background: active ? C.chipNavyBg : C.surface,
              border: `1.5px solid ${active ? C.navy : C.borderSoft}`,
              borderRadius: 11, padding: '11px 13px', cursor: 'pointer', textAlign: 'left', minHeight: 56,
            }}>
              <Ico n={live ? 'critical' : 'completed'} size={17} color={live ? C.emergency : C.success} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: C.navy }}>{d.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted2 }}>{d.region}</span>
              </span>
              {/* Status is spelled out, not only coloured (rules/04 §Accessibility). */}
              <span style={{
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                color: live ? C.emergency : C.successText,
              }}>{live ? tr.home.active : tr.wizard.disasterResolved}</span>
            </button>
          );
        })}
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
            <button key={c.key} onClick={() => onPick(c.key)} aria-pressed={active} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: active ? C.chipNavyBg : C.surface,
              border: `1.5px solid ${active ? C.navy : C.borderSoft}`,
              borderRadius: 12, padding: 14, cursor: 'pointer', textAlign: 'center', minHeight: 86,
            }}>
              <Ico n={c.icon} size={22} color={active ? C.navy : C.muted} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.navy, lineHeight: 1.25 }}>{c.label}</span>
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
      <Picker value={v.priority} onChange={(x) => set('priority', x)} ariaLabel={tr.wizard.fPriority}
        options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel[p] }))} />
    </Field>
  );
}

function DetailsStep({ v, set, togglePetNeed, cat }: {
  v: WizardValues; set: SetFn; togglePetNeed: (n: string) => void; cat?: { key: string };
}) {

  if (cat?.key === 'Ulaşım') {
    return (
      <Grid>
        <Field label={tr.wizard.fVehicle}>
          <Picker value={v.vehicle} onChange={(x) => set('vehicle', x)} ariaLabel={tr.wizard.fVehicle}
            placeholder={tr.wizard.none} options={toOptions(PASSENGER_VEHICLES)} />
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
          <Picker value={v.vehicle} onChange={(x) => set('vehicle', x)} ariaLabel={tr.wizard.fVehicle}
            placeholder={tr.wizard.none} options={toOptions(CARGO_VEHICLES)} />
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
          <Picker value={v.animal} onChange={(x) => set('animal', x)} ariaLabel={tr.wizard.fAnimal}
            placeholder={tr.wizard.none} options={toOptions(ANIMALS)} />
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
        {/* A closed list keeps units comparable across needs: "kutu" and "Kutu" and
            "kutular" are three different units to a coordinator adding up deliveries
            (rules/05 §Quantities — store a numeric quantity and an explicit unit). */}
        <Picker value={v.unit} onChange={(x) => set('unit', x)} ariaLabel={tr.wizard.unitPick}
          placeholder={tr.wizard.unitPick} options={toOptions(UNIT_PRESETS)} />
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
          <Picker value={v.loc} onChange={(x) => set('loc', x)} ariaLabel={tr.wizard.fLocation}
            options={toOptions(coordLocs)} />
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
          <Picker value={v.city} onChange={(x) => set('city', x)} ariaLabel={tr.wizard.fCity}
            placeholder={tr.orgs.pickProvince} options={toOptions(PROVINCES)} />
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
