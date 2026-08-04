import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { trUpdates, UPDATE_TYPE_LABEL, UPDATE_FILTERS } from '../i18n/operationUpdates';
import { C } from '../theme';
import { eyebrow, Ico, type IcoName } from '../ui';
import { repo } from '../data';
import type { OperationUpdate, OperationUpdateType, UpdateFeedCursor, UpdateFeedEvent, RealtimeStatus } from '../types';

// Gönderim formu ve raporlama penceresi ağır: ancak kullanıcı gerçekten
// göndermek ya da bildirmek istediğinde iniyorlar (rules/09 §8).
const UpdateForm = lazy(() => import('./UpdateForm').then((m) => ({ default: m.UpdateForm })));
const UpdateReportModal = lazy(() => import('./UpdateReportModal').then((m) => ({ default: m.UpdateReportModal })));

// ---------------------------------------------------------------------------
// Tür rozeti — renk TEK BAŞINA anlam taşımıyor: ikon + metin birlikte
// (rules/04 §Accessibility). Güvenlik uyarısı en görünür tür, kullanıcı yorumu
// en sessiz olan.
// ---------------------------------------------------------------------------
const TYPE_TONE: Record<OperationUpdateType, { bg: string; border: string; fg: string; icon: IcoName }> = {
  safety_notice:      { bg: '#FEF3F2', border: '#F6C9C9', fg: '#B42318', icon: 'critical' },
  coordinator_update: { bg: '#EEF4FB', border: '#CFE0F2', fg: '#1E5C93', icon: 'shield' },
  institution_update: { bg: '#EFF6FB', border: '#CBE0F0', fg: '#1E5C93', icon: 'people' },
  delivery_update:    { bg: '#FFF8E5', border: '#F2DFA8', fg: '#8A6100', icon: 'need' },
  need_update:        { bg: '#FFF4E8', border: '#F2D2A8', fg: '#8A4A00', icon: 'need' },
  field_report:       { bg: '#F4F7FA', border: '#D9E2EC', fg: '#334E68', icon: 'pin' },
  public_comment:     { bg: C.canvas, border: C.borderSoft, fg: C.muted, icon: 'people' },
  system_event:       { bg: C.canvas, border: C.borderSoft, fg: C.muted, icon: 'activity' },
};

function TypeBadge({ t }: { t: OperationUpdateType }) {
  const tone = TYPE_TONE[t] ?? TYPE_TONE.field_report;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 12, fontWeight: 700, color: tone.fg, background: tone.bg,
      border: `1px solid ${tone.border}`, borderRadius: 20, padding: '4px 9px',
    }}>
      <Ico n={tone.icon} size={12} color={tone.fg} />
      {UPDATE_TYPE_LABEL[t] ?? t}
    </span>
  );
}

function Chip({ text, tone, icon }: { text: string; tone: 'warn' | 'ok' | 'muted'; icon: IcoName }) {
  const c = tone === 'warn'
    ? { bg: '#FFF8E5', bd: '#F2DFA8', fg: '#8A6100' }
    : tone === 'ok'
      ? { bg: '#EAF7EF', bd: '#C9E9D6', fg: '#157F3E' }
      : { bg: C.canvas, bd: C.borderSoft, fg: C.muted };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 11.5, fontWeight: 700, color: c.fg, background: c.bg,
      border: `1px solid ${c.bd}`, borderRadius: 20, padding: '3px 8px',
    }}><Ico n={icon} size={11} color={c.fg} />{text}</span>
  );
}

