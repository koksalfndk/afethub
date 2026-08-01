import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Field, Ico, inputStyle, eyebrow } from '../ui';
import { Picker } from '../components/Picker';
import type { ContactTopic } from '../types';

const TOPICS: ContactTopic[] = ['Genel', 'Kurum', 'Gönüllü', 'Basın', 'Teknik', 'Diğer'];
const MAX = 4000;
const MIN = 20;

const primaryBtn = {
  background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
  padding: '0 20px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
};
const plainBtn = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
  padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

export function Contact() {
  const a = useApp();
  const auth = useAuth();
  const loggedIn = auth.enabled && !!auth.user;
  const mob = a.device === 'mobile';

  // Prefilled from the account when there is one, so nobody retypes what we already
  // hold (rules/01 §Registration Must Be Optional). The form itself never requires one.
  const [name, setName] = useState(auth.profile?.fullName ?? '');
  const [email, setEmail] = useState(auth.user?.email ?? '');
  const [topic, setTopic] = useState<ContactTopic>('Genel');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // The session resolves after the first render; without this the fields stay empty for
  // someone who is signed in.
  useEffect(() => {
    if (!loggedIn) return;
    setName((v) => v || (auth.profile?.fullName ?? ''));
    setEmail((v) => v || (auth.user?.email ?? ''));
  }, [loggedIn, auth.profile?.fullName, auth.user?.email]);

  const send = async () => {
    if (name.trim().length < 2) return setErr(tr.contact.errName);
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim())) return setErr(tr.contact.errEmail);
    if (message.trim().length < MIN) return setErr(tr.contact.errMessage);
    setErr(''); setBusy(true);
    const ok = await a.submitContact({ name, email, topic, message });
    setBusy(false);
    // The form keeps everything on failure: retyping a long message because a request
    // failed is the worst version of this page (rules/04 §Forms).
    if (!ok) return;
    setDone(true);
    setMessage('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const card = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: mob ? 16 : 22,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div>
        <div style={eyebrow}>{tr.contact.navLabel}</div>
        <h1 style={{ fontSize: mob ? 24 : 28, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 8px', color: C.navy }}>
          {tr.contact.title}
        </h1>
        <p style={{ fontSize: 15, color: C.text, margin: 0, maxWidth: '62ch' }}>{tr.contact.lead}</p>
      </div>

      {/* Not decoration: someone in danger must be told, on the page where they are about
          to wait for a reply, that this is not the channel for it (rules/07). */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: '#FFF6F6', border: '1px solid #F3D2D4', borderRadius: 12, padding: '12px 14px',
      }}>
        <span style={{ paddingTop: 1 }}><Ico n="critical" size={16} color="#BE2A31" /></span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#7A2E33' }}>{tr.contact.emergency}</p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.15fr) minmax(0,.85fr)' }}>
        <div style={card}>
          {done ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, background: '#EAF7EF',
                border: '1px solid #C9E9D6', color: C.successText, borderRadius: 20,
                padding: '4px 11px', fontSize: 12.5, fontWeight: 700,
              }}><Ico n="completed" size={13} color={C.successText} />{tr.contact.doneTitle}</span>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: C.text }}>{tr.contact.doneBody}</p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.muted2 }}>{tr.contact.doneMailNote}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setDone(false)} style={primaryBtn}>{tr.contact.newMessage}</button>
                <button onClick={() => a.go('home')} style={plainBtn}>{tr.contact.backHome}</button>
              </div>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 14px', color: C.navy }}>{tr.contact.formTitle}</h2>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: mob ? '1fr' : '1fr 1fr' }}>
                <Field label={tr.contact.fName}>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                    maxLength={120} style={inputStyle} />
                </Field>
                <Field label={tr.contact.fEmail}>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                    autoComplete="email" readOnly={loggedIn} disabled={loggedIn}
                    style={{ ...inputStyle, ...(loggedIn ? { background: C.canvas, color: C.muted } : {}) }} />
                </Field>
                <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: C.muted2, marginTop: -4 }}>
                  {tr.contact.fEmailNote}
                </div>
                <Field label={tr.contact.fTopic} full>
                  <Picker value={topic} onChange={(v) => setTopic(v as ContactTopic)}
                    options={TOPICS.map((t) => ({ value: t, label: tr.contact.topics[t] }))}
                    ariaLabel={tr.contact.fTopic} />
                </Field>
                <Field label={tr.contact.fMessage} full>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
                    placeholder={tr.contact.fMessagePh} rows={7}
                    style={{ ...inputStyle, minHeight: 150, resize: 'vertical', lineHeight: 1.6 }} />
                </Field>
                <div style={{
                  gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between',
                  gap: 10, marginTop: -4, fontSize: 12.5, color: C.muted2,
                }}>
                  <span>{tr.contact.minNote}</span>
                  <span className="tnum">{tr.contact.counter(message.length)}</span>
                </div>
              </div>

              {err && (
                <p role="alert" style={{
                  margin: '12px 0 0', fontSize: 13.5, color: '#7A2E33',
                  background: '#FFF6F6', border: '1px solid #F3D2D4', borderRadius: 9, padding: '10px 12px',
                }}>{err}</p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={() => void send()} disabled={busy} className="hv-emergency"
                  style={{ ...primaryBtn, opacity: busy ? .7 : 1, cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? tr.contact.sending : tr.contact.send}
                </button>
                <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.contact.speedNote}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={card}>
            <div style={eyebrow}>{tr.contact.mailTitle}</div>
            <a href={`mailto:${tr.contact.mailAddress}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8,
              fontSize: 16, fontWeight: 700, color: C.navy, textDecoration: 'none',
            }}>
              <Ico n="mail" size={16} color={C.info} />{tr.contact.mailAddress}
            </a>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.6, color: C.muted2 }}>{tr.contact.mailNote}</p>
          </div>

          <div style={card}>
            <div style={eyebrow}>{tr.contact.notHere}</div>
            <p style={{ margin: '8px 0 12px', fontSize: 13.5, lineHeight: 1.65, color: C.text }}>{tr.contact.notHereBody}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {([
                ['report', tr.header.reportAid],
                ['needReq', tr.bottomNav.request],
                ['volunteer', tr.nav.volunteer],
                ['track', tr.header.track],
              ] as const).map(([route, label]) => (
                <button key={route} onClick={() => a.go(route)} className="hv-navy" style={{
                  background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20,
                  padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: C.heading2,
                  cursor: 'pointer', minHeight: 36,
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
