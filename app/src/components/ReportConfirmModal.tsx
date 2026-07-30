import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { Field, Ico, inputStyle } from '../ui';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { COMMUNITY_THRESHOLD } from '../data/repo';
import { formatDate } from '../util';
import type { DisasterReport } from '../types';

// "Bildirimi Doğrula" — confirming someone else's report.
//
// Why this is a form and not a button: the counter it raises is what opens an
// operation on its own at COMMUNITY_THRESHOLD. An anonymous click could be repeated
// by one person until the threshold fell, and the platform would publish a disaster
// nobody but that person reported. The name/e-mail/location are not proof of identity
// — the e-mail is never verified — but one address counts once (unique constraint,
// migration 0016), which is what makes the threshold mean anything at all.
//
// Nothing entered here is published: the fields go to the coordinator-only
// confirmations table (rules/01 §Public Access, rules/03 §Contact Information).

const btn = (primary: boolean) => (primary
  ? { background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
      padding: '0 18px', height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
  : { background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
      padding: '0 16px', height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const });

export function ReportConfirmModal({ report, onClose }: { report: DisasterReport; onClose: () => void }) {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const loggedIn = auth.enabled && !!auth.user;

  // A signed-in visitor already gave us these; asking again would break the standing
  // rule against re-entering information the platform holds (rules/01 §Registration).
  const [name, setName] = useState(loggedIn ? (auth.profile?.fullName ?? '') : '');
  const [email, setEmail] = useState(loggedIn ? (auth.user?.email ?? '') : '');
  // The account stores the city as `city`; it is the same field the forms label "İl".
  const [province, setProvince] = useState(loggedIn ? (auth.profile?.city ?? '') : '');
  const [district, setDistrict] = useState(loggedIn ? (auth.profile?.district ?? '') : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ count: number; already: boolean; slug: string } | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, and the page behind does not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const submit = async () => {
    if (name.trim().length < 3) return setErr(tr.confirmReport.errName);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr(tr.confirmReport.errEmail);
    if (province.trim().length < 2) return setErr(tr.confirmReport.errProvince);
    setErr(''); setBusy(true);
    const res = await a.confirmDisasterReport(report.id, {
      name: name.trim(), email: email.trim(), province: province.trim(), district: district.trim(),
    });
    setBusy(false);
    if (res) setDone({ count: res.report.reportCount, already: res.already, slug: res.createdSlug });
  };

  // Everything the confirmation needs is already on the account: nothing to ask.
  const knownAccount = loggedIn && name.trim().length >= 3
    && email.trim().includes('@') && province.trim().length >= 2;
  const place = [report.province, report.district].filter(Boolean).join(' / ');
  const left = Math.max(0, COMMUNITY_THRESHOLD - report.reportCount);

  return (
    <div
      role="dialog" aria-modal="true" aria-label={tr.confirmReport.title}
      onMouseDown={(e) => { if (!boxRef.current?.contains(e.target as Node)) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', zIndex: 80,
        display: 'flex', alignItems: mob ? 'flex-end' : 'center', justifyContent: 'center', padding: mob ? 0 : 20,
      }}
    >
      <div ref={boxRef} className="anim-in" style={{
        background: C.surface, width: '100%', maxWidth: 480,
        borderRadius: mob ? '14px 14px 0 0' : 14, boxShadow: '0 18px 48px rgba(11,30,48,.25)',
        maxHeight: mob ? '92vh' : '90%', overflowY: 'auto',
      }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>{tr.confirmReport.title}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
              {disasterTypeLabel[report.type]} · {place} · {formatDate(report.occurredOn)}
            </div>
          </div>
          <button onClick={onClose} aria-label={tr.confirmReport.cancel} style={{
            background: 'none', border: 0, cursor: 'pointer', padding: 6, lineHeight: 0,
          }}><Ico n="close" size={17} color={C.muted2} /></button>
        </div>

        {done ? (
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            {done.already ? (
              <div style={{ background: '#FFFDF4', border: '1px solid #F2DFA8', borderRadius: 11, padding: 14 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: C.warningText }}>{tr.confirmReport.alreadyTitle}</div>
                <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 4 }}>{tr.confirmReport.alreadyBody}</div>
              </div>
            ) : done.slug ? (
              <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 11, padding: 14 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: C.successText }}>{tr.confirmReport.openedTitle}</div>
                <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 4 }}>{tr.confirmReport.openedBody}</div>
                <button onClick={() => { onClose(); a.openDisaster(done.slug, 'needs'); }} style={{ ...btn(true), marginTop: 11 }}>
                  {tr.confirmReport.openLink}
                </button>
              </div>
            ) : (
              <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 11, padding: 14 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: C.successText }}>{tr.confirmReport.doneTitle}</div>
                <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 4 }}>{tr.confirmReport.doneBody(done.count)}</div>
              </div>
            )}

            {/* The account offer comes AFTER the contribution, never before it
                (rules/01 §Registration Must Be Optional). It is skipped for someone
                who is already signed in. */}
            {!loggedIn && (
              <div style={{ background: G.surfaceSoft, border: `1px solid ${C.borderFaint}`, borderRadius: 11, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{tr.confirmReport.signupTitle}</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{tr.confirmReport.signupBody}</div>
                <button onClick={() => { onClose(); auth.openModal('signUp', email.trim()); }}
                  className="hv-navy" style={{ ...btn(false), marginTop: 11 }}>
                  {tr.confirmReport.signupCta}
                </button>
              </div>
            )}

            <button onClick={onClose} className="hv-navy" style={{ ...btn(false), alignSelf: 'flex-start' }}>
              {tr.confirmReport.close}
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            <p style={{ fontSize: 13.5, color: C.heading2, margin: 0 }}>{tr.confirmReport.intro}</p>

            <div style={{ background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '10px 12px' }}>
              <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: C.warningText }}>
                {report.reportCount} {tr.dashReports.reportedWord}
                {left > 0 && <span style={{ color: C.muted2, fontWeight: 500 }}> · {tr.dashReports.toThreshold(left)}</span>}
              </div>
              {report.description && (
                <p style={{ fontSize: 13, color: C.text, margin: '6px 0 0' }}>{report.description}</p>
              )}
            </div>

            {/* A signed-in account has already given us all of this. Asking again is the
                exact re-entry rules/01 §Registration Must Be Optional forbids, so the
                form collapses to a line stating who is confirming. Only a field the
                account is actually missing is asked for. */}
            {knownAccount ? (
              <div style={{ background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '11px 13px' }}>
                <div style={{ fontSize: 12.5, color: C.muted2 }}>{tr.confirmReport.asAccount}</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.navy, marginTop: 2 }}>
                  {[name, [province, district].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 11, gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))' }}>
                  {!loggedIn && (
                    <>
                      <Field label={tr.confirmReport.fName} full>
                        <input name="confirm-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                          autoFocus style={inputStyle} />
                      </Field>
                      <Field label={tr.confirmReport.fEmail} full>
                        <input type="email" name="confirm-email" autoComplete="email" value={email}
                          onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                      </Field>
                    </>
                  )}
                  <Field label={tr.confirmReport.fProvince}>
                    <select name="confirm-province" value={province} autoFocus={loggedIn}
                      onChange={(e) => { setProvince(e.target.value); setDistrict(''); }} style={inputStyle}>
                      <option value="">{tr.orgs.pickProvince}</option>
                      {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label={tr.confirmReport.fDistrict}>
                    <select name="confirm-district" value={district} onChange={(e) => setDistrict(e.target.value)}
                      disabled={!province} style={{ ...inputStyle, opacity: province ? 1 : .6 }}>
                      <option value="">{province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}</option>
                      {districtsOf(province).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                </div>

                {!loggedIn && <p style={{ fontSize: 12, color: C.muted2, margin: 0 }}>{tr.confirmReport.whyContact}</p>}
                {loggedIn && <p style={{ fontSize: 12, color: C.muted2, margin: 0 }}>{tr.confirmReport.needProvince}</p>}
              </>
            )}

            {err && (
              <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, color: C.errorText, borderRadius: 9, padding: '10px 12px', fontSize: 13.5 }}>{err}</div>
            )}

            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button onClick={() => void submit()} disabled={busy} className="hv-emergency"
                style={{ ...btn(true), flex: '1 1 150px', opacity: busy ? .7 : 1 }}>
                {tr.confirmReport.submit}
              </button>
              <button onClick={onClose} className="hv-navy" style={btn(false)}>{tr.confirmReport.cancel}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
