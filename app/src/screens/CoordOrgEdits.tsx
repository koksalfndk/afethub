import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow } from '../ui';
import { orgFieldText } from '../data/repo';
import { maskEmail, maskPhone } from '../util';
import type { EditRequestStatus, OrgEditRequest } from '../types';

// Coordinator queue for correction requests against published organization records.
//
// The screen exists because 0007 stored proposals with nowhere to review them: requests
// landed in the database and no one could see them. What it must NOT do is apply a
// request automatically — the whole reason "Doğrulandı" means anything is that a person
// checks the change first (rules/02: a request is never automatically a record).
//
// Partial acceptance is the default interaction: a request can be right about the phone
// number and wrong about the address. Forcing all-or-nothing would push coordinators
// into rejecting requests that contain a real correction.
//
// Authorisation is RLS + the two SECURITY DEFINER functions in migration 0012, not this
// screen being hard to reach (rules/03 §Server-Side Authorization).

const STATUS_TONE: Record<EditRequestStatus, { fg: string; bg: string; bd: string }> = {
  'Pending review': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Applied: { fg: C.success, bg: '#EAF7EE', bd: '#BFE3CB' },
  Rejected: { fg: C.emergency, bg: C.errorSurface, bd: C.errorBorder },
};

function StatusChip({ s }: { s: EditRequestStatus }) {
  const t = STATUS_TONE[s];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 20, padding: '3px 9px',
      whiteSpace: 'nowrap',
    }}>{tr.coordOrgEdits.statusLabels[s]}</span>
  );
}

// One field of the diff. Both sides are rendered, always: a proposal shown on its own
// asks the coordinator to approve a change without telling them what it replaces.
function DiffRow({ k, cur, next, checked, disabled, onToggle }: {
  k: string; cur: string; next: string;
  checked: boolean; disabled: boolean; onToggle: () => void;
}) {
  const label = tr.coordOrgEdits.fieldLabels[k] ?? k;
  const blank = tr.coordOrgEdits.emptyValue;
  return (
    <label style={{
      display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 10, alignItems: 'start',
      padding: '10px 12px', borderRadius: 9,
      background: checked ? '#F4FAF6' : C.surface,
      border: `1px solid ${checked ? '#BFE3CB' : C.borderFaint}`,
      cursor: disabled ? 'default' : 'pointer',
    }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle}
        style={{ width: 18, height: 18, marginTop: 2, accentColor: C.success }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy }}>{label}</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          <div style={{ fontSize: 13, color: C.muted, wordBreak: 'break-word' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted3 }}>
              {tr.coordOrgEdits.currentValue}
            </span>
            <br />
            <span style={{ textDecoration: 'line-through', textDecorationColor: C.borderSoft }}>{cur || blank}</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.navy, fontWeight: 600, wordBreak: 'break-word' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.success }}>
              {tr.coordOrgEdits.proposedValue}
            </span>
            <br />
            {next || blank}
          </div>
        </div>
      </div>
    </label>
  );
}

