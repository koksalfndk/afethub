import { useApp } from '../store';
import { tr, priorityLabel } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { Field, inputStyle, PriorityBadge } from '../ui';
import type { PriorityKey } from '../theme';

const CATS = ['Sağlık', 'Ekipman', 'Hijyen', 'Giyim', 'Enerji'];
const PRIOS: PriorityKey[] = ['Critical', 'Urgent', 'Normal'];

export function CoordNeeds() {
  const a = useApp();
  if (!a.snap) return null;
  const L = cols(a.device === 'mobile');
  const c = a.cneed;
  const manage = enrichSorted(a.snap.needs);

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>{tr.coord.createNeed}</h1>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.coord.createNeedBody}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <Field label={tr.coord.fTitle} full><input value={c.title} onChange={(e) => a.setCneed('title', e.target.value)} placeholder="Yanık pansumanı" style={inputStyle} /></Field>
          <Field label={tr.coord.fCategory}>
            <select value={c.cat} onChange={(e) => a.setCneed('cat', e.target.value)} style={inputStyle}>{CATS.map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label={tr.coord.fPriority}>
            <select value={c.priority} onChange={(e) => a.setCneed('priority', e.target.value)} style={inputStyle}>{PRIOS.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}</select>
          </Field>
          <Field label={tr.coord.fRequired}><input value={c.required} onChange={(e) => a.setCneed('required', e.target.value)} type="number" placeholder="100" style={inputStyle} /></Field>
          <Field label={tr.coord.fUnit}><input value={c.unit} onChange={(e) => a.setCneed('unit', e.target.value)} placeholder="paket" style={inputStyle} /></Field>
          <Field label={tr.coord.fLocation}>
            <select value={c.loc} onChange={(e) => a.setCneed('loc', e.target.value)} style={inputStyle}>
              <option>Seydikemer Kapalı Pazar Yeri</option><option>Çamlıyayla Okul Spor Salonu</option>
            </select>
          </Field>
          <Field label={tr.coord.fDeadline}><input value={c.deadline} onChange={(e) => a.setCneed('deadline', e.target.value)} type="date" style={inputStyle} /></Field>
          <button onClick={a.publishNeed} style={{ gridColumn: '1 / -1', background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.coord.publish}</button>
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.coord.publishedNeeds}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {manage.map((n) => (
            <div key={n.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{n.name}</div>
                <div style={{ fontSize: 12.5, color: C.muted2 }}>{tr.coord.verifiedRemaining(n.verified, n.required, n.remaining)}</div>
              </div>
              <PriorityBadge p={n.priority} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => a.bumpNeed(n.id)} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer', minHeight: 36 }}>{tr.coord.bump}</button>
                <button onClick={() => a.togglePause(n.id)} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: C.muted, cursor: 'pointer', minHeight: 36 }}>{n.priority === 'Paused' ? tr.coord.resume : tr.coord.pause}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
