import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, DISASTER_ICON, eyebrow, LiveDot } from '../ui';
import { ShareDisasterModal } from '../components/ShareDisasterModal';
import { DisasterFormDrawer } from '../components/DisasterFormDrawer';
import { agoMinutes } from '../util';
import type { Disaster, DisasterType } from '../types';

// Coordinator screen: the operations themselves.
//
// A new operation is published the moment it is saved — the coordinator creating it is
// the reviewer, so there is nothing to queue it for (the same reasoning as a
// coordinator-filed need). The screen says so before the save, not after.
//
// Authorisation is RLS on `disasters`, not this screen being hard to reach
// (rules/03 §Server-Side Authorization).
export function CoordDisasters() {
  const a = useApp();
  const mob = a.device === 'mobile';

  // Form artık sağdan açılan çekmecede (components/DisasterFormDrawer). Bu ekran
  // yalnızca HANGİ kaydın açık olduğunu tutar; taslak çekmecenin kendi içinde.
  // '' = yeni operasyon, null = kapalı.
  const [editing, setEditing] = useState<string | null>(null);
  // Pencereler id ile tutulur, kaydın kendisiyle değil: kayıt arada güncellenirse
  // pencere eski adı/eski slug'ı göstermeye devam etmesin.
  const [sharing, setSharing] = useState<string | null>(null);

  const list = (a.snap?.disasters ?? []).slice().sort((x, y) => {
    const rank = (d: Disaster) => (d.status === 'Active' ? 0 : 1);
    return rank(x) - rank(y) || agoMinutes(x.updatedLabel) - agoMinutes(y.updatedLabel);
  });

  const editingDisaster = editing ? list.find((d) => d.id === editing) ?? null : null;
  const sharingDisaster = sharing ? list.find((d) => d.id === sharing) ?? null : null;
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <span style={eyebrow}>{tr.nav.operations}</span>
          <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0', color: C.navy }}>{tr.coordDisasters.title}</h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: '5px 0 0', maxWidth: '76ch' }}>{tr.coordDisasters.subtitle}</p>
        </div>
        <button onClick={() => setEditing('')} style={{
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LiveDot /><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.navy }}>{tr.dash.opsTitle}</h2>
        <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted2 }}>{tr.coordDisasters.countLabel(list.length)}</span>
      </div>

      {/* Masaüstünde gerçek bir tablo (<table>), mobilde kart listesi.
          Neden gerçek tablo: sütun başlıkları ekran okuyucuya `<th scope="col">` ile
          bildiriliyor ve her hücrenin hangi sütun olduğu satır satır okunuyor. Aynı
          görünümü div'lerle taklit etmek bu bilgiyi yok eder (rules/04 §Accessibility).
          Mobilde tablo kullanılmıyor: 390 px'e altı sütun sığmaz, yatay kaydırma da
          tek elle telefondan bakan bir koordinatör için kullanılabilir değil. */}
      {mob ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((d) => {
            const live = d.status === 'Active';
            return (
              <article key={d.id} style={{
                ...card, borderLeft: `3px solid ${live ? C.emergency : C.success}`, padding: 13,
                display: 'flex', flexDirection: 'column', gap: 9, opacity: live ? 1 : .86,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <TypeMark type={d.type} live={live} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button onClick={() => a.openCoordDisaster(d.slug)} className="lnk" style={{ ...nameBtn, fontSize: 15 }}>
                      {d.name}
                    </button>
                    <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>
                      {disasterTypeLabel[d.type]} · {d.region}
                    </div>
                    <div className="tnum" style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {tr.common.updated(d.updatedLabel)} · {startedByLabel(d, a.orgs)}
                    </div>
                  </div>
                  <StatusChip status={d.status} />
                </div>
                <RowActions d={d} onInspect={() => a.openCoordDisaster(d.slug)}
                  onEdit={() => setEditing(d.id)} onShare={() => setSharing(d.id)} full />
              </article>
            );
          })}
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: C.canvas }}>
                <th scope="col" style={{ ...th, width: '28%' }}>{tr.coordDisasters.colDisaster}</th>
                <th scope="col" style={{ ...th, width: '20%' }}>{tr.coordDisasters.colRegion}</th>
                <th scope="col" style={{ ...th, width: '9%' }}>{tr.coordDisasters.colStatus}</th>
                <th scope="col" style={{ ...th, width: '14%' }}>{tr.coordDisasters.colStarted}</th>
                <th scope="col" style={{ ...th, width: '11%' }}>{tr.coordDisasters.colUpdated}</th>
                {/* Sabit genişlik: yüzdeyle verildiğinde üç düğme alt alta sarmalanıp
                    satırı üç katına çıkarıyordu. */}
                <th scope="col" style={{ ...th, width: 246, textAlign: 'right' }}>{tr.coordDisasters.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const live = d.status === 'Active';
                return (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.borderFaint}`, opacity: live ? 1 : .82 }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <TypeMark type={d.type} live={live} />
                        <span style={{ minWidth: 0 }}>
                          {/* Ad birincil bağlantı: bir listede satırın adına tıklamak
                              detaya gitmek demektir, düğmeyi aramak zorunda bırakmaz. */}
                          <button onClick={() => a.openCoordDisaster(d.slug)} className="lnk" style={nameBtn}>
                            {d.name}
                          </button>
                          <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 1 }}>
                            {disasterTypeLabel[d.type]}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: 13, color: C.text }}>{d.region}</td>
                    <td style={td}><StatusChip status={d.status} /></td>
                    <td style={{ ...td, fontSize: 12.5, color: C.text }}>{startedByLabel(d, a.orgs)}</td>
                    <td className="tnum" style={{ ...td, fontSize: 12.5, color: C.muted }}>{d.updatedLabel}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <RowActions d={d} onInspect={() => a.openCoordDisaster(d.slug)}
                        onEdit={() => setEditing(d.id)} onShare={() => setSharing(d.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sharingDisaster && (
        <ShareDisasterModal disaster={sharingDisaster} onClose={() => setSharing(null)} />
      )}
      {editing !== null && (
        <DisasterFormDrawer disaster={editingDisaster} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const th = {
  textAlign: 'left', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: C.muted2, padding: '11px 14px', whiteSpace: 'nowrap',
} as const;
const td = { padding: '11px 14px', verticalAlign: 'middle' } as const;
// Düğme ama bağlantı gibi okunur: metin rengi ve altı çizili hover'ı `.lnk` veriyor.
// Odak halkası tarayıcının varsayılanı — kaldırılmadı (rules/04 §Accessibility).
const nameBtn = {
  display: 'block', background: 'none', border: 0, padding: 0, textAlign: 'left',
  font: 'inherit', fontSize: 14, fontWeight: 700, color: C.navy, cursor: 'pointer',
} as const;

function TypeMark({ type, live }: { type: DisasterType; live: boolean }) {
  return (
    <span style={{
      width: 32, height: 32, flex: '0 0 32px', borderRadius: 9, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: live ? C.errorSurface : '#EAF7EF',
      border: `1px solid ${live ? C.errorBorder : '#C9E9D6'}`,
    }}><Ico n={DISASTER_ICON[type]} size={16} color={live ? C.emergency : C.success} /></span>
  );
}

// Durum yalnızca renkle değil, kelimeyle (rules/04 §Accessibility).
function StatusChip({ status }: { status: Disaster['status'] }) {
  const live = status === 'Active';
  return (
    <span style={{
      display: 'inline-block', fontSize: 11.5, fontWeight: 700, borderRadius: 20,
      padding: '3px 9px', whiteSpace: 'nowrap',
      color: live ? C.emergency : C.successText,
      background: live ? C.errorSurface : '#EAF7EF',
      border: `1px solid ${live ? C.errorBorder : '#C9E9D6'}`,
    }}>{tr.coordDisasters.statusLabels[status]}</span>
  );
}

function startedByLabel(d: Disaster, orgs: { id: string; name: string }[]): string {
  const org = d.openedByOrgId ? orgs.find((o) => o.id === d.openedByOrgId) ?? null : null;
  return org?.name ?? (d.openedByCommunity ? tr.coordDisasters.fOpenedByCommunity : tr.coordDisasters.fOpenedBySelf);
}

// İncele birincil eylem — satıra tıklamanın karşılığı. Düzenle kaldırılmadı, ikinci
// plana alındı: ilçe ve yerleşim bilgisi yalnızca o formdan giriliyor ve detay
// sayfasındaki "Afet kaydını düzenle" bağlantısı buraya geliyor. Kaldırılsaydı o iş
// yapılamaz hâle gelirdi.
function RowActions({ d, onInspect, onEdit, onShare, full }: {
  d: Disaster; onInspect: () => void; onEdit: () => void; onShare: () => void; full?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 7, justifyContent: full ? 'stretch' : 'flex-end', flexWrap: full ? 'wrap' : 'nowrap' }}>
      <button onClick={onInspect} className="hv-navy" aria-label={tr.coordDisasters.inspectAria(d.name)} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: full ? 1 : undefined,
        background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
        height: 38, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}><Ico n="eye" size={15} color="#fff" />{tr.coordDisasters.inspect}</button>
      <button onClick={onShare} className="hv-navy" aria-label={tr.coordDisasters.shareAria(d.name)} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: full ? 1 : undefined,
        background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
        height: 38, padding: '0 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}><Ico n="share" size={15} />{tr.coordDisasters.share}</button>
      <button onClick={onEdit} className="hv-navy" aria-label={tr.coordDisasters.editAria(d.name)} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: full ? '0 0 38px' : undefined,
        background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.muted, borderRadius: 9,
        width: 38, height: 38, cursor: 'pointer',
      }} title={tr.coordDisasters.edit}><Ico n="pencil" size={15} /></button>
    </div>
  );
}
