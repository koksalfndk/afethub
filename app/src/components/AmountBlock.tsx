import { tr } from '../i18n/strings';
import { C } from '../theme';
import { srOnly } from '../ui';

// Bir operasyonun dört miktarı, tek blok.
//
// Bu bileşenin varlık sebebi bir sıralama kuralı: KALAN büyük, diğer üçü küçük.
// Şeffaflık "her sayıyı eşit göster" demek değil, "hiçbir sayıyı gizleme" demek.
// Dördü de ekranda; ama ziyaretçinin davranışını değiştiren tek sayı kalan olduğu
// için hiyerarşi ona göre. Talep edilen bilerek en soluk öğe — rules/04
// §Content Hierarchy talep edilen miktarın kalanın önüne geçmesini yasaklıyor.
//
// Sıra hiçbir ekranda değişmez: kalan → çubuk → onaylandı / bekliyor / talep edildi.
// Aynı dört sayıyı iki ekranda farklı sırada göstermek, ikisini de yeniden
// öğrenmek demektir.
//
// Çubuk ASLA yalnız değil: altında her zaman sayılar var (rules/04 §Quantity Display,
// "Never use a progress bar without numerical text"). Bekleyen dilim ayrıca TARALI —
// renk körü bir kullanıcı için sarı ile yeşil arasında dokusal bir fark bırakır
// (rules/04 §Accessibility, renk tek başına anlam taşımaz).
//
// Bekleyen miktar çubukta onaylananın YANINDA duruyor ama kalanı azaltmıyor: çubuğun
// boş kalan kısmı `remaining` değil, `required - verified - pending`. Bu kasıtlı bir
// görsel: bekleyen doğrulanırsa yeşile döner, reddedilirse boşluğa. Kanonik kural
// (rules/02) bozulmadan ikisi de gösterilebiliyor.

// Sıfır bölen koruması tek yerde.
const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);

export function AmountBlock({ required, verified, pending, remaining, compact }: {
  required: number;
  verified: number;
  pending: number;
  remaining: number;
  compact?: boolean;
}) {
  const t = tr.home.amount;
  const nf = new Intl.NumberFormat('tr-TR');

  // Hiç ihtiyaç kaydı yok. "0 kalem kalan" yazmak, kalemlerin karşılandığı anlamına
  // gelirdi; oysa henüz hiçbir şey yayınlanmamış. İkisi aynı şey değil.
  if (required === 0) {
    return (
      <div style={{
        background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 12,
        padding: compact ? 14 : 16, fontSize: 13.5, color: C.muted,
      }}>{t.none}</div>
    );
  }

  const okPct = pct(verified, required);
  // Bekleyen, çubukta onaylanandan artan yere sığdığı kadar çizilir: onaylanan +
  // bekleyen talebi aşarsa (fazla bildirim) çubuk taşmaz, sayılar yine doğru yazılır.
  const pendPct = Math.min(pct(pending, required), 100 - okPct);

  return (
    <div>
      <div aria-hidden>
        {/* Kutunun İÇİNDE yalnızca kararı değiştiren sayı ve onun çubuğu var.
            Destekleyici üç sayı kutunun DIŞINA alındı: aynı yüzeyde durduklarında
            dördü de eşit ağırlıkta okunuyor ve "hangi afet daha çok yardım
            istiyor" sorusu göz taramasıyla yanıtlanamıyordu. Şeffaflık kaybolmadı,
            hiyerarşi kazanıldı (rules/04 §Content Hierarchy). */}
        <div style={{
          background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 12,
          padding: compact ? '13px 14px' : '15px 16px',
        }}>
          <div className="tnum" style={{
            fontSize: compact ? 28 : 32, fontWeight: 800, color: C.errorText,
            lineHeight: 1.08, letterSpacing: '-.025em',
          }}>{nf.format(remaining)} {t.remainingUnit}</div>
          <div style={{ fontSize: compact ? 13.5 : 14, color: C.heading2, fontWeight: 700, marginTop: 2 }}>
            {t.remaining}
          </div>

          {/* Çubuk inceldi (9 → 6px): burada rolü bir ölçü aracı değil, tek bakışta
              "ne kadarı karşılandı" hissi vermek. Kesin sayılar altta yazıyor. */}
          <div style={{
            height: 6, borderRadius: 999, background: C.surface, border: `1px solid ${C.borderFaint}`,
            overflow: 'hidden', display: 'flex', marginTop: 12,
          }}>
            <span style={{ width: `${okPct}%`, background: 'linear-gradient(180deg,#1BB055,#159947)' }} />
            {/* Taralı desen: bekleyen dilimi renkten bağımsız olarak da ayırır. */}
            <span style={{
              width: `${pendPct}%`,
              background: 'repeating-linear-gradient(45deg,#F0C860,#F0C860 4px,#E6A700 4px,#E6A700 8px)',
            }} />
          </div>
        </div>

        {/* Destekleyici sayılar: zeminsiz, 12px, tek satır. Kanıt olarak oradalar,
            karşılaştırma öğesi olarak değil. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '3px 14px',
          fontSize: 12, color: C.muted, marginTop: 9, lineHeight: 1.5,
        }}>
          <span><strong className="tnum" style={{ color: C.successText, fontWeight: 700 }}>{nf.format(verified)}</strong> {t.verified}</span>
          <span><strong className="tnum" style={{ color: C.warningText, fontWeight: 700 }}>{nf.format(pending)}</strong> {t.pending}</span>
          <span><strong className="tnum" style={{ fontWeight: 600 }}>{nf.format(required)}</strong> {t.required}</span>
        </div>
      </div>

      {/* Ekran okuyucu dört rakamı art arda değil, tek cümle olarak duyar. Yukarıdaki
          görsel blok bu yüzden aria-hidden. */}
      <span style={srOnly}>{t.aria(remaining, verified, pending, required)}</span>
    </div>
  );
}
