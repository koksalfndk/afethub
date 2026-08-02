import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G, PRI } from '../theme';
import { Ico, ProgressBar, eyebrow, type IcoName } from '../ui';
import { categoryIcon } from '../needForm';
import { agoMinutes, formatDate } from '../util';
import { repo, fulfilmentRate, pickFeaturedNeeds, SITUATION_STALE_DAYS, isVerifiedDelivery } from '../data';
import type { EnrichedNeed } from '../select';
import type { OperationMedia, OperationStage, OperationUpdate } from '../types';

// ---------------------------------------------------------------------------
// Faz 2 — Genel Bakış.
//
// Bu dosya YALNIZCA OKUNUR. Gönderi formu, moderasyon aracı ve teslim sözü formu
// bilinçli olarak yok (Faz 3-4). Buradaki her bölüm tek bir soruyu cevaplıyor ve
// cevabı yoksa bunu söylüyor — boş bir kartı iskeletle doldurmak, olmayan bir
// veriyi varmış gibi göstermenin en sessiz biçimi (rules/04 §Empty States).
// ---------------------------------------------------------------------------

const cardBase = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
  position: 'relative' as const, overflow: 'hidden' as const,
};

function SectionCard({ title, action, children, pad = 18 }: {
  title: string; action?: React.ReactNode; children: React.ReactNode; pad?: number;
}) {
  return (
    <section style={{ ...cardBase, padding: pad }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {/* h2: sayfanın h1'i operasyon adı, bunlar onun altındaki bölümler. Araya
            atlanan bir seviye, ekran okuyucuda bölüm listesini bozar
            (rules/04 §Accessibility — logical heading order). */}
        <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: C.navy }}>{title}</h2>
        {action}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

// Boş durum: gerçeği anlatır, "her şey tamam" demez.
function Empty({ text }: { text: string }) {
  return (
    <p style={{
      margin: 0, fontSize: 13.5, color: C.muted, background: C.canvas,
      border: `1px dashed ${C.borderSoft}`, borderRadius: 10, padding: '14px 15px',
    }}>{text}</p>
  );
}

// ---------------------------------------------------------------------------
// Operasyon aşaması
// ---------------------------------------------------------------------------
// Durum RENKLE DEĞİL, önce metinle anlatılıyor: rozet her zaman aşamanın Türkçe
// adını yazıyor, renk yalnızca ona eşlik ediyor (rules/04 §Accessibility).
const STAGE_TONE: Record<OperationStage, { fg: string; bg: string; bd: string; icon: IcoName }> = {
  initial_response:   { fg: '#A32027', bg: '#FEF3F2', bd: '#F6C9C9', icon: 'critical' },
  intensive_response: { fg: '#A32027', bg: '#FEF3F2', bd: '#F6C9C9', icon: 'critical' },
  evacuation:         { fg: '#B45309', bg: '#FFF6ED', bd: '#FBD3AC', icon: 'people' },
  cooling:            { fg: '#946B00', bg: '#FFF8E5', bd: '#F2DFA8', icon: 'activity' },
  recovery:           { fg: '#2A6FB0', bg: '#EFF6FB', bd: '#CBE0F0', icon: 'activity' },
  monitoring:         { fg: '#0F766E', bg: '#ECFAF7', bd: '#BFE7E0', icon: 'shield' },
  completed:          { fg: '#157F3E', bg: '#EAF7EF', bd: '#C9E9D6', icon: 'completed' },
};

export function OperationStageBlock({ compact = false }: { compact?: boolean }) {
  const a = useApp();
  const d = a.snap?.disaster;
  if (!d) return null;
  const stage = d.operationStage ?? null;
  const tone = stage ? STAGE_TONE[stage] : null;
  const note = (d.operationStageNote ?? '').trim();

  return (
    <div style={{
      marginTop: 10, background: tone ? tone.bg : C.chipNavyBg,
      border: `1px solid ${tone ? tone.bd : C.borderSoft}`,
      borderLeft: `3px solid ${tone ? tone.fg : C.muted3}`,
      borderRadius: 10, padding: compact ? '10px 12px' : '11px 14px', maxWidth: '72ch',
    }}>
      <div style={eyebrow}>{tr.disaster.stage.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <Ico n={tone ? tone.icon : 'activity'} size={16} color={tone ? tone.fg : C.muted} />
        <strong style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: tone ? tone.fg : C.muted, letterSpacing: '-.01em' }}>
          {stage ? tr.disaster.stage.names[stage] : tr.disaster.stage.none}
        </strong>
        {/* Aşama yazılmışsa güncellenme zamanı anlamlı; yazılmamışsa bir zaman
            göstermek "belirtilmedi"yi bir olay gibi okutur. */}
        {stage && d.operationStageSetAt
          ? <span style={{ fontSize: 12, color: C.muted2 }}>· {tr.disaster.stage.updated(d.operationStageSetAt)}</span>
          : null}
      </div>
      {/* Açıklama YOKSA uydurulmuyor: yalnızca etiket kalır. */}
      <p style={{ margin: '6px 0 0', fontSize: 13.5, color: stage ? C.heading2 : C.muted, lineHeight: 1.45 }}>
        {note || (stage ? '' : tr.disaster.stage.noneHint)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Şu anda en çok ihtiyaç duyulan destek
// ---------------------------------------------------------------------------
export function FeaturedNeeds({ needs }: { needs: EnrichedNeed[] }) {
  const a = useApp();
  const { items, manual } = useMemo(() => pickFeaturedNeeds(needs), [needs]);
  if (items.length === 0) return null;

  return (
    <div style={{ ...cardBase, background: G.heroCard, padding: '14px 16px' }}>
      <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: G.heroRibbon }} />
      <div style={eyebrow}>{tr.disaster.featured.title}</div>
      <ul style={{
        listStyle: 'none', margin: '9px 0 0', padding: 0,
        display: 'flex', flexWrap: 'wrap', gap: 8,
      }}>
        {items.map((n) => (
          <li key={n.id}>
            {/* Doğrudan o kalemin hızlı bakış penceresine gider — ziyaretçi listeyi
                yeniden taramak zorunda kalmaz. */}
            <button
              onClick={() => a.openDisaster(a.snap!.disaster.slug, 'needs', n.id)}
              className="hv-navy"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48,
                background: C.surface, border: `1px solid ${(PRI[n.priority] ?? PRI.Normal).border}`,
                borderRadius: 24, padding: '10px 15px', cursor: 'pointer',
                fontSize: 14.5, fontWeight: 600, color: C.navy, textAlign: 'left',
              }}
            >
              <Ico n={categoryIcon(n.cat)} size={16} color={n.barColor} />
              <span>{n.name}</span>
              <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: n.barColor }}>
                {tr.disaster.left(n.remaining)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Seçimin nereden geldiğini söylemek, listeye güvenmenin ön şartı. */}
      <p style={{ margin: '9px 0 0', fontSize: 12, color: C.muted2 }}>
        {manual ? tr.disaster.featured.manual : tr.disaster.featured.auto}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sahadan fotoğraflar
// ---------------------------------------------------------------------------
// Kova ÖZEL: `storagePath` tek başına bir görüntü açmıyor, kısa ömürlü imzalı bir
// bağlantı gerekiyor. Bağlantısı üretilemeyen fotoğraf listede YER ALMAZ — kırık bir
// çerçeve, olmayan bir kanıt gibi durur.
function PhotoStrip({ media }: { media: OperationMedia[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const shown = useMemo(() => media.slice(0, 6), [media]);
  const paths = useMemo(() => shown.map((m) => m.storagePath).join('|'), [shown]);

  useEffect(() => {
    if (shown.length === 0) { setUrls({}); setState('idle'); return; }
    let alive = true;
    setState('loading');
    repo.signMedia(shown.map((m) => m.storagePath))
      .then((map) => { if (alive) { setUrls(map); setState('idle'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
    // `paths` bilinçli: dizi kimliği her render'da değişir, içerik değişmedikçe
    // yeniden imzalamak gereksiz ağ trafiği olurdu.
  }, [paths, shown]);

  const usable = shown.filter((m) => urls[m.storagePath]);

  const close = useCallback(() => setOpenIdx(null), []);
  const step = useCallback((delta: number) => {
    setOpenIdx((i) => (i == null ? i : (i + delta + usable.length) % usable.length));
  }, [usable.length]);

  if (media.length === 0) return <Empty text={tr.disaster.photos.none} />;
  if (state === 'loading') return <Empty text={tr.disaster.photos.loading} />;
  if (state === 'error') return <Empty text={tr.disaster.photos.error} />;
  if (usable.length === 0) return <Empty text={tr.disaster.photos.none} />;

  return (
    <>
      {/* Telefonda yatay kaydırma (swipe), masaüstünde ızgara. */}
      <ul style={{
        listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      }}>
        {usable.map((m, i) => (
          <li key={m.id}>
            <button
              onClick={() => setOpenIdx(i)}
              style={{
                display: 'block', width: '100%', padding: 0, border: `1px solid ${C.border}`,
                borderRadius: 10, overflow: 'hidden', background: C.canvas, cursor: 'pointer',
              }}
              aria-label={tr.disaster.photos.openAria(m.caption || tr.disaster.photos.untitled)}
            >
              <img
                src={urls[m.storagePath]}
                alt={m.caption || tr.disaster.photos.untitled}
                width={m.width ?? 400} height={m.height ?? 300}
                loading="lazy"
                style={{ display: 'block', width: '100%', height: 118, objectFit: 'cover' }}
              />
              <span style={{ display: 'block', padding: '8px 10px 10px', textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.navy, lineHeight: 1.35 }}>
                  {m.caption || tr.disaster.photos.untitled}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 3 }}>
                  {[m.locationText, m.capturedAt ? formatDate(m.capturedAt.slice(0, 10)) : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {openIdx != null && usable[openIdx] && (
        <Lightbox
          item={usable[openIdx]} url={urls[usable[openIdx].storagePath]}
          index={openIdx} total={usable.length}
          onClose={close} onPrev={() => step(-1)} onNext={() => step(1)}
        />
      )}
    </>
  );
}

function Lightbox({ item, url, index, total, onClose, onPrev, onNext }: {
  item: OperationMedia; url: string; index: number; total: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const navBtn = {
    minWidth: 48, minHeight: 48, borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)', color: '#fff',
    fontSize: 14, fontWeight: 600,
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label={item.caption || tr.disaster.photos.untitled}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,18,28,.92)',
        display: 'flex', flexDirection: 'column', padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span className="tnum" style={{ color: '#AFC4D6', fontSize: 13 }}>{index + 1} / {total}</span>
        <button ref={closeRef} onClick={onClose} style={{ ...navBtn, padding: '0 16px' }}>
          {tr.common.close}
        </button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{
        flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 12, marginTop: 12,
      }}>
        {total > 1 && <button onClick={onPrev} style={navBtn} aria-label={tr.disaster.photos.prev}>‹</button>}
        <img
          src={url} alt={item.caption || tr.disaster.photos.untitled}
          style={{ flex: 1, minWidth: 0, maxHeight: '100%', objectFit: 'contain' }}
        />
        {total > 1 && <button onClick={onNext} style={navBtn} aria-label={tr.disaster.photos.next}>›</button>}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, color: '#EAF1F7', maxWidth: '80ch' }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{item.caption || tr.disaster.photos.untitled}</div>
        <div style={{ fontSize: 12.5, color: '#AFC4D6', marginTop: 4 }}>
          {[
            item.locationText,
            item.capturedAt ? formatDate(item.capturedAt.slice(0, 10)) : '',
            tr.disaster.photos.by(item.authorLabel),
            tr.disaster.photos.approved,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saha güncellemesi kartı
// ---------------------------------------------------------------------------
const UPDATE_TONE: Record<string, string> = {
  coordinator_update: C.info,
  institution_update: C.teal,
  safety_notice: C.emergency,
  delivery_update: C.success,
  need_update: C.orange,
  field_report: C.muted,
  public_comment: C.muted2,
  system_event: C.muted3,
};

function UpdateCard({ u }: { u: OperationUpdate }) {
  // Koordinatör / kurum / güvenlik güncellemeleri öne çıkar; kullanıcı gönderileri
  // görsel olarak geri planda kalır (direktif §5.1).
  const strong = u.type === 'coordinator_update' || u.type === 'institution_update' || u.type === 'safety_notice';
  const accent = UPDATE_TONE[u.type] ?? C.muted;
  return (
    <article style={{
      background: strong ? C.surface : C.canvas,
      border: `1px solid ${strong ? C.border : C.borderFaint}`,
      borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ ...eyebrow, color: accent }}>{tr.disaster.updates.types[u.type]}</span>
        <span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>{u.time}</span>
        {u.pinned && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: C.warningText, background: '#FFF8E5',
            border: '1px solid #F2DFA8', borderRadius: 20, padding: '2px 8px',
          }}>{tr.disaster.updates.pinned}</span>
        )}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 14, color: C.text, lineHeight: 1.5 }}>{u.body}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{u.authorLabel}</span>
        {/* Doğrulanmamış bir bildirim, doğrulanmış bir güncellemeyle aynı görünmez
            (rules/07 §Critical Distinctions). */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
          borderRadius: 20, padding: '2px 9px',
          color: u.verified ? C.successText : C.warningText,
          background: u.verified ? '#EAF7EF' : '#FFF8E5',
          border: `1px solid ${u.verified ? '#C9E9D6' : '#F2DFA8'}`,
        }}>
          <Ico n={u.verified ? 'verified' : 'pending'} size={12} color={u.verified ? C.successText : C.warningText} />
          {u.verified ? tr.disaster.updates.verified : tr.disaster.updates.awaitingReview}
        </span>
        {u.relatedNeedName && (
          <span style={{ fontSize: 12, color: C.muted }}>{tr.disaster.updates.relatedNeed(u.relatedNeedName)}</span>
        )}
        {u.approximateLocation && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.muted }}>
            <Ico n="pin" size={12} color={C.muted2} />{u.approximateLocation}
          </span>
        )}
      </div>
      {u.correctsUpdateId && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.warningText }}>
          {tr.disaster.updates.corrected}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Genel Bakış gövdesi
// ---------------------------------------------------------------------------
export function OperationOverview({ needs, mob, twoCol }: {
  needs: EnrichedNeed[]; mob: boolean; twoCol: string;
}) {
  const a = useApp();
  const snap = a.snap;
  if (!snap) return null;
  const d = snap.disaster;

  const activeNeeds = needs.filter((n) => n.remaining > 0).length;
  const completedNeeds = needs.length - activeNeeds;
  const rate = fulfilmentRate(activeNeeds, completedNeeds);
  const criticalNeeds = needs.filter((n) => n.priority === 'Critical' && n.remaining > 0).slice(0, 5);

  // Durum özeti bayatladı mı. Eşik tek bir yerde (SITUATION_STALE_DAYS) ve ekranda
  // da o sayı yazıyor.
  const staleMin = SITUATION_STALE_DAYS * 1440;
  const stale = agoMinutes(d.updatedLabel) >= staleMin;

  // Son doğrulanan teslimatlar denetim kaydından okunuyor — ayrı bir sayaç değil,
  // olayın kendisi. Gönderenin adı zaten `audit_log_public` tarafından maskeleniyor
  // ve burada hiç gösterilmiyor.
  const verifiedRows = snap.log.filter((l) => isVerifiedDelivery(l.action)).slice(0, 5);

  const updates = snap.updates.slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 4 — Durum özeti */}
      <SectionCard
        title={tr.disaster.situation}
        action={<span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>{tr.common.updated(d.updatedLabel)}</span>}
      >
        {d.situation
          ? <p style={{ fontSize: 14, color: C.text, margin: 0, lineHeight: 1.55, maxWidth: '78ch' }}>{d.situation}</p>
          : <Empty text={tr.disaster.situationNone} />}
        {stale && (
          <div role="status" style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12,
            background: '#FFFDF4', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
            borderRadius: 10, padding: '9px 12px', maxWidth: '72ch',
          }}>
            <span style={{ paddingTop: 1 }}><Ico n="critical" size={14} color={C.warningText} /></span>
            <span style={{ fontSize: 12.5, color: C.heading2 }}>{tr.disaster.situationStale(SITUATION_STALE_DAYS)}</span>
          </div>
        )}
      </SectionCard>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: twoCol }}>
        {/* 5 — Kritik ihtiyaçlar */}
        <SectionCard
          title={tr.disaster.criticalNeeds}
          action={
            <button onClick={() => a.go('disaster', { tab: 'needs' })} style={{
              background: 'none', border: 0, padding: '12px 4px', fontSize: 13, fontWeight: 600,
              color: C.navy, cursor: 'pointer', textDecoration: 'underline', minHeight: 44,
            }}>{tr.disaster.allNeeds}</button>
          }
        >
          {criticalNeeds.length === 0 ? <Empty text={tr.disaster.noCriticalNeeds} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criticalNeeds.map((n) => (
                <div key={n.id} style={{ border: '1px solid #F6C9C9', background: '#FEF7F7', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>
                      <Ico n={categoryIcon(n.cat)} size={15} color={C.emergency} />{n.name}
                    </span>
                    {/* Kalan miktar birimiyle birlikte: çıplak bir sayı "135" neyin
                        135'i olduğunu söylemiyor (rules/04 §Quantity Display). */}
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: C.emergency, whiteSpace: 'nowrap' }}>
                      {tr.disaster.remainingWithUnit(n.remaining, n.unit)}
                    </span>
                  </div>
                  <div style={{ marginTop: 10 }}><ProgressBar pct={n.pctVal} color={C.emergency} height={6} track="#F1D6D6" /></div>
                  {/* İkincil sayılar daha hafif ve HER BİRİ ETİKETLİ. "Bekleyen" ve
                      "teslim sözü" kalan miktarı DEĞİŞTİRMİYOR; cümle bunu yazıyor. */}
                  <div className="tnum" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: C.muted }}>
                    <span>{tr.disaster.verifiedUnit(n.verified, n.required, n.unit)}</span>
                    <span>{tr.disaster.pendingInline(n.pending)}</span>
                    {(n.pledged ?? 0) > 0 && <span>{tr.disaster.pledge.planned(n.pledged ?? 0, n.unit)}</span>}
                  </div>
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 11.5, color: C.muted2 }}>{tr.disaster.secondaryAmountsNote}</p>
            </div>
          )}
        </SectionCard>

        {/* 6 — Operasyon ilerleme kartı */}
        <SectionCard title={tr.disaster.progress.title}>
          {rate == null ? <Empty text={tr.disaster.fulfilRateNone} /> : (
            <>
              <div className="tnum" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: C.success }}>
                %{rate}
              </div>
              <div style={{ marginTop: 10 }}><ProgressBar pct={rate} color={C.success} height={8} /></div>
              <dl style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))',
                gap: 10, margin: '14px 0 0',
              }}>
                {[
                  [tr.disaster.progress.published, needs.length],
                  [tr.disaster.progress.completed, completedNeeds],
                  [tr.disaster.progress.active, activeNeeds],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 11, background: C.canvas }}>
                    <dt style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</dt>
                    <dd className="tnum" style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 700, color: C.navy }}>{value}</dd>
                  </div>
                ))}
              </dl>
              {/* Hesap yöntemi ekranda açıkça yazılı — yüzdeyi miktar oranı sanan
                  okuyucu, sayfanın en yanıltıcı satırını okumuş olurdu. */}
              <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted2, lineHeight: 1.5 }}>
                {tr.disaster.fulfilRateHow}
              </p>
            </>
          )}
        </SectionCard>
      </div>

      {/* 7 — Sahadan fotoğraflar */}
      <SectionCard title={tr.disaster.photos.title}>
        <PhotoStrip media={snap.media} />
      </SectionCard>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: twoCol }}>
        {/* 8 — Son doğrulanan teslimatlar */}
        <SectionCard title={tr.disaster.lastVerified.title}>
          {verifiedRows.length === 0 ? <Empty text={tr.disaster.lastVerified.none} /> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {verifiedRows.map((l) => (
                <li key={l.id} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  borderBottom: `1px solid ${C.borderFaint}`, paddingBottom: 9,
                }}>
                  <span style={{ paddingTop: 2 }}><Ico n="verified" size={15} color={C.success} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {/* Gönderen kişi GÖSTERİLMEZ: doğrulanan şey teslimat, kişi değil. */}
                    <span style={{ display: 'block', fontSize: 13.5, color: C.heading2, lineHeight: 1.45 }}>{l.detail}</span>
                    <span className="tnum" style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 2 }}>{l.time}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 9 — Saha güncellemeleri önizlemesi */}
        <SectionCard title={tr.disaster.updates.title}>
          {updates.length === 0 ? <Empty text={tr.disaster.updates.none} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {updates.map((u) => <UpdateCard key={u.id} u={u} />)}
              {/* "Tüm güncellemeleri gör" AKSİYONU YOK: hedef route Faz 4'te
                  yazılacak ve çalışmayan bir bağlantı göstermek, olmayan bir sayfayı
                  varmış gibi sunmak olurdu (direktif §17). */}
              <p style={{ margin: 0, fontSize: 12, color: C.muted2 }}>{tr.disaster.updates.previewNote}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* 10 — Operasyon bilgi özeti */}
      <section style={{
        border: `1px solid ${C.borderFaint}`, borderRadius: 12, background: C.canvas,
        padding: mob ? '14px 15px' : '16px 18px',
      }}>
        <div style={eyebrow}>{tr.disaster.footer.title}</div>
        <dl style={{
          display: 'grid', gap: '10px 18px', margin: '10px 0 0',
          gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fit, minmax(160px,1fr))',
        }}>
          {[
            [tr.disaster.footer.opened, formatDate(d.openedAt)],
            [tr.disaster.footer.stage, d.operationStage ? tr.disaster.stage.names[d.operationStage] : tr.disaster.stage.none],
            [tr.disaster.footer.team, tr.disaster.startedByAfethub],
            [tr.disaster.footer.published, String(needs.length)],
            [tr.disaster.footer.completed, String(completedNeeds)],
            [tr.disaster.footer.updated, d.updatedLabel || '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt style={{ fontSize: 11.5, color: C.muted2, fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: 13.5, color: C.navy, fontWeight: 600 }}>{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
