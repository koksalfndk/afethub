import { useApp } from '../store';
import { tr, statusLabel } from '../i18n/strings';
import { C, STATUS } from '../theme';
import { cols } from '../select';
import { Field, inputStyle, eyebrow, Ico } from '../ui';
import { useAuth } from '../auth';

export function Track() {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;
  const L = cols(a.device === 'mobile');
  const sub = a.trackedSub;
  // A submission opened from the list may belong to another operation than the loaded
  // snapshot, so its need name comes from the record itself when the lookup misses.
  const need = sub && a.snap ? a.snap.needs.find((n) => n.id === sub.needId) : null;

  let timeline: { label: string; time: string; dot: string; ring: string; fg: string }[] = [];
  if (sub) {
    const third = sub.status === 'Rejected' ? tr.track.timeline.rejected : sub.status === 'Partially verified' ? tr.track.timeline.partially : tr.track.timeline.verified;
    const stages = [tr.track.timeline.submitted, tr.track.timeline.pending, third, tr.track.timeline.closed];
    const reached = sub.status === 'Pending verification' ? 1 : 3;
    timeline = stages.map((label, i) => ({
      label,
      time: i <= reached ? (i === 0 ? sub.submitted : i === reached ? tr.track.timeLatest : tr.track.timeDone) : tr.track.timeWaiting,
      dot: i <= reached ? (sub.status === 'Rejected' && i === 2 ? C.emergency : i === 1 && reached === 1 ? C.warning : C.success) : '#FFFFFF',
      ring: i <= reached ? 'transparent' : C.borderSoft,
      fg: i <= reached ? C.navy : C.muted3,
    }));
  }

  const st = sub ? STATUS[sub.status] : STATUS.Verified;

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>{tr.track.title}</h1>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 18px' }}>{loggedIn ? tr.track.mineIntro : tr.track.intro}</p>

      {/* Signed in: the account's own submissions, no code needed. The code form stays
          below it — a delivery reported with a different address is not in this list,
          and that is the only way to reach it. */}
      {loggedIn && (
        <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${C.borderFaint}` }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: C.navy }}>{tr.track.mineTitle}</h2>
            {a.mySubs.length > 0 && (
              <span className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>{tr.track.mineCount(a.mySubs.length)}</span>
            )}
          </div>

          {a.backend === 'local' && (
            <div style={{ background: '#FFFBEF', borderBottom: '1px solid #F2DFA8', padding: '9px 16px', fontSize: 12.5, fontWeight: 600, color: C.warningText }}>
              {tr.track.mineDemoNote}
            </div>
          )}

          {a.mySubsLoading ? (
            <div style={{ padding: '18px 16px', fontSize: 13.5, color: C.muted }}>{tr.track.mineLoading}</div>
          ) : a.mySubsError ? (
            <div style={{ padding: '16px' }}>
              <div role="alert" style={{ fontSize: 13.5, color: C.errorText, fontWeight: 600 }}>{a.mySubsError}</div>
              <button onClick={a.reloadMySubs} className="hv-navy" style={{ marginTop: 10, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{tr.track.mineRetry}</button>
            </div>
          ) : a.mySubs.length === 0 ? (
            <div style={{ padding: '18px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.heading2 }}>{tr.track.mineEmpty}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{tr.track.mineEmptyBody}</div>
            </div>
          ) : (
            <>
              {a.mySubs.map((row) => {
                const t = STATUS[row.status] ?? STATUS.Verified;
                const selected = sub?.code === row.code;
                return (
                  <button key={row.code} onClick={() => a.openTrackedSub(row)} aria-pressed={selected} className="hv-navy" style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center',
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    background: selected ? C.chipNavyBg : 'none', border: 0,
                    borderTop: `1px solid ${C.borderFaint}`,
                    borderLeft: `3px solid ${selected ? C.navy : 'transparent'}`,
                    padding: '12px 16px', minHeight: 60,
                  }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: C.navy }}>
                        {row.qty} {row.unit} · {row.needName || '—'}
                      </span>
                      <span className="tnum" style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 1 }}>
                        {row.code} · {row.loc} · {row.submitted}
                      </span>
                    </span>
                    {/* Status in words as well as colour (rules/04 §Accessibility). */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap' }}>
                      {statusLabel[row.status]}
                    </span>
                    <Ico n="chev" size={16} color={C.muted3} />
                  </button>
                );
              })}
              <div style={{ padding: '11px 16px', borderTop: `1px solid ${C.borderFaint}`, fontSize: 12, color: C.muted2 }}>
                {tr.track.mineOtherEmail}
              </div>
            </>
          )}
        </section>
      )}

      {loggedIn && <div style={{ ...eyebrow, marginBottom: 8 }}>{tr.track.otherTitle}</div>}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={tr.track.code}><input value={a.track.code} onChange={(e) => a.setTrack('code', e.target.value)} placeholder="AFT-4821" style={{ ...inputStyle, letterSpacing: '.05em' }} /></Field>
        <Field label={tr.track.email}><input value={a.track.email} onChange={(e) => a.setTrack('email', e.target.value)} type="email" placeholder="siz@example.com" style={inputStyle} /></Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={a.doTrack} style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.track.trackBtn}</button>
          <button onClick={a.fillDemoCode} style={{ background: 'none', border: 0, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>{tr.track.demo}</button>
        </div>
        {a.trackError && <div style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 10, padding: '12px 13px', fontSize: 13.5, color: C.errorText }}>{a.trackError}</div>}
      </div>

      {sub && (
        <div className="anim-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted2 }}>{sub.code}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{sub.qty} {sub.unit} · {sub.needName || need?.name || ''}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub.loc} · {tr.track.lastUpdated(sub.submitted)}</div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: st.fg, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 20, padding: '6px 11px', whiteSpace: 'nowrap' }}>{statusLabel[sub.status]}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 14 }}>
            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9, padding: 11 }}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.track.reported}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{sub.qty}</div>
            </div>
            <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9, padding: 11 }}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.track.verified}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.success }}>{sub.verifiedQty == null ? '—' : sub.verifiedQty}</div>
            </div>
          </div>
          <div style={{ marginTop: 14, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9, padding: 12 }}>
            <div style={{ fontSize: 12, color: C.muted2, fontWeight: 600 }}>{tr.track.coordNotes}</div>
            <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 3 }}>{sub.note}</div>
          </div>
          {sub.photoUrl && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: C.muted2, fontWeight: 600, marginBottom: 6 }}>{tr.report.photoLabel}</div>
              <a href={sub.photoUrl} target="_blank" rel="noreferrer"><img src={sub.photoUrl} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, border: `1px solid ${C.border}` }} /></a>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            {timeline.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.dot, border: `2px solid ${s.ring}`, marginTop: 3 }} />
                  <span style={{ flex: 1, width: 2, background: C.border }} />
                </div>
                <div style={{ paddingBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: s.fg }}>{s.label}</div>
                  <div style={{ fontSize: 12.5, color: C.muted2 }}>{s.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
