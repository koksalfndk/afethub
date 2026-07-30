import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow, Field } from '../ui';
import { maskEmail, maskPhone } from '../util';
import type { StaffRole, VolunteerApplication, VolunteerStatus } from '../types';

// Coordinator/admin screen: who can act on the platform, and who has offered to help.
//
// The two sections share a screen because they answer the same question — "who is
// involved" — but they are NOT the same thing, and the copy says so: staff have accounts
// and powers; a volunteer application is a person a coordinator agreed to call.
//
// Granting a role is admin-only. The screen renders for coordinators too (they see the
// volunteer queue), but every staff action is refused by is_admin() inside the RPC.
// Hiding the form would not be authorization (rules/03).

const ROLES: StaffRole[] = ['coordinator', 'admin'];

const V_TONE: Record<VolunteerStatus, { fg: string; bg: string; bd: string }> = {
  'Pending review': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Approved: { fg: C.success, bg: '#EAF7EE', bd: '#BFE3CB' },
  'On hold': { fg: C.info, bg: '#EDF5FC', bd: '#C9DEF2' },
  Rejected: { fg: C.emergency, bg: C.errorSurface, bd: C.errorBorder },
  Withdrawn: { fg: C.muted, bg: C.chipNavyBg, bd: C.borderSoft },
};

const ghost = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  height: 42, padding: '0 13px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
};

