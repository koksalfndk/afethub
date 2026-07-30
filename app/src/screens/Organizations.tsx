import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { tr, orgStatusLabel, ORG_KINDS, ORG_SCOPES } from '../i18n/strings';
import { C, G } from '../theme';
import { cols } from '../select';
import { Chip, Field, Ico, filterSelectStyle, inputStyle, labelText, eyebrow, type IcoName } from '../ui';
import type { OrgKind, OrgScope, Organization } from '../types';

const emptyDraft = {
  name: '', kind: 'Dernek' as OrgKind, scope: 'İl' as OrgScope, province: '', district: '',
  services: [] as string[], description: '', website: '', email: '', phone: '', emergencyPhone: '', address: '',
  yourName: '', yourEmail: '', yourPhone: '',
};

// Selectable service tags. Free text is intentionally not offered: a fixed
// vocabulary keeps the directory filterable and prevents 20 spellings of the
// same capability.
const SERVICE_TAGS = [
  'Arama kurtarma', 'Afet koordinasyonu', 'Lojistik', 'Gıda', 'İçme suyu', 'Barınma',
  'Sağlık', 'Psikososyal destek', 'Hayvan sağlığı', 'Söndürme desteği', 'Su ikmali',
  'Temizlik malzemesi', 'Tahliye desteği', 'Eğitim', 'Gönüllü koordinasyonu',
  'Hasar tespiti', 'Ağaçlandırma', 'Kan bağışı',
];

const normName = (v: string) => v.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

function StatusBadge({ o }: { o: Organization }) {
  const pending = o.status === 'Pending verification';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
      borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
      color: pending ? C.warningText : C.successText,
      background: pending ? '#FFF8E5' : '#EAF7EF',
      border: `1px solid ${pending ? '#F2DFA8' : '#C9E9D6'}`,
    }}>
      <Ico n={pending ? 'pending' : 'verified'} size={13} />
      {orgStatusLabel[o.status]}
    </span>
  );
}

