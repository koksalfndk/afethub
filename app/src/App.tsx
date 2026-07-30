import type { ReactElement } from 'react';
import { useApp } from './store';
import { C } from './theme';
import { Toolbar } from './components/Toolbar';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { Modal } from './components/Modal';
import { Toast } from './components/Toast';
import { AuthModal } from './components/AuthModal';
import { AccountBanner } from './components/AccountBanner';
import { ReportModal } from './components/ReportModal';
import { NeedWizard } from './components/NeedWizard';
import { Home } from './screens/Home';
import { Disaster } from './screens/Disaster';
import { Track } from './screens/Track';
import { NeedRequest } from './screens/NeedRequest';
import { Organizations } from './screens/Organizations';
import { ReportDisaster } from './screens/ReportDisaster';
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
  const frame = a.frame; // 412px phone mock-up wrapper (dev preview only)

  const screens: Record<string, () => ReactElement | null> = {
    home: Home, disaster: Disaster, track: Track, needReq: NeedRequest, orgs: Organizations, reportDisaster: ReportDisaster,
    coordHome: CoordHome, coordQueue: CoordQueue, coordNeeds: CoordNeeds, coordLog: CoordLog,
    components: Components, system: System,
  };
  const isReport = a.route === 'report';
  // "Teslimat bildir" opens as a modal over the previous page (home as backdrop).
  const Screen = isReport ? Home : (screens[a.route] ?? Home);

  return (
    <div style={{ minHeight: '100vh', background: C.canvas, color: C.navy, fontSize: 15, lineHeight: 1.5 }}>
      {a.showToolbar && <Toolbar />}
      <div style={{ display: 'flex', justifyContent: 'center', padding: frame ? '20px 12px 32px' : '0' }}>
        <div style={{
          width: '100%', maxWidth: frame ? 412 : 'none', background: C.canvas,
          border: frame ? `1px solid ${C.borderSoft}` : '0', borderRadius: frame ? 20 : 0,
          overflow: 'hidden', boxShadow: frame ? '0 18px 44px rgba(16,42,67,.14)' : 'none',
          minHeight: 720, position: 'relative',
        }}>
          <Header />
          <AccountBanner />
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {coord && !mob && <Sidebar />}
            {/* The mobile bottom bar is fixed, so reserve its height here. */}
            <main style={{
              flex: 1, minWidth: 0,
              padding: mob ? '16px 14px' : '24px 28px 40px',
              paddingBottom: mob ? (frame ? 24 : 96) : 40,
            }}>
              {a.snap ? <Screen /> : <div style={{ padding: 40, color: C.muted }}>Yükleniyor…</div>}
            </main>
          </div>
          {mob && <BottomNav />}
          {isReport && <ReportModal />}
          <NeedWizard />
          <Modal />
          <AuthModal />
          <Toast />
        </div>
      </div>
    </div>
  );
}
