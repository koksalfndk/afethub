import { useEffect, useState, type ReactElement } from 'react';
import { useApp } from './store';
import { useAuth } from './auth';
import { tr } from './i18n/strings';
import { LOAD_TIMEOUT_MS } from './util';
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
import { About } from './screens/About';
import { HowItWorks } from './screens/HowItWorks';
import { Account } from './screens/Account';
import { CoordSlider } from './screens/CoordSlider';
import { CoordDisasters } from './screens/CoordDisasters';
import { CoordOrgEdits } from './screens/CoordOrgEdits';
import { CoordOrgs } from './screens/CoordOrgs';
import { CoordReports } from './screens/CoordReports';
import { CoordStaff } from './screens/CoordStaff';
import { CoordOps } from './screens/CoordOps';
import { Volunteer } from './screens/Volunteer';
import { Contact } from './screens/Contact';
import { CoordContact } from './screens/CoordContact';
import { LiveTicker } from './components/LiveTicker';
import { DisasterReportModal } from './components/DisasterReportModal';
import { Footer } from './components/Footer';
import { CoordHome } from './screens/CoordHome';
import { CoordQueue } from './screens/CoordQueue';
import { CoordNeeds } from './screens/CoordNeeds';
import { CoordLog } from './screens/CoordLog';
import { Components } from './screens/Components';
import { System } from './screens/System';
import { applyRouteMeta } from './seo';

export function App() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const coord = a.role === 'coordinator';
  const frame = a.frame; // 412px phone mock-up wrapper (dev preview only)

  // Per-route title / canonical / robots. seo.ts existed and was written for this, but
  // nothing ever called it, so every path shipped the home page's title and a canonical
  // of "/" — including the new /iletisim page. Client-side only, so it fixes the tab,
  // the share sheet and the history entry, NOT what a crawler sees before JS runs
  // (rules/09 §3, still true until prerender exists).
  useEffect(() => {
    applyRouteMeta(a.route, { disasterName: a.snap?.disaster.name, slug: a.currentSlug, tab: a.tab });
  }, [a.route, a.tab, a.currentSlug, a.snap?.disaster.name]);

  const screens: Record<string, () => ReactElement | null> = {
    home: Home, disaster: Disaster, track: Track, needReq: NeedRequest, orgs: Organizations, reportDisaster: ReportDisaster, about: About, howItWorks: HowItWorks, account: Account, volunteer: Volunteer, contact: Contact,
    coordHome: CoordHome, coordQueue: CoordQueue, coordNeeds: CoordNeeds, coordLog: CoordLog, coordSlider: CoordSlider, coordDisasters: CoordDisasters, coordOrgEdits: CoordOrgEdits, coordOrgs: CoordOrgs, coordStaff: CoordStaff, coordOps: CoordOps, coordReports: CoordReports, coordContact: CoordContact,
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
          // Clipping is only needed to round off the phone mock-up. `hidden` there made
          // the wrapper a scroll container, which silently disabled `position: sticky`
          // for every descendant — that is what broke the bottom nav and the disaster
          // rail, and it would break the sticky mobile header inside the preview frame.
          // `clip` rounds the corners without creating a scroll container.
          overflow: frame ? 'clip' : 'visible',
          boxShadow: frame ? '0 18px 44px rgba(16,42,67,.14)' : 'none',
          // Column flex + full viewport height so the footer sits on the bottom edge on a
          // short page (tracking, account) instead of floating mid-screen with blank
          // canvas under it. The content row below takes the slack.
          display: 'flex', flexDirection: 'column',
          minHeight: frame ? 720 : '100vh', position: 'relative',
        }}>
          <Header />
          <LiveTicker />
          <AccountBanner />
          {/* flex: 1 — this row absorbs the leftover height, which is what pushes the
              footer down. alignItems: stretch keeps the coordinator sidebar and the
              disaster rail running the full height of the row. */}
          <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
            {/* Panel chrome belongs to panel routes. A coordinator reading /gonullu or a
                disaster page is looking at the public site and should see the public
                site (rules/04 §Responsive Navigation: do not mix public and coordinator
                navigation without clear role context). */}
            {coord && !mob && a.route.startsWith('coord') && <Sidebar />}
            {/* The mobile bottom bar is fixed, so reserve its height here. */}
            <main style={{
              flex: 1, minWidth: 0,
              padding: mob ? '16px 14px' : '24px 28px 40px',
              paddingBottom: mob ? (frame ? 24 : 96) : 40,
            }}>
              {a.snap ? <Screen /> : <LoadState />}
            </main>
          </div>
          <Footer />
          {mob && <BottomNav />}
          {(isReport || a.deliveryOpen) && <ReportModal />}
          <DisasterReportModal />
          <NeedWizard />
          <Modal />
          <AuthModal key={auth.prefillEmail} />
          <Toast />
        </div>
      </div>
    </div>
  );
}

// Loading is bounded and always exits into something actionable: after the read
// timeout the user gets an explanation and a retry, never an endless spinner
// (rules/04 §Loading States, §Error States).
function LoadState() {
  const a = useApp();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (a.loadError) return;
    const t = setTimeout(() => setSlow(true), Math.round(LOAD_TIMEOUT_MS / 2));
    return () => clearTimeout(t);
  }, [a.loadError]);

  const failed = !!a.loadError;
  return (
    <div style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, maxWidth: 520 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: failed ? C.errorText : C.heading2 }}>
        {failed ? tr.common.loadFailed : tr.common.loading}
      </div>
      {!failed && slow && (
        <div style={{ fontSize: 13.5, color: C.muted }}>{tr.common.loadSlow}</div>
      )}
      {(failed || slow) && (
        <button onClick={a.retryLoad} style={{
          marginTop: 4, background: C.navy, border: `1px solid ${C.navy}`, color: '#fff',
          borderRadius: 10, padding: '0 18px', height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>{tr.common.retry}</button>
      )}
    </div>
  );
}
