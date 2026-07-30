import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, eyebrow, Field } from '../ui';
import { PROVINCES } from '../data/trLocations';
import type { ProfileInput } from '../types';

// "Hesabım" — the account page.
//
// The account is optional by design (CLAUDE.md §Primary Product Rule): everything a
// visitor can do without one still works. Its only job is to hold contact details so
// they are not retyped, and to record which institution the person belongs to.
//
// Two things are deliberately read-only here:
//   role        — platform authority. Only an admin changes it (rules/03).
//   orgVerified — a coordinator confirms an affiliation; self-declaring it would make
//                 the badge worthless. Changing the organization resets it.
export function Account() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const p = auth.profile;

  const [form, setForm] = useState<ProfileInput>({
    fullName: '', phone: '', city: '', orgId: null, orgTitle: '',
  });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Fill from the loaded profile once it arrives. Never overwrite what the user is
  // currently typing: only sync when the identity changes.
  useEffect(() => {
    if (!p) return;
    setForm({
      fullName: p.fullName, phone: p.phone, city: p.city,
      orgId: p.orgId, orgTitle: p.orgTitle,
    });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: mob ? 15 : 18,
  } as const;
  const h2 = { fontSize: 16, fontWeight: 700, margin: 0, color: C.navy } as const;

  // Not signed in: explain rather than gate silently, and never imply an account is
  // required to contribute.
  if (!auth.user) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span style={eyebrow}>{tr.header.account}</span>
          <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.account.needAuthTitle}</h1>
          <p style={{ fontSize: 14.5, color: C.text, margin: '8px 0 0' }}>{tr.account.needAuthBody}</p>
        </div>
        {auth.enabled ? (
          <button onClick={() => auth.openModal('signIn')} style={{
            alignSelf: 'flex-start', background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
            borderRadius: 10, height: 48, padding: '0 18px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr.account.signIn}</button>
        ) : (
          <div style={{
            background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
            borderRadius: 10, padding: '11px 13px',
          }}>
            <b style={{ fontSize: 13.5, color: C.warningText }}>{tr.account.localTitle}</b>
            <div style={{ fontSize: 13, color: C.heading2, marginTop: 2 }}>{tr.account.localBody}</div>
          </div>
        )}
      </div>
    );
  }

  const org = form.orgId ? a.orgs.find((o) => o.id === form.orgId) ?? null : null;
  const orgChanged = !!p && p.orgId !== form.orgId;
  const roleLabel = p?.role === 'admin' ? tr.auth.roleAdminLabel
    : p?.role === 'coordinator' ? tr.auth.roleCoordinatorLabel
      : tr.auth.roleVolunteerLabel;

  const submit = async () => {
    if (!form.fullName.trim()) { setErr(tr.account.errName); setSaved(false); return; }
    setErr('');
    const ok = await auth.updateProfile(form);
    setSaved(ok);
    if (!ok) setErr(tr.account.saveFailed);
    else a.showToast(tr.account.saved);
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={eyebrow}>{tr.header.account}</span>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.account.title}</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '78ch' }}>{tr.account.subtitle}</p>
      </div>

      <section style={card}>
        <h2 style={h2}>{tr.account.sectionPerson}</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 12 }}>
          <Field label={tr.account.fName}>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              name="profile-name" autoComplete="name" style={inputStyle} />
          </Field>
          <Field label={tr.account.fEmail} hint={`· ${tr.account.fEmailNote}`}>
            <input value={auth.user.email ?? ''} readOnly disabled
              style={{ ...inputStyle, background: C.canvas, color: C.muted }} />
          </Field>
          <Field label={tr.account.fPhone}>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              name="profile-phone" autoComplete="tel" inputMode="tel" style={inputStyle} />
          </Field>
          <Field label={tr.account.fCity}>
            <select value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              name="profile-city" style={inputStyle}>
              <option value="">—</option>
              {PROVINCES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>{tr.account.sectionOrg}</h2>
        <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>{tr.account.orgNote}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 12 }}>
          <Field label={tr.account.fOrg} full>
            <select value={form.orgId ?? ''} onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value || null }))}
              name="profile-organization" style={inputStyle}>
              <option value="">{tr.account.fOrgNone}</option>
              {a.orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          {form.orgId && (
            <Field label={tr.account.fOrgTitle} full>
              <input value={form.orgTitle} onChange={(e) => setForm((f) => ({ ...f, orgTitle: e.target.value }))}
                placeholder={tr.account.fOrgTitlePh} name="profile-org-title" autoComplete="off" style={inputStyle} />
            </Field>
          )}
        </div>

        {org && (
          <div style={{
            marginTop: 12, background: C.canvas, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${p?.orgVerified && !orgChanged ? C.success : C.warning}`,
            borderRadius: 10, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ paddingTop: 1 }}>
              <Ico n={p?.orgVerified && !orgChanged ? 'verified' : 'pending'} size={16}
                color={p?.orgVerified && !orgChanged ? C.success : C.warning} />
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.navy }}>{org.name}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                {org.kind} · {org.scope === 'Ulusal' ? tr.orgs.national : [org.province, org.district].filter(Boolean).join(' / ')}
              </div>
              {/* Status is carried by text, not colour alone (rules/04 §Accessibility). */}
              <div style={{
                fontSize: 12.5, fontWeight: 700, marginTop: 5,
                color: p?.orgVerified && !orgChanged ? C.successText : C.warningText,
              }}>
                {p?.orgVerified && !orgChanged ? tr.account.orgVerified : tr.account.orgPending}
              </div>
              {orgChanged && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{tr.account.orgChangeNote}</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>{tr.account.sectionRole}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
            color: C.navy, background: G.chip, border: `1px solid ${C.borderSoft}`,
            borderRadius: 20, padding: '5px 12px',
          }}><Ico n="user" size={14} color={C.muted} />{roleLabel}</span>
          <span style={{ fontSize: 12.5, color: C.muted }}>{tr.account.roleNote}</span>
        </div>
      </section>

      {err && (
        <div role="alert" style={{
          background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 10,
          padding: '10px 13px', fontSize: 13.5, color: C.errorText, fontWeight: 600,
        }}>{err}</div>
      )}
      {saved && !err && (
        <div style={{
          background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 10,
          padding: '10px 13px', fontSize: 13.5, color: C.successText, fontWeight: 600,
        }}>{tr.account.saved}</div>
      )}

      <div>
        <button onClick={() => void submit()} disabled={auth.working} style={{
          background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
          height: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 600,
          cursor: auth.working ? 'default' : 'pointer', opacity: auth.working ? .7 : 1,
        }}>{auth.working ? tr.auth.working : tr.account.save}</button>
      </div>
    </div>
  );
}
