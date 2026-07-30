import { useEffect } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { PROVINCES } from '../data/trLocations';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { Field, inputStyle, eyebrow, StatusBadge } from '../ui';
import { PhotoUploader } from '../components/PhotoUploader';
import { defaultEta, halfHourSlots, UNIT_PRESETS } from '../util';

export function Report({ inModal = false }: { inModal?: boolean }) {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;

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

  return (
    <div style={wrap}>
      {!inModal && <button onClick={() => a.go('disaster', { tab: 'needs' })} style={{ background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>{tr.report.backToNeeds}</button>}
      {!inModal && <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '8px 0 4px' }}>{tr.report.title}</h1>}
      {!inModal && <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 18px' }}>{tr.report.intro}</p>}

      <div style={{ background: C.surface, border: inModal ? '0' : `1px solid ${C.border}`, borderRadius: 12, padding: inModal ? 0 : 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 10 }}>{tr.report.sectionDelivery}</div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
            <Field label={tr.report.fields.need} full>
              <select value={f.needId} onChange={(e) => a.setForm('needId', e.target.value)} style={inputStyle}>
                {needOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label={tr.report.fields.quantity}>
              <input value={f.qty} onChange={(e) => a.setForm('qty', e.target.value)} type="number" min={1} placeholder="30" style={inputStyle} />
            </Field>
            <Field label={tr.report.fields.unit}>
              <input value={f.unit} onChange={(e) => a.setForm('unit', e.target.value)} placeholder="kutu" list="unit-presets" style={inputStyle} />
              <datalist id="unit-presets">{UNIT_PRESETS.map((u) => <option key={u} value={u} />)}</datalist>
            </Field>
            <Field label={tr.report.fields.location}>
              <select value={f.loc} onChange={(e) => a.setForm('loc', e.target.value)} style={inputStyle}>
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
            <Field label={tr.report.fields.notes} hint={tr.report.fields.optional} full>
              <textarea value={f.notes} onChange={(e) => a.setForm('notes', e.target.value)} rows={3} placeholder={tr.report.fields.notesPh} style={{ ...inputStyle, minHeight: undefined, resize: 'vertical' }} />
            </Field>
            <PhotoUploader value={f.photoUrl} onChange={(url) => a.setForm('photoUrl', url)} />
          </div>
        </div>

        {!loggedIn && (
          <>
            <div style={{ height: 1, background: C.border }} />
            <div>
              <div style={{ ...eyebrow, marginBottom: 10 }}>{tr.report.sectionContact}</div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
                <Field label={tr.report.fields.fullName}><input value={f.name} onChange={(e) => a.setForm('name', e.target.value)} placeholder="Ayşe Yılmaz" style={inputStyle} /></Field>
                <Field label={tr.report.fields.email}><input value={f.email} onChange={(e) => a.setForm('email', e.target.value)} type="email" placeholder="siz@example.com" style={inputStyle} /></Field>
                <Field label={tr.report.fields.phone}><input value={f.phone} onChange={(e) => a.setForm('phone', e.target.value)} placeholder="+90 5xx xxx xx xx" style={inputStyle} /></Field>
                <Field label={tr.report.fields.city}>
                  <select name="city" autoComplete="address-level1" value={f.city} onChange={(e) => a.setForm('city', e.target.value)} style={inputStyle}>
                    <option value="">{tr.orgs.pickProvince}</option>
                    {PROVINCES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </>
        )}

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: 13 }}>
          <input checked={f.confirm} onChange={(e) => a.setForm('confirm', e.target.checked)} type="checkbox" style={{ width: 18, height: 18, marginTop: 1, accentColor: C.navy }} />
          <span style={{ fontSize: 13.5, color: C.heading2 }}>{tr.report.confirm}</span>
        </label>

        {a.formError && (
          <div style={{ display: 'flex', gap: 10, background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 10, padding: '12px 13px' }}>
            <span style={{ color: C.emergency, fontWeight: 700, fontSize: 14 }}>!</span>
            <span style={{ fontSize: 13.5, color: C.errorText }}>{a.formError}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={a.submitDelivery} className="hv-emergency" style={{ background: C.emergency, border: `1px solid ${C.emergency}`, color: '#fff', borderRadius: 10, padding: '13px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.report.submit}</button>
          <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.report.pendingNote}</span>
        </div>
      </div>
    </div>
  );
}