// Kartın onaylı fotoğrafları. "N fotoğraf" bir düğme: bağlantılar ancak kişi
// isteyince İMZALANIYOR — akıştaki her kart için imzalı URL üretmek, hiç
// bakılmayacak fotoğraflar için ağ trafiği ve kısa ömürlü bağlantı israfı olurdu.
// Kaynak `snap.media` (operation_media_public): yalnızca onaylı VE yayımlanmış
// ekler; bekleyen fotoğraf buraya sunucu gereği hiç düşmüyor.
function CardPhotos({ updateId, count }: { updateId: string; count: number }) {
  const a = useApp();
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const items = (a.snap?.media ?? []).filter((m) => m.updateId === updateId);
  // Sayı kartın kendi verisinden; medya listesi anlık görüntüden. İkisi kısa bir
  // süre ayrışabilir (yeni onay) — düğme sayıyı, açılan ızgara gerçekte imzalanabileni gösterir.
  if (items.length === 0 && count === 0) return null;

  const ac = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (items.length === 0 || Object.keys(urls).length > 0) return;
    setState('loading');
    try {
      setUrls(await repo.signMedia(items.map((m) => m.storagePath)));
      setState('idle');
    } catch { setState('error'); }
  };

  const usable = items.filter((m) => urls[m.storagePath]);
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => void ac()} aria-expanded={open} style={{
        background: 'none', border: 0, color: C.navy, fontSize: 12.5, fontWeight: 700,
        cursor: 'pointer', textDecoration: 'underline', padding: '0 2px', minHeight: 44,
      }}>{trUpdates.photoCount(count)}</button>
      {open && (
        state === 'loading' ? (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>{trUpdates.photosLoading}</p>
        ) : state === 'error' || (items.length > 0 && usable.length === 0) ? (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>{trUpdates.photosUnavailable}</p>
        ) : usable.length === 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted }}>{trUpdates.photosUnavailable}</p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {usable.map((m) => (
              <a key={m.id} href={urls[m.storagePath]} target="_blank" rel="noreferrer">
                <img src={urls[m.storagePath]} alt={m.caption || trUpdates.photoAlt}
                  width={m.width ?? 96} height={m.height ?? 96} loading="lazy"
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.borderFaint}`, display: 'block' }} />
              </a>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function UpdateCard({ u, onReport }: { u: OperationUpdate; onReport: (id: string) => void }) {
  const safety = u.type === 'safety_notice';
  const quiet = u.type === 'public_comment';
  return (
    <article style={{
      background: quiet ? C.canvas : C.surface,
      border: `1px solid ${safety ? '#F6C9C9' : C.border}`,
      borderLeft: safety ? '4px solid #D9363E' : `1px solid ${quiet ? C.borderFaint : C.border}`,
      borderRadius: 12, padding: 14, opacity: quiet ? 0.92 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <TypeBadge t={u.type} />
        {u.pinned && <Chip text={trUpdates.pinnedBadge} tone="warn" icon="pin" />}
        {u.correctsUpdateId && <Chip text={trUpdates.correctedBadge} tone="warn" icon="activity" />}
        {/* Doğrulama durumu KELİMEYLE yazılıyor: rules/07 §Critical Distinctions
            doğrulanmamış bir bildirimi kesin bilgi gibi göstermeyi yasaklıyor. */}
        <Chip
          text={u.verified ? trUpdates.verifiedBadge : trUpdates.unverifiedBadge}
          tone={u.verified ? 'ok' : 'muted'}
          icon={u.verified ? 'verified' : 'pending'}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted2, whiteSpace: 'nowrap' }}>{u.time}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: C.heading2, marginBottom: 4 }}>{u.authorLabel}</div>

      {u.correctsUpdateId && (
        <div style={{ fontSize: 12.5, color: '#8A6100', marginBottom: 6 }}>{trUpdates.correctedNote}</div>
      )}

      <p style={{ margin: '0 0 10px', fontSize: 14.5, lineHeight: 1.55, color: C.text, whiteSpace: 'pre-wrap' }}>
        {u.body}
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: C.muted }}>
        {u.relatedNeedName && <span>{trUpdates.relatedNeed}: <strong style={{ color: C.navy }}>{u.relatedNeedName}</strong></span>}
        {u.relatedLocationName && <span>{trUpdates.relatedLocation}: <strong style={{ color: C.navy }}>{u.relatedLocationName}</strong></span>}
        {u.approximateLocation && <span>{trUpdates.area}: <strong style={{ color: C.navy }}>{u.approximateLocation}</strong></span>}
      </div>

      {u.photoCount > 0 && <CardPhotos updateId={u.id} count={u.photoCount} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={() => onReport(u.id)} style={{
          background: 'none', border: 0, color: C.muted2, fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', textDecoration: 'underline', minHeight: 44, padding: '0 4px',
        }}>{trUpdates.report}</button>
      </div>
    </article>
  );
}

export function OperationUpdates() {
  const a = useApp();
  const disasterId = a.snap?.disaster.id ?? '';
  const mob = a.device === 'mobile';

  const [type, setType] = useState<OperationUpdateType | ''>(() => {
    // Süzgeç adreste taşınıyor: paylaşılan bir bağlantı aynı görünümü açmalı.
    const p = new URLSearchParams(window.location.search).get('type') ?? '';
    return (UPDATE_FILTERS.some((f) => f.key === p) ? p : '') as OperationUpdateType | '';
  });
  const [pinned, setPinned] = useState<OperationUpdate[]>([]);
  const [rows, setRows] = useState<OperationUpdate[]>([]);
  const [cursor, setCursor] = useState<UpdateFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [reportId, setReportId] = useState('');

  // Senkron kilit: `loadingMore` bir sonraki render'da uygulanıyor, aynı tick
  // içindeki ikinci tıklama ondan önce geçer ve aynı sayfayı iki kez ekler
  // (Faz 3-A'da üretimde ölçülen kusurun aynısı).
  const moreLock = useRef(false);

  // ---- Canlı akış (Faz 4-A) -------------------------------------------------
  // `idle` = bu modda realtime yok (yerel demo); gösterge hiç çizilmiyor.
  const [rtStatus, setRtStatus] = useState<'idle' | RealtimeStatus>('idle');
  // Yeni gelen kayıtlar TAMPONDA bekliyor; "N yeni güncelleme"ye basılınca akışa
  // giriyor. Kendiliğinden eklemek okunan listeyi kaydırırdı.
  const [fresh, setFresh] = useState<OperationUpdate[]>([]);
  // Olay işleyicisinin güncel süzgece bakması gerekiyor ama abonelik süzgeç
  // değişince YENİDEN KURULMAMALI (WebSocket'i her çip tıklamasında koparmak
  // olurdu) — süzgeç bir ref üzerinden okunuyor.
  const typeRef = useRef(type);
  typeRef.current = type;

  const ilkYukle = useCallback(async () => {
    if (!disasterId) return;
    setLoading(true);
    setError('');
    try {
      const [p, page] = await Promise.all([
        repo.listPinnedOperationUpdates(disasterId),
        repo.listOperationUpdates({ disasterId, type }, null),
      ]);
      setPinned(p);
      setRows(page.rows);
      setCursor(page.cursor);
    } catch {
      // Ham sunucu iletisi gösterilmiyor (rules/03 §Error Handling).
      setError(trUpdates.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [disasterId, type]);

  useEffect(() => { void ilkYukle(); }, [ilkYukle]);

  // Süzgeç değiştiğinde ya da akış baştan yüklendiğinde tampon anlamını yitiriyor:
  // içindekiler ya yeni süzgece uymuyor ya da zaten listede.
  useEffect(() => { setFresh([]); }, [ilkYukle]);

  const ilkYukleRef = useRef(ilkYukle);
  ilkYukleRef.current = ilkYukle;

  // Olay geldi → kayıt GÜVENLİ görünümden yeniden okunur. Olayın kendisi asla
  // render edilmiyor: gövde/PII taşımıyor ve source-of-truth değil (0048).
  const olayIsle = useCallback(async (e: UpdateFeedEvent) => {
    if (e.eventType === 'hidden') {
      // Gizlenen içerik istemciden HEMEN düşer (değişmez karar). Veritabanında
      // durmaya devam ediyor; bu yalnızca ekrandan kaldırma.
      setRows((prev) => prev.filter((u) => u.id !== e.updateId));
      setPinned((prev) => prev.filter((u) => u.id !== e.updateId));
      setFresh((prev) => prev.filter((u) => u.id !== e.updateId));
      return;
    }
    // Aktif süzgece uymayan yayın tamponu ŞİŞİRMEMELİ: "3 yeni güncelleme" deyip
    // gösterince hiçbir şey eklememek güveni bozar.
    if ((e.eventType === 'published' || e.eventType === 'corrected')
        && typeRef.current && e.updateType !== typeRef.current) return;

    let kayit: OperationUpdate | null = null;
    try {
      kayit = await repo.getOperationUpdate(e.updateId);
    } catch { return; /* okunamadıysa olay atlanır; tam yenileme telafi eder */ }
    // Olay ile okuma arasında kayıt gizlenmiş olabilir — görünümden geldiyse yayında.
    if (!kayit) return;

    if (e.eventType === 'published' || e.eventType === 'corrected') {
      if (kayit.pinned) {
        // Sabit olarak doğan kayıt (örn. sabitlenmiş güvenlik uyarısının
        // düzeltmesi) akış tamponuna değil sabit bölümüne gider.
        try { setPinned(await repo.listPinnedOperationUpdates(disasterId)); } catch { /* sonraki yenileme */ }
        return;
      }
      const yeni = kayit;
      setFresh((prev) => (prev.some((u) => u.id === yeni.id) ? prev : [yeni, ...prev]));
      // Zaten akışta görünüyorsa (düzeltme zinciri vb.) yerinde güncelle.
      setRows((prev) => prev.map((u) => (u.id === yeni.id ? yeni : u)));
      return;
    }

    // pinned / unpinned / updated: sabit bölümü yeniden okunur, akıştaki kopya
    // yerinde tazelenir. Sabitlenen kayıt akıştan çıkar (sunucu listede zaten
    // döndürmeyecek); sabitliği kalkan kayıt kronolojik yerine bir sonraki tam
    // yenilemede döner — araya sokuşturmak sıralamayı bozar.
    try { setPinned(await repo.listPinnedOperationUpdates(disasterId)); } catch { /* sonraki yenileme */ }
    const guncel = kayit;
    if (e.eventType === 'pinned') {
      setRows((prev) => prev.filter((u) => u.id !== guncel.id));
      setFresh((prev) => prev.filter((u) => u.id !== guncel.id));
    } else {
      setRows((prev) => prev.map((u) => (u.id === guncel.id ? guncel : u)));
      setFresh((prev) => prev.map((u) => (u.id === guncel.id ? guncel : u)));
    }
  }, [disasterId]);

  const olayIsleRef = useRef(olayIsle);
  olayIsleRef.current = olayIsle;

  // Abonelik operasyon başına BİR kez kuruluyor; süzgeç ve işleyici ref'lerden.
  useEffect(() => {
    if (!disasterId) return;
    const kapat = repo.subscribeOperationUpdates(
      disasterId,
      (e) => { void olayIsleRef.current(e); },
      (s) => {
        setRtStatus((onceki) => {
          // Kopukluktan dönüşte kaçan olaylar telafi edilir: tam yenileme.
          if (s === 'live' && onceki === 'offline') void ilkYukleRef.current();
          return s;
        });
      },
    );
    return kapat;
  }, [disasterId]);

  const tamponuGoster = () => {
    setRows((prev) => {
      const varOlan = new Set(prev.map((u) => u.id));
      return [...fresh.filter((u) => !varOlan.has(u.id)), ...prev];
    });
    setFresh([]);
  };

  // Süzgeç adres çubuğuna yazılıyor ama geçmişe yeni kayıt EKLENMİYOR: süzgeç
  // değiştirmek bir gezinme değil, geri tuşu operasyon sayfasından çıkmalı.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (type) url.searchParams.set('type', type); else url.searchParams.delete('type');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [type]);

  const dahaFazla = async () => {
    if (moreLock.current || !cursor) return;
    moreLock.current = true;
    setLoadingMore(true);
    try {
      const page = await repo.listOperationUpdates({ disasterId, type }, cursor);
      // Kimlik bazında birleştirme: aynı kayıt iki kez eklenmemeli.
      setRows((prev) => {
        const varOlan = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !varOlan.has(r.id))];
      });
      setCursor(page.cursor);
    } catch {
      setError(trUpdates.loadFailed);
    } finally {
      moreLock.current = false;
      setLoadingMore(false);
    }
  };

  const bos = !loading && !error && pinned.length === 0 && rows.length === 0;

  return (
    <div>
      <h2 style={{ fontSize: mob ? 20 : 23, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>
        {trUpdates.title}
      </h2>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 6px' }}>{trUpdates.lead}</p>
      <p style={{ fontSize: 12.5, color: C.muted2, margin: '0 0 14px', lineHeight: 1.5 }}>{trUpdates.note}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button type="button" onClick={() => setFormOpen(true)} className="hv-navy" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
          borderRadius: 9, minHeight: 48, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}><Ico n="plus" size={15} color={C.navy} />{trUpdates.submit}</button>
        {/* Vaat role göre: koordinatörün gönderimi incelemeden GEÇMEZ ve bunu
            misafir cümlesiyle örtmek 3 Ağustos'ta üretimde yanlış çıktı. */}
        <span style={{ fontSize: 12, color: C.muted2 }}>
          {a.role === 'coordinator' ? trUpdates.coordLead : trUpdates.formLead}
        </span>
      </div>

      {/* Süzgeç çipleri — seçim SORGUYA gidiyor, tarayıcıda gizleme yok. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div role="tablist" aria-label={trUpdates.filters}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {UPDATE_FILTERS.map((f) => {
            const on = type === f.key;
            return (
              <button key={f.key || 'all'} type="button" role="tab" aria-selected={on}
                onClick={() => setType(f.key)}
                style={{
                  background: on ? C.navy : C.surface, border: `1px solid ${on ? C.navy : C.borderSoft}`,
                  color: on ? '#fff' : C.heading2, borderRadius: 20, padding: '10px 14px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                }}>{f.label}</button>
            );
          })}
        </div>
        {/* Bağlantı durumu — yalnızca realtime OLAN modda çiziliyor (`idle` = yok).
            Durum kelimeyle; nokta yalnızca destek (rules/04 §Accessibility). */}
        {rtStatus !== 'idle' && rtStatus !== 'offline' && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
            fontSize: 12, fontWeight: 600, color: rtStatus === 'live' ? '#157F3E' : C.muted2,
            whiteSpace: 'nowrap',
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 4,
              background: rtStatus === 'live' ? '#2FA45C' : C.muted3,
            }} />
            {rtStatus === 'live' ? trUpdates.rtLive : trUpdates.rtConnecting}
          </span>
        )}
      </div>

      {/* Kopukluk sessiz geçiştirilmiyor: akış bayat olabilir ve bunu söylemek
          "canlıymış gibi durmak"tan iyi (rules/01 §Freshness). Sarı, kırmızı değil:
          bu bir tehlike değil, bir bilgi tazeliği notu. */}
      {rtStatus === 'offline' && (
        <div role="status" style={{
          background: '#FFF8E5', border: '1px solid #F2DFA8', borderRadius: 10,
          padding: '9px 12px', fontSize: 12.5, color: '#8A6100', marginBottom: 14,
        }}>{trUpdates.rtOffline}</div>
      )}

      {/* Yeni kayıtlar kullanıcı İSTEYİNCE giriyor; sayaç ekran okuyucuya da
          duyuruluyor. Buton tüm şeridi kaplıyor — sahada eldivenli bir başparmak
          küçük bir bağlantıyı tutturamaz. */}
      {fresh.length > 0 && (
        <div role="status" aria-live="polite" style={{ marginBottom: 12 }}>
          <button type="button" onClick={tamponuGoster} className="hv-navy" style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#EEF4FB', border: '1px solid #CFE0F2', color: '#1E5C93',
            borderRadius: 10, minHeight: 48, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            <Ico n="activity" size={15} color="#1E5C93" />
            {trUpdates.rtNew(fresh.length)} · {trUpdates.rtShow}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: '#FEF3F2', border: '1px solid #F6C9C9', borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 14, color: C.errorText, fontWeight: 600 }}>{error}</div>
          <button type="button" onClick={() => void ilkYukle()} className="hv-navy" style={{
            marginTop: 10, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, minHeight: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{trUpdates.retry}</button>
        </div>
      )}

      {loading && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, fontSize: 14, color: C.muted }}>
          {tr.common.loading}
        </div>
      )}

      {bos && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.heading2 }}>
            {type ? trUpdates.emptyFiltered : trUpdates.empty}
          </div>
        </div>
      )}

      {/* Sabit uyarılar ayrı bölümde. Aynı kayıt aşağıdaki akışta İKİNCİ KEZ
          görünmüyor — sunucu onu listeden zaten çıkarıyor (migration 0048). */}
      {pinned.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>{trUpdates.pinnedTitle}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {pinned.map((u) => <UpdateCard key={u.id} u={u} onReport={setReportId} />)}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((u) => <UpdateCard key={u.id} u={u} onReport={setReportId} />)}
        </div>
      )}

      {cursor && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" onClick={() => void dahaFazla()} disabled={loadingMore} className="hv-navy" style={{
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, minHeight: 48, padding: '0 20px', fontSize: 14, fontWeight: 600,
            cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.7 : 1,
          }}>{loadingMore ? trUpdates.loadingMore : trUpdates.more}</button>
        </div>
      )}
      {!loading && !cursor && rows.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12.5, color: C.muted2, marginTop: 14 }}>{trUpdates.end}</p>
      )}

      <p style={{ fontSize: 12, color: C.muted2, marginTop: 18, lineHeight: 1.5 }}>{trUpdates.emergency}</p>

      <Suspense fallback={null}>
        {formOpen && (
          <UpdateForm
            onClose={() => setFormOpen(false)}
            // Koordinatörün gönderimi doğrudan yayımlanıyor; akış yenilenmezse
            // kendi güncellemesini göremez ve "kayboldu" sanır. Misafir için
            // yenileme zararsız bir fazlalık.
            onSent={() => { setFormOpen(false); void ilkYukle(); }}
          />
        )}
        {reportId && <UpdateReportModal updateId={reportId} onClose={() => setReportId('')} />}
      </Suspense>
    </div>
  );
}
