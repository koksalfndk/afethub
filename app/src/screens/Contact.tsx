import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Field, Ico, inputStyle, eyebrow } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { PROVINCES, districtsOf } from '../data/trLocations';
import {
  prepareFile, prettyBytes, contactFileAccept, ContactFileError,
  MAX_FILES, type PreparedContactFile,
} from '../contactFiles';
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
  // Optional block. Prefilled from the account where we already hold the value — nobody
  // retypes what they have given us before (rules/01).
  const [phone, setPhone] = useState(auth.profile?.phone ?? '');
  const [province, setProvince] = useState(auth.profile?.city ?? '');
  const [district, setDistrict] = useState(auth.profile?.district ?? '');
  const [website, setWebsite] = useState('');
  const [files, setFiles] = useState<PreparedContactFile[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // The session resolves after the first render; without this the fields stay empty for
  // someone who is signed in.
  useEffect(() => {
    if (!loggedIn) return;
    setName((v) => v || (auth.profile?.fullName ?? ''));
    setEmail((v) => v || (auth.user?.email ?? ''));
    setPhone((v) => v || (auth.profile?.phone ?? ''));
    setProvince((v) => v || (auth.profile?.city ?? ''));
    setDistrict((v) => v || (auth.profile?.district ?? ''));
  }, [loggedIn, auth.profile?.fullName, auth.user?.email, auth.profile?.phone, auth.profile?.city, auth.profile?.district]);

  // Every picked file is decoded and checked here before it is queued. Nothing is
  // uploaded until the message is sent, so abandoning the page leaves no objects behind.
  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setErr(''); setPreparing(true);
    const next: PreparedContactFile[] = [];
    for (const file of Array.from(list)) {
      if (files.length + next.length >= MAX_FILES) { setErr(tr.contact.errFileTooMany); break; }
      try {
        next.push(await prepareFile(file));
      } catch (e) {
        const code = e instanceof ContactFileError ? e.code : 'unreadable';
        setErr(
          code === 'too-large' ? tr.contact.errFileTooLarge(file.name)
            : code === 'bad-type' ? tr.contact.errFileBadType(file.name)
              : code === 'no-webp' ? tr.contact.errFileNoWebp
                : tr.contact.errFileUnreadable(file.name),
        );
      }
    }
    setPreparing(false);
    if (next.length > 0) setFiles((v) => [...v, ...next].slice(0, MAX_FILES));
  };

  const send = async () => {
    if (name.trim().length < 2) return setErr(tr.contact.errName);
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim())) return setErr(tr.contact.errEmail);
    if (message.trim().length < MIN) return setErr(tr.contact.errMessage);
    if (website.trim() !== '' && !/^https?:\/\/\S{3,}$/i.test(website.trim())) return setErr(tr.contact.errWebsite);
    setErr(''); setBusy(true);
    const ok = await a.submitContact(
      { name, email, topic, message, phone, province, district, website },
      files,
    );
    setBusy(false);
    // The form keeps everything on failure: retyping a long message because a request
    // failed is the worst version of this page (rules/04 §Forms).
    if (!ok) return;
    setDone(true);
    setMessage('');
    setFiles([]);
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

                {/* Optional block, visibly separated. It is below the message on purpose:
                    someone who only wants to write a sentence should never have to scroll
                    past fields they do not owe us (rules/03 §Data Minimization). */}
                <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.borderFaint}`, paddingTop: 14, marginTop: 2 }}>
                  <div style={eyebrow}>{tr.contact.optionalTitle}</div>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted2 }}>{tr.contact.optionalNote}</p>
                </div>

                <Field label={tr.contact.fPhone}>
                  <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 32))}
                    type="tel" autoComplete="tel" placeholder={tr.contact.fPhonePh} style={inputStyle} />
                </Field>
                <Field label={tr.contact.fWebsite}>
                  <input value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 200))}
                    type="url" inputMode="url" placeholder={tr.contact.fWebsitePh} style={inputStyle} />
                </Field>
                <Field label={tr.contact.fProvince}>
                  <Picker value={province}
                    onChange={(v) => { setProvince(v); setDistrict(''); }}
                    options={[{ value: '', label: '—' }, ...toOptions(PROVINCES)]}
                    ariaLabel={tr.contact.fProvince} />
                </Field>
                <Field label={tr.contact.fDistrict}>
                  <Picker value={district} onChange={setDistrict} disabled={!province}
                    options={[{ value: '', label: '—' }, ...toOptions(districtsOf(province))]}
                    ariaLabel={tr.contact.fDistrict} />
                </Field>

                {/* Files */}
                <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.borderFaint}`, paddingTop: 14, marginTop: 2 }}>
                  <div style={eyebrow}>{tr.contact.filesTitle}</div>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: C.muted2 }}>{tr.contact.filesNote}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.muted2 }}>{tr.contact.filesPrivacy}</p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <label style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, ...plainBtn,
                      height: 44, cursor: files.length >= MAX_FILES ? 'not-allowed' : 'pointer',
                      opacity: files.length >= MAX_FILES ? .6 : 1,
                    }}>
                      <Ico n="plus" size={15} color={C.info} />{tr.contact.filesPick}
                      <input type="file" multiple accept={contactFileAccept}
                        disabled={files.length >= MAX_FILES || preparing}
                        onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
                        style={{ display: 'none' }} />
                    </label>
                    {preparing && <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.contact.filesPreparing}</span>}
                    {!preparing && files.length === 0 && (
                      <span style={{ fontSize: 12.5, color: C.muted3 }}>{tr.contact.filesEmpty}</span>
                    )}
                  </div>

                  {files.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {files.map((f, idx) => (
                        <li key={`${f.objectName}`} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: C.canvas, border: `1px solid ${C.borderFaint}`,
                          borderRadius: 9, padding: '8px 10px',
                        }}>
                          <Ico n={f.kind === 'image' ? 'image' : 'file'} size={15} color={C.muted} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{
                              display: 'block', fontSize: 13, fontWeight: 600, color: C.navy,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{f.name}</span>
                            {/* The saving is shown, not claimed: a phone photo goes in at
                                4 MB and is stored at a few hundred KB, and the person who
                                picked it can see that happened. */}
                            <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
                              {f.kind === 'image' && f.originalBytes > f.bytes
                                ? tr.contact.fileShrunk(prettyBytes(f.originalBytes), prettyBytes(f.bytes))
                                : `${prettyBytes(f.bytes)} · ${tr.contact.fileAsIs}`}
                            </span>
                          </span>
                          <button type="button" onClick={() => setFiles((v) => v.filter((_, i) => i !== idx))}
                            style={{
                              background: 'none', border: 0, padding: '6px 8px', fontSize: 12.5,
                              fontWeight: 600, color: C.info, cursor: 'pointer',
                            }}>{tr.contact.filesRemove}</button>
                        </li>
                      ))}
                    </ul>
                  )}
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