function VolunteerCard({ app }: { app: VolunteerApplication }) {
  const a = useApp();
  const open = app.status === 'Pending review' || app.status === 'On hold';
  const [mode, setMode] = useState<'hold' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const tone = V_TONE[app.status];

  const decide = async (status: VolunteerStatus) => {
    if ((status === 'Rejected' || status === 'On hold') && note.trim().length < 5) {
      setErr(tr.coordVolunteers.errReason); return;
    }
    setErr(''); setBusy(true);
    const ok = await a.reviewVolunteer(app.id, status, note.trim());
    setBusy(false);
    if (ok) { setMode(null); setNote(''); }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Ico n="people" size={15} color={C.muted2} />
            <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{app.fullName}</span>
            <span style={{
              fontSize: 11.5, fontWeight: 700, color: tone.fg, background: tone.bg,
              border: `1px solid ${tone.bd}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
            }}>{tr.coordVolunteers.statusLabels[app.status]}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
            {[app.disasterName || tr.coordVolunteers.generalPool,
              [app.district, app.province].filter(Boolean).join(', '),
              app.createdLabel].filter(Boolean).join(' · ')}
          </div>
          {/* Masked even for a coordinator: a queue does not need a dialable number to
              make the decision (rules/03 §Contact Information). */}
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
            {[maskPhone(app.phone), maskEmail(app.email)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {app.skills.length > 0 && (
        <div>
          <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordVolunteers.skillsLabel}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
            {app.skills.map((s) => (
              <span key={s} style={{
                fontSize: 12, fontWeight: 600, color: C.heading2, background: G.chip,
                border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '4px 10px',
              }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {app.availability && (
        <div style={{ fontSize: 13, color: C.muted }}>
          <strong style={{ color: C.navy, fontWeight: 600 }}>{tr.coordVolunteers.availabilityLabel}:</strong> {app.availability}
        </div>
      )}

      {app.note && (
        <div style={{ background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '10px 12px' }}>
          <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordVolunteers.noteLabel}</div>
          <p style={{ fontSize: 13.5, color: C.text, margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{app.note}</p>
        </div>
      )}

      {app.reviewNote && (
        <div style={{ fontSize: 13, color: C.muted }}>
          <strong style={{ color: C.navy, fontWeight: 600 }}>{tr.coordVolunteers.reviewNoteLabel}:</strong> {app.reviewNote}
        </div>
      )}

      {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{err}</div>}

      {open && mode === null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => decide('Approved')} disabled={busy} style={{
            background: C.success, border: `1px solid ${C.success}`, color: '#fff', borderRadius: 10,
            height: 42, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr.coordVolunteers.approve}</button>
          <button onClick={() => { setMode('hold'); setErr(''); }} style={ghost}>{tr.coordVolunteers.hold}</button>
          <button onClick={() => { setMode('reject'); setErr(''); }} style={{ ...ghost, color: C.emergency }}>{tr.coordVolunteers.reject}</button>
        </div>
      )}

      {open && mode !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelText}>{tr.coordVolunteers.reasonLabel}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder={tr.coordVolunteers.reasonPh} style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => decide(mode === 'hold' ? 'On hold' : 'Rejected')} disabled={busy} style={{
              background: mode === 'hold' ? G.navyBtn : G.emergencyBtn,
              border: `1px solid ${mode === 'hold' ? C.navy : '#BE2A31'}`, color: '#fff', borderRadius: 10,
              height: 42, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{mode === 'hold' ? tr.coordVolunteers.hold : tr.coordVolunteers.reject}</button>
            <button onClick={() => { setMode(null); setErr(''); }} style={ghost}>{tr.coordVolunteers.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CoordStaff() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const isAdmin = auth.profile?.role === 'admin';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('coordinator');
  const [note, setNote] = useState('');
  const [orgId, setOrgId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [vTab, setVTab] = useState<'pending' | 'approved' | 'other'>('pending');
  const verifiedOrgs = a.orgs.filter((o) => o.status === 'Verified');

  useEffect(() => { a.reloadStaff(); a.reloadVolunteers(); }, []);

  const grant = async () => {
    if (!email.includes('@') || email.trim().length < 5) { setErr(tr.coordStaff.errEmail); return; }
    setErr(''); setBusy(true);
    const res = await a.grantStaffRole(email.trim(), role, note.trim(), orgId || null);
    setBusy(false);
    if (res) { setEmail(''); setNote(''); setOrgId(''); }
  };

  const apps = a.volunteers.filter((v) => (
    vTab === 'pending' ? v.status === 'Pending review' || v.status === 'On hold'
      : vTab === 'approved' ? v.status === 'Approved'
        : v.status === 'Rejected' || v.status === 'Withdrawn'
  ));
  const countOf = (t: typeof vTab) => a.volunteers.filter((v) => (
    t === 'pending' ? v.status === 'Pending review' || v.status === 'On hold'
      : t === 'approved' ? v.status === 'Approved'
        : v.status === 'Rejected' || v.status === 'Withdrawn'
  )).length;

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
          {tr.coordStaff.title}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '72ch' }}>{tr.coordStaff.subtitle}</p>
      </div>

      {a.backend === 'local' && (
        <div style={{
          background: '#FFFBEF', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.coordStaff.localNote}</div>
      )}

      {/* ---- Staff ---- */}
      <section style={{ ...card, padding: mob ? 15 : 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: C.navy }}>{tr.coordStaff.inviteTitle}</h2>
          {/* The constraint is stated, not hidden: a browser cannot create accounts. */}
          <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0', maxWidth: '78ch' }}>{tr.coordStaff.howItWorks}</p>
          <p style={{ fontSize: 12.5, color: C.muted3, margin: '6px 0 0', maxWidth: '78ch' }}>
            {a.backend === 'local' ? tr.coordStaff.mailLocalNote : tr.coordStaff.mailNote}
          </p>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: C.warningText, background: '#FFFBEF', border: '1px solid #F2DFA8', borderRadius: 8, padding: '8px 10px', margin: '8px 0 0' }}>
              {tr.coordStaff.adminOnly}
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.4fr) 160px', alignItems: 'start' }}>
          <Field label={tr.coordStaff.fEmail}>
            <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={tr.coordStaff.fEmailPh} style={inputStyle} />
          </Field>
          <Field label={tr.coordStaff.fRole}>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} style={inputStyle}>
              {ROLES.map((r) => <option key={r} value={r}>{tr.coordStaff.roleLabels[r]}</option>)}
            </select>
          </Field>
          {/* Only verified records: assigning a membership marks it verified on the
              person's profile, so it must not point at a record nobody has checked. */}
          <Field label={tr.coordStaff.fOrg} hint={tr.coordStaff.orgHint} full>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={inputStyle}>
              <option value="">{tr.coordStaff.fOrgNone}</option>
              {verifiedOrgs.map((o) => (
                <option key={o.id} value={o.id}>{[o.name, o.province].filter(Boolean).join(' · ')}</option>
              ))}
            </select>
          </Field>
          {verifiedOrgs.length === 0 && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: C.muted3 }}>{tr.coordStaff.orgNoneAvailable}</div>
          )}
          <Field label={tr.coordStaff.fNote} full>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr.coordStaff.fNotePh} style={inputStyle} />
          </Field>
        </div>

        {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{err}</div>}

        <button onClick={grant} disabled={busy} style={{
          alignSelf: 'flex-start', background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
          borderRadius: 10, height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600,
          cursor: busy ? 'default' : 'pointer',
        }}>{tr.coordStaff.submit}</button>

        {a.staffError && (
          <div style={{ fontSize: 13, color: C.warningText, background: '#FFFBEF', border: '1px solid #F2DFA8', borderRadius: 8, padding: '9px 11px' }}>
            {a.staffError}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.borderFaint}`, paddingTop: 12 }}>
          <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordStaff.staffTitle}</div>
          {a.staff.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.coordStaff.staffEmpty}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {a.staff.map((m) => {
                const self = m.id === auth.user?.id;
                return (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '10px 12px',
                  }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{m.fullName || m.email}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2 }}>{maskEmail(m.email)} · {m.createdLabel}</div>
                    </div>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, color: m.role === 'admin' ? C.info : C.navy,
                      background: m.role === 'admin' ? '#EDF5FC' : C.chipNavyBg,
                      border: `1px solid ${m.role === 'admin' ? '#C9DEF2' : C.borderSoft}`,
                      borderRadius: 20, padding: '3px 10px',
                    }}>{tr.coordStaff.roleLabels[m.role]}</span>
                    {self
                      ? <span style={{ fontSize: 12, color: C.muted3 }}>{tr.coordStaff.selfNote}</span>
                      : isAdmin && (
                        <button onClick={() => { if (window.confirm(tr.coordStaff.revokeConfirm)) void a.revokeStaffRole(m.id); }}
                          style={{ ...ghost, color: C.emergency }}>{tr.coordStaff.revoke}</button>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${C.borderFaint}`, paddingTop: 12 }}>
          <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordStaff.invitesTitle}</div>
          {a.invites.length === 0 ? (
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.coordStaff.invitesEmpty}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {a.invites.map((i) => (
                  <div key={i.email} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '10px 12px',
                  }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.navy, wordBreak: 'break-all' }}>{i.email}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2 }}>
                        {[tr.coordStaff.roleLabels[i.role], i.createdLabel, i.note].filter(Boolean).join(' · ')}
                      </div>
                      {i.orgId && (
                        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                          {tr.coordStaff.inviteOrgLabel}: {i.orgName || (a.orgs.find((o) => o.id === i.orgId)?.name ?? '—')}
                        </div>
                      )}
                    </div>
                    <button onClick={() => void a.cancelRoleInvite(i.email)} style={ghost}>{tr.coordStaff.cancelInvite}</button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: C.muted3, margin: '8px 0 0' }}>{tr.coordStaff.invitePendingNote}</p>
            </>
          )}
        </div>
      </section>

      {/* ---- Volunteer applications ---- */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.navy }}>{tr.coordVolunteers.title}</h2>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '5px 0 0', maxWidth: '72ch' }}>{tr.coordVolunteers.subtitle}</p>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['pending', 'approved', 'other'] as const).map((t) => {
            const on = t === vTab;
            return (
              <button key={t} onClick={() => setVTab(t)} style={{
                background: on ? C.navy : C.surface, color: on ? '#fff' : C.navy,
                border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
                height: 40, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}>{tr.coordVolunteers.tabs[t]} · {countOf(t)}</button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted2 }}>
            {tr.coordVolunteers.countLabel(a.volunteers.length)}
          </span>
        </div>

        {a.volunteersLoading && <div style={{ fontSize: 13.5, color: C.muted }}>{tr.common.loading}</div>}
        {a.volunteersError && (
          <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: C.emergency, fontWeight: 600 }}>{a.volunteersError}</span>
            <button onClick={() => a.reloadVolunteers()} style={ghost}>{tr.common.retry}</button>
          </div>
        )}

        {!a.volunteersLoading && !a.volunteersError && apps.length === 0 && (
          <div style={{ ...card, padding: 26, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{tr.coordVolunteers.empty}</div>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 5 }}>{tr.coordVolunteers.emptyHint}</div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {apps.map((v) => <VolunteerCard key={v.id} app={v} />)}
        </div>

        <p style={{ fontSize: 12.5, color: C.muted3, margin: 0 }}>{tr.coordVolunteers.contactPrivate}</p>
      </section>
    </div>
  );
}
