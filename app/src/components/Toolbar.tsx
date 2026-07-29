import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr } from '../i18n/strings';

// The prototype's top chrome: switch role (Visitor/Coordinator), simulate device
// (Desktop/Mobile), and jump to the reference screens (Architecture / Components).
export function Toolbar() {
  const a = useApp();
  const auth = useAuth();
  const coord = a.role === 'coordinator';
  const mob = a.device === 'mobile';

  const seg = (active: boolean) => ({
    border: 0, cursor: 'pointer', padding: '7px 12px', borderRadius: 6, fontSize: 12.5,
    fontWeight: 600, background: active ? '#F6F8FA' : 'transparent', color: active ? '#0B1E30' : '#BCCCDC',
  }) as const;

  return (
    <div style={{
      background: '#0B1E30', color: '#F6F8FA', padding: '0 16px', display: 'flex', alignItems: 'center',
      gap: 16, flexWrap: 'wrap', minHeight: 48, position: 'sticky', top: 0, zIndex: 60,
    }}>
      <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9FB3C8', fontWeight: 600 }}>
        {tr.prototype}
      </span>
      {!auth.enabled && (
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.08)', padding: 3, borderRadius: 8 }}>
          <button style={seg(!coord)} onClick={() => a.setRole('visitor')}>{tr.toolbar.visitor}</button>
          <button style={seg(coord)} onClick={() => a.setRole('coordinator')}>{tr.toolbar.coordinator}</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.08)', padding: 3, borderRadius: 8 }}>
        <button style={seg(!mob)} onClick={() => a.setDevice('desktop')}>{tr.toolbar.desktop}</button>
        <button style={seg(mob)} onClick={() => a.setDevice('mobile')}>{tr.toolbar.mobile}</button>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: '#BCCCDC' }}>
        <button onClick={() => a.go('system')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: '8px 0', fontSize: 12.5, fontWeight: 500, color: a.route === 'system' ? '#FFFFFF' : '#BCCCDC' }}>{tr.toolbar.architecture}</button>
        <button onClick={() => a.go('components')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: '8px 0', fontSize: 12.5, fontWeight: 500, color: a.route === 'components' ? '#FFFFFF' : '#BCCCDC' }}>{tr.toolbar.components}</button>
      </div>
    </div>
  );
}
