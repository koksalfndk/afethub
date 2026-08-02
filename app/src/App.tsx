import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { useApp, type Route } from './store';
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
import { AccountBanner } from './components/AccountBanner';
import { Home } from './screens/Home';
import { Disaster } from './screens/Disaster';
import { applyRouteMeta } from './seo';

// ---------------------------------------------------------------------------
// Route seviyesinde kod bölme.
//
// Neden: tek bir paket 1,29 MB'a çıkmıştı ve içinde koordinatör panelinin on üç
// ekranı da vardı — yani bir afet sayfasını telefonda açan ziyaretçi, hiçbir zaman
// göremeyeceği yönetim ekranlarını da indiriyordu. Zayıf bağlantıdaki bir kullanıcı
// için bu, ihtiyaç listesinin geç gelmesi demek (rules/01 §Emergency First,
// rules/09 §8).
//
// `Home` ve `Disaster` BİLEREK eager: ikisi de giriş noktası ve onları geciktirmek
// ilk boyamayı bir tur geriye atardı. Geri kalan her ekran ve ağır modal, ancak
// gerçekten açıldığında iniyor. Davranış değişmiyor; `Suspense` sınırı zaten var olan
// `LoadState` iskeletini gösteriyor.
// ---------------------------------------------------------------------------
const Disasters = lazy(() => import('./screens/Disasters').then((m) => ({ default: m.Disasters })));
const Track = lazy(() => import('./screens/Track').then((m) => ({ default: m.Track })));
const NeedRequest = lazy(() => import('./screens/NeedRequest').then((m) => ({ default: m.NeedRequest })));
const Organizations = lazy(() => import('./screens/Organizations').then((m) => ({ default: m.Organizations })));
const ReportDisaster = lazy(() => import('./screens/ReportDisaster').then((m) => ({ default: m.ReportDisaster })));
const About = lazy(() => import('./screens/About').then((m) => ({ default: m.About })));
const HowItWorks = lazy(() => import('./screens/HowItWorks').then((m) => ({ default: m.HowItWorks })));
const Account = lazy(() => import('./screens/Account').then((m) => ({ default: m.Account })));
const CoordSlider = lazy(() => import('./screens/CoordSlider').then((m) => ({ default: m.CoordSlider })));
const CoordDisasters = lazy(() => import('./screens/CoordDisasters').then((m) => ({ default: m.CoordDisasters })));
const CoordOrgEdits = lazy(() => import('./screens/CoordOrgEdits').then((m) => ({ default: m.CoordOrgEdits })));
const CoordOrgs = lazy(() => import('./screens/CoordOrgs').then((m) => ({ default: m.CoordOrgs })));
const CoordReports = lazy(() => import('./screens/CoordReports').then((m) => ({ default: m.CoordReports })));
const CoordStaff = lazy(() => import('./screens/CoordStaff').then((m) => ({ default: m.CoordStaff })));
const CoordOps = lazy(() => import('./screens/CoordOps').then((m) => ({ default: m.CoordOps })));
const Volunteer = lazy(() => import('./screens/Volunteer').then((m) => ({ default: m.Volunteer })));
const Contact = lazy(() => import('./screens/Contact').then((m) => ({ default: m.Contact })));
const CoordContact = lazy(() => import('./screens/CoordContact').then((m) => ({ default: m.CoordContact })));
const CoordHome = lazy(() => import('./screens/CoordHome').then((m) => ({ default: m.CoordHome })));
const CoordDisaster = lazy(() => import('./screens/CoordDisaster').then((m) => ({ default: m.CoordDisaster })));
const CoordQueue = lazy(() => import('./screens/CoordQueue').then((m) => ({ default: m.CoordQueue })));
const CoordNeeds = lazy(() => import('./screens/CoordNeeds').then((m) => ({ default: m.CoordNeeds })));
const CoordLog = lazy(() => import('./screens/CoordLog').then((m) => ({ default: m.CoordLog })));
const Components = lazy(() => import('./screens/Components').then((m) => ({ default: m.Components })));
const System = lazy(() => import('./screens/System').then((m) => ({ default: m.System })));
const NeedWizard = lazy(() => import('./components/NeedWizard').then((m) => ({ default: m.NeedWizard })));
const AuthModal = lazy(() => import('./components/AuthModal').then((m) => ({ default: m.AuthModal })));
const DisasterReportModal = lazy(() => import('./components/DisasterReportModal').then((m) => ({ default: m.DisasterReportModal })));
const ReportModal = lazy(() => import('./components/ReportModal').then((m) => ({ default: m.ReportModal })));
// Destek sayfası formu ihtiyaç kartındaki küçük tetikleyiciden ağır: yalnızca
// "Destek Ol"a basıldığında iniyor (rules/09 §8 — zayıf bağlantıdaki ziyaretçi
// açmadığı formu indirmemeli).
const SupportSheet = lazy(() => import('./components/SupportSheet').then((m) => ({ default: m.SupportSheet })));
import { LiveTicker } from './components/LiveTicker';
import { Footer } from './components/Footer';

