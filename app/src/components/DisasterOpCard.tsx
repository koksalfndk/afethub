import { useApp } from '../store';
import { tr, priorityLabel } from '../i18n/strings';
import { C, G, PRI, type PriorityKey } from '../theme';
import { Ico, DISASTER_ICON } from '../ui';
import { AmountBlock } from './AmountBlock';
import type { DisasterCard } from '../data/repo';

// Bir operasyonun kartı. Ana sayfada da, /afetler listesinde de AYNI bileşen.
//
// Ayrı ayrı yazılsalardı ikisi kaçınılmaz olarak ayrışırdı: biri "kalan"ı büyütür,
// diğeri talep edileni öne alır ve aynı afet iki ekranda iki farklı hikâye anlatır.
// Miktarların sırası bir tasarım tercihi değil, rules/04 §Content Hierarchy'nin
// gereği — o yüzden tek yerde duruyor.
//
// Kartta TEK baskın öğe var: kalan miktar. Onaylanan / doğrulama bekleyen / talep
// edilen miktar bloğunun dışında, 12px'te (AmountBlock'a bakın). "En çok gereken"
// çip yığını değil tek satır metin: kartın ikinci bir odak noktası olmamalı.

// Bir operasyonun manşet önceliği, açık ihtiyaçlarının en ağırıdır — türetilir,
// saklanmaz; yoksa ihtiyaçlardan kopar.
export function worstPriority(c: DisasterCard): PriorityKey {
  let worst: PriorityKey = 'Normal';
  for (const n of c.topNeeds) {
    if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[worst] ?? PRI.Normal).rank) worst = n.priority;
  }
  return worst;
}

export function DisasterOpCard({ card }: { card: DisasterCard }) {
  const a = useApp();
  const mob = a.device === 'mobile';
  const t = tr.home;
  const nf = new Intl.NumberFormat('tr-TR');

  const d = card.disaster;
  const active = d.status === 'Active';
  const pr = worstPriority(card);
  const tone = PRI[pr] ?? PRI.Normal;

  return (
    <article className="hv-lift" style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      // Kapanmış operasyon soluk ama okunur: arşiv değil, tamamlanmış iş.
      opacity: active ? 1 : .82,
    }}>
      {/* 4px şerit yalnızca önceliği taşır; başka hiçbir anlamı yok. */}
      <div style={{ height: 4, background: active ? tone.bar : C.success }} />
      <div style={{ padding: mob ? 18 : 24, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            {/* h3: ekran okuyucu kullanıcısı başlıklar arasında gezinerek
                afetten afete atlayabilmeli (rules/04 §Logical heading order). */}
            <h3 style={{ margin: 0 }}>
              <button onClick={() => a.openDisaster(d.slug)} className="hv-navy" style={{
                background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                font: 'inherit', fontSize: mob ? 19 : 23, fontWeight: 800, color: C.navy,
                letterSpacing: '-.02em', lineHeight: 1.2,
              }}>{d.name}</button>
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.muted, marginTop: 5 }}>
              <Ico n={DISASTER_ICON[d.type]} size={13} color={C.muted3} />
              {d.region || d.province}
            </div>
          </div>
          {/* Durum ve öncelik renkle DEĞİL kelimeyle; renk yalnızca tekrar ediyor. */}
          {active ? (
            <span style={{
              fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
              color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`,
            }}>{priorityLabel[pr].toLocaleUpperCase('tr')}</span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '4px 10px',
              fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', color: C.successText,
              background: '#EAF7EF', border: '1px solid #C9E9D6',
            }}><Ico n="completed" size={12} color={C.successText} />
              {d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived}</span>
          )}
        </div>

        <AmountBlock
          required={card.requiredTotal} verified={card.verifiedTotal}
          pending={card.pendingUnits} remaining={card.remainingTotal}
          compact={mob}
        />

        {card.topNeeds.length > 0 && (
          <p style={{ margin: '13px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
            <span>{t.topNeedsLabel}: </span>
            {card.topNeeds.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ' · '}
                <span style={{ color: C.heading2, fontWeight: 600 }}>{n.name}</span>
                <span className="tnum"> {nf.format(n.remaining)} {n.unit}</span>
              </span>
            ))}
            {card.activeNeeds > card.topNeeds.length && (
              <span> · {t.moreNeeds(card.activeNeeds - card.topNeeds.length)}</span>
            )}
          </p>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderTop: `1px solid ${C.borderFaint}`, paddingTop: 16, marginTop: 'auto', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>{t.updatedAgo(d.updatedLabel)}</span>
          <button onClick={() => a.openDisaster(d.slug)} className="hv-press" style={{
            background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
            borderRadius: 10, height: 44, padding: '0 16px', fontSize: 13.5,
            fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.detail} →</button>
        </div>
      </div>
    </article>
  );
}
