import { useApp } from '../store';
import { C } from '../theme';

export function Toast() {
  const a = useApp();
  if (!a.toast) return null;
  return (
    <div className="anim-in" style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 80, background: '#0B1E30', color: '#fff',
      borderRadius: 11, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 12px 30px rgba(11,30,48,.3)', maxWidth: 340,
    }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.success, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 20px' }}>✓</span>
      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.toast}</span>
    </div>
  );
}
