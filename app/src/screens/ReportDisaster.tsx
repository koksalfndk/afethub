import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { cols } from '../select';
import { Field, Ico, inputStyle, eyebrow, type IcoName } from '../ui';
import type { DisasterReport, DisasterReportInput, DisasterType } from '../types';

const TYPES: { key: DisasterType; icon: IcoName }[] = [
  { key: 'Wildfire', icon: 'critical' },
  { key: 'Earthquake', icon: 'activity' },
  { key: 'Flood', icon: 'activity' },
  { key: 'Storm', icon: 'activity' },
  { key: 'Evacuation', icon: 'people' },
  { key: 'Other', icon: 'need' },
];

const today = () => new Date().toISOString().slice(0, 10);

export function ReportDisaster() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const L = cols(mob);

  const [type, setType] = useState<DisasterType | ''>('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [occurredOn, setOccurredOn] = useState(today());
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [err, setErr] = useState('');
  const [similar, setSimilar] = useState<DisasterReport[] | null>(null);
  const [done, setDone] = useState<{ report: DisasterReport; merged: boolean } | null>(null);

  const input = (): DisasterReportInput => ({
    type: type as DisasterType, province, district, locationNote, occurredOn, description, name, email, phone,
  });

  const validate = (): boolean => {
    if (!type) { setErr(tr.reportDisaster.errType); return false; }
    if (!province.trim()) { setErr(tr.reportDisaster.errProvince); return false; }
    if (description.trim().length < 5) { setErr(tr.reportDisaster.errDescription); return false; }
    if (!name.trim() || !email.trim()) { setErr(tr.reportDisaster.errContact); return false; }
    setErr('');
    return true;
  };

  // Suggest first, write second: the reporter gets the chance to confirm an existing
  // report instead of opening a duplicate. The merge rule is applied again on write.
  const next = async () => {
    if (!validate()) return;
    const found = await a.findSimilarReports(input());
    if (found.length > 0) { setSimilar(found); return; }
    const res = await a.submitDisasterReport(input());
    if (res) setDone(res);
  };

  const confirmExisting = async (r: DisasterReport) => {
    const ok = await a.confirmDisasterReport(r.id);
    if (ok) setDone({ report: { ...r, reportCount: r.reportCount + 1 }, merged: true });
  };

  const createAnyway = async () => {
    const res = await a.submitDisasterReport(input());
    if (res) setDone(res);
    setSimilar(null);
  };

  const reset = () => {
    setType(''); setProvince(''); setDistrict(''); setLocationNote(''); setOccurredOn(today());
    setDescription(''); setSimilar(null); setDone(null); setErr('');
  };

  if (done) {
    const r = done.report;
    return (
      <div className="anim-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        <div style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.successText }}>{tr.reportDisaster.doneTitle}</div>
          <div style={{ fontSize: 13.5, color: C.heading2, marginTop: 5 }}>{tr.reportDisaster.doneBody}</div>
          <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
              {disasterTypeLabel[r.type]} · {[r.province, r.district].filter(Boolean).join(' / ')}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{tr.reportDisaster.observedOn(r.occurredOn)}</div>
            <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: C.warningText, marginTop: 8 }}>
              {tr.reportDisaster.reportedBy(r.reportCount)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button onClick={reset} className="hv-navy" style={btn(false)}>{tr.reportDisaster.another}</button>
          <button onClick={() => a.go('home')} style={btn(true)}>{tr.reportDisaster.backHome}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 780 }}>
      <div>
        <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0, color: C.navy }}>{tr.reportDisaster.title}</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0' }}>{tr.reportDisaster.intro}</p>
      </div>

      {/* AfetHUB is not an emergency authority (rules/03). */}
      <div style={{
        background: C.errorSurface, border: `1px solid ${C.errorBorder}`, borderLeft: `3px solid ${C.emergency}`,
        borderRadius: 10, padding: '11px 13px', fontSize: 12.5, color: C.errorText, fontWeight: 600,
      }}>{tr.reportDisaster.notAuthority}</div>

      {similar ? (
        <section className="anim-in" style={{ background: G.criticalPanel, border: '1px solid #F3DADA', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{tr.reportDisaster.similarTitle}</div>
            <p style={{ fontSize: 13.5, color: C.heading2, margin: '5px 0 0' }}>{tr.reportDisaster.similarBody}</p>
          </div>
          {similar.map((r) => (
            <div key={r.id} style={{ background: C.surface, border: '1px solid #F1DEDE', borderRadius: 11, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
                    {disasterTypeLabel[r.type]} · {[r.province, r.district].filter(Boolean).join(' / ')}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    {r.locationNote || tr.reportDisaster.observedOn(r.occurredOn)}
                  </div>
                </div>
                <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.warningText, whiteSpace: 'nowrap' }}>
                  {tr.reportDisaster.reportedBy(r.reportCount)}
                </span>
              </div>
              {r.description && <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{r.description}</p>}
              <div className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>
                {tr.reportDisaster.observedOn(r.occurredOn)} · {tr.reportDisaster.lastReport(r.lastReportLabel)}
              </div>
              <button onClick={() => void confirmExisting(r)} style={{ ...btn(true), alignSelf: 'flex-start' }}>
                {tr.reportDisaster.similarConfirm}
              </button>
            </div>
          ))}
          <button onClick={() => void createAnyway()} className="hv-navy" style={{ ...btn(false), alignSelf: 'flex-start' }}>
            {tr.reportDisaster.similarNew}
          </button>
        </section>
      ) : (
        <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.emergency}`, borderRadius: 14, padding: 18 }}>
          <div style={eyebrow}>{tr.reportDisaster.chooseType}</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', marginTop: 10 }}>
            {TYPES.map((t) => {
              const on = type === t.key;
              return (
                <button key={t.key} onClick={() => setType(t.key)} aria-pressed={on} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '13px 13px', borderRadius: 11,
                  border: `1px solid ${on ? C.navy : C.borderSoft}`, background: on ? G.navyBtn : C.surface,
                  color: on ? '#fff' : C.navy, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  minHeight: 52, textAlign: 'left',
                }}>
                  <Ico n={t.icon} size={18} color={on ? '#fff' : C.emergency} />
                  {disasterTypeLabel[t.key]}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form, marginTop: 18 }}>
            <Field label={tr.reportDisaster.fProvince}><input value={province} onChange={(e) => setProvince(e.target.value)} style={inputStyle} /></Field>
            <Field label={tr.reportDisaster.fDistrict}><input value={district} onChange={(e) => setDistrict(e.target.value)} style={inputStyle} /></Field>
            <Field label={tr.reportDisaster.fLocation} full>
              <input value={locationNote} onChange={(e) => setLocationNote(e.target.value)} placeholder={tr.reportDisaster.fLocationPh} style={inputStyle} />
            </Field>
            <Field label={tr.reportDisaster.fDate}>
              <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} max={today()} style={inputStyle} />
            </Field>
            <Field label={tr.reportDisaster.fDescription} full>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={tr.reportDisaster.fDescriptionPh} style={{ ...inputStyle, minHeight: 88 }} />
            </Field>
          </div>

          <div style={{ ...eyebrow, marginTop: 18 }}>{tr.reportDisaster.contactSection}</div>
          <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 4 }}>{tr.reportDisaster.contactHint}</div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.form, marginTop: 10 }}>
            <Field label={tr.reportDisaster.fName}><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
            <Field label={tr.reportDisaster.fEmail}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
            <Field label={tr.reportDisaster.fPhone}><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
          </div>

          {err && (
            <div style={{ marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`, color: C.errorText, borderRadius: 9, padding: '10px 12px', fontSize: 13.5 }}>{err}</div>
          )}
          <button onClick={() => void next()} className="hv-emergency" style={{ ...btn(true), marginTop: 16 }}>{tr.reportDisaster.submit}</button>
        </section>
      )}
    </div>
  );
}

function btn(primary: boolean) {
  return primary
    ? {
        background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
        padding: '0 20px', height: 48, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
      }
    : {
        background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
        padding: '0 18px', height: 48, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
      };
}
