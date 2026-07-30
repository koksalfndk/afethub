import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, eyebrow } from '../ui';
import { isPublicAuditAction } from '../data/repo';

// The system log — every action the platform recorded, in one place.
//
// This screen exists because the public live feed and the audit trail were being asked
// to be one thing. The feed is the same for every visitor and carries only operational
// facts; everything else — who was granted a role, which invitation was used, which
// organization was rejected, which volunteer went on shift — names people, and lands
// here. RLS (migration 0017) is what actually withholds those rows from a non-admin: a
// coordinator opening this page simply gets the public subset back, so the restriction
// does not depend on this component (rules/03 §Server-Side Authorization).
//
// Rows are never edited or deleted — the table carries an immutability trigger. What is
// filtered here is only what is displayed.

export function CoordLog() {
  const a = useApp();
  const auth = useAuth();
  const isAdmin = auth.profile?.role === 'admin';

  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => { a.reloadSystemLog(); }, []);

  const actions = useMemo(
    () => Array.from(new Set(a.systemLog.map((e) => e.action))).sort((x, y) => x.localeCompare(y, 'tr')),
    [a.systemLog],
  );

  const needle = q.trim().toLocaleLowerCase('tr');
  const rows = a.systemLog.filter((e) => (
    (!action || e.action === action)
    && (!needle
      || e.action.toLocaleLowerCase('tr').includes(needle)
      || e.user.toLocaleLowerCase('tr').includes(needle)
      || e.detail.toLocaleLowerCase('tr').includes(needle)
      || e.disasterName.toLocaleLowerCase('tr').includes(needle))
  ));

  const th = {
    textAlign: 'left' as const, fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
    textTransform: 'uppercase' as const, color: C.muted, padding: '11px 13px',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = { padding: '11px 13px', fontSize: 13, verticalAlign: 'top' as const, borderBottom: `1px solid ${C.borderFaint}` };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.coordLog.title}</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '6px 0 0', maxWidth: '78ch' }}>{tr.coordLog.subtitle}</p>
      </div>

      <div style={{
        background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 10,
        padding: '10px 13px', fontSize: 12.5, color: C.heading2, display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{ paddingTop: 1 }}><Ico n="shield" size={14} color={C.muted2} /></span>
        <span>{tr.coordLog.adminOnly}</span>
      </div>

      {/* Not authorisation — the database already withheld the private rows. This only
          explains the shorter list to a coordinator who lands here. */}
      {!isAdmin && (
        <div style={{
          background: '#FFFDF4', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
          borderRadius: 10, padding: '10px 13px', fontSize: 13, color: C.warningText, fontWeight: 600,
        }}>{tr.coordLog.notAdmin}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 200,
          background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: '0 13px', height: 42,
        }}>
          <Ico n="search" size={15} color={C.muted2} />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" autoComplete="off"
            placeholder={tr.coordLog.searchPh} aria-label={tr.coordLog.searchPh}
            style={{ border: 0, background: 'none', outline: 'none', fontSize: 13.5, color: C.navy, width: '100%', minWidth: 0 }} />
        </label>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          aria-label={tr.coordLog.allActions} style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
          <option value="">{tr.coordLog.allActions}</option>
          {actions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>
          {tr.coordLog.countLabel(rows.length, a.systemLog.length)}
        </span>
        <button onClick={() => a.reloadSystemLog()} className="hv-navy" style={{
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
          height: 42, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        }}>{tr.common.retry}</button>
      </div>

      {a.systemLogLoading && <div style={{ fontSize: 13.5, color: C.muted }}>{tr.common.loading}</div>}
      {a.systemLogError && (
        <div style={{ background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderRadius: 9, padding: '11px 13px', fontSize: 13.5, color: C.emergency, fontWeight: 600 }}>
          {a.systemLogError}
        </div>
      )}

      {!a.systemLogLoading && !a.systemLogError && rows.length === 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 26, textAlign: 'center', fontSize: 14, color: C.muted }}>
          {tr.coordLog.empty}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ background: '#F7FAFC' }}>
                {tr.coordLog.head.map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const isPublic = isPublicAuditAction(e.action);
                return (
                  <tr key={e.id}>
                    <td className="tnum" style={{ ...td, color: C.muted2, whiteSpace: 'nowrap' }}>{e.time}</td>
                    <td style={{ ...td, color: C.heading2 }}>{e.user}</td>
                    <td style={{ ...td, minWidth: 180 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, flex: '0 0 8px' }} />
                        <span style={{ fontWeight: 600, color: C.navy }}>{e.action}</span>
                      </span>
                      {/* Whether a row also appears on the public feed is itself worth
                          knowing when auditing what visitors can see. */}
                      <span style={{
                        display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 700,
                        letterSpacing: '.04em', textTransform: 'uppercase',
                        color: isPublic ? C.successText : C.muted2,
                        background: isPublic ? '#EAF7EE' : C.canvas,
                        border: `1px solid ${isPublic ? '#C9E9D6' : C.borderFaint}`,
                        borderRadius: 20, padding: '1px 7px',
                      }}>{isPublic ? tr.coordLog.publicBadge : tr.coordLog.privateBadge}</span>
                    </td>
                    <td style={{ ...td, color: C.text, minWidth: 220 }}>
                      {e.detail}
                      {e.disasterName && (
                        <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 2 }}>{e.disasterName}</span>
                      )}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{e.oldValue}</td>
                    <td style={{ ...td, color: C.successText, fontWeight: 600 }}>{e.newValue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
