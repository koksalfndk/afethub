import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, DISASTER_ICON, inputStyle, labelText, eyebrow, Field, LiveDot } from '../ui';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { agoMinutes } from '../util';
import type { Disaster, DisasterInput, DisasterType } from '../types';

// Coordinator screen: the operations themselves.
//
// A new operation is published the moment it is saved — the coordinator creating it is
// the reviewer, so there is nothing to queue it for (the same reasoning as a
// coordinator-filed need). The screen says so before the save, not after.
//
// Authorisation is RLS on `disasters`, not this screen being hard to reach
// (rules/03 §Server-Side Authorization).
const TYPES: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];
const STATUSES: Disaster['status'][] = ['Active', 'Resolved', 'Archived'];

const blank = (): DisasterInput => ({
  name: '', type: 'Wildfire', province: '', district: '',
  status: 'Active', situation: '', openedByOrgId: null,
});

// A figure that cannot be typed, with a way through to the records behind it. Shown as
// a field so it sits in the same grid as the editable ones, but it is a button: the
// number is only meaningful if you can see who it counts.
function CountField({ label, value, hint, cta, onOpen }: {
  label: string; value: number; hint: string; cta: string; onOpen: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelText}>{label}</span>
      <button onClick={onOpen} className="hv-navy" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
        minHeight: 46, padding: '0 13px', cursor: 'pointer', textAlign: 'left', width: '100%',
      }}>
        <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{value}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.info }}>{cta}</span>
      </button>
      <span style={{ fontSize: 11.5, color: C.muted2 }}>{hint}</span>
    </div>
  );
}

