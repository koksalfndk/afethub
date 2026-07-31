import { useEffect, useRef, useState } from 'react';
import { C, G } from '../theme';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { Ico } from '../ui';
import type { Disaster } from '../types';

// Bir operasyonun herkese açık sayfasını paylaşma penceresi.
//
// Neden ayrı bir pencere: koordinatör bağlantıyı elle yazdığında ("afethub.com/afet/
// seydikemer-yangin") yardım etmek isteyen kişi 404 görüyor. Bağlantı burada kaydın
// KENDİ slug'ından üretiliyor, elle yazılmıyor.
//
// Adres tarayıcıdan (`location.origin`) alınır, sabit yazılmaz: aynı kod önizleme ve
// yerel ortamda da çalışıyor ve oralarda afethub.com'a giden bir link üretmemeli.

const publicUrl = (slug: string): string =>
  `${typeof window === 'undefined' ? '' : window.location.origin}/afet/${slug}`;

export function ShareDisasterModal({ disaster, onClose }: { disaster: Disaster; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const url = publicUrl(disaster.slug);
  const message = tr.shareDisaster.message({
    name: disaster.name,
    typeLabel: disasterTypeLabel[disaster.type],
    region: disaster.region,
    statusLabel: tr.coordDisasters.statusLabels[disaster.status],
    situation: disaster.situation.trim(),
    url,
  });

  // Escape ile kapanır ve açılışta odak pencerenin içine girer: klavye kullanıcısı
  // arkadaki tablonun içinde kaybolmaz (rules/04 §Accessibility).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    setCopyFailed(false);
    try {
      // `navigator.clipboard` güvenli olmayan bağlamda (http) yok; başarısızlık
      // sessizce yutulmaz, kullanıcıya elle kopyalayabileceği söylenir.
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.46)' }} />
      <div
        className="anim-in"
        role="dialog"
        aria-modal="true"
        aria-label={tr.shareDisaster.title}
        style={{
          position: 'relative', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 26px 60px rgba(16,42,67,.28)',
        }}
      >
        <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: G.heroRibbon }} />

        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
          padding: '16px 18px 12px', borderBottom: `1px solid ${C.borderFaint}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.shareDisaster.title}</div>
            <div style={{ fontSize: 12.5, color: C.navy, marginTop: 3, fontWeight: 600 }}>{disaster.name}</div>
            <div style={{ fontSize: 12, color: C.muted2, marginTop: 2, maxWidth: '46ch' }}>{tr.shareDisaster.intro}</div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={tr.shareDisaster.close} style={{
            width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 34px',
          }}><Ico n="close" size={16} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="share-url" style={{
              display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
              textTransform: 'uppercase', color: C.muted2, marginBottom: 6,
            }}>{tr.shareDisaster.linkLabel}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* readOnly ama seçilebilir: kopyalama başarısız olursa elle alınabilsin. */}
              <input
                id="share-url"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: '1 1 240px', minWidth: 0, background: C.canvas,
                  border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '0 12px',
                  height: 46, fontSize: 13.5, color: C.navy,
                }}
              />
              <button onClick={copy} className="hv-navy" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, background: C.surface,
                border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
                height: 46, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}>
                {/* Sonuç yalnızca renkle değil, ikon VE yazıyla bildirilir. */}
                <Ico n={copied ? 'completed' : 'copy'} size={16} color={copied ? C.successText : C.navy} />
                {copied ? tr.shareDisaster.copied : tr.shareDisaster.copy}
              </button>
            </div>
            {copyFailed && (
              <p role="alert" style={{ margin: '7px 0 0', fontSize: 12, color: C.warningText }}>
                {tr.shareDisaster.copyFailed}
              </p>
            )}
          </div>

          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
              textTransform: 'uppercase', color: C.muted2, marginBottom: 6,
            }}>{tr.shareDisaster.previewLabel}</div>
            {/* Ne gönderileceği önce gösterilir: koordinatör kendi adına paylaşıyor,
                içeriği görmeden göndermek zorunda bırakılmaz. */}
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '11px 12px', fontSize: 12.5, lineHeight: 1.55, color: C.text,
              fontFamily: 'inherit', maxHeight: 168, overflowY: 'auto',
            }}>{message}</pre>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                background: '#1E8E3E', border: '1px solid #17752F', color: '#fff', borderRadius: 9,
                height: 46, padding: '0 16px', fontSize: 14, fontWeight: 600,
              }}
            >
              <Ico n="chat" size={17} color="#fff" />
              {tr.shareDisaster.whatsapp}
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hv-navy"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
                background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
                borderRadius: 9, height: 46, padding: '0 14px', fontSize: 14, fontWeight: 600,
              }}
            >
              <Ico n="eye" size={16} />
              {tr.shareDisaster.openPublic}
            </a>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: C.muted2 }}>{tr.shareDisaster.whatsappHint}</p>
        </div>
      </div>
    </div>
  );
}
