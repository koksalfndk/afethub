import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';
import { HomeIllustration } from './HomeIllustration';

// Ana sayfanın üst üçte biri.
//
// Statik. Slider yoktu, konuldu, ve şimdi geri alındı — sebebi ölçülebilir bir şey:
// dönen bir kahraman, ziyaretçinin OKUMAYA BAŞLADIĞI cümleyi elinden alır. Stres
// altındaki, tek elle telefon tutan, zayıf şebekedeki bir kullanıcı için bu bir
// hatadır (rules/01 §Emergency First). Slider silinmedi, "Nasıl Çalışır" sayfasına
// taşındı: orada içerik okunur, aciliyet yoktur, dönmesinin bir maliyeti yok.
//
// Burada TEK bir sayı var: kaç afet açık. Ne toplam bağış, ne gönüllü sayısı, ne
// doğrulama kuyruğu. Bunların hepsi doğru sayılar ama hiçbiri ziyaretçinin ilk
// kararını değiştirmiyor; ilk ekranda yer kaplamaları, kararı yavaşlatmaktan başka
// bir işe yaramaz.
//
// Rozet TIKLANABİLİR ve aktif afet listesine gider: bir ekranda duran her canlı
// bilgi, gösterdiği şeye giden bir yol olmalı.
//
// Üç düğmeden yalnızca biri kırmızı. Üçü de kırmızı olsaydı hiçbiri acil olmazdı
// (rules/01 §No Misleading Urgency).

export function HomeHero({ activeCount, updatedLabel, onSeeActive }: {
  activeCount: number;
  // Boş dizge = güncelleme zamanı bilinmiyor. O zaman uydurulmuş bir "az önce"
  // yazmak yerine rozetin o yarısı hiç çizilmez (rules/01 §Freshness).
  updatedLabel: string;
  onSeeActive: () => void;
}) {
  const a = useApp();
  const mob = a.device === 'mobile';
  const t = tr.home.hero;

  const btn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    height: mob ? 54 : 56, padding: mob ? 0 : '0 24px', width: mob ? '100%' : undefined,
    borderRadius: 12, fontSize: mob ? 15.5 : 16, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '-.01em',
  } as const;

  return (
    <section style={{
      background: 'linear-gradient(180deg,#FFFFFF 0%,#F6F8FA 100%)',
      border: `1px solid ${C.border}`, borderRadius: 16,
      padding: mob ? '30px 20px 28px' : '76px 56px 64px',
    }}>
      {/* İki sütun: solda karar, sağda görsel. 980px altında görsel DÜŞER —
          küçültülerek değil, tamamen kaldırılarak. Telefonda dekoratif bir çizim,
          üç düğmeyi ekranın altına iten bir engeldir (rules/04 §Mobile First). */}
      <div style={{
        display: 'grid', gap: mob ? 0 : 40, alignItems: 'center',
        gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.15fr) minmax(0,.85fr)',
      }}>
      <div style={{ maxWidth: 720 }}>
        <button onClick={onSeeActive} className="hv-navy hv-press" style={{
          display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 40,
          background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 999,
          padding: '0 15px', marginBottom: mob ? 18 : 26, cursor: 'pointer',
          fontSize: mob ? 12.5 : 13, fontWeight: 700, color: C.heading2,
          boxShadow: '0 1px 2px rgba(16,42,67,.06)',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flex: '0 0 8px',
            background: activeCount > 0 ? C.emergency : C.muted3,
          }} />
          {activeCount > 0 ? t.badge(activeCount) : t.badgeNone}
          {updatedLabel && (
            <>
              <span aria-hidden style={{ color: C.borderSoft }}>|</span>
              <span style={{ fontWeight: 500, color: C.muted }}>{t.badgeUpdated(updatedLabel)}</span>
            </>
          )}
        </button>

        <h1 style={{
          fontSize: mob ? 32 : 54, lineHeight: 1.09, letterSpacing: '-.03em',
          margin: `0 0 ${mob ? 14 : 20}px`, color: C.navy, fontWeight: 800,
        }}>{t.title}</h1>

        {/* Misyon: başlığın hemen altında, gövdeden bir tık daha koyu ve kalın.
            Sırayla okununca "ne yapıyoruz → neden → nasıl" oluyor. */}
        <p style={{
          fontSize: mob ? 15.5 : 17.5, lineHeight: 1.5, color: C.heading2, fontWeight: 600,
          margin: `0 0 ${mob ? 10 : 14}px`, maxWidth: '52ch',
        }}>{t.mission}</p>

        <p style={{
          fontSize: mob ? 15.5 : 17, lineHeight: 1.55, color: C.text,
          margin: `0 0 ${mob ? 24 : 34}px`, maxWidth: '56ch',
        }}>{t.body}</p>

        <div style={{ display: mob ? 'grid' : 'flex', gap: mob ? 10 : 14, flexWrap: 'wrap' }}>
          <button onClick={a.openDisasterForm} className="hv-press" style={{
            ...btn, background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 2px 6px rgba(191,42,49,.26)',
          }}><Ico n="critical" size={18} color="#fff" />{t.ctaReport}</button>

          <button onClick={() => a.go('report')} className="hv-press" style={{
            ...btn, background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
          }}><Ico n="need" size={18} color="#fff" />{t.ctaHelp}</button>

          <button onClick={onSeeActive} className="hv-navy hv-press" style={{
            ...btn, background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
          }}><Ico n="pin" size={18} color={C.navy} />{t.ctaSee}</button>
        </div>

        <p style={{
          fontSize: mob ? 12.5 : 13.5, lineHeight: 1.5, color: C.muted,
          margin: `${mob ? 18 : 24}px 0 0`, maxWidth: '72ch',
        }}>{tr.home.disclaimer}</p>
      </div>

      {!mob && <HomeIllustration height={344} />}
      </div>
    </section>
  );
}