export function CoordDisasters() {
  const a = useApp();
  const mob = a.device === 'mobile';

  const [editing, setEditing] = useState<string | null>(null);  // id, or '' for new
  const [draft, setDraft] = useState<DisasterInput>(blank());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const list = (a.snap?.disasters ?? []).slice().sort((x, y) => {
    const rank = (d: Disaster) => (d.status === 'Active' ? 0 : 1);
    return rank(x) - rank(y) || agoMinutes(x.updatedLabel) - agoMinutes(y.updatedLabel);
  });

  const openNew = () => { setDraft(blank()); setEditing(''); setErr(''); };
  const openEdit = (d: Disaster) => {
    // `region` is derived from province + district, so the district is read back out of
    // it rather than stored twice and allowed to drift.
    const district = d.region.split('·')[0].split(',')[0].trim();
    setDraft({
      name: d.name, type: d.type, province: d.province,
      district: district === d.province ? '' : district,
      status: d.status, situation: d.situation, openedByOrgId: d.openedByOrgId,
    });
    setEditing(d.id); setErr('');
  };
  const set = <K extends keyof DisasterInput>(k: K, v: DisasterInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) { setErr(tr.coordDisasters.errName); return; }
    if (!draft.province) { setErr(tr.coordDisasters.errProvince); return; }
    if (!draft.situation.trim()) { setErr(tr.coordDisasters.errSituation); return; }
    setErr(''); setBusy(true);
    const ok = await a.saveDisaster(editing === '' ? null : editing, draft);
    setBusy(false);
    if (ok) setEditing(null);
  };

  // The saved record behind the open form: the volunteer figures are read from it, not
  // from the draft, because they are not editable fields.
  const editingDisaster = editing ? list.find((d) => d.id === editing) ?? null : null;
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;
  // Only verified organizations may be named as the initiator: a pending record is an
  // unchecked claim, and this line appears on a public page.
  const orgOptions = a.orgs.filter((o) => o.status === 'Verified');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <span style={eyebrow}>{tr.nav.operations}</span>
          <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.coordDisasters.title}</h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '5px 0 0', maxWidth: '76ch' }}>{tr.coordDisasters.subtitle}</p>
        </div>
        <button onClick={openNew} style={{
          background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
          height: 46, padding: '0 17px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7,
        }}><Ico n="plus" size={16} color="#fff" />{tr.coordDisasters.add}</button>
      </div>

      {a.backend === 'local' && (
        <div style={{
          background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.coordDisasters.localNote}</div>
      )}

      {editing !== null && (
        <section style={{ ...card, borderTop: `3px solid ${C.navy}`, padding: mob ? 15 : 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.navy }}>
            {editing === '' ? tr.coordDisasters.formNew : tr.coordDisasters.formEdit}
          </h2>
          {editing === '' && (
            <p style={{
              margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: C.successText,
              background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 9, padding: '8px 11px',
            }}>{tr.coordDisasters.directNotice}</p>
          )}

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', marginTop: 13, alignItems: 'start' }}>
            <Field label={tr.coordDisasters.fName} full>
              <input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={90}
                placeholder={tr.coordDisasters.fNamePh} autoComplete="off" style={inputStyle} />
            </Field>
            <Field label={tr.coordDisasters.fType}>
              <select value={draft.type} onChange={(e) => set('type', e.target.value as DisasterType)} style={inputStyle}>
                {TYPES.map((t) => <option key={t} value={t}>{disasterTypeLabel[t]}</option>)}
              </select>
            </Field>
            <Field label={tr.coordDisasters.fStatus}>
              <select value={draft.status} onChange={(e) => set('status', e.target.value as Disaster['status'])} style={inputStyle}>
                {STATUSES.map((v) => <option key={v} value={v}>{tr.coordDisasters.statusLabels[v]}</option>)}
              </select>
            </Field>
            <Field label={tr.coordDisasters.fProvince}>
              <select value={draft.province} onChange={(e) => { set('province', e.target.value); set('district', ''); }} style={inputStyle}>
                <option value="">{tr.orgs.pickProvince}</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={tr.coordDisasters.fDistrict}>
              <select value={draft.district} onChange={(e) => set('district', e.target.value)} disabled={!draft.province}
                style={{ ...inputStyle, opacity: draft.province ? 1 : .6 }}>
                <option value="">{draft.province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}</option>
                {districtsOf(draft.province).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label={tr.coordDisasters.fSituation} full>
              <textarea value={draft.situation} onChange={(e) => set('situation', e.target.value)} rows={3}
                placeholder={tr.coordDisasters.fSituationPh} style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }} />
            </Field>
            {/* Read-only, and they open the people behind them. These are counts of
                approved volunteer applications (migration 0017): a coordinator typing
                "168" here published a figure with nobody behind it, which is the same
                mistake as a hand-entered delivery total (CLAUDE.md §Source of Truth). */}
            <CountField label={tr.coordDisasters.fVolunteers} value={editingDisaster?.volunteers ?? 0}
              hint={tr.coordDisasters.volunteersDerived}
              cta={tr.coordDisasters.openVolunteers}
              onOpen={() => a.openVolunteers(editing || null, 'approved')} />
            <CountField label={tr.coordDisasters.fOnShift} value={editingDisaster?.onShift ?? 0}
              hint={tr.coordDisasters.onShiftDerived}
              cta={tr.coordDisasters.openOnShift}
              onOpen={() => a.openVolunteers(editing || null, 'onShift')} />
            <Field label={tr.coordDisasters.fOpenedBy} hint={`· ${tr.coordDisasters.openedByHint}`} full>
              <select value={draft.openedByOrgId ?? ''} onChange={(e) => set('openedByOrgId', e.target.value || null)} style={inputStyle}>
                <option value="">
                  {editingDisaster?.openedByCommunity ? tr.coordDisasters.fOpenedByCommunity : tr.coordDisasters.fOpenedBySelf}
                </option>
                {orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ ...labelText, color: C.muted2, fontWeight: 500, marginTop: 10, fontSize: 12 }}>
            {editing === ''
              ? tr.coordDisasters.slugNewNote
              : tr.coordDisasters.slugNote(list.find((d) => d.id === editing)?.slug ?? '')}
          </div>

          {err && (
            <div role="alert" style={{
              marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`,
              borderRadius: 9, padding: '9px 12px', fontSize: 13, color: C.errorText, fontWeight: 600,
            }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => void submit()} disabled={busy} style={{
              background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
              height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1,
            }}>{busy ? tr.auth.working : editing === '' ? tr.coordDisasters.save : tr.coordDisasters.saveEdit}</button>
            <button onClick={() => setEditing(null)} className="hv-navy" style={{
              background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
              height: 46, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>{tr.coordDisasters.cancel}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LiveDot /><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.navy }}>{tr.dash.opsTitle}</h2>
        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted2 }}>{tr.coordDisasters.countLabel(list.length)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((d) => {
          const live = d.status === 'Active';
          const org = d.openedByOrgId ? a.orgs.find((o) => o.id === d.openedByOrgId) ?? null : null;
          return (
            <article key={d.id} style={{
              ...card, borderLeft: `3px solid ${live ? C.emergency : C.success}`, padding: 14,
              display: 'grid', gridTemplateColumns: mob ? '1fr' : 'auto minmax(0,1fr) auto', gap: 13, alignItems: 'center',
              opacity: live ? 1 : .86,
            }}>
              <span style={{
                width: 34, height: 34, flex: '0 0 34px', borderRadius: 10, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: live ? C.errorSurface : '#EAF7EF',
                border: `1px solid ${live ? C.errorBorder : '#C9E9D6'}`,
              }}><Ico n={DISASTER_ICON[d.type]} size={17} color={live ? C.emergency : C.success} /></span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{d.name}</span>
                  {/* Status as a word, not only a colour (rules/04 §Accessibility). */}
                  <span style={{
                    fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
                    color: live ? C.emergency : C.successText,
                    background: live ? C.errorSurface : '#EAF7EF',
                    border: `1px solid ${live ? C.errorBorder : '#C9E9D6'}`,
                  }}>{tr.coordDisasters.statusLabels[d.status]}</span>
                </div>
                <div className="tnum" style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>
                  {disasterTypeLabel[d.type]} · {d.region} · {tr.common.updated(d.updatedLabel)}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {tr.coordDisasters.startedBy}: {org?.name
                    ?? (d.openedByCommunity ? tr.coordDisasters.fOpenedByCommunity : tr.coordDisasters.fOpenedBySelf)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => openEdit(d)} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
                  height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}>{tr.coordDisasters.edit}</button>
                <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
                  height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}>{tr.coordDisasters.openPublic}</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
