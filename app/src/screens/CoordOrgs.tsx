import { useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { orgEditableFrom } from '../data/repo';
import type { Organization, OrganizationSave, OrgKind, OrgScope, OrgStatus } from '../types';

// Coordinator screen: the organizations directory itself.
//
// Two different powers live here and they are kept apart on purpose:
//   * editing a record's fields — a correction, no claim about the institution
//   * verifying it — a claim that someone checked who these people are
// Merging them would mean fixing a phone number silently upgraded a record to
// "Doğrulandı", which is exactly what makes that badge worth anything (rules/02).
//
// Authorisation is RLS on `organizations` plus verify_organization()'s own
// is_coordinator() guard, not this screen being hard to reach (rules/03).

const KINDS: OrgKind[] = ['Kamu kurumu', 'Belediye', 'Dernek', 'Vakıf', 'Meslek odası', 'Gönüllü grubu', 'Diğer'];
const SCOPES: OrgScope[] = ['Ulusal', 'Bölgesel', 'İl', 'İlçe'];

const blank = (): OrganizationSave => ({
  name: '', kind: 'Dernek', scope: 'İl', province: '', district: '', services: [],
  description: '', website: '', email: '', phone: '', emergencyPhone: '', address: '',
});

const STATUS_TONE: Record<OrgStatus, { fg: string; bg: string; bd: string }> = {
  Verified: { fg: C.success, bg: '#EAF7EE', bd: '#BFE3CB' },
  'Pending verification': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Rejected: { fg: C.emergency, bg: C.errorSurface, bd: C.errorBorder },
};

const STATUS_LABEL: Record<OrgStatus, string> = {
  Verified: 'Doğrulandı', 'Pending verification': 'Doğrulama bekliyor', Rejected: 'Reddedildi',
};

type Filter = 'all' | OrgStatus;

export function CoordOrgs() {
  const a = useApp();
  const mob = a.device === 'mobile';

  const [editing, setEditing] = useState<string | null>(null); // id, or '' for new
  const [draft, setDraft] = useState<OrganizationSave>(blank());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const rows = a.orgs
    .filter((o) => filter === 'all' || o.status === filter)
    .slice()
    .sort((x, y) => {
      // Records awaiting a decision first — that is the work on this screen.
      const rank = (o: Organization) => (o.status === 'Pending verification' ? 0 : 1);
      return rank(x) - rank(y) || x.name.localeCompare(y.name, 'tr');
    });
  const countOf = (f: Filter) => (f === 'all' ? a.orgs.length : a.orgs.filter((o) => o.status === f).length);

  const openNew = () => { setDraft(blank()); setEditing(''); setErr(''); };
  const openEdit = (o: Organization) => { setDraft(orgEditableFrom(o)); setEditing(o.id); setErr(''); };
  const set = <K extends keyof OrganizationSave>(k: K, v: OrganizationSave[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) { setErr(tr.coordOrgs.errName); return; }
    setErr(''); setBusy(true);
    const ok = await a.saveOrganization(editing === '' ? null : editing, draft);
    setBusy(false);
    if (ok) setEditing(null);
  };

  const doVerify = async (id: string) => { await a.verifyOrganization(id, 'Verified', ''); };
  const doReject = async (id: string) => {
    if (rejectNote.trim().length < 5) { setErr(tr.coordOrgs.errReject); return; }
    setErr(''); setBusy(true);
    const ok = await a.verifyOrganization(id, 'Rejected', rejectNote.trim());
    setBusy(false);
    if (ok) { setRejecting(null); setRejectNote(''); }
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;
  const ghost = {
    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
    height: 42, padding: '0 13px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <span style={eyebrow}>{tr.nav.operations}</span>
          <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
            {tr.coordOrgs.title}
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '72ch' }}>{tr.coordOrgs.subtitle}</p>
        </div>
        <button onClick={openNew} className="hv-emergency" style={{
          display: 'flex', alignItems: 'center', gap: 7, background: G.emergencyBtn,
          border: '1px solid #BE2A31', color: '#fff', borderRadius: 10, height: 46,
          padding: '0 17px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}><Ico n="plus" size={16} />{tr.coordOrgs.add}</button>
      </div>

      {a.backend === 'local' && (
        <div style={{
          background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.coordOrgs.localNote}</div>
      )}

      {editing !== null && (
        <section style={{ ...card, borderTop: `3px solid ${C.navy}`, padding: mob ? 15 : 18 }}>
          <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 12px', color: C.navy }}>
            {editing === '' ? tr.coordOrgs.formNew : tr.coordOrgs.formEdit}
          </h2>
          {editing === '' && (
            <div style={{
              background: '#F2FBF5', border: '1px solid #BFE3CB', borderRadius: 9,
              padding: '10px 12px', fontSize: 13, color: '#136B37', fontWeight: 600, marginBottom: 12,
            }}>{tr.coordOrgs.directNotice}</div>
          )}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))', alignItems: 'start' }}>
            <Field label={tr.orgs.fName} full>
              <input value={draft.name} onChange={(e) => set('name', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fKind}>
              <select value={draft.kind} onChange={(e) => set('kind', e.target.value as OrgKind)} style={inputStyle}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label={tr.orgs.fScope}>
              <select value={draft.scope} onChange={(e) => set('scope', e.target.value as OrgScope)} style={inputStyle}>
                {SCOPES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label={tr.orgs.fProvince}>
              <select value={draft.province} onChange={(e) => { set('province', e.target.value); set('district', ''); }} style={inputStyle}>
                <option value="">{tr.coordOrgs.filterAll}</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label={tr.orgs.fDistrict}>
              <select value={draft.district} onChange={(e) => set('district', e.target.value)}
                disabled={!draft.province} style={{ ...inputStyle, color: draft.province ? C.navy : C.muted3 }}>
                <option value="">—</option>
                {districtsOf(draft.province).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label={tr.orgs.fServices} hint={tr.orgs.fServicesHint} full>
              <input value={draft.services.join(', ')}
                onChange={(e) => set('services', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
                style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fDescription} full>
              <textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={3}
                style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} />
            </Field>
            <Field label={tr.orgs.fWebsite}>
              <input value={draft.website} onChange={(e) => set('website', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fEmail}>
              <input value={draft.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fPhone}>
              <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fEmergency}>
              <input value={draft.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={tr.orgs.fAddress} full>
              <input value={draft.address} onChange={(e) => set('address', e.target.value)} style={inputStyle} />
            </Field>
          </div>
          {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600, marginTop: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={submit} disabled={busy} style={{
              background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
              height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            }}>{editing === '' ? tr.coordOrgs.saveNew : tr.coordOrgs.save}</button>
            <button onClick={() => setEditing(null)} style={{ ...ghost, height: 46 }}>{tr.coordOrgs.cancel}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'Pending verification', 'Verified', 'Rejected'] as Filter[]).map((f) => {
          const on = f === filter;
          const label = f === 'all' ? tr.coordOrgs.filterAll
            : f === 'Pending verification' ? tr.coordOrgs.filterPending
              : f === 'Verified' ? tr.coordOrgs.filterVerified : tr.coordOrgs.filterRejected;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: on ? C.navy : C.surface, color: on ? '#fff' : C.navy,
              border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
              height: 40, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{label} · {countOf(f)}</button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted2 }}>{tr.coordOrgs.countLabel(rows.length)}</span>
      </div>

      {rows.length === 0 && (
        <div style={{ ...card, padding: 26, textAlign: 'center', fontSize: 14, color: C.muted }}>{tr.coordOrgs.empty}</div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((o) => {
          const tone = STATUS_TONE[o.status];
          const pending = o.status === 'Pending verification';
          return (
            <div key={o.id} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Ico n="org" size={15} color={C.muted2} />
                    <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{o.name}</span>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, color: tone.fg, background: tone.bg,
                      border: `1px solid ${tone.bd}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
                    }}>{STATUS_LABEL[o.status]}</span>
                    {o.isOfficial && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                        color: C.info, background: '#EDF5FC', border: '1px solid #C9DEF2',
                        borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap',
                      }}>{tr.coordOrgs.officialTag}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
                    {[o.kind, o.scope, [o.district, o.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                  </div>
                  {(o.phone || o.email) && (
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
                      {[o.phone, o.email].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {pending && (
                    <button onClick={() => doVerify(o.id)} style={{
                      background: C.success, border: `1px solid ${C.success}`, color: '#fff', borderRadius: 10,
                      height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                    }}>{tr.coordOrgs.verify}</button>
                  )}
                  {o.status !== 'Rejected' && (
                    <button onClick={() => { setRejecting(o.id); setRejectNote(''); setErr(''); }}
                      style={{ ...ghost, color: C.emergency }}>{tr.coordOrgs.reject}</button>
                  )}
                  <button onClick={() => openEdit(o)} style={ghost}>{tr.coordOrgs.edit}</button>
                </div>
              </div>

              {rejecting === o.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${C.borderFaint}`, paddingTop: 10 }}>
                  <span style={labelText}>{tr.coordOrgs.rejectNote}</span>
                  <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2}
                    placeholder={tr.coordOrgs.rejectNotePh} style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }} />
                  {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{err}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => doReject(o.id)} disabled={busy} style={{
                      background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
                      height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                    }}>{tr.coordOrgs.rejectConfirm}</button>
                    <button onClick={() => { setRejecting(null); setErr(''); }} style={ghost}>{tr.coordOrgs.cancel}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12.5, color: C.muted3, margin: 0, maxWidth: '80ch' }}>{tr.coordOrgs.verifyNote}</p>
    </div>
  );
}
