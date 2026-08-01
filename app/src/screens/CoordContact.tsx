import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, eyebrow } from '../ui';
import { Picker } from '../components/Picker';
import { supabase } from '../data/supabaseClient';
import { CONTACT_BUCKET, prettyBytes } from '../contactFiles';
import type { ContactMessage, ContactStatus } from '../types';

// "Tümü" başta ve varsayılan: kuyruğu açan kişi önce ne kadar mesaj olduğunu görmeli.
// "Yeni" ile açmak, okunmuş ama kapatılmamış bir mesajı görünmez kılıyordu.
const FILTERS: { value: string; label: string }[] = [
  { value: '', label: tr.contact.panelAll },
  { value: 'Yeni', label: tr.contact.panelNew },
  { value: 'Okundu', label: tr.contact.panelRead },
  { value: 'Kapatıldı', label: tr.contact.panelClosed },
];

// Status carries a colour AND its own word — colour alone never says what a row is
// (rules/04 §Accessibility).
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

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function CoordContact() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState('');
  const [fileErr, setFileErr] = useState('');

  // Attachments live in a private bucket. A short-lived signed URL is created at the
  // moment a coordinator asks for one, so nothing here is a durable address that could
  // be forwarded or leak in a screenshot (migration 0026). `download` also means the
  // browser saves the file instead of rendering it.
  const openFile = async (path: string, name: string) => {
    setFileErr('');
    if (!supabase) return setFileErr(tr.contact.panelFileError);
    const { data, error } = await supabase.storage.from(CONTACT_BUCKET)
      .createSignedUrl(path, 60, { download: name });
    if (error || !data?.signedUrl) return setFileErr(tr.contact.panelFileError);
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => { a.reloadContact(); /* on mount only */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: ContactMessage[] = a.contactMessages.filter((m) => (status ? m.status === status : true));
  const open = a.contactMessages.find((m) => m.id === openId) ?? null;

  const th = {
    textAlign: 'left' as const, fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
    textTransform: 'uppercase' as const, color: C.muted, padding: '11px 13px',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = { padding: '11px 13px', fontSize: 13, verticalAlign: 'middle' as const, borderBottom: `1px solid ${C.borderFaint}` };
  const btn = {
    background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
    padding: '0 13px', height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  const statusChip = (s: ContactStatus) => {
    const t = TONE[s];
    return (
      <span style={{
        background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, borderRadius: 20,
        padding: '3px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      }}>{s}</span>
    );
  };

  // The actions a coordinator can take on a message, shared by the list row and the
  // dialog so the two can never drift apart.
  const actions = (m: ContactMessage) => (
    <>
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
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div>
        <span style={eyebrow}>{tr.nav.operations}</span>
        <h1 style={{ fontSize: mob ? 22 : 24, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 6px', color: C.navy }}>
          {tr.contact.panelTitle}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: 0, maxWidth: '70ch' }}>{tr.contact.panelSubtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ minWidth: 190 }}>
          <Picker value={status} onChange={setStatus} options={FILTERS} ariaLabel={tr.contact.panelTitle} />
        </span>
        <button onClick={() => a.reloadContact()} className="hv-navy" style={{ ...btn, height: 42 }}>{tr.contact.refresh}</button>
        <span className="tnum" style={{ fontSize: 12.5, color: C.muted2 }}>
          {tr.contact.countLabel(rows.length, a.contactMessages.length)}
        </span>
        {a.contactLoading && <span style={{ fontSize: 13, color: C.muted2 }}>{tr.common.loading}</span>}
        {a.contactError && <span role="alert" style={{ fontSize: 13, color: C.errorText }}>{a.contactError}</span>}
      </div>

      {rows.length === 0 && !a.contactLoading ? (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 26, textAlign: 'center', fontSize: 14, color: C.muted,
        }}>{tr.contact.panelEmpty}</div>
      ) : mob ? (
        // Phone: the same list, one row per card. A 6-column table on a 390px screen is
        // a horizontal scroll nobody performs one-handed (rules/04 §Mobile First).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((m) => (
            <button key={m.id} onClick={() => setOpenId(m.id)} style={{
              textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 13, cursor: 'pointer', display: 'flex',
              flexDirection: 'column', gap: 6, minHeight: 48,
            }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {statusChip(m.status)}
                <span style={{ fontSize: 14.5, fontWeight: 700, color: C.navy }}>{m.name}</span>
                <span style={{
                  background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20,
                  padding: '2px 9px', fontSize: 11.5, fontWeight: 600, color: C.heading2,
                }}>{tr.contact.topics[m.topic] ?? m.topic}</span>
              </span>
              <span style={{
                fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{oneLine(m.message)}</span>
              <span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>
                {when(m.createdAt)}
                {m.files.length > 0 && ` · ${m.files.length} ek`}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#F7FAFC' }}>
                {tr.contact.head.map((h, i) => <th key={h || `c${i}`} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{statusChip(m.status)}</td>
                  <td style={{ ...td, fontWeight: 700, color: C.navy, whiteSpace: 'nowrap' }}>{m.name}</td>
                  <td style={{ ...td, color: C.heading2, whiteSpace: 'nowrap' }}>
                    {tr.contact.topics[m.topic] ?? m.topic}
                    {m.files.length > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8,
                        fontSize: 11.5, fontWeight: 600, color: C.muted,
                      }}><Ico n="need" size={12} color={C.muted2} />{m.files.length}</span>
                    )}
                  </td>
                  {/* One line only: the list is for scanning, the dialog is for reading. */}
                  <td style={{
                    ...td, color: C.text, maxWidth: 380, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{oneLine(m.message)}</td>
                  <td className="tnum" style={{ ...td, color: C.muted2, whiteSpace: 'nowrap' }}>{when(m.createdAt)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setOpenId(m.id)} className="hv-navy"
                      style={{ ...btn, height: 34 }}>{tr.contact.detail}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 72, display: 'flex',
          alignItems: mob ? 'flex-end' : 'center', justifyContent: 'center', padding: mob ? 0 : 20,
        }}>
          <div onClick={() => setOpenId('')} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.46)' }} />
          <div className="anim-in" role="dialog" aria-modal="true" aria-label={tr.contact.detailTitle} style={{
            position: 'relative', width: '100%', maxWidth: 620, background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: mob ? '16px 16px 0 0' : 14,
            boxShadow: '0 26px 60px rgba(16,42,67,.28)',
            maxHeight: mob ? '92vh' : '88vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${C.borderFaint}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.contact.detailTitle}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    {statusChip(open.status)}
                    <span style={{ fontSize: 12.5, color: C.muted }}>{when(open.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => setOpenId('')} aria-label={tr.contact.close} style={{
                  width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surface,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 34px',
                }}><Ico n="close" size={16} /></button>
              </div>
            </div>

            <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13.5 }}>
                <span style={{ color: C.muted2 }}>{tr.contact.fromLabel}</span>
                <span style={{ color: C.navy, fontWeight: 600 }}>{open.name}</span>
                <span style={{ color: C.muted2 }}>{tr.contact.mailLabel}</span>
                {/* Full address, deliberately: this screen is coordinator-only and
                    answering is the operational need that justifies showing it. */}
                <a href={`mailto:${open.email}`} style={{ color: C.info, fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>{open.email}</a>
                <span style={{ color: C.muted2 }}>{tr.contact.topicLabel}</span>
                <span style={{ color: C.heading2, fontWeight: 600 }}>{tr.contact.topics[open.topic] ?? open.topic}</span>
                {/* Optional fields only appear when the person actually filled them in;
                    an empty "Telefon —" row is noise in a queue you work through. */}
                {open.phone && <><span style={{ color: C.muted2 }}>{tr.contact.panelPhone}</span>
                  <a href={`tel:${open.phone.replace(/[^\d+]/g, '')}`} style={{ color: C.info, fontWeight: 600, textDecoration: 'none' }}>{open.phone}</a></>}
                {(open.province || open.district) && <><span style={{ color: C.muted2 }}>{tr.contact.panelPlace}</span>
                  <span style={{ color: C.heading2, fontWeight: 600 }}>{[open.district, open.province].filter(Boolean).join(' / ')}</span></>}
                {open.website && <><span style={{ color: C.muted2 }}>{tr.contact.panelWebsite}</span>
                  {/* noreferrer: a coordinator opening a stranger's link must not hand the
                      panel's URL to that site. */}
                  <a href={open.website} target="_blank" rel="noopener noreferrer nofollow"
                    style={{ color: C.info, fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>{open.website}</a></>}
              </div>

              {open.files.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...eyebrow, fontSize: 11, marginBottom: 6 }}>{tr.contact.panelFiles}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {open.files.map((f) => (
                      <li key={f.path} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '8px 10px',
                      }}>
                        <Ico n={f.mime.startsWith('image/') ? 'need' : 'completed'} size={15} color={C.muted} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{
                            display: 'block', fontSize: 13, fontWeight: 600, color: C.navy,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{f.name}</span>
                          <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{prettyBytes(f.bytes)}</span>
                        </span>
                        <button onClick={() => void openFile(f.path, f.name)} style={{ ...btn, height: 32 }}>
                          {tr.contact.panelOpenFile}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {fileErr && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: C.errorText }}>{fileErr}</p>}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ ...eyebrow, fontSize: 11, marginBottom: 6 }}>{tr.contact.messageLabel}</div>
                <p style={{
                  margin: 0, fontSize: 14.5, lineHeight: 1.65, color: C.text, whiteSpace: 'pre-wrap',
                  background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 10, padding: '12px 14px',
                }}>{open.message}</p>
              </div>
            </div>

            <div style={{
              padding: '12px 18px', borderTop: `1px solid ${C.borderFaint}`,
              display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>{actions(open)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
