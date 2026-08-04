import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { trModeration } from '../i18n/coordUpdates';
// Tip etiketlerinin TEK kaynağı herkese açık akışın sözlüğü; iki ekran aynı türe
// iki farklı ad vermemeli. İki dosya da tembel iniyor, pakete maliyeti yok.
import { UPDATE_TYPE_LABEL } from '../i18n/operationUpdates';
import { C } from '../theme';
import { cols } from '../select';
import { eyebrow, Ico, StatCard, type IcoName } from '../ui';
import { Picker } from '../components/Picker';
import { repo } from '../data';
import type { UpdateQueueRow } from '../types';

// ---------------------------------------------------------------------------
// Saha güncellemeleri moderasyon kuyruğu (Faz 4-A, migration 0049)
//
// Kuyruk verisi STORE'A EKLENMEDİ, ekran repo'yu doğrudan çağırıyor: `store.tsx`
// herkese açık ilk pakette ve oraya eklenen her satır bu ekranı hiç açmayacak
// ziyaretçinin indirdiği bayta dönüşüyor (CoordPledges'in dışa aktarma kararıyla
// aynı gerekçe). Yetki kontrolü sunucuda (`operation_update_queue` içindeki
// `is_coordinator()`); ekran yalnızca reddedilecek çağrıyı hiç yapmamak için
// koordinatör rotasında yaşıyor.
//
// İletişim bilgisi bu ekranda HEP maskeli. Tam bilgi detay çekmecesinde, yazılı
// gerekçeyle ve denetim kaydıyla açılıyor (rules/03 §Contact Information).
// ---------------------------------------------------------------------------

const Drawer = lazy(() => import('../components/UpdateModerationDrawer').then((m) => ({ default: m.UpdateModerationDrawer })));

// Türkçe göreli zaman. `supabaseRepo` içindeki `rel` özel; bu ekran tembel bir
// parça olduğu için küçük bir kopya, ortak modüle taşıyıp herkese indirtmekten
// daha ucuz. Çekmece de buradan alıyor.
export function sureOnce(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const min = Math.floor(Math.max(0, Date.now() - then) / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

// Bekleme etiketi rozet DEĞİL — durum değil, sıra bilgisi.
function bekleme(iso: string): string {
  const s = sureOnce(iso);
  return s === 'az önce' ? s : trModeration.waiting(s.replace(' önce', ''));
}

export function FlagBadges({ r }: { r: UpdateQueueRow }) {
  const rozet = (text: string, fg: string, bg: string, border: string, icon: IcoName) => (
    <span key={text} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: 700, color: fg, background: bg,
      border: `1px solid ${border}`, borderRadius: 20, padding: '4px 9px',
    }}>
      <Ico n={icon} size={12} color={fg} />
      {text}
    </span>
  );
  const out: React.ReactNode[] = [];
  if (r.piiFlagged) out.push(rozet(trModeration.badgePii, '#8A4A00', '#FFF4E8', '#F2D2A8', 'shield'));
  if (r.openReports > 0) out.push(rozet(trModeration.badgeReports(r.openReports), C.errorText, '#FEF3F2', '#F6C9C9', 'critical'));
  if (r.photoPending > 0) out.push(rozet(trModeration.badgePhotos(r.photoPending), '#8A6100', '#FFF8E5', '#F2DFA8', 'pending'));
  if (r.infoRequestedAt) out.push(rozet(trModeration.badgeInfo, '#1E5C93', '#EFF6FB', '#CBE0F0', 'need'));
  // Yayımlanmış ama bildirimi/fotoğrafı açık olduğu için kuyruğa düşen kayıt:
  // durumun kendisi de görünür olmalı, yoksa "neden burada?" sorusu cevapsız kalır.
  if (r.status === 'published') out.push(rozet(trModeration.badgePublished, '#157F3E', '#EAF7EF', '#C9E9D6', 'verified'));
  return out.length > 0 ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{out}</div> : null;
}

