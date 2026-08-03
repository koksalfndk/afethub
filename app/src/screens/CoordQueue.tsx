import type { CSSProperties } from 'react';
import { useApp, type SubFilter } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { cols } from '../select';
import { Chip, StatusBadge } from '../ui';

const SUBFILTERS: SubFilter[] = ['Pending', 'Verified', 'Partially', 'Rejected', 'All'];

export function CoordQueue() {
  const a = useApp();
  const auth = useAuth();
  if (!a.snap) return null;
  const L = cols(a.device === 'mobile');
  // Düzeltme yetkisi: kararı veren koordinatör ya da yönetici (migration 0032).
  // Oturum yoksa (yerel mod) kural sunucuda zaten yok; düğme gösterilir.
  const canRevise = (decidedBy?: string | null) =>
    !auth.enabled || auth.profile?.role === 'admin'
    || (!!decidedBy && decidedBy === auth.profile?.id);

  const enriched = a.snap.subs.map((x) => {
    const need = a.snap!.needs.find((n) => n.id === x.needId);
    const actionable = x.status === 'Pending verification' || x.status === 'Information requested';
    return {
      ...x,
      needName: need?.name ?? '—',
      verifiedLabel: x.verifiedQty == null ? '—' : `${x.verifiedQty} ${x.unit}`,
      vFg: x.verifiedQty ? C.success : C.muted3,
      actionable,
      settledNote: x.status === 'Rejected' ? tr.coord.closedNoChange : tr.coord.appliedToRemaining,
    };
  });
  const visible = enriched.filter((x) => a.subFilter === 'All' || (a.subFilter === 'Pending' ? x.status === 'Pending verification' : x.status.startsWith(a.subFilter)));

  const actBtn = (label: string, onClick: () => void, style: CSSProperties) => (
    <button onClick={onClick} style={{ borderRadius: 7, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 36, ...style }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>{tr.coord.queueTitle}</h1>
        <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{tr.coord.queueSubtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUBFILTERS.map((f) => <Chip key={f} label={tr.coord.subFilters[f]} active={a.subFilter === f} onClick={() => a.setSubFilter(f)} />)}
      </div>

      {visible.length > 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
              <thead>
                <tr style={{ background: C.canvas }}>
                  {tr.coord.tableHead.map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, padding: '11px 14px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.borderFaint}` }}>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>{s.contributor}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2 }}>{s.city} · {s.code}</div>
                      {s.photoUrl && <a href={s.photoUrl} target="_blank" rel="noreferrer"><img src={s.photoUrl} alt="" style={{ marginTop: 6, width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.borderSoft}`, display: 'block' }} /></a>}
                    </td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontSize: 14, color: C.heading2 }}>{s.needName}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2 }}>{s.loc}</div>
                    </td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top', fontSize: 14, fontWeight: 600, color: C.navy, fontVariantNumeric: 'tabular-nums' }}>{s.qty} {s.unit}</td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top', fontSize: 14, fontWeight: 600, color: s.vFg, fontVariantNumeric: 'tabular-nums' }}>{s.verifiedLabel}</td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top', fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{s.submitted}</td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top' }}><StatusBadge s={s.status} /></td>
                    <td style={{ padding: '13px 14px', verticalAlign: 'top' }}>
                      {s.actionable ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {actBtn(tr.coord.approve, () => a.openModal(s, 'approve'), { background: C.success, border: `1px solid ${C.success}`, color: '#fff' })}
                          {actBtn(tr.coord.partial, () => a.openModal(s, 'partial'), { background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy })}
                          {actBtn(tr.coord.reject, () => a.openModal(s, 'reject'), { background: C.surface, border: '1px solid #F6C9C9', color: C.emergency })}
                          <button onClick={() => a.openModal(s, 'info')} style={{ background: 'none', border: 0, color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 4px', textDecoration: 'underline' }}>{tr.coord.requestInfo}</button>
                        </div>
                      ) : (
                        // Karara bağlanmış kayıt. Sahada karar teslimatın tamamı
                        // gelmeden veriliyor; düzeltme olmadan koordinatörün tek
                        // çaresi ikinci bir sahte kayıt açmak olurdu.
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 12.5, color: C.muted2 }}>{s.settledNote}</span>
                          {canRevise(s.decidedBy) ? (
                            <>
                              {actBtn(tr.modal.revise, () => a.openModal(s, 'approve', true), { background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy })}
                              <button
                                onClick={() => void a.undoDecision(s)}
                                aria-label={tr.modal.undoAria(s.code)}
                                style={{ background: 'none', border: 0, color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '8px 4px', textDecoration: 'underline' }}
                              >{tr.modal.undo}</button>
                            </>
                          ) : (
                            // Sessizce gizlemek yerine NEDEN yapılamadığı yazılır.
                            <span style={{ fontSize: 11.5, color: C.muted3 }}>{tr.modal.reviseLocked}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.coord.queueClearTitle}</div>
          <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.coord.queueClearBody}</div>
        </div>
      )}
    </div>
  );
}