function RequestCard({ r }: { r: OrgEditRequest }) {
  const a = useApp();
  const open = r.status === 'Pending review';
  // Only fields that still differ from the LIVE record are actionable. A request may
  // name a field that someone has since corrected by hand; offering to "apply" an
  // identical value would write a no-op and close the request as if it did something.
  const stale = r.changedFields.filter((k) => orgFieldText(r.current, k) === orgFieldText(r.proposed, k));
  const actionable = r.changedFields.filter((k) => !stale.includes(k));
  const [sel, setSel] = useState<string[]>(actionable);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setSel((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));

  const apply = async () => {
    if (sel.length === 0) { setErr(tr.coordOrgEdits.errNoField); return; }
    setErr(''); setBusy(true);
    await a.applyOrgEdit(r.id, sel, '');
    setBusy(false);
  };
  const reject = async () => {
    if (note.trim().length < 5) { setErr(tr.coordOrgEdits.errRejectNote); return; }
    setErr(''); setBusy(true);
    const ok = await a.rejectOrgEdit(r.id, note.trim());
    setBusy(false);
    if (ok) { setRejecting(false); setNote(''); }
  };

  const hasContact = !!(r.submittedByName || r.submittedByEmail || r.submittedByPhone);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Ico n="org" size={15} color={C.muted2} />
            <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{r.orgName}</span>
            <StatusChip s={r.status} />
          </div>
          <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
            {tr.coordOrgEdits.fieldCount(r.changedFields.length)} · {r.createdLabel}
            {r.reviewedLabel && ` · ${r.reviewedLabel}`}
          </div>
        </div>
        {open && (
          <span style={{ fontSize: 12, color: C.muted2, fontWeight: 600 }}>
            {tr.coordOrgEdits.selectedCount(sel.length, actionable.length)}
          </span>
        )}
      </div>

      {/* Why, in the requester's words. A diff on its own does not tell a coordinator
          whether to trust it, which is why the note is mandatory on submission. */}
      <div style={{ background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '10px 12px' }}>
        <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordOrgEdits.reasonLabel}</div>
        <p style={{ fontSize: 13.5, color: C.text, margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{r.note}</p>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {r.changedFields.map((k) => (
          <DiffRow key={k} k={k}
            cur={orgFieldText(r.current, k)} next={orgFieldText(r.proposed, k)}
            checked={open ? sel.includes(k) : r.status === 'Applied'}
            disabled={!open || stale.includes(k)}
            onToggle={() => toggle(k)} />
        ))}
      </div>

      {stale.length > 0 && open && (
        <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>
          {tr.coordOrgEdits.staleNote(stale.map((k) => tr.coordOrgEdits.fieldLabels[k] ?? k).join(', '))}
        </p>
      )}

      {/* Requester contact: coordinator-only, and masked even here. A moderation list
          does not need a readable phone number to make the decision
          (rules/03 §Contact Information). */}
      <div style={{ borderTop: `1px solid ${C.borderFaint}`, paddingTop: 10 }}>
        <div style={{ ...eyebrow, fontSize: 11 }}>{tr.coordOrgEdits.requesterLabel}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          {hasContact
            ? [r.submittedByName, maskEmail(r.submittedByEmail), maskPhone(r.submittedByPhone)]
                .filter(Boolean).join(' · ')
            : tr.coordOrgEdits.requesterNone}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted3, marginTop: 3 }}>{tr.coordOrgEdits.requesterPrivate}</div>
      </div>

      {r.reviewNote && (
        <div style={{ fontSize: 13, color: C.muted }}>
          <strong style={{ color: C.navy, fontWeight: 600 }}>{tr.coordOrgEdits.reviewNoteLabel}:</strong> {r.reviewNote}
        </div>
      )}

      {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{err}</div>}

      {open && !rejecting && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={apply} disabled={busy || actionable.length === 0} style={{
            background: busy ? C.borderSoft : G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
            borderRadius: 10, height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 600,
            cursor: busy || actionable.length === 0 ? 'default' : 'pointer',
          }}>{tr.coordOrgEdits.applySelected}</button>
          <button onClick={() => setSel(actionable)} style={ghost}>{tr.coordOrgEdits.selectAll}</button>
          <button onClick={() => setSel([])} style={ghost}>{tr.coordOrgEdits.selectNone}</button>
          <button onClick={() => { setRejecting(true); setErr(''); }} style={{ ...ghost, color: C.emergency }}>
            {tr.coordOrgEdits.reject}
          </button>
          <span style={{ fontSize: 11.5, color: C.muted3, marginLeft: 'auto' }}>{tr.coordOrgEdits.verificationNote}</span>
        </div>
      )}

      {open && rejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelText}>{tr.coordOrgEdits.rejectNote}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder={tr.coordOrgEdits.rejectNotePh} style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reject} disabled={busy} style={{
              background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
              borderRadius: 10, height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr.coordOrgEdits.rejectConfirm}</button>
            <button onClick={() => { setRejecting(false); setErr(''); }} style={ghost}>{tr.coordOrgEdits.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ghost = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
} as const;

const TABS: EditRequestStatus[] = ['Pending review', 'Applied', 'Rejected'];
const TAB_KEY: Record<EditRequestStatus, 'pending' | 'applied' | 'rejected'> = {
  'Pending review': 'pending', Applied: 'applied', Rejected: 'rejected',
};

export function CoordOrgEdits() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [tab, setTab] = useState<EditRequestStatus>('Pending review');

  // Loaded on mount rather than with the rest of the app: the rows carry the
  // requester's contact details, so they are only fetched when this screen is open.
  useEffect(() => { a.reloadOrgEdits(); }, []);

  const rows = a.orgEdits.filter((r) => r.status === tab);
  const countOf = (s: EditRequestStatus) => a.orgEdits.filter((r) => r.status === s).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
          {tr.coordOrgEdits.title}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '70ch' }}>{tr.coordOrgEdits.subtitle}</p>
      </div>

      {a.backend === 'local' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F0DFA8', borderLeft: '4px solid #E6A700', borderRadius: 9, padding: '10px 13px', fontSize: 13, color: '#8A6A00', fontWeight: 600 }}>
          {tr.coordOrgEdits.localNote}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = t === tab;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: on ? C.navy : C.surface, color: on ? '#fff' : C.navy,
              border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
              height: 40, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr.coordOrgEdits.tabs[TAB_KEY[t]]} · {countOf(t)}</button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: C.muted2 }}>
          {tr.coordOrgEdits.countLabel(a.orgEdits.length)}
        </span>
      </div>

      {a.orgEditsLoading && <div style={{ fontSize: 13.5, color: C.muted }}>{tr.common.loading}</div>}
      {a.orgEditsError && (
        <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: C.emergency, fontWeight: 600 }}>{a.orgEditsError}</span>
          <button onClick={() => a.reloadOrgEdits()} style={ghost}>{tr.common.retry}</button>
        </div>
      )}

      {!a.orgEditsLoading && !a.orgEditsError && rows.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 26, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{tr.coordOrgEdits.empty}</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 5 }}>{tr.coordOrgEdits.emptyHint}</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((r) => <RequestCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