export function CoordUpdates() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const L = cols(mob);

  const [rows, setRows] = useState<UpdateQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [disasterId, setDisasterId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Tek uçuş kuralı: filtre hızla değişirse eski yanıt yenisini EZMEMELİ.
  const istek = useRef(0);
  const yukle = useCallback(async (dis: string) => {
    const benim = ++istek.current;
    setLoading(true);
    try {
      const data = await repo.listUpdateQueue(dis);
      if (istek.current !== benim) return;
      setRows(data);
      setError(false);
    } catch {
      if (istek.current !== benim) return;
      setError(true);
    } finally {
      if (istek.current === benim) setLoading(false);
    }
  }, []);

  useEffect(() => { void yukle(disasterId); }, [disasterId, yukle]);

  const operations = useMemo(
    () => (a.snap?.disasters ?? []).map((d) => ({ value: d.id, label: d.name })),
    [a.snap?.disasters],
  );

  const pending = rows.filter((r) => r.status === 'moderation_pending');
  const cards: { key: string; label: string; hint: string; value: number; accent: string; icon: IcoName; primary?: boolean }[] = [
    { key: 'pending', label: trModeration.cards.pending, hint: trModeration.cards.pendingHint, value: pending.length, accent: C.navy, icon: 'pending', primary: true },
    { key: 'reported', label: trModeration.cards.reported, hint: trModeration.cards.reportedHint, value: rows.filter((r) => r.openReports > 0).length, accent: C.emergency, icon: 'critical', primary: true },
    { key: 'info', label: trModeration.cards.info, hint: trModeration.cards.infoHint, value: rows.filter((r) => r.infoRequestedAt).length, accent: C.info, icon: 'need' },
    { key: 'pii', label: trModeration.cards.pii, hint: trModeration.cards.piiHint, value: rows.filter((r) => r.piiFlagged).length, accent: C.warning, icon: 'shield' },
  ];

  const acik = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <div>
      <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>
        {trModeration.title}
      </h1>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 6px' }}>{trModeration.lead}</p>
      <p style={{ fontSize: 12.5, color: C.muted2, margin: '0 0 18px', lineHeight: 1.5 }}>
        {trModeration.note}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fit, minmax(190px,1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map((c) => (
          <StatCard key={c.key} label={c.label} value={c.value} hint={c.hint} accent={c.accent} icon={c.icon} primary={c.primary} />
        ))}
      </div>

      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <label style={{ display: 'block', minWidth: mob ? '100%' : 260 }}>
          <span style={{ ...eyebrow, display: 'block', marginBottom: 5 }}>{trModeration.filterOperation}</span>
          <Picker
            value={disasterId}
            onChange={setDisasterId}
            options={[{ value: '', label: trModeration.filterAll }, ...operations]}
          />
        </label>
        <button type="button" onClick={() => void yukle(disasterId)} disabled={loading} className="hv-navy" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
          borderRadius: 9, minHeight: 46, padding: '0 14px', fontSize: 13.5, fontWeight: 600,
          cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          <Ico n="activity" size={15} color={C.navy} />
          {loading ? trModeration.refreshing : trModeration.refresh}
        </button>
      </div>

      {error ? (
        <div role="alert" style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, color: C.errorText, fontWeight: 600 }}>{trModeration.loadFailed}</div>
          <button type="button" onClick={() => void yukle(disasterId)} className="hv-navy" style={{
            marginTop: 10, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{trModeration.retry}</button>
        </div>
      ) : loading && rows.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, fontSize: 14, color: C.muted }}>
          {tr.common.loading}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.heading2 }}>{trModeration.empty}</div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{trModeration.emptyHint}</p>
        </div>
      ) : mob ? (
        <MobileList rows={rows} onOpen={setOpenId} />
      ) : (
        <DesktopTable rows={rows} onOpen={setOpenId} />
      )}

      <Suspense fallback={null}>
        {acik && (
          <Drawer
            row={acik}
            onClose={() => setOpenId(null)}
            onChanged={() => { setOpenId(null); void yukle(disasterId); }}
          />
        )}
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Masaüstü tablo
// ---------------------------------------------------------------------------
function DesktopTable({ rows, onOpen }: { rows: UpdateQueueRow[]; onOpen: (id: string) => void }) {
  const th: React.CSSProperties = {
    ...eyebrow, textAlign: 'left', padding: '10px 12px',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px', borderBottom: `1px solid ${C.borderFaint}`, fontSize: 13.5, verticalAlign: 'top',
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {trModeration.title}
        </caption>
        <thead>
          <tr>
            <th scope="col" style={th}>{trModeration.colUpdate}</th>
            <th scope="col" style={th}>{trModeration.colAuthor}</th>
            <th scope="col" style={th}>{trModeration.colFlags}</th>
            <th scope="col" style={th}>{trModeration.colWaiting}</th>
            <th scope="col" style={th}>{trModeration.colAction}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, maxWidth: 420 }}>
                <span style={{ display: 'block', fontWeight: 600, color: C.heading2, lineHeight: 1.45 }}>
                  {r.body.length > 140 ? r.body.slice(0, 140) + '…' : r.body}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 3 }}>
                  {[UPDATE_TYPE_LABEL[r.type], r.disasterName].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td style={td}>
                <span style={{ display: 'block', color: C.heading2, fontWeight: 600 }}>
                  {trModeration.authorLabel[r.authorType] ?? r.authorType}
                </span>
                {/* Liste MASKELİ iletişim gösteriyor; tam bilgi çekmecede, gerekçeyle. */}
                <span style={{ display: 'block', fontSize: 12, color: C.muted2 }}>{r.contactMasked || '—'}</span>
              </td>
              <td style={td}><FlagBadges r={r} /></td>
              <td style={{ ...td, whiteSpace: 'nowrap' }} className="tnum">{bekleme(r.createdAt)}</td>
              <td style={td}>
                <button type="button" onClick={() => onOpen(r.id)} className="hv-navy" style={{
                  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                  borderRadius: 9, padding: '0 13px', height: 44, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{trModeration.open}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobil kartlar — tablo küçültülmüyor
// ---------------------------------------------------------------------------
function MobileList({ rows, onOpen }: { rows: UpdateQueueRow[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.id} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${r.openReports > 0 ? C.emergency : r.piiFlagged ? C.warning : C.borderSoft}`,
          borderRadius: 12, padding: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {[UPDATE_TYPE_LABEL[r.type], trModeration.authorLabel[r.authorType] ?? r.authorType].join(' · ')}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: C.heading2, lineHeight: 1.5 }}>
            {r.body.length > 180 ? r.body.slice(0, 180) + '…' : r.body}
          </p>
          <div style={{ marginTop: 8 }}><FlagBadges r={r} /></div>
          <div className="tnum" style={{ fontSize: 12.5, color: C.muted2, marginTop: 8 }}>
            {bekleme(r.createdAt)} · {r.disasterName}
          </div>
          <button type="button" onClick={() => onOpen(r.id)} className="hv-navy" style={{
            marginTop: 12, width: '100%', background: C.surface, border: `1px solid ${C.borderSoft}`,
            color: C.navy, borderRadius: 9, minHeight: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{trModeration.open}</button>
        </div>
      ))}
    </div>
  );
}
