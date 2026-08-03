import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, eyebrow, Field } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { DIAL_COUNTRIES, dialLabel } from '../data/dialCodes';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { supabase } from '../data/supabaseClient';
import { toWebp, AVATAR_MAX_EDGE, ImageError } from '../imageUpload';
import { DEFAULT_DIAL, splitPhone, joinPhone } from '../util';
import type { ProfileInput } from '../types';

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase('tr') || '?';
}

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
    fullName: '', phone: '', city: '', district: '', orgId: null, orgTitle: '',
  });
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const photoRef = useRef<HTMLInputElement | null>(null);

  // Password change is a self-contained action (its own inputs, its own button),
  // independent of the profile-save form below.
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const changePassword = async () => {
    setPwErr(''); setPwOk(false);
    if (pwNew.length < 6) { setPwErr(tr.account.pwErrShort); return; }
    if (pwNew !== pwNew2) { setPwErr(tr.account.pwErrMismatch); return; }
    const r = await auth.changePassword(pwCur, pwNew);
    if (r === 'bad-current') { setPwErr(tr.account.pwErrCurrent); return; }
    if (r === 'error') { setPwErr(tr.account.pwErrGeneric); return; }
    setPwOk(true); setPwCur(''); setPwNew(''); setPwNew2('');
  };

  // Fill from the loaded profile once it arrives. Never overwrite what the user is
  // currently typing: only sync when the identity changes.
  useEffect(() => {
    if (!p) return;
    const split = splitPhone(p.phone);
    setDial(split.dial);
    setForm({
      fullName: p.fullName, phone: split.rest, city: p.city, district: p.district,
      orgId: p.orgId, orgTitle: p.orgTitle,
    });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same pipeline as every other image in the product: decode, cap the long edge,
  // re-encode WebP (which also drops EXIF/GPS), then upload. Profile photos used to be
  // stored exactly as the phone produced them.
  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!supabase || !auth.user) { setPhotoErr(tr.account.photoNeedsBackend); return; }
    setPhotoErr(''); setPhotoBusy(true);
    try {
      const { blob } = await toWebp(file, AVATAR_MAX_EDGE, 0.85);
      const path = `${auth.user.id}/${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp', upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await auth.setAvatar(data.publicUrl);
    } catch (e) {
      setPhotoErr(e instanceof ImageError ? tr.account.photoFailed : tr.account.photoFailed);
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

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
    const ok = await auth.updateProfile({ ...form, phone: joinPhone(dial, form.phone) });
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

      {/* Profile photo. Same conversion pipeline as every other image in the product. */}
      <section style={card}>
        <h2 style={h2}>{tr.account.sectionPhoto}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{
            width: 72, height: 72, flex: '0 0 72px', borderRadius: '50%', overflow: 'hidden',
            border: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: p?.avatarUrl ? C.surface : G.chip, color: C.text, fontSize: 24, fontWeight: 700,
          }}>
            {p?.avatarUrl
              ? <img src={p.avatarUrl} alt="" width={72} height={72}
                  style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }} />
              : initials(form.fullName || auth.user.email || '')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200, flex: '1 1 240px' }}>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif"
              style={{ display: 'none' }} onChange={(e) => void onPickPhoto(e.target.files?.[0])} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => photoRef.current?.click()} disabled={photoBusy} className="hv-navy" style={{
                background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
                height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600,
                cursor: photoBusy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
              }}>
                <Ico n="plus" size={15} color={C.muted} />
                {photoBusy ? tr.account.photoUploading : p?.avatarUrl ? tr.account.photoChange : tr.account.photoAdd}
              </button>
              {p?.avatarUrl && !photoBusy && (
                <button type="button" onClick={() => void auth.setAvatar('')} style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.muted, borderRadius: 9,
                  height: 42, padding: '0 13px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}>{tr.account.photoRemove}</button>
              )}
            </div>
            <span style={{ fontSize: 11.5, color: C.muted2, lineHeight: 1.45 }}>{tr.account.photoHint}</span>
            {photoErr && (
              <span role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: C.errorText }}>{photoErr}</span>
            )}
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>{tr.account.sectionPerson}</h2>
        {/* Every label is one line and every hint sits BELOW its input, so with
            alignItems:'start' the inputs land on the same line. The e-mail hint used to
            live inside the label, wrapping it to two lines and pushing that field down. */}
        <div style={{
          display: 'grid', gap: 12, marginTop: 12, alignItems: 'start',
          gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))',
        }}>
          <Field label={tr.account.fName}>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              name="profile-name" autoComplete="name" style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.heading2 }}>{tr.account.fEmail}</span>
            <input value={auth.user.email ?? ''} readOnly disabled
              style={{ ...inputStyle, background: C.canvas, color: C.muted }} />
            <span style={{ fontSize: 11.5, color: C.muted2 }}>{tr.account.fEmailNote}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.heading2 }}>{tr.account.fPhone}</span>
            {/* Dial code is a separate control so the number field holds only digits.
                Stored value stays one string: "+90 5xx …". */}
            <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0,1fr)', gap: 8 }}>
              <Picker value={dial} onChange={setDial} ariaLabel={tr.account.fPhoneCode} searchable
                options={DIAL_COUNTRIES.map((c) => ({ value: c.dial, label: dialLabel(c) }))} />
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                name="profile-phone" autoComplete="tel-national" inputMode="tel"
                placeholder="5xx xxx xx xx" style={inputStyle} />
            </div>
          </div>
          {/* City splits into il + ilçe once a province is picked — the district list
              only exists after the province is known. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.heading2 }}>{tr.account.fCity}</span>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: form.city ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr' }}>
              <Picker value={form.city} ariaLabel={tr.account.fCity}
                onChange={(x) => setForm((f) => ({ ...f, city: x, district: '' }))}
                placeholder={tr.orgs.pickProvince} options={toOptions(PROVINCES)} />
              {form.city && (
                <Picker value={form.district} ariaLabel={tr.orgs.fDistrict}
                  onChange={(x) => setForm((f) => ({ ...f, district: x }))}
                  placeholder={tr.orgs.allDistricts} options={toOptions(districtsOf(form.city))} />
              )}
            </div>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>{tr.account.sectionOrg}</h2>
        <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>{tr.account.orgNote}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 12 }}>
          <Field label={tr.account.fOrg} full>
            <Picker value={form.orgId ?? ''} ariaLabel={tr.account.fOrg}
              onChange={(x) => setForm((f) => ({ ...f, orgId: x || null }))}
              options={[{ value: '', label: tr.account.fOrgNone }, ...a.orgs.map((o) => ({ value: o.id, label: o.name }))]} />
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

      {/* Password change. Independent of the profile save; re-verifies the current
          password server-side before applying (rules/03). */}
      <section style={card}>
        <h2 style={h2}>{tr.account.sectionPassword}</h2>
        <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>{tr.account.pwNote}</p>
        <div style={{
          display: 'grid', gap: 12, marginTop: 12, alignItems: 'start',
          gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))',
        }}>
          <Field label={tr.account.pwCurrent} full>
            <input value={pwCur} onChange={(e) => setPwCur(e.target.value)} type="password"
              autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
          </Field>
          <Field label={tr.account.pwNew}>
            <input value={pwNew} onChange={(e) => setPwNew(e.target.value)} type="password"
              autoComplete="new-password" placeholder="••••••••" style={inputStyle} />
          </Field>
          <Field label={tr.account.pwConfirm}>
            <input value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} type="password"
              autoComplete="new-password" placeholder="••••••••" style={inputStyle}
              onKeyDown={(e) => { if (e.key === 'Enter') void changePassword(); }} />
          </Field>
        </div>
        {pwOk && (
          <div style={{ marginTop: 12, background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: C.successText, fontWeight: 600 }}>{tr.account.pwChanged}</div>
        )}
        {pwErr && (
          <div role="alert" style={{ marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: C.errorText, fontWeight: 600 }}>{pwErr}</div>
        )}
        <div style={{ marginTop: 12 }}>
          <button onClick={() => void changePassword()} disabled={auth.working} style={{
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
            height: 44, padding: '0 16px', fontSize: 14, fontWeight: 600,
            cursor: auth.working ? 'default' : 'pointer', opacity: auth.working ? .7 : 1,
          }}>{auth.working ? tr.auth.working : tr.account.pwChange}</button>
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
