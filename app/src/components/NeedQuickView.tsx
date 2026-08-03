import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, wash } from '../theme';
import { PriorityBadge, ProgressBar, Ico, ClosedNeedNotice } from '../ui';
import { detailPairs, categoryIcon } from '../needForm';
import { acceptsPledges } from '../data';
import type { EnrichedNeed } from '../select';

// Bir ihtiyaç kaleminin hızlı bakış penceresi.
//
// Önceden bu buton sağ altta kaybolan bir toast açıyordu: tek satır metin, birkaç
// saniye sonra yok. Ziyaretçinin "bu kalem için ne getirmeliyim, nereye, ne kadarı
// hâlâ eksik" sorusunun cevabı okunamadan kayboluyordu. Pencere kalıcı: kapatana
// kadar durur, klavyeyle gezilebilir ve içinden doğrudan teslimat bildirilebilir.
//
// Kartta olmayan üç şey burada: teslim noktasının AÇIK ADRESİ ve saatleri, o kaleme
// gelen teslimat kayıtlarının sayısı, ve kalemin hangi operasyona ait olduğu.
// Kartta bunları göstermek kart ızgarasını okunmaz hale getirirdi.
export function NeedQuickView({ need, onClose }: { need: EnrichedNeed; onClose: () => void }) {
  const a = useApp();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape kapatır ve açılışta odak pencerenin içine girer; klavye kullanıcısı
  // arkadaki kart ızgarasının içinde kaybolmaz (rules/04 §Accessibility).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Teslim noktası kaydı: kartta yalnızca adı var. Adres ve saatler burada, çünkü
  // "getireceğim" diyen kişinin bir sonraki sorusu tam olarak bu.
  const point = a.snap?.locations.find((l) => l.name === need.loc) ?? null;

  // Bu kaleme gelen teslimatlar. İSİM GÖSTERİLMİYOR: herkese açık sayfada bağışçı
  // adı yayınlanmıyor (migration 0024 aynı sebeple akışı maskeliyor). Sayı, güveni
  // sağlamak için yeterli; kim getirdiği ziyaretçinin bilmesi gereken bir şey değil.
  const subs = (a.snap?.subs ?? []).filter((s) => s.needId === need.id);
  const verifiedSubs = subs.filter((s) => s.status === 'Verified' || s.status === 'Partially verified').length;
  const pendingSubs = subs.filter((s) => s.status === 'Pending verification').length;

  // Hiç kayıt YOKSA ve doğrulanmış miktar da sıfırsa, "henüz teslimat bildirilmedi"
  // doğru bir cümle. Doğrulanmış miktar sıfır değilse aynı cümle yalan olurdu: o
  // miktarın arkasında bu sayfada kaydı olmayan teslimatlar var. O durumda satır
  // hiç yazılmaz — uydurulmuş bir açıklama yazmaktansa susmak doğru.
  const subsLine = subs.length > 0
    ? [
        verifiedSubs > 0 ? tr.needQuick.deliveredSubs(verifiedSubs) : '',
        pendingSubs > 0 ? tr.needQuick.pendingSubs(pendingSubs) : '',
      ].filter(Boolean).join(' · ')
    : (need.verified === 0 ? tr.needQuick.noDeliveries : '');

  const pairs = detailPairs(need.details);

  const stat = (label: string, value: string, tone?: 'green' | 'amber') => (
    <div style={{
      background: tone === 'green' ? '#EAF7EF' : tone === 'amber' ? '#FFF8E5' : C.canvas,
      border: `1px solid ${tone === 'green' ? '#C9E9D6' : tone === 'amber' ? '#F2DFA8' : C.border}`,
      borderRadius: 9, padding: '9px 11px',
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: tone === 'green' ? C.successText : tone === 'amber' ? C.warningText : C.muted }}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: tone === 'green' ? C.successText : tone === 'amber' ? C.warningText : C.navy }}>{value}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(11,30,48,.45)', zIndex: 70,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="anim-in"
        role="dialog" aria-modal="true" aria-label={need.name}
        style={{
          background: C.surface, borderRadius: 14, width: '100%', maxWidth: 470,
          boxShadow: '0 18px 48px rgba(11,30,48,.25)', maxHeight: '90%', overflowY: 'auto',
        }}>

        {/* başlık */}
        <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <span style={{
            width: 38, height: 38, flex: '0 0 38px', borderRadius: 10, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: wash(need.barColor, 8), border: `1px solid ${C.borderFaint}`,
          }}><Ico n={categoryIcon(need.cat)} size={19} color={need.barColor} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{need.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 3 }}>
              {need.cat} · {tr.common.updated(need.updated)}
            </div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={tr.common.close} style={{
            flex: '0 0 auto', background: 'none', border: 0, fontSize: 17, lineHeight: 1,
            color: C.muted2, cursor: 'pointer', padding: 6, borderRadius: 8,
          }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Kalan, karar veren sayı: penceredeki en büyük öğe (rules/04). */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="tnum" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: need.barColor }}>{need.remaining}</div>
              <div style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginTop: 5 }}>
                {need.done ? tr.disaster.coveredWord : `${need.unit} ${tr.disaster.remainingWord}`}
              </div>
            </div>
            <PriorityBadge p={need.priority} />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 600, color: C.heading2 }}>
              <span className="tnum">{tr.disaster.verifiedUnit(need.verified, need.required, need.unit)}</span>
              <span className="tnum" style={{ color: C.muted2, fontWeight: 500 }}>{need.pctVal}%</span>
            </div>
            <div style={{ marginTop: 7 }}><ProgressBar pct={need.pctVal} color={need.barColor} height={8} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {stat(tr.needQuick.required, `${need.required} ${need.unit}`)}
            {stat(tr.needQuick.verified, `${need.verified} ${need.unit}`, 'green')}
            {stat(tr.needQuick.pending, `${need.pending} ${need.unit}`, 'amber')}
          </div>

          {/* Teslimat kayıtları — sayı olarak. Hiç kayıt yoksa "0 teslimat" yazmak
              yerine ne olduğu söylenir: kayıt yokluğu, kalemin gereksizliği değil. */}
          {subsLine && (
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{subsLine}</div>
          )}

          {/* teslim noktası */}
          <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted2 }}>{tr.needQuick.dropOff}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ico n="pin" size={14} color={C.muted2} />{need.loc}
            </div>
            {/* Nokta kaydı bulunamadıysa adres UYDURULMAZ; yalnızca ad kalır. */}
            {point && (
              <>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{point.address}</div>
                {point.hours && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{tr.needQuick.hours(point.hours)}</div>}
              </>
            )}
          </div>

          {pairs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pairs.map(([k, val]) => (
                <span key={k} style={{ fontSize: 12, color: C.heading2, background: C.chipNavyBg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '3px 8px' }}>
                  <b style={{ fontWeight: 600 }}>{k}:</b> {val}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.heading2, borderRadius: 9,
            padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44,
          }}>{tr.common.close}</button>
          {/* Karşılanmış bir kalem için destek yolu açık tutulur ama birincil
              görünmez: fazladan gelen bir teslimat gerçek ve kaydedilmeli.
              Duraklatılmış/tamamlanmış kalemde ise eylem hiç sunulmuyor — sunucu
              zaten reddediyor ve pencere bunu önceden söylüyor. */}
          {!acceptsPledges(need) ? <ClosedNeedNotice priority={need.priority} /> : (
          <button
            type="button"
            aria-label={tr.support.ctaAria(need.name)}
            onClick={() => { onClose(); a.openSupport(need.id); }}
            className={need.done ? undefined : 'hv-emergency'}
            style={{
              background: need.done ? C.surface : C.emergency,
              border: `1px solid ${need.done ? C.borderSoft : C.emergency}`,
              color: need.done ? C.navy : '#fff', borderRadius: 9,
              padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44,
            }}>{tr.support.cta}</button>)}
        </div>
      </div>
    </div>
  );
}
