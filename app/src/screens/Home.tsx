import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import { tr, priorityLabel } from '../i18n/strings';
import { categoryIcon } from '../needForm';
import { C, G, PRI, type PriorityKey } from '../theme';
import { Ico, DISASTER_ICON, type IcoName } from '../ui';
import { HomeHero } from '../components/HomeHero';
import { AmountBlock } from '../components/AmountBlock';
import { HomeOperationsMap } from '../components/HomeOperationsMap';
import { ReportConfirmModal } from '../components/ReportConfirmModal';
import { COMMUNITY_THRESHOLD, isVerifiedDelivery } from '../data/repo';
import { formatDate, prefersReducedMotion } from '../util';
import type { DisasterType, DisasterReport } from '../types';
import type { DisasterCard } from '../data/repo';

// ---------------------------------------------------------------------------
// Herkese açık ana sayfa — "birleşim" tasarımı.
//
// Sayfa iki farklı ziyaretçiyi YARIŞTIRMIYOR, SIRAYA DİZİYOR.
//
// Üst üçte bir tamamen panikteki kullanıcıya ait: statik kahraman, üç düğme, tek
// sayı (kaç afet açık). Kaydırdıkça sayfa veriye dönüşüyor ve şüpheci ziyaretçinin
// aradığı kanıt geliyor — ama tablo diliyle değil, kart diliyle. Klasik hata ikisini
// aynı ekranda tatmin etmeye çalışıp ikisi için de yorucu bir orta yol üretmektir.
//
// Buradan KALDIRILANLAR ve nereye gittikleri:
//   · dört sayaçlık koyu şerit  → afet kartındaki miktar bloğuna (afet bazında anlamlı,
//                                 ulusal toplam olarak ziyaretçinin kararını değiştirmiyor)
//   · katlanan operasyon tablosu → /afet listesi ve afet detay sayfaları
//   · canlı hareket akışı kartı  → tek satır "son doğrulanan teslimat"
//   · "koordinasyon bir arada"   → kurumlar sayfası
//   · arama ve tür süzgeçleri    → 6 afetle süzgeç, olmayan bir sorunun çözümü
//
// Slider silinmedi, "Nasıl Çalışır" sayfasına taşındı (HowItWorks.tsx).
// ---------------------------------------------------------------------------

// Bir operasyonun manşet önceliği, açık ihtiyaçlarının en ağırıdır — türetilir,
// saklanmaz; yoksa ihtiyaçlardan kopar.
function worstPriority(c: DisasterCard): PriorityKey {
  let worst: PriorityKey = 'Normal';
  for (const n of c.topNeeds) {
    if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[worst] ?? PRI.Normal).rank) worst = n.priority;
  }
  return worst;
}

// "Nasıl yardım edebilirim" — dört yol, dördü de hesap açmadan.
const HELP_ACTIONS: {
  key: 'volunteer' | 'supply' | 'donate' | 'report';
  icon: IcoName; tint: string; run: (a: ReturnType<typeof useApp>) => void;
}[] = [
  { key: 'volunteer', icon: 'people',   tint: '#EAF7EF', run: (a) => a.go('volunteer') },
  { key: 'supply',    icon: 'need',     tint: '#FFF3E8', run: (a) => a.go('report') },
  { key: 'donate',    icon: 'org',      tint: C.chipNavyBg, run: (a) => a.go('orgs') },
  { key: 'report',    icon: 'critical', tint: '#FEF3F2', run: (a) => a.openDisasterForm() },
];

