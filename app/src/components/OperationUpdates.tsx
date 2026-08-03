import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { trUpdates, UPDATE_TYPE_LABEL, UPDATE_FILTERS } from '../i18n/operationUpdates';
import { C } from '../theme';
import { eyebrow, Ico, type IcoName } from '../ui';
import { repo } from '../data';
import type { OperationUpdate, OperationUpdateType, UpdateFeedCursor } from '../types';

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
        {u.photoCount > 0 && <span>{trUpdates.photoCount(u.photoCount)}</span>}
      </div>

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
        <span style={{ fontSize: 12, color: C.muted2 }}>{trUpdates.formLead}</span>
      </div>

      {/* Süzgeç çipleri — seçim SORGUYA gidiyor, tarayıcıda gizleme yok. */}
      <div role="tablist" aria-label={trUpdates.filters}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
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
            onSent={() => { setFormOpen(false); }}
          />
        )}
        {reportId && <UpdateReportModal updateId={reportId} onClose={() => setReportId('')} />}
      </Suspense>
    </div>
  );
}