// Sayfa genişliği ve ortalama TEK yerde.
//
// Bu tabloya kadar her ekran kendi içinde `maxWidth` + `margin: '0 auto'` yazıyordu ve
// ikincisini yazmayı unutan sayfa sola yapışıyordu — iletişim sayfası tam olarak böyle
// çıktı. Kural artık ekranın hatırlamasına bağlı değil: buraya bir satır eklenen sayfa
// ortalanır, eklenmeyen sayfa (ana sayfa, afet, kurumlar, panel ekranları) bugünkü gibi
// tam genişlikte kalır.
const PAGE_MAX: Partial<Record<Route, number>> = {
  contact: 980,
};

export function App() {
  const a = useApp();
  const auth = useAuth();
  const mob = a.device === 'mobile';
  const coord = a.role === 'coordinator';
  const frame = a.frame; // 412px phone mock-up wrapper (dev preview only)

  // Per-route title / canonical / robots. seo.ts existed and was written for this, but
  // nothing ever called it, so every path shipped the home page's title and a canonical
  // of "/". Client-side only: it fixes the tab, the share sheet and the history entry,
  // NOT what a crawler sees before JS runs (rules/09 §3, still true until prerender).
  useEffect(() => {
    applyRouteMeta(a.route, { disasterName: a.snap?.disaster.name, slug: a.currentSlug, tab: a.tab });
  }, [a.route, a.tab, a.currentSlug, a.snap?.disaster.name]);

  const screens: Record<string, ComponentType> = {
    home: Home, disasters: Disasters, disaster: Disaster, track: Track, needReq: NeedRequest, orgs: Organizations, reportDisaster: ReportDisaster, about: About, howItWorks: HowItWorks, account: Account, volunteer: Volunteer, contact: Contact,
    coordHome: CoordHome, coordQueue: CoordQueue, coordNeeds: CoordNeeds, coordLog: CoordLog, coordSlider: CoordSlider, coordDisasters: CoordDisasters, coordOrgEdits: CoordOrgEdits, coordOrgs: CoordOrgs, coordStaff: CoordStaff, coordOps: CoordOps, coordReports: CoordReports, coordDisaster: CoordDisaster, coordContact: CoordContact,
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
              <div style={{ width: '100%', maxWidth: PAGE_MAX[a.route], margin: '0 auto' }}>
                {a.snap ? <Suspense fallback={<LoadState />}><Screen /></Suspense> : <LoadState />}
              </div>
            </main>
          </div>
          <Footer />
          {mob && <BottomNav />}
          {/* Ağır modaller yalnızca açıldıklarında iniyor. `fallback={null}`: modal
              kapalıyken ekranda hiçbir şey olmamalı; bir iskelet göstermek kapalı bir
              pencerenin yerini işaretlemek olurdu. */}
          <Suspense fallback={null}>
            {(isReport || a.deliveryOpen) && <ReportModal />}
            <DisasterReportModal />
            <NeedWizard />
            <AuthModal key={auth.prefillEmail} />
            {a.supportNeedId && <SupportSheet />}
          </Suspense>
          <Modal />
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
