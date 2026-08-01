import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, eyebrow } from '../ui';
import { Picker } from '../components/Picker';
import type { ContactMessage, ContactStatus } from '../types';

const FILTERS: { value: string; label: string }[] = [
  { value: 'Yeni', label: tr.contact.panelNew },
  { value: 'Okundu', label: tr.contact.panelRead },
  { value: 'Kapatıldı', label: tr.contact.panelClosed },
  { value: '', label: 'Tümü' },
];

const TONE: Record<ContactStatus, { bg: string; bd: string; fg: string }> = {
  'Yeni': { bg: '#FFF7E8', bd: '#F2DCB3', fg: '#8A6100' },
  'Okundu': { bg: '#EEF4FA', bd: '#D3E2F2', fg: '#2A6FB0' },
  'Kapatıldı': { bg: '#F1F4F7', bd: '#DCE4EC', fg: '#627D98' },
};

const when = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function CoordContact() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [status, setStatus] = useState('Yeni');
  const [open, setOpen] = useState<string>('');

  useEffect(() => { a.reloadContact(); /* on mount only */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: ContactMessage[] = a.contactMessages.filter((m) => (status ? m.status === status : true));
  const btn = {
    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
    padding: '0 13px', height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div>
        <div style={eyebrow}>{tr.nav.dashboard}</div>
        <h1 style={{ fontSize: mob ? 22 : 26, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 6px', color: C.navy }}>
          {tr.contact.panelTitle}
        </h1>
        <p style={{ fontSize: 14, color: C.muted2, margin: 0, maxWidth: '70ch' }}>{tr.contact.panelSubtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 190 }}>
          <Picker value={status} onChange={setStatus} options={FILTERS} ariaLabel={tr.contact.panelTitle} />
        </div>
        <button onClick={() => a.reloadContact()} style={btn}>Yenile</button>
        {a.contactLoading && <span style={{ fontSize: 13, color: C.muted2 }}>Yükleniyor…</span>}
        {a.contactError && <span role="alert" style={{ fontSize: 13, color: C.errorText }}>{a.contactError}</span>}
      </div>

      {rows.length === 0 && !a.contactLoading ? (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 22, fontSize: 14, color: C.muted2,
        }}>{tr.contact.panelEmpty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((m) => {
            const t = TONE[m.status];
            const isOpen = open === m.id;
            return (
              <div key={m.id} style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: mob ? 14 : 16,
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  {/* Status as text inside the chip, not colour alone (rules/04). */}
                  <span style={{
                    background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, borderRadius: 20,
                    padding: '3px 10px', fontSize: 11.5, fontWeight: 700,
                  }}>{m.status}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{m.name}</span>
                  <span style={{
                    background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20,
                    padding: '2px 9px', fontSize: 11.5, fontWeight: 600, color: C.heading2,
                  }}>{tr.contact.topics[m.topic] ?? m.topic}</span>
                  <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, marginLeft: 'auto' }}>{when(m.createdAt)}</span>
                </div>

                <p style={{
                  margin: '10px 0 0', fontSize: 14, lineHeight: 1.65, color: C.text,
                  whiteSpace: 'pre-wrap',
                  ...(isOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
                }}>{m.message}</p>
                {m.message.length > 220 && (
                  <button onClick={() => setOpen(isOpen ? '' : m.id)} style={{
                    background: 'none', border: 0, padding: '6px 0 0', fontSize: 12.5, fontWeight: 600,
                    color: C.info, cursor: 'pointer',
                  }}>{isOpen ? 'Kısalt' : 'Tamamını oku'}</button>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                  {/* The address is here because replying is the job — and it is
                      coordinator-only data, never rendered on a public surface. */}
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: [İletişim] ${m.topic}`)}`}
                    className="hv-navy" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7, ...btn,
                      textDecoration: 'none', lineHeight: '38px',
                    }}>
                    <Ico n="mail" size={14} color={C.info} />{tr.contact.panelReply}
                  </a>
                  {m.status !== 'Okundu' && (
                    <button onClick={() => void a.setContactStatus(m.id, 'Okundu')} style={btn}>{tr.contact.markRead}</button>
                  )}
                  {m.status !== 'Kapatıldı' && (
                    <button onClick={() => void a.setContactStatus(m.id, 'Kapatıldı')} style={btn}>{tr.contact.markClosed}</button>
                  )}
                  {m.status !== 'Yeni' && (
                    <button onClick={() => void a.setContactStatus(m.id, 'Yeni')} style={btn}>{tr.contact.reopen}</button>
                  )}
                  <span style={{ fontSize: 12, color: C.muted3 }}>{m.email}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
