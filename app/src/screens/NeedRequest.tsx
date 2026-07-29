import { useApp } from '../store';
import { tr, priorityLabel } from '../i18n/strings';
import { C } from '../theme';
import { cols } from '../select';
import { Field, inputStyle } from '../ui';
import type { PriorityKey } from '../theme';

const CATS = ['Sağlık', 'Ekipman', 'Hijyen', 'Giyim', 'Enerji', 'Gıda ve Su'];
const PRIOS: PriorityKey[] = ['Critical', 'Urgent', 'Normal'];

export function NeedRequest() {
  const a = useApp();
  const L = cols(a.device === 'mobile');
  const r = a.nreq;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 4px' }}>{tr.needReq.title}</h1>
      <p style={{ fontSize: 14.5, color: C.muted, margin: '0 0 18px' }}>{tr.needReq.intro}</p>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, display: 'grid', gap: 12, gridTemplateColumns: L.form }}>
        <Field label={tr.needReq.disaster}>
          <select style={inputStyle}><option>Seydikemer Orman Yangını</option></select>
        </Field>
        <Field label={tr.needReq.category}>
          <select value={r.cat} onChange={(e) => a.setNreq('cat', e.target.value)} style={inputStyle}>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={tr.needReq.titleField} full>
          <input value={r.title} onChange={(e) => a.setNreq('title', e.target.value)} placeholder="Yanık pansumanı" style={inputStyle} />
        </Field>
        <Field label={tr.needReq.description} full>
          <textarea value={r.desc} onChange={(e) => a.setNreq('desc', e.target.value)} rows={3} placeholder={tr.needReq.descPh} style={{ ...inputStyle, minHeight: undefined, resize: 'vertical' }} />
        </Field>
        <Field label={tr.needReq.requestedQty}>
          <input value={r.qty} onChange={(e) => a.setNreq('qty', e.target.value)} type="number" placeholder="80" style={inputStyle} />
        </Field>
        <Field label={tr.needReq.unit}>
          <input value={r.unit} onChange={(e) => a.setNreq('unit', e.target.value)} placeholder="paket" style={inputStyle} />
        </Field>
        <Field label={tr.needReq.priority}>
          <select value={r.priority} onChange={(e) => a.setNreq('priority', e.target.value)} style={inputStyle}>
            {PRIOS.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
          </select>
        </Field>
        <Field label={tr.needReq.location}>
          <input value={r.loc} onChange={(e) => a.setNreq('loc', e.target.value)} placeholder={tr.needReq.locationPh} style={inputStyle} />
        </Field>
        <div style={{ gridColumn: '1 / -1', height: 1, background: C.border }} />
        <Field label={tr.needReq.fullName}><input value={r.name} onChange={(e) => a.setNreq('name', e.target.value)} style={inputStyle} /></Field>
        <Field label={tr.needReq.email}><input value={r.email} onChange={(e) => a.setNreq('email', e.target.value)} type="email" style={inputStyle} /></Field>
        <Field label={tr.needReq.phone}><input value={r.phone} onChange={(e) => a.setNreq('phone', e.target.value)} style={inputStyle} /></Field>
        <Field label={tr.needReq.city}><input value={r.city} onChange={(e) => a.setNreq('city', e.target.value)} style={inputStyle} /></Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={a.submitNeedReq} style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10, padding: '13px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.needReq.submit}</button>
          <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.needReq.afterNote}</span>
        </div>
        {a.needReqCode && (
          <div style={{ gridColumn: '1 / -1', background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 10, padding: 13, fontSize: 13.5, color: C.successText, fontWeight: 600 }}>{tr.needReq.done(a.needReqCode)}</div>
        )}
      </div>
    </div>
  );
}