export function Organizations() {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;
  const mob = a.device === 'mobile';
  const L = cols(mob);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [province, setProvince] = useState('');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof emptyDraft>(k: K, v: (typeof emptyDraft)[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const provinces = useMemo(
    () => Array.from(new Set(a.orgs.map((o) => o.province).filter(Boolean))).sort((x, y) => x.localeCompare(y, 'tr')),
    [a.orgs],
  );

  const needle = q.trim().toLowerCase();
  const visible = a.orgs.filter((o) =>
    (!needle
      || o.name.toLowerCase().includes(needle)
      || o.province.toLowerCase().includes(needle)
      || o.district.toLowerCase().includes(needle)
      || o.services.some((sv) => sv.toLowerCase().includes(needle)))
    && (!kind || o.kind === kind)
    && (!province || o.province === province)
    && (!onlyVerified || o.status === 'Verified'));

  const openForm = () => { setStep(0); setErr(''); setDone(false); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setErr(''); };

  // Step gate: each step only blocks on what it actually asked for.
  // An entry that already exists must be corrected, not duplicated.
  const duplicate = a.orgs.find((o) => normName(o.name) === normName(draft.name));

  const nextStep = () => {
    if (step === 0 && draft.name.trim().length < 2) return setErr(tr.orgs.errName);
    if (step === 0 && duplicate) return setErr(tr.orgs.errDuplicate(duplicate.name));
    if (step === 2) { void submit(); return; }
    setErr('');
    setStep((v) => Math.min(2, v + 1));
  };

  const submit = async () => {
    if (draft.name.trim().length < 2) return setErr(tr.orgs.errName);
    if (duplicate) return setErr(tr.orgs.errDuplicate(duplicate.name));
    if (!draft.website.trim() && !draft.email.trim() && !draft.phone.trim()) return setErr(tr.orgs.errContact);
    const byName = loggedIn ? (auth.profile?.fullName || 'Gönüllü') : draft.yourName;
    const byEmail = loggedIn ? (auth.user?.email || '') : draft.yourEmail;
    if (!byName.trim() || !byEmail.trim()) return setErr(tr.orgs.errSubmitter);
    setErr('');
    const ok = await a.submitOrganization({
      name: draft.name, kind: draft.kind, scope: draft.scope, province: draft.province, district: draft.district,
      services: draft.services,
      description: draft.description, website: draft.website, email: draft.email,
      phone: draft.phone, emergencyPhone: draft.emergencyPhone, address: draft.address,
      submittedByName: byName, submittedByEmail: byEmail, submittedByPhone: draft.yourPhone,
    });
    if (ok) { setDone(true); setFormOpen(false); setStep(0); setDraft(emptyDraft); }
  };

  const contactRow = (icon: IcoName, label: string, value: string, href?: string) => (
    value ? (
      <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '4px 10px', fontSize: 13 }}>
        <span style={{ color: C.muted2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ico n={icon} size={13} color={C.muted3} />{label}
        </span>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: C.info, fontWeight: 600, wordBreak: 'break-word' }}>{value}</a>
          : <span style={{ color: C.heading2, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    ) : null
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0, color: C.navy }}>{tr.orgs.title}</h1>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 4, maxWidth: '70ch' }}>{tr.orgs.subtitle}</div>
        </div>
        <button onClick={openForm} className="hv-emergency" style={{
          background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
          padding: '0 18px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}><Ico n="plus" size={16} />{tr.orgs.addBtn}</button>
      </div>

      {/* AfetHUB claims no official affiliation (rules/03). */}
      <div style={{
        background: G.surfaceSoft, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.info}`,
        borderRadius: 10, padding: '11px 13px', fontSize: 12.5, color: C.heading2,
      }}>{tr.orgs.disclaimer}</div>

      {done && (
        <div className="anim-in" style={{
          background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 12, padding: 16,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.successText }}>{tr.orgs.doneTitle}</div>
          <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 4 }}>{tr.orgs.doneBody}</div>
        </div>
      )}

      {/* Compact step-by-step modal: three short screens instead of one long form
          (rules/04 §Forms — progressive disclosure on public emergency forms). */}
      {formOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: mob ? 'flex-end' : 'center', justifyContent: 'center', padding: mob ? 0 : 20 }}>
          <div onClick={closeForm} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.46)' }} />
          <div className="anim-in" role="dialog" aria-modal="true" aria-label={tr.orgs.formTitle} style={{
            position: 'relative', width: '100%', maxWidth: 560, maxHeight: mob ? '92vh' : '88vh', overflowY: 'auto',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: mob ? '16px 16px 0 0' : 14, boxShadow: '0 26px 60px rgba(16,42,67,.28)',
          }}>
            <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: G.heroRibbon }} />
            <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.borderFaint}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.orgs.formTitle}</div>
                  <div className="tnum" style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>
                    {tr.orgs.stepOf(step + 1, 3)} · {tr.orgs.stepNames[step]}
                  </div>
                </div>
                <button onClick={closeForm} aria-label={tr.orgs.cancel} style={{
                  width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 34px',
                }}><Ico n="close" size={16} /></button>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= step ? C.emergency : C.borderFaint }} />
                ))}
              </div>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {step === 0 && (
                <>
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>{tr.orgs.formIntro}</p>
                  <Field label={tr.orgs.fName} full>
                    <input name="organization-name" autoComplete="off" value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus style={inputStyle} />
                  </Field>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                    <Field label={tr.orgs.fKind}>
                      <select value={draft.kind} onChange={(e) => set('kind', e.target.value as OrgKind)} style={inputStyle}>
                        {ORG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </Field>
                    <Field label={tr.orgs.fScope}>
                      <select value={draft.scope} onChange={(e) => set('scope', e.target.value as OrgScope)} style={inputStyle}>
                        {ORG_SCOPES.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted2 }}>{tr.orgs.errOfficialClaim}</div>
                </>
              )}

              {step === 1 && (
                <>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                    <Field label={tr.orgs.fProvince}>
                      <select name="organization-province" autoComplete="off" value={draft.province} onChange={(e) => { set('province', e.target.value); set('district', ''); }} autoFocus style={inputStyle}>
                        <option value="">{tr.orgs.pickProvince}</option>
                        {PROVINCES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                      </select>
                    </Field>
                    <Field label={tr.orgs.fDistrict}>
                      <select name="organization-district" autoComplete="off" value={draft.district} onChange={(e) => set('district', e.target.value)} disabled={!draft.province} style={{ ...inputStyle, opacity: draft.province ? 1 : .6 }}>
                        <option value="">{draft.province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}</option>
                        {districtsOf(draft.province).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div>
                    <div style={{ ...labelText, marginBottom: 7 }}>{tr.orgs.fServices}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {SERVICE_TAGS.map((t) => {
                        const on = draft.services.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => set('services', on ? draft.services.filter((x) => x !== t) : [...draft.services, t])}
                            aria-pressed={on} style={{
                              background: on ? C.navy : C.surface, border: `1px solid ${on ? C.navy : C.borderSoft}`,
                              color: on ? '#fff' : C.heading2, borderRadius: 20, padding: '7px 12px',
                              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 36,
                            }}>{t}</button>
                        );
                      })}
                    </div>
                  </div>
                  <Field label={tr.orgs.fDescription} full>
                    <textarea name="organization-description" autoComplete="off" value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3} style={{ ...inputStyle, minHeight: 84 }} />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div style={eyebrow}>{tr.orgs.contactSection}</div>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                    <Field label={tr.orgs.fWebsite} full><input name="organization-website" autoComplete="off" value={draft.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" autoFocus style={inputStyle} /></Field>
                    <Field label={tr.orgs.fEmail}><input type="email" name="organization-email" autoComplete="off" value={draft.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} /></Field>
                    <Field label={tr.orgs.fPhone}><input name="organization-phone" autoComplete="off" value={draft.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} /></Field>
                    <Field label={tr.orgs.fEmergency}><input name="organization-emergency" autoComplete="off" value={draft.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} style={inputStyle} /></Field>
                    <Field label={tr.orgs.fAddress}><input name="organization-address" autoComplete="off" value={draft.address} onChange={(e) => set('address', e.target.value)} style={inputStyle} /></Field>
                  </div>
                  {loggedIn ? (
                    // Signed in: the submitter is already known, so we never ask again
                    // (rules/01 §Registration — never re-request name/email/city).
                    <div style={{ background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '11px 13px', fontSize: 12.5, color: C.heading2 }}>
                      {tr.orgs.submitterKnown(auth.profile?.fullName || auth.user?.email || '')}
                    </div>
                  ) : (
                    <>
                      <div style={{ ...eyebrow, marginTop: 6 }}>{tr.orgs.submitterSection}</div>
                      <div style={{ fontSize: 12, color: C.muted2, marginTop: -6 }}>{tr.orgs.submitterHint}</div>
                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                        <Field label={tr.orgs.fYourName} full><input name="submitter-name" autoComplete="name" value={draft.yourName} onChange={(e) => set('yourName', e.target.value)} style={inputStyle} /></Field>
                        <Field label={tr.orgs.fYourEmail}><input type="email" name="submitter-email" autoComplete="email" value={draft.yourEmail} onChange={(e) => set('yourEmail', e.target.value)} style={inputStyle} /></Field>
                        <Field label={tr.orgs.fYourPhone}><input name="submitter-phone" autoComplete="tel" value={draft.yourPhone} onChange={(e) => set('yourPhone', e.target.value)} style={inputStyle} /></Field>
                      </div>
                    </>
                  )}
                </>
              )}

              {err && (
                <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, color: C.errorText, borderRadius: 9, padding: '10px 12px', fontSize: 13.5 }}>{err}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 9, padding: '0 18px 18px', flexWrap: 'wrap' }}>
              {step > 0 && (
                <button onClick={() => { setErr(''); setStep((v) => v - 1); }} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
                  padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>{tr.orgs.back}</button>
              )}
              <button onClick={nextStep} className="hv-emergency" style={{
                flex: 1, minWidth: 150, background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
                borderRadius: 10, height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
              }}>{step === 2 ? tr.orgs.submit : tr.orgs.next}</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '0 12px', minHeight: 44, maxWidth: 460 }}>
          <Ico n="search" size={15} color={C.muted2} />
          {/* Chrome's heuristics happily autofill a bare text input — including a
              search box. Filters and third-party contact fields are explicitly opted
              out; only the submitter's own fields below advertise an autofill type. */}
          <input type="search" name="org-search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.orgs.searchPh} aria-label={tr.orgs.searchPh}
            style={{ border: 0, background: 'none', outline: 'none', fontSize: 14, color: C.navy, padding: '11px 0', width: '100%', minWidth: 0 }} />
        </label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={tr.orgs.allKinds} style={filterSelectStyle}>
            <option value="">{tr.orgs.allKinds}</option>
            {ORG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label={tr.orgs.allProvinces} style={filterSelectStyle}>
            <option value="">{tr.orgs.allProvinces}</option>
            {provinces.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Chip label={tr.orgs.onlyVerified} active={onlyVerified} onClick={() => setOnlyVerified((v) => !v)} accent={C.success} />
          <span style={{ flex: 1, minWidth: 4 }} />
          <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{tr.orgs.countLabel(visible.length, a.orgs.length)}</span>
        </div>
      </div>

      {visible.length > 0 ? (
        <div style={{ display: 'grid', gap: 13, gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))' }}>
          {visible.map((o) => {
            const pending = o.status === 'Pending verification';
            return (
              <article key={o.id} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderTop: `3px solid ${pending ? C.warning : C.success}`, borderRadius: 14, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 11, height: '100%',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{o.name}</div>
                    <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
                      {o.kind} · {o.scope === 'Ulusal' ? tr.orgs.national : [o.province, o.district].filter(Boolean).join(' / ') || o.scope}
                    </div>
                  </div>
                  <StatusBadge o={o} />
                </div>

                {o.isOfficial && (
                  <span style={{
                    alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11,
                    fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.info,
                    background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 5, padding: '3px 7px',
                  }}>{tr.orgs.officialBadge}</span>
                )}

                {o.description && <p style={{ fontSize: 13.5, color: C.text, margin: 0 }}>{o.description}</p>}

                {o.services.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {o.services.map((sv) => (
                      <span key={sv} style={{ fontSize: 12, color: C.heading2, background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 6, padding: '3px 8px' }}>{sv}</span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, borderTop: `1px solid ${C.borderFaint}` }}>
                  {contactRow('need', tr.orgs.website, o.website, o.website || undefined)}
                  {contactRow('user', tr.orgs.email, o.email, o.email ? `mailto:${o.email}` : undefined)}
                  {contactRow('track', tr.orgs.phone, o.phone, o.phone ? `tel:${o.phone.replace(/\s/g, '')}` : undefined)}
                  {contactRow('pending', tr.orgs.emergency, o.emergencyPhone, o.emergencyPhone ? `tel:${o.emergencyPhone.replace(/\s/g, '')}` : undefined)}
                  {contactRow('pin', tr.orgs.address, o.address)}
                </div>

                <div style={{ marginTop: 'auto', fontSize: 11.5, color: C.muted2 }}>
                  {pending ? tr.orgs.pendingNote : tr.orgs.addedAgo(o.createdLabel)}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.orgs.empty}</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.orgs.emptyBody}</div>
        </div>
      )}
    </div>
  );
}