export function Home() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const ov = a.overview;

  // Tıklanan acil kalemin operasyon pinleri. Ölçü tıklama ANINDA alınır ve saklanır:
  // sonradan ölçüp düzeltmek, katmanın açıldıktan sonra zıplamasına yol açıyordu.
  const [pins, setPins] = useState<{ name: string; rect: DOMRect } | null>(null);
  const [confirming, setConfirming] = useState<DisasterReport | null>(null);
  // Dörtten fazla aktif operasyon varsa liste kısalır. Ayrı bir "tüm afetler"
  // ROTASI yok ve uydurulmadı: olmayan bir sayfaya giden düğme, çalışmayan düğmedir.
  // Genişletmek aynı ızgarayı büyütür, ziyaretçi yerini kaybetmez.
  const [showAll, setShowAll] = useState(false);
  const activeRef = useRef<HTMLElement | null>(null);

  if (!ov) return <div style={{ padding: 40, color: C.muted }}>{tr.common.loading}</div>;

  const t = tr.home;
  const SEC_GAP = mob ? 34 : 68;
  const panel = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
  } as const;

  const active = ov.disasters.filter((c) => c.disaster.status === 'Active');

  // Kahraman rozetindeki tazelik. En son güncellenen operasyonun etiketi kullanılıyor;
  // hiçbiri yoksa rozetin o yarısı hiç çizilmez (uydurulmuş bir "az önce" yok).
  const freshest = ov.log[0]?.time ?? active[0]?.disaster.updatedLabel ?? '';

  // Kartlarda gösterilecek operasyonlar: önce önceliğe, sonra kalan miktara.
  // Dört ile sınırlı — beşincisi "tümünü gör"ün arkasında.
  const sorted = active.slice().sort((x, y) =>
    (PRI[worstPriority(x)] ?? PRI.Normal).rank - (PRI[worstPriority(y)] ?? PRI.Normal).rank
    || y.remainingTotal - x.remainingTotal);
  const cards = showAll ? sorted : sorted.slice(0, 4);

  // Acil kalemler ADIYLA toplanır: `ov.urgent` operasyon başına satır veriyor ve
  // olduğu gibi basıldığında aynı kalem üç kez yan yana çıkıyor, ziyaretçi üç ayrı
  // ihtiyaç sanıyordu.
  const urgent = (() => {
    type Op = { id: string; name: string; slug: string; needId: string; remaining: number; type: DisasterType };
    const m = new Map<string, { name: string; cat: string; priority: PriorityKey; remaining: number; unit: string; ops: Op[] }>();
    for (const n of ov.urgent) {
      const card = ov.disasters.find((c) => c.disaster.id === n.disasterId);
      const op: Op = {
        id: n.disasterId, name: n.disasterName, slug: n.disasterSlug, needId: n.id,
        remaining: n.remaining, type: card?.disaster.type ?? 'Other',
      };
      const cur = m.get(n.name);
      if (cur) {
        cur.remaining += n.remaining;
        cur.ops.push(op);
        if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[cur.priority] ?? PRI.Normal).rank) cur.priority = n.priority;
      } else {
        m.set(n.name, { name: n.name, cat: n.cat, priority: n.priority, remaining: n.remaining, unit: n.unit, ops: [op] });
      }
    }
    return [...m.values()]
      .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank || y.remaining - x.remaining)
      .slice(0, 4);
  })();

  // Canlı akışın ana sayfada kalan tek izi. Akan bir liste değil, TEK satır: akışın
  // taşıdığı tek kritik anlam "bu platform şu anda çalışıyor" ve o bir satıra sığıyor.
  const lastVerified = ov.log.find((e) => isVerifiedDelivery(e.action)) ?? null;

  // Türkçe binlik ayracı: 10000 litre okunmuyor, 10.000 litre okunuyor
  // (rules/04 §Dates and Numbers).
  const nf = new Intl.NumberFormat('tr-TR');

  const h2 = {
    margin: 0, fontSize: mob ? 23 : 30, fontWeight: 800,
    letterSpacing: '-.02em', color: C.navy, lineHeight: 1.2,
  } as const;
  const lead = { margin: '6px 0 0', fontSize: mob ? 14.5 : 16, color: C.muted } as const;

  const SectionHead = ({ title, sub, link, onLink }: {
    title: string; sub?: string; link?: string; onLink?: () => void;
  }) => (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap', marginBottom: mob ? 18 : 28,
    }}>
      <div>
        <h2 style={h2}>{title}</h2>
        {sub && <p style={lead}>{sub}</p>}
      </div>
      {link && onLink && (
        <button onClick={onLink} className="lnk" style={{
          background: 'none', border: 0, padding: 0, font: 'inherit',
          fontSize: 14.5, fontWeight: 700, color: C.info, cursor: 'pointer', minHeight: 40,
        }}>{link} →</button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SEC_GAP }}>

      {/* ---- 1 · Kahraman -------------------------------------------------- */}
      <HomeHero
        activeCount={ov.totals.activeDisasters}
        updatedLabel={freshest}
        onSeeActive={() => activeRef.current?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start',
        })}
      />

      {/* ---- 2 · Aktif afetler --------------------------------------------
          Kartın tek büyük sayısı KALAN. Onaylanan, bekleyen ve talep edilen aynı
          blokta ama 12.5px'te — dördü de yayında, hiyerarşi ziyaretçinin kararına
          göre (AmountBlock'un başındaki nota bakın). */}
      <section ref={activeRef} style={{ scrollMarginTop: 88 }}>
        <SectionHead
          title={t.activeTitle} sub={t.activeLead}
          link={sorted.length > 4 ? (showAll ? t.showLess : t.seeAllCount(sorted.length)) : undefined}
          onLink={sorted.length > 4 ? () => setShowAll((v) => !v) : undefined}
        />

        {cards.length === 0 ? (
          <div style={{ ...panel, borderStyle: 'dashed', padding: mob ? '28px 20px' : '44px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: mob ? 16 : 18, fontWeight: 800, color: C.heading2 }}>{t.activeEmpty}</div>
            <p style={{ margin: '8px auto 0', fontSize: 14, color: C.muted, maxWidth: '52ch' }}>{t.activeEmptyBody}</p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gap: mob ? 12 : 20,
            gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))',
          }}>
            {cards.map((c) => {
              const d = c.disaster;
              const pr = worstPriority(c);
              const tone = PRI[pr] ?? PRI.Normal;
              return (
                <article key={d.id} style={{ ...panel, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {/* 4px şerit yalnızca önceliği taşır; başka hiçbir anlamı yok. */}
                  <div style={{ height: 4, background: tone.bar }} />
                  <div style={{ padding: mob ? 18 : 24, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
                          <Ico n={DISASTER_ICON[d.type]} size={14} color={C.muted2} />
                          {/* Yalnızca `region`: ili zaten içinde taşıyor ("Seydikemer, Muğla").
                              İl adını ayrıca eklemek "Muğla · Seydikemer, Muğla" üretiyordu. */}
                          {d.region || d.province}
                        </div>
                        <button onClick={() => a.openDisaster(d.slug)} className="hv-navy" style={{
                          background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                          fontSize: mob ? 18.5 : 22, fontWeight: 800, color: C.navy, letterSpacing: '-.015em',
                        }}>{d.name}</button>
                      </div>
                      {/* Öncelik renkle DEĞİL kelimeyle; renk yalnızca tekrar ediyor. */}
                      <span style={{
                        fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
                        color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`,
                      }}>{priorityLabel[pr].toLocaleUpperCase('tr')}</span>
                    </div>

                    <AmountBlock
                      required={c.requiredTotal} verified={c.verifiedTotal}
                      pending={c.pendingUnits} remaining={c.remainingTotal}
                      compact={mob}
                    />

                    {c.topNeeds.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{t.topNeedsLabel}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {c.topNeeds.map((n) => (
                            <span key={n.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
                              padding: '4px 11px', fontSize: 11.5, fontWeight: 700, color: C.heading2,
                              background: C.chipNavyBg, border: `1px solid ${C.borderFaint}`,
                            }}>
                              <Ico n={categoryIcon(n.cat)} size={12} color={(PRI[n.priority] ?? PRI.Normal).bar} />
                              {n.name} · {nf.format(n.remaining)} {n.unit}
                            </span>
                          ))}
                          {c.activeNeeds > c.topNeeds.length && (
                            <span style={{
                              borderRadius: 999, padding: '4px 11px', fontSize: 11.5, fontWeight: 700,
                              color: C.muted, background: C.chipNavyBg, border: `1px solid ${C.borderFaint}`,
                            }}>{t.moreNeeds(c.activeNeeds - c.topNeeds.length)}</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      borderTop: `1px solid ${C.borderFaint}`, paddingTop: 16, marginTop: 'auto',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 12.5, color: C.muted2 }}>{t.updatedAgo(d.updatedLabel)}</span>
                      <button onClick={() => a.openDisaster(d.slug)} style={{
                        background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
                        borderRadius: 10, height: 44, padding: '0 16px', fontSize: 13.5,
                        fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>{t.detail} →</button>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Boş yuva değil, bir eylem. Izgarada tek kart kalsa bile sayfa dolu
                görünür — veri seyrekken de ayakta duran tasarım budur. */}
            <article style={{
              ...panel, background: C.chipNavyBg, borderStyle: 'dashed',
              padding: mob ? 20 : 24, display: 'grid', placeItems: 'center', textAlign: 'center',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.heading2, marginBottom: 8 }}>{t.reportCardTitle}</div>
                <p style={{ margin: '0 auto 16px', fontSize: 14, color: C.muted, maxWidth: '36ch' }}>{t.reportCardBody}</p>
                <button onClick={a.openDisasterForm} style={{
                  background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
                  borderRadius: 10, height: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                }}>{t.hero.ctaReport}</button>
              </div>
            </article>
          </div>
        )}
      </section>

      {/* ---- 2b · Topluluk bildirimleri ------------------------------------
          Tasarım özetinde bu bölüm yoktu; sebebiyle birlikte bırakıldı. Bunlar
          DOĞRULANMAMIŞ iddialar ve ana sayfadaki tek teyit yolu burası — sessizce
          kaldırmak, çalışan bir akışı erişilemez kılardı. Yayındaki afetlerden
          görsel olarak ayrı duruyor (sarı zemin) ve sayı "bildirildi" diye
          adlandırılıyor, "ulaştı" değil (rules/07 §Critical Distinctions). */}
      {ov.reports.length > 0 && (
        <section>
          <SectionHead title={tr.dashReports.title} sub={tr.dashReports.note} />
          <div style={{
            display: 'grid', gap: mob ? 11 : 16,
            gridTemplateColumns: mob ? '1fr' : `repeat(${Math.min(ov.reports.length, 3)}, minmax(0,1fr))`,
          }}>
            {ov.reports.slice(0, 3).map((r) => {
              const left = Math.max(0, COMMUNITY_THRESHOLD - r.reportCount);
              return (
                <article key={r.id} style={{
                  border: '1px solid #F2DFA8', background: '#FFFDF4', borderRadius: 14,
                  padding: mob ? 16 : 18, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: C.navy }}>
                        {[r.province, r.district].filter(Boolean).join(' / ')}
                      </span>
                      <span className="tnum" style={{ display: 'block', fontSize: 12.5, color: C.muted2, marginTop: 2 }}>
                        {formatDate(r.occurredOn)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="tnum" style={{ display: 'block', fontSize: 19, fontWeight: 800, color: C.warningText }}>{r.reportCount}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.muted }}>{tr.dashReports.reportedWord}</span>
                    </span>
                  </div>
                  {left > 0 && (
                    <span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>{tr.dashReports.toThreshold(left)}</span>
                  )}
                  <button onClick={() => setConfirming(r)} className="hv-navy" style={{
                    marginTop: 'auto', background: C.surface, border: `1px solid ${C.borderSoft}`,
                    color: C.navy, borderRadius: 10, height: 44, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  }}>{tr.dashReports.confirm}</button>
                </article>
              );
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted2 }}>
            {tr.dashReports.thresholdNote(COMMUNITY_THRESHOLD)}
          </p>
        </section>
      )}

      {/* ---- 3 · Nasıl yardım edebilirim ------------------------------------ */}
      <section>
        <SectionHead title={t.helpTitle} sub={t.helpLead} />
        <div style={{
          display: 'grid', gap: mob ? 10 : 18,
          gridTemplateColumns: mob ? '1fr' : 'repeat(4, minmax(0,1fr))',
        }}>
          {HELP_ACTIONS.map((h) => (
            <button key={h.key} onClick={() => h.run(a)} className="hv-navy" style={{
              ...panel, cursor: 'pointer', textAlign: 'left',
              padding: mob ? 16 : '28px 22px',
              // Mobilde satır, masaüstünde kart. 76px'lik satır tek elle baş parmakla
              // ulaşılabilir; masaüstünde aynı yükseklik boşluk israfı olurdu.
              display: 'flex', flexDirection: mob ? 'row' : 'column',
              alignItems: mob ? 'center' : 'stretch', gap: mob ? 14 : 0,
              minHeight: mob ? 76 : 0,
            }}>
              <span style={{
                width: mob ? 46 : 48, height: mob ? 46 : 48, flex: `0 0 ${mob ? 46 : 48}px`,
                borderRadius: 14, background: h.tint, display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: mob ? 0 : 18,
              }}><Ico n={h.icon} size={21} color={C.heading2} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block', fontSize: mob ? 16 : 18, fontWeight: 800,
                  color: C.navy, marginBottom: mob ? 2 : 8,
                }}>{t.help[h.key].title}</span>
                <span style={{
                  display: 'block', fontSize: mob ? 13.5 : 14.5, color: C.text, lineHeight: 1.5,
                }}>{t.help[h.key].body}</span>
              </span>
              {mob && <Ico n="chev" size={18} color={C.muted3} />}
            </button>
          ))}
        </div>
      </section>

      {/* ---- 4 · Şu anda en çok gereken -------------------------------------
          Sayı KÜÇÜLTÜLMEDİ, sadece tek başına bırakıldı. Miktarı tamamen atmak
          ziyaretçiyi "ne kadar göndereyim?" sorusuyla baş başa bırakırdı. */}
      {urgent.length > 0 && (
        <section>
          <SectionHead title={t.urgentTitle} sub={t.urgentLead} />
          <div style={{
            display: 'grid', gap: mob ? 11 : 18,
            gridTemplateColumns: mob ? '1fr' : `repeat(${Math.min(urgent.length, 4)}, minmax(0,1fr))`,
          }}>
            {urgent.map((n) => {
              const tone = PRI[n.priority] ?? PRI.Normal;
              // Kalem tek operasyonda aranıyorsa tıklama doğrudan oraya gider.
              // Birden çoksa hangisi olduğu ziyaretçinin kararı: rastgele birine
              // göndermek, yanlış sahaya gitmesine yol açar.
              const direct = n.ops.length === 1;
              const open = (e: React.MouseEvent<HTMLButtonElement>) => {
                if (direct) {
                  const o = n.ops[0];
                  a.openDisaster(o.slug, 'needs', o.needId);
                  return;
                }
                setPins({ name: n.name, rect: e.currentTarget.getBoundingClientRect() });
              };
              return (
                <article key={n.name} style={{
                  ...panel, borderTop: `3px solid ${tone.bar}`,
                  padding: mob ? 16 : 24,
                  display: 'flex', flexDirection: mob ? 'row' : 'column',
                  alignItems: mob ? 'center' : 'stretch', gap: mob ? 14 : 0, minWidth: 0,
                }}>
                  <span style={{
                    width: mob ? 44 : 52, height: mob ? 44 : 52, flex: `0 0 ${mob ? 44 : 52}px`,
                    borderRadius: 14, background: C.chipNavyBg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', marginBottom: mob ? 0 : 14,
                  }}><Ico n={categoryIcon(n.cat)} size={mob ? 21 : 25} color={tone.bar} /></span>

                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: mob ? 16.5 : 19, fontWeight: 800, color: C.navy,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{n.name}</span>
                    <span className="tnum" style={{
                      display: 'block', fontSize: mob ? 14.5 : 17, fontWeight: 800,
                      color: tone.fg, marginTop: 3,
                    }}>{t.urgentRemaining(nf.format(n.remaining), n.unit)}</span>
                    <span style={{
                      display: 'block', fontSize: 12.5, color: C.muted, marginTop: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{direct ? t.urgentIn(n.ops[0].name) : t.urgentInMany(n.ops.length)}</span>
                  </span>

                  <button onClick={open} className="hv-navy"
                    aria-haspopup={direct ? undefined : 'dialog'}
                    aria-expanded={direct ? undefined : pins?.name === n.name}
                    style={{
                      background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                      borderRadius: 10, height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 700,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      width: mob ? undefined : '100%', marginTop: mob ? 0 : 16, flex: mob ? '0 0 auto' : undefined,
                    }}>{t.urgentSend}</button>
                </article>
              );
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted2 }}>{tr.common.remainingUnchanged}</p>
        </section>
      )}

      {/* ---- 5 · Harita ---------------------------------------------------- */}
      <section>
        <HomeOperationsMap />
      </section>

      {/* ---- 6 · Süreç + son doğrulanan teslimat ---------------------------- */}
      <section>
        <SectionHead title={t.flowTitle} sub={t.flowLead} />
        <div style={{
          display: 'grid', position: 'relative',
          gridTemplateColumns: mob ? '1fr' : 'repeat(4, minmax(0,1fr))',
        }}>
          {/* Masaüstünde adımları birleştiren yatay çizgi; mobilde dikey. Yalnızca
              bağlantıyı gösterir, durum taşımaz. */}
          <span aria-hidden style={mob ? {
            position: 'absolute', left: 23, top: 22, bottom: 40, width: 2, background: C.borderSoft,
          } : {
            position: 'absolute', top: 24, left: '12%', right: '12%', height: 2, background: C.borderSoft,
          }} />
          {t.flow.map((s, i) => {
            const last = i === t.flow.length - 1;
            return (
              <div key={s.title} style={{
                position: 'relative',
                display: 'flex', flexDirection: mob ? 'row' : 'column',
                alignItems: mob ? 'flex-start' : 'center',
                textAlign: mob ? 'left' : 'center',
                gap: mob ? 16 : 0, paddingBottom: mob && !last ? 22 : 0,
              }}>
                <span className="tnum" style={{
                  width: mob ? 44 : 48, height: mob ? 44 : 48, flex: `0 0 ${mob ? 44 : 48}px`,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  // Son adım DOLU: tamamlanmışlığı renk değil dolgu anlatıyor.
                  background: last ? C.navy : C.surface, color: last ? '#fff' : C.navy,
                  border: `2px solid ${C.navy}`, fontWeight: 800, fontSize: 17,
                  marginBottom: mob ? 0 : 18,
                }}>{i + 1}</span>
                <span>
                  <span style={{ display: 'block', fontSize: mob ? 16 : 17, fontWeight: 800, color: C.navy, marginBottom: mob ? 3 : 8 }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 14, color: C.muted, lineHeight: 1.5, padding: mob ? 0 : '0 14px' }}>{s.body}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Akışın tek satırı. Ad ve soyadın baş harfi veritabanından maskelenmiş
            geliyor (migration 0024); burada kısaltılacak bir tam ad yok. */}
        <div style={{
          ...panel, borderLeft: `3px solid ${C.success}`, background: '#FBFDFC',
          padding: mob ? 15 : '18px 22px', marginTop: mob ? 20 : 28,
          display: 'flex', alignItems: mob ? 'flex-start' : 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flex: '0 0 8px',
            background: lastVerified ? C.success : C.muted3, marginTop: mob ? 6 : 0,
          }} />
          {lastVerified ? (
            <>
              <span style={{ fontSize: mob ? 13.5 : 14.5, color: C.text, flex: 1, minWidth: 0 }}>
                <strong style={{ color: C.navy }}>{t.lastVerified}:</strong>{' '}
                {[lastVerified.user, lastVerified.detail, lastVerified.disasterName].filter(Boolean).join(' · ')}
              </span>
              <span style={{ fontSize: 13, color: C.muted2, whiteSpace: 'nowrap' }}>{lastVerified.time}</span>
            </>
          ) : (
            <span style={{ fontSize: mob ? 13.5 : 14.5, color: C.muted }}>{t.lastVerifiedEmpty}</span>
          )}
        </div>
      </section>

      {/* ---- 7 · Güven ------------------------------------------------------
          Üç sıfat değil, üç KURAL. "Güvenilir", "şeffaf", "hızlı" doğrulanamaz;
          aşağıdaki üç cümlenin her biri yanlışlanabilir bir davranış tarifi. */}
      <section style={{
        background: C.headerNavy, borderRadius: 16,
        padding: mob ? '28px 20px' : '56px 48px',
      }}>
        <h2 style={{ ...h2, color: '#fff' }}>{t.trustSectionTitle}</h2>
        <p style={{
          margin: '10px 0 0', fontSize: mob ? 14 : 15.5, color: '#8FA7BE', maxWidth: '70ch',
        }}>{t.trustSectionLead}</p>
        <div style={{
          display: 'grid', gap: mob ? 11 : 20, marginTop: mob ? 20 : 32,
          gridTemplateColumns: mob ? '1fr' : 'repeat(3, minmax(0,1fr))',
        }}>
          {t.trustCards.map((c) => (
            <div key={c.title} style={{
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 14, padding: mob ? 16 : 22,
            }}>
              <div style={{ fontSize: mob ? 15 : 16, fontWeight: 800, color: '#fff', marginBottom: 10 }}>{c.title}</div>
              <p style={{ margin: 0, fontSize: mob ? 13.5 : 14.5, color: '#C3D3E1', lineHeight: 1.6 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {confirming && <ReportConfirmModal report={confirming} onClose={() => setConfirming(null)} />}

      {pins && (
        <UrgentPins
          title={t.urgentPinsTitle(pins.name)}
          anchor={pins.rect}
          ops={urgent.find((x) => x.name === pins.name)?.ops ?? []}
          unit={urgent.find((x) => x.name === pins.name)?.unit ?? ''}
          onPick={(o) => { setPins(null); a.openDisaster(o.slug, 'needs', o.needId); }}
          onClose={() => setPins(null)}
        />
      )}
    </div>
  );
}

// Bir kalemin hangi operasyonlarda arandığını gösteren pin listesi.
//
// document.body'ye taşınıyor: kart `overflow: hidden` bir panelin içinde ve normal
// akışta konumlanan bir katman kenarda kırpılırdı (Picker de aynı sebeple böyle).
//
// Konum tıklama anındaki ölçüyle BİR KEZ hesaplanıyor; sonradan ölçüp düzeltmek
// katmanın açıldıktan sonra yerinden zıplamasına yol açıyor.
const PIN_W = 264;
function UrgentPins({ title, anchor, ops, unit, onPick, onClose }: {
  title: string;
  anchor: DOMRect;
  unit: string;
  ops: { id: string; name: string; slug: string; needId: string; remaining: number; type: DisasterType }[];
  onPick: (o: { slug: string; needId: string }) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Sayfa kaydırılınca bağlantı noktası altından kayar; katman yerinde kalıp
    // ilgisiz bir kutuya işaret etmektense kapanır.
    const onScroll = () => onClose();
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    // Yakalama evresinde DEĞİL: kendi düğmelerimizin tıklaması önce çalışmalı.
    document.addEventListener('mousedown', onDown);
    boxRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const h = 46 + ops.length * 54 + 10;
  const below = anchor.bottom + 8 + h <= window.innerHeight - 10;
  const top = below ? anchor.bottom + 8 : Math.max(10, anchor.top - 8 - h);
  const left = Math.min(
    Math.max(10, anchor.left + anchor.width / 2 - PIN_W / 2),
    Math.max(10, window.innerWidth - PIN_W - 10),
  );

  return createPortal(
    <div ref={boxRef} tabIndex={-1} role="dialog" aria-label={title} className="anim-in" style={{
      position: 'fixed', top, left, width: PIN_W, zIndex: 80,
      background: C.surface, border: `1px solid ${C.errorBorder}`, borderRadius: 12,
      boxShadow: '0 14px 38px rgba(11,30,48,.22)', overflow: 'hidden', outline: 'none',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${C.borderFaint}`, background: G.criticalPanel,
        fontSize: 12, fontWeight: 700, color: C.navy,
      }}>{title}</div>
      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ops.map((o) => (
          <button key={o.id} onClick={() => onPick(o)} className="hv-navy" style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9,
            padding: '9px 10px', cursor: 'pointer', minHeight: 46,
          }}>
            <span style={{
              width: 28, height: 28, flex: '0 0 28px', borderRadius: 8, background: C.chipNavyBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Ico n={DISASTER_ICON[o.type]} size={15} color={C.emergency} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{
                display: 'block', fontSize: 13, fontWeight: 600, color: C.navy,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{o.name}</span>
              <span className="tnum" style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1 }}>
                {tr.home.urgentPinRemaining(o.remaining, unit)}
              </span>
            </span>
            <span style={{ flex: '0 0 auto', color: C.muted2, fontSize: 15 }}>›</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
