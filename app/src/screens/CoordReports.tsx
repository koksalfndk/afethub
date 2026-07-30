import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, eyebrow } from '../ui';
import { COMMUNITY_THRESHOLD } from '../data/repo';
import { formatDate } from '../util';
import type { ReportQueueItem, ReportStatus } from '../types';

// Coordinator queue for community reports.
//
// A report is a claim. Two things can turn it into an operation: enough people
// confirming it (the threshold, applied in the database), or a coordinator deciding
// here. Both paths end in the same public record, but they are labelled differently —
// an operation opened by the crowd says so on its own page until someone with
// authority confirms it, because ten unverified e-mail addresses are not verification
// (rules/01 §Clear Operational States, rules/02 §Need Requests).
//
// What this screen deliberately does NOT show: the reporters' names, addresses and
// phone numbers. The count of people who left contact details is enough to judge a
// claim; the details themselves stay in the coordinator-only tables and are not
// fetched here (rules/03 §Contact Information).

const ghost = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
} as const;

const TABS: { key: 'open' | 'published' | 'rejected'; match: (r: ReportQueueItem) => boolean }[] = [
  { key: 'open', match: (r) => r.status === 'Pending verification' || r.status === 'Merged' },
  { key: 'published', match: (r) => r.status === 'Published' },
  { key: 'rejected', match: (r) => r.status === 'Rejected' },
];

