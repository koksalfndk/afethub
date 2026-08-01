import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store';
import { tr, priorityLabel } from '../i18n/strings';
import { categoryIcon } from '../needForm';
import { C, G, PRI, type PriorityKey } from '../theme';
import { Ico, DISASTER_ICON, type IcoName } from '../ui';
import { HomeHero } from '../components/HomeHero';
import { DisasterOpCard, worstPriority } from '../components/DisasterOpCard';
import { HomeOperationsMap } from '../components/HomeOperationsMap';
import { ReportConfirmModal } from '../components/ReportConfirmModal';
import { COMMUNITY_THRESHOLD, isVerifiedDelivery } from '../data/repo';
import { formatDate } from '../util';
import type { DisasterType, DisasterReport } from '../types';

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
  const cards = active.slice().sort((x, y) =>
    (PRI[worstPriority(x)] ?? PRI.Normal).rank - (PRI[worstPriority(y)] ?? PRI.Normal).rank
    || y.remainingTotal - x.remainingTotal).slice(0, 4);

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
        // Eskiden aşağıdaki bölüme kaydırıyordu, çünkü gidecek bir sayfa yoktu.
        // Artık var: "Aktif Afetleri Gör" gerçekten aktif afetlerin sayfasına gidiyor.
        onSeeActive={() => a.go('disasters')}
      />

      {/* ---- 2 · Aktif afetler --------------------------------------------
          Kartta TEK baskın öğe var: kalan miktar. Onaylanan / bekleyen / talep
          edilen miktar bloğunun DIŞINDA, 12px'te duruyor (AmountBlock'a bakın) ve
          "en çok gereken" kalemler çip yığını değil tek satır metin. Amaç tek bir
          soruya göz taramasıyla cevap verebilmek: hangi afet en çok yardım istiyor?  */}
      <section>
        <SectionHead
          title={t.activeTitle} sub={t.activeLead}
          link={t.seeAllCount(active.length)}
          onLink={() => a.go('disasters')}
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
            {cards.map((c) => <DisasterOpCard key={c.disaster.id} card={c} />)}

            {/* Boş yuva değil, bir eylem. Izgarada tek kart kalsa bile sayfa dolu
                görünür — veri seyrekken de ayakta duran tasarım budur. */}
            <article className="hv-lift" style={{
              ...panel, background: C.chipNavyBg, borderStyle: 'dashed',
              padding: mob ? 20 : 24, display: 'grid', placeItems: 'center', textAlign: 'center',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.heading2, marginBottom: 8 }}>{t.reportCardTitle}</div>
                <p style={{ margin: '0 auto 16px', fontSize: 14, color: C.muted, maxWidth: '36ch' }}>{t.reportCardBody}</p>
                <button onClick={a.openDisasterForm} className="hv-press" style={{
                  background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
                  borderRadius: 10, height: 48, padding: '0 20px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                }}>{t.hero.ctaReport}</button>
              </div>
            </article>
          </div>
        )}
      </section>

      {/* ---- 3 · Harita ----------------------------------------------------
          YUKARI TAŞINDI (eskiden 5. bölümdü). Harita "ülkede durum ne" sorusunun
          en hızlı cevabı ve ziyaretçilerin çoğu ikinci olarak kendi ilini arıyor.
          Listeden hemen sonra gelmesi, listeyi coğrafi bir bağlama oturtuyor. */}
      <section>
        <HomeOperationsMap />
      </section>

      {/* ---- 4 · Nasıl yardım edebilirim ------------------------------------ */}
      <section>
        <SectionHead title={t.helpTitle} sub={t.helpLead} />
        <div style={{
          display: 'grid', gap: mob ? 10 : 18,
          gridTemplateColumns: mob ? '1fr' : 'repeat(4, minmax(0,1fr))',
        }}>
          {HELP_ACTIONS.map((h) => (
            <button key={h.key} onClick={() => h.run(a)} className="hv-lift hv-press" style={{
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

      {/* ---- 5 · Acil ihtiyaçlar --------------------------------------------
          Kart tek bir soruya cevap veriyor: ne göndereyim, ne kadar? Bu yüzden
          kalan miktar kartın en büyük öğesi — kalem adından da büyük. Öncelik hem
          renkli şerit hem KELİME ile yazılı (rules/04: renk tek başına anlam
          taşımaz). Süs yok: ikon, ad, miktar, yer, düğme. */}
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
                <article key={n.name} className="hv-lift" style={{
                  ...panel, borderTop: `3px solid ${tone.bar}`,
                  padding: mob ? 16 : 22, display: 'flex', flexDirection: 'column', minWidth: 0,
                }}>
                  {/* Mobilde ikon metnin SOLUNDA, düğme ALT SATIRDA. Üçünü tek satıra
                      dizmek metne 150px bırakıyordu: kalem adı ve "2 bölgede aranıyor"
                      kırpılıyor, miktar üç satıra bölünüyordu. Kartın tek işi bir sayıyı
                      okutmak; o sayı sığmıyorsa kart çalışmıyor demektir. */}
                  <div style={{
                    display: 'flex', flexDirection: mob ? 'row' : 'column',
                    alignItems: mob ? 'center' : 'stretch', gap: mob ? 14 : 0, minWidth: 0,
                  }}>
                    <span style={{
                      width: mob ? 46 : 52, height: mob ? 46 : 52, flex: `0 0 ${mob ? 46 : 52}px`,
                      borderRadius: 14, background: tone.bg, border: `1px solid ${tone.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: mob ? 0 : 14,
                    }}><Ico n={categoryIcon(n.cat)} size={mob ? 22 : 26} color={tone.bar} /></span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        margin: 0, fontSize: 13.5, fontWeight: 700, color: C.heading2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{n.name}</h3>
                      {/* Kartın en büyük öğesi: gönderilecek miktar. */}
                      <span className="tnum" style={{
                        display: 'block', fontSize: mob ? 21 : 24, fontWeight: 800,
                        color: C.navy, letterSpacing: '-.02em', lineHeight: 1.15, marginTop: 2,
                      }}>{t.urgentRemaining(nf.format(n.remaining), n.unit)}</span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                        fontSize: 12.5, color: C.muted, marginTop: 6,
                      }}>
                        <span style={{ color: tone.fg, fontWeight: 700 }}>{priorityLabel[n.priority]}</span>
                        <span aria-hidden style={{ color: C.borderSoft }}>·</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {direct ? t.urgentIn(n.ops[0].name) : t.urgentInMany(n.ops.length)}
                        </span>
                      </span>
                    </span>
                  </div>

                  <button onClick={open} className="hv-navy hv-press"
                    aria-haspopup={direct ? undefined : 'dialog'}
                    aria-expanded={direct ? undefined : pins?.name === n.name}
                    style={{
                      background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                      borderRadius: 10, height: 48, padding: '0 14px', fontSize: 13.5, fontWeight: 700,
                      cursor: 'pointer', whiteSpace: 'nowrap', width: '100%', marginTop: mob ? 14 : 16,
                    }}>{t.urgentSend}</button>
                </article>
              );
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted }}>{tr.common.remainingUnchanged}</p>
        </section>
      )}

      {/* ---- 6 · Topluluk bildirimleri --------------------------------------
          AŞAĞI TAŞINDI. Daha önce aktif afetlerin hemen altındaydı ve ilk kez gelen
          bir ziyaretçi, doğrulanmış operasyonlarla doğrulanmamış iddiaları yan yana
          görüyordu — ikisinin farkını henüz öğrenmeden. Artık süreç şemasından ÖNCE
          ama "nasıl yardım ederim" ve "acil ihtiyaçlar"dan SONRA: platformun nasıl
          çalıştığı anlaşıldıktan sonra katılım kapısı açılıyor. */}
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
                <article key={r.id} className="hv-lift" style={{
                  border: '1px solid #F2DFA8', background: '#FFFDF4', borderRadius: 14,
                  padding: mob ? 16 : 18, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: C.navy }}>
                        {[r.province, r.district].filter(Boolean).join(' / ')}
                      </span>
                      <span className="tnum" style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                        {formatDate(r.occurredOn)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="tnum" style={{ display: 'block', fontSize: 19, fontWeight: 800, color: C.warningText }}>{r.reportCount}</span>
                      <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{tr.dashReports.reportedWord}</span>
                    </span>
                  </div>
                  {left > 0 && (
                    <span className="tnum" style={{ fontSize: 12, color: C.muted }}>{tr.dashReports.toThreshold(left)}</span>
                  )}
                  <button onClick={() => setConfirming(r)} className="hv-navy hv-press" style={{
                    marginTop: 'auto', background: C.surface, border: `1px solid ${C.borderSoft}`,
                    color: C.navy, borderRadius: 10, height: 46, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  }}>{tr.dashReports.confirm}</button>
                </article>
              );
            })}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted }}>
            {tr.dashReports.thresholdNote(COMMUNITY_THRESHOLD)}
          </p>
        </section>
      )}

      {/* ---- 7 · Süreç ------------------------------------------------------
          Zaman çizelgesi değil, AKIŞ ŞEMASI. Numaralı daireler bir sıralama
          gösteriyordu ama adımlar arasındaki NEDENSELLİĞİ göstermiyordu; oklu
          kutular "bunun olması için önce şunun olması gerek" diyor.
          Beş kutu, dört değil: "destek bildirildi" ile "teslimat doğrulandı" aynı
          şey değil ve bu ayrım platformun temeli (rules/07). */}
      <section>
        <SectionHead title={t.flowTitle} sub={t.flowLead} />
        <div style={{
          display: 'grid', gap: mob ? 0 : 10, alignItems: 'stretch',
          gridTemplateColumns: mob ? '1fr' : 'repeat(5, minmax(0,1fr))',
        }}>
          {t.flow.map((s, i) => {
            const last = i === t.flow.length - 1;
            return (
              <div key={s.title} style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', alignItems: 'stretch' }}>
                <div style={{
                  ...panel, flex: 1, padding: mob ? 15 : '18px 16px',
                  display: 'flex', flexDirection: mob ? 'row' : 'column',
                  alignItems: mob ? 'flex-start' : 'stretch', gap: mob ? 13 : 0,
                  // Son kutu vurgulu: doğrulama, sürecin tamamlandığı tek nokta.
                  borderColor: last ? '#C9E9D6' : C.border,
                  background: last ? '#FBFDFC' : C.surface,
                }}>
                  <span style={{
                    width: 40, height: 40, flex: '0 0 40px', borderRadius: 12,
                    background: last ? '#EAF7EF' : C.chipNavyBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: mob ? 0 : 12,
                  }}><Ico n={s.icon as IcoName} size={19} color={last ? C.success : C.heading2} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="tnum" style={{
                      display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '.07em',
                      color: C.muted, marginBottom: 3,
                    }}>{`${i + 1}. ADIM`}</span>
                    <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: C.navy, marginBottom: 5 }}>{s.title}</span>
                    <span style={{ display: 'block', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{s.body}</span>
                  </span>
                </div>
                {/* Ok: masaüstünde sağa, mobilde aşağı. Yalnızca yön taşır. */}
                {!last && (
                  <span aria-hidden style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.muted3, fontSize: 17, flex: '0 0 auto',
                    width: mob ? '100%' : 18, height: mob ? 26 : 'auto',
                    transform: mob ? 'rotate(90deg)' : undefined,
                  }}>→</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Akışın tek satırı. Ad ve soyadın baş harfi veritabanından maskelenmiş
            geliyor (migration 0024); burada kısaltılacak bir tam ad yok. */}
        <div style={{
          ...panel, borderLeft: `3px solid ${C.success}`, background: '#FBFDFC',
          padding: mob ? 15 : '18px 22px', marginTop: mob ? 20 : 26,
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
              <span style={{ fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{lastVerified.time}</span>
            </>
          ) : (
            <span style={{ fontSize: mob ? 13.5 : 14.5, color: C.muted }}>{t.lastVerifiedEmpty}</span>
          )}
        </div>
      </section>

      {/* ---- 8 · Güven ------------------------------------------------------
          Artık bir dipnot değil, bir bölüm. Üstte dört onaylı madde (hızlı okunur),
          altta üç kutu (ayrıntı isteyen için). Üçü de sıfat değil KURAL — "güvenilir"
          doğrulanamaz, "kalan = talep − onaylanan" doğrulanabilir. */}
      <section style={{
        background: C.headerNavy, borderRadius: 16,
        padding: mob ? '28px 20px' : '56px 48px',
      }}>
        <h2 style={{ ...h2, color: '#fff' }}>{t.trustSectionTitle}</h2>
        <p style={{
          margin: '10px 0 0', fontSize: mob ? 14 : 15.5, color: '#8FA7BE', maxWidth: '70ch',
        }}>{t.trustSectionLead}</p>

        <ul style={{
          listStyle: 'none', margin: mob ? '20px 0 0' : '28px 0 0', padding: 0,
          display: 'grid', gap: mob ? 10 : 12,
          gridTemplateColumns: mob ? '1fr' : 'repeat(2, minmax(0,1fr))',
        }}>
          {t.trustPoints.map((p) => (
            <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{
                width: 26, height: 26, flex: '0 0 26px', borderRadius: '50%',
                background: 'rgba(110,231,168,.14)', border: '1px solid rgba(110,231,168,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Ico n="completed" size={14} color="#6EE7A8" /></span>
              <span style={{ fontSize: mob ? 14.5 : 15.5, fontWeight: 600, color: '#fff' }}>{p}</span>
            </li>
          ))}
        </ul>

        <div style={{
          display: 'grid', gap: mob ? 11 : 20, marginTop: mob ? 22 : 34,
          paddingTop: mob ? 22 : 32, borderTop: '1px solid rgba(255,255,255,.12)',
          gridTemplateColumns: mob ? '1fr' : 'repeat(3, minmax(0,1fr))',
        }}>
          {t.trustCards.map((c) => (
            <div key={c.title}>
              <div style={{ fontSize: mob ? 15 : 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{c.title}</div>
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
              <span className="tnum" style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>
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
