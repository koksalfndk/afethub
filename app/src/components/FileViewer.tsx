import { useEffect, useState } from 'react';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { Ico } from '../ui';
import { prettyBytes } from '../contactFiles';
import { docxToText } from '../officeText';

// Looking at an attachment without leaving the panel.
//
// Everything here renders from a short-lived signed URL that the caller created; the
// bucket stays private and no third-party viewer is involved (see officeText.ts for why
// that matters). Images and PDFs are shown with what the browser already has, a .docx is
// read as text in the page, and anything else says so plainly and offers the download —
// a viewer that pretends to preview a format it cannot read is worse than a download
// button.
export interface ViewerFile {
  name: string;
  mime: string;
  bytes: number;
  /** Inline URL — signed, short-lived, no download disposition. */
  url: string;
  /** Same object, signed with a download disposition. */
  downloadUrl: string;
}

const isImage = (m: string) => m.startsWith('image/');
const isPdf = (m: string) => m === 'application/pdf';
const isText = (m: string) => m === 'text/plain' || m === 'text/csv';
const isDocx = (m: string) => m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function FileViewer({ file, onClose, mobile }: {
  file: ViewerFile;
  onClose: () => void;
  mobile: boolean;
}) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Esc closes it. A viewer that traps a coordinator mid-queue is a queue that stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    const needsFetch = isText(file.mime) || isDocx(file.mime);
    if (!needsFetch) return;
    setState('loading'); setText('');
    (async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error('fetch');
        const body = isDocx(file.mime) ? await docxToText(await res.blob()) : await res.text();
        if (!alive) return;
        setText(body.slice(0, 200_000));
        setState('idle');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [file.url, file.mime]);

  const frame = {
    width: '100%', border: `1px solid ${C.borderFaint}`, borderRadius: 10,
    background: C.canvas, minHeight: mobile ? 320 : 460,
  };

  const body = () => {
    if (isImage(file.mime)) {
      return (
        <img src={file.url} alt={file.name} style={{
          ...frame, display: 'block', maxHeight: mobile ? '58vh' : '66vh',
          objectFit: 'contain', background: '#0B1E30',
        }} />
      );
    }
    if (isPdf(file.mime)) {
      // A cross-origin iframe: the PDF renders in the browser's own viewer and cannot
      // reach anything in this page.
      return (
        <iframe src={file.url} title={file.name}
          style={{ ...frame, height: mobile ? '58vh' : '66vh' }} />
      );
    }
    if (isText(file.mime) || isDocx(file.mime)) {
      if (state === 'loading') {
        return <div style={{ ...frame, padding: 16, fontSize: 13.5, color: C.muted }}>{tr.common.loading}</div>;
      }
      if (state === 'error') {
        return <div style={{ ...frame, padding: 16, fontSize: 13.5, color: C.muted }}>{tr.contact.viewerNoPreview}</div>;
      }
      return (
        <pre style={{
          ...frame, margin: 0, padding: 16, maxHeight: mobile ? '58vh' : '66vh', overflow: 'auto',
          fontSize: 13.5, lineHeight: 1.65, color: C.text,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: isDocx(file.mime) ? 'inherit' : 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>{text}</pre>
      );
    }
    // xlsx and anything else: no honest preview, so it says so.
    return (
      <div style={{ ...frame, padding: 20, fontSize: 13.5, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {tr.contact.viewerNoPreview}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, display: 'flex',
      alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', padding: mobile ? 0 : 20,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.56)' }} />
      <div className="anim-in" role="dialog" aria-modal="true" aria-label={file.name} style={{
        position: 'relative', width: '100%', maxWidth: 900, background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: mobile ? '16px 16px 0 0' : 14,
        boxShadow: '0 26px 60px rgba(16,42,67,.30)',
        maxHeight: mobile ? '94vh' : '92vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${C.borderFaint}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Ico n={isImage(file.mime) ? 'image' : 'file'} size={17} color={C.muted} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{
              display: 'block', fontSize: 15, fontWeight: 700, color: C.navy,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{file.name}</span>
            <span className="tnum" style={{ fontSize: 12, color: C.muted2 }}>{prettyBytes(file.bytes)}</span>
          </span>
          <a href={file.downloadUrl} download={file.name} className="hv-navy" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy,
            borderRadius: 9, padding: '0 13px', height: 38, lineHeight: '38px',
            fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            <Ico n="download" size={14} color={C.info} />{tr.contact.viewerDownload}
          </a>
          <button onClick={onClose} aria-label={tr.contact.close} style={{
            width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.borderSoft}`,
            background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flex: '0 0 38px',
          }}><Ico n="close" size={16} /></button>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>{body()}</div>

        <div style={{ padding: '10px 16px 14px', fontSize: 12, color: C.muted3 }}>
          {tr.contact.viewerNote}
        </div>
      </div>
    </div>
  );
}