const STATUS_TONE: Record<ReportStatus, { fg: string; bg: string; bd: string }> = {
  'Pending verification': { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Merged: { fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' },
  Published: { fg: C.success, bg: '#EAF7EE', bd: '#BFE3CB' },
  Rejected: { fg: C.emergency, bg: C.errorSurface, bd: C.errorBorder },
};

function Chip({ text, tone }: { text: string; tone: { fg: string; bg: string; bd: string } }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
      color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}`, borderRadius: 20,
      padding: '3px 9px', whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function ReportCard({ r }: { r: ReportQueueItem }) {
  const a = useApp();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const open = r.status === 'Pending verification' || r.status === 'Merged';
  const left = Math.max(0, COMMUNITY_THRESHOLD - r.reportCount);

  const publish = async () => {
    setErr(''); setBusy(true);
    await a.reviewDisasterReport(r.id, 'publish', '');
    setBusy(false);
  };
  const reject = async () => {
    if (reason.trim().length < 5) { setErr(tr.coordReports.errReason); return; }
    setErr(''); setBusy(true);
    const ok = await a.reviewDisasterReport(r.id, 'reject', reason.trim());
    setBusy(false);
    if (ok) { setRejecting(false); setReason(''); }
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Ico n="critical" size={15} color={C.warningText} />
            <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>
              {[r.province, r.district].filter(Boolean).join(' / ')}
            </span>
            <Chip text={disasterTypeLabel[r.type]} tone={{ fg: C.heading2, bg: G.chip, bd: C.borderFaint }} />
            <Chip text={r.status} tone={STATUS_TONE[r.status]} />
            {r.openedByCommunity && (
              <Chip text={tr.coordReports.communityBadge} tone={{ fg: '#8A6A00', bg: '#FFF9E6', bd: '#F0DFA8' }} />
            )}
          </div>
          <div className="tnum" style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
            {formatDate(r.occurredOn)} · {r.createdLabel} · {tr.reportDisaster.lastReport(r.lastReportLabel)}
          </div>
        </div>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span className="tnum" style={{ display: 'block', fontSize: 20, fontWeight: 700, color: C.warning }}>{r.reportCount}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: C.muted }}>{tr.coordReports.reportedWord}</span>
        </span>
      </div>

      {r.locationNote && (
        <div style={{ fontSize: 13, color: C.heading2 }}>
          <Ico n="pin" size={12} color={C.muted3} /> {r.locationNote}
        </div>
      )}
      {r.description && (
        <div style={{ background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '10px 12px' }}>
          <p style={{ fontSize: 13.5, color: C.text, margin: 0, whiteSpace: 'pre-wrap' }}>{r.description}</p>
        </div>
      )}

      {/* Corroboration, stated as what it is: a count of people, not a verification. */}
      <div className="tnum" style={{ fontSize: 12.5, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{tr.coordReports.confirmationsWord(r.confirmations)}</span>
        {open && <span>· {left > 0 ? tr.coordReports.thresholdLeft(left) : tr.coordReports.thresholdReached}</span>}
      </div>

      {r.rejectReason && (
        <div style={{ fontSize: 13, color: C.muted }}>
          <strong style={{ color: C.navy, fontWeight: 600 }}>{tr.coordReports.rejectNote}:</strong> {r.rejectReason}
        </div>
      )}

      {err && <div style={{ fontSize: 13, color: C.emergency, fontWeight: 600 }}>{err}</div>}

      {open && !rejecting && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => void publish()} disabled={busy} className="hv-emergency" style={{
            background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
            height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? .7 : 1,
          }}>{tr.coordReports.publish}</button>
          <button onClick={() => { setRejecting(true); setErr(''); }} style={{ ...ghost, color: C.emergency }}>
            {tr.coordReports.reject}
          </button>
          <span style={{ fontSize: 11.5, color: C.muted3, marginLeft: 'auto' }}>{tr.coordReports.publishHint}</span>
        </div>
      )}

      {open && rejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelText}>{tr.coordReports.rejectNote}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder={tr.coordReports.rejectNotePh} style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void reject()} disabled={busy} style={{
              background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
              height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr.coordReports.rejectConfirm}</button>
            <button onClick={() => { setRejecting(false); setErr(''); }} style={ghost}>{tr.coordReports.cancel}</button>
          </div>
        </div>
      )}

      {r.disasterSlug && (
        <div style={{ borderTop: `1px solid ${C.borderFaint}`, paddingTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => a.openDisaster(r.disasterSlug!, 'needs')} className="hv-navy" style={ghost}>
            {tr.coordReports.openDisaster}
          </button>
          {/* Only a community-opened operation carries the unverified label, and only
              this action clears it. */}
          {r.openedByCommunity && !r.communityConfirmed && (
            <>
              <span style={{ fontSize: 12.5, color: C.warningText, fontWeight: 600 }}>{tr.coordReports.awaitingConfirm}</span>
              <button onClick={() => { if (r.disasterId) void a.confirmCommunityDisaster(r.disasterId); }}
                disabled={!r.disasterId} style={{
                  background: C.success, border: `1px solid ${C.success}`, color: '#fff', borderRadius: 10,
                  height: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}>{tr.coordReports.confirmCommunity}</button>
            </>
          )}
          {r.openedByCommunity && r.communityConfirmed && (
            <Chip text={tr.coordReports.confirmedBadge} tone={{ fg: C.success, bg: '#EAF7EE', bd: '#BFE3CB' }} />
          )}
        </div>
      )}
    </div>
  );
}

export function CoordReports() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [tab, setTab] = useState<'open' | 'published' | 'rejected'>('open');

  useEffect(() => { a.reloadReportQueue(); }, []);

  const matcher = TABS.find((t) => t.key === tab)!.match;
  const rows = a.reportQueue.filter(matcher);
  const countOf = (k: 'open' | 'published' | 'rejected') =>
    a.reportQueue.filter(TABS.find((t) => t.key === k)!.match).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>
          {tr.coordReports.title}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '70ch' }}>{tr.coordReports.subtitle}</p>
        <p style={{ fontSize: 12.5, color: C.muted2, margin: '4px 0 0' }}>{tr.dashReports.thresholdNote(COMMUNITY_THRESHOLD)}</p>
      </div>

      {a.backend === 'local' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F0DFA8', borderLeft: '4px solid #E6A700', borderRadius: 9, padding: '10px 13px', fontSize: 13, color: '#8A6A00', fontWeight: 600 }}>
          {tr.coordReports.localNote}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              background: on ? C.navy : C.surface, color: on ? '#fff' : C.navy,
              border: `1px solid ${on ? C.navy : C.borderSoft}`, borderRadius: 20,
              height: 40, padding: '0 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}>{tr.coordReports.tabs[t.key]} · {countOf(t.key)}</button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12.5, color: C.muted2 }}>
          {tr.coordReports.countLabel(a.reportQueue.length)}
        </span>
      </div>

      {a.reportQueueLoading && <div style={{ fontSize: 13.5, color: C.muted }}>{tr.common.loading}</div>}
      {a.reportQueueError && (
        <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: C.emergency, fontWeight: 600 }}>{a.reportQueueError}</span>
          <button onClick={() => a.reloadReportQueue()} style={ghost}>{tr.common.retry}</button>
        </div>
      )}

      {!a.reportQueueLoading && !a.reportQueueError && rows.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 26, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{tr.coordReports.empty}</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 5 }}>{tr.coordReports.emptyHint}</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((r) => <ReportCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
