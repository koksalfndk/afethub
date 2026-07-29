import type { ReactElement } from 'react';
import { useApp } from './store';
import { C } from './theme';
import { Toolbar } from './components/Toolbar';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { Modal } from './components/Modal';
import { Toast } from './components/Toast';
import { Home } from './screens/Home';
import { Disaster } from './screens/Disaster';
import { Report } from './screens/Report';
import { Track } from './screens/Track';
import { NeedRequest } from './screens/NeedRequest';
import { CoordHome } from './screens/CoordHome';
import { CoordQueue } from './screens/CoordQueue';
import { CoordNeeds } from './screens/CoordNeeds';
import { CoordLog } from './screens/CoordLog';
import { Components } from './screens/Components';
import { System } from './screens/System';

export function App() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const coord = a.role === 'coordinator';

  const screens: Record<string, () => ReactElement | null> = {
    home: Home, disaster: Disaster, report: Report, track: Track, needReq: NeedRequest,
    coordHome: CoordHome, coordQueue: CoordQueue, coordNeeds: CoordNeeds, coordLog: CoordLog,
    components: Components, system: System,
  };
  const Screen = screens[a.route] ?? Home;

  return (
    <div style={{ minHeight: '100vh', background: C.canvas, color: C.navy, fontSize: 15, lineHeight: 1.5 }}>
      <Toolbar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: mob ? '20px 12px 32px' : '0' }}>
        <div style={{
          width: '100%', maxWidth: mob ? 412 : 'none', background: C.canvas,
          border: mob ? `1px solid ${C.borderSoft}` : '0', borderRadius: mob ? 20 : 0,
          overflow: 'hidden', boxShadow: mob ? '0 18px 44px rgba(16,42,67,.14)' : 'none',
          minHeight: 720, position: 'relative',
        }}>
          <Header />
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {coord && !mob && <Sidebar />}
            <main style={{ flex: 1, minWidth: 0, padding: mob ? '16px 14px' : '24px 28px 40px', paddingBottom: mob ? 20 : 40 }}>
              {a.snap ? <Screen /> : <div style={{ padding: 40, color: C.muted }}>Yükleniyor…</div>}
            </main>
          </div>
          {mob && <BottomNav />}
          <Modal />
          <Toast />
        </div>
      </div>
    </div>
  );
}
