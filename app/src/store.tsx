import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { repo, fallbackToLocal, type Snapshot } from './data';
import type { Submission, VerifyKind } from './types';
import type { NeedPayload } from './needForm';
import { tr } from './i18n/strings';
import { useAuth } from './auth';

export type Route =
  | 'home' | 'disaster' | 'report' | 'track' | 'needReq'
  | 'coordHome' | 'coordQueue' | 'coordNeeds' | 'coordLog'
  | 'components' | 'system';
export type Tab = 'overview' | 'needs' | 'locations' | 'announcements' | 'activity';
export type Device = 'desktop' | 'mobile';
export type Role = 'visitor' | 'coordinator';
export type Filter = 'All' | 'Critical' | 'Urgent' | 'Normal' | 'Completed';
export type SubFilter = 'Pending' | 'Verified' | 'Partially' | 'Rejected' | 'All';

export interface ModalState { subId: string; kind: VerifyKind; qty: string; reason: string; }

// ---- Clean URL routing (History API): every screen is a real, shareable path ----
// A Vercel SPA rewrite (vercel.json) serves index.html for these paths.
const TABS: Tab[] = ['overview', 'needs', 'locations', 'announcements', 'activity'];

function toPath(route: Route, tab: Tab, slug: string): string {
  switch (route) {
    case 'home': return '/';
    case 'disaster': return `/afet/${slug}` + (tab && tab !== 'needs' ? `/${tab}` : '');
    case 'report': return '/bildir';
    case 'track': return '/takip';
    case 'needReq': return '/talep';
    case 'coordHome': return '/koordinasyon';
    case 'coordQueue': return '/koordinasyon/kuyruk';
    case 'coordNeeds': return '/koordinasyon/ihtiyaclar';
    case 'coordLog': return '/koordinasyon/kayit';
    case 'system': return '/sistem';
    case 'components': return '/bilesenler';
    default: return '/';
  }
}

interface ParsedPath { route: Route; tab?: Tab; slug?: string; role?: Role; }
function fromPath(pathname: string): ParsedPath {
  const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { route: 'home', role: 'visitor' };
  switch (parts[0]) {
    case 'afet':
      if (parts[1]) return { route: 'disaster', slug: parts[1], tab: (TABS.includes(parts[2] as Tab) ? (parts[2] as Tab) : 'needs'), role: 'visitor' };
      return { route: 'home', role: 'visitor' };
    case 'bildir': return { route: 'report' };
    case 'takip': return { route: 'track' };
    case 'talep': return { route: 'needReq' };
    case 'koordinasyon': {
      const s = parts[1];
      const r: Route = s === 'kuyruk' ? 'coordQueue' : s === 'ihtiyaclar' ? 'coordNeeds' : s === 'kayit' ? 'coordLog' : 'coordHome';
      return { route: r, role: 'coordinator' };
    }
    case 'sistem': return { route: 'system' };
    case 'bilesenler': return { route: 'components' };
    default: return { route: 'home' };
  }
}

const emptyForm = {
  needId: 'n1', qty: '', unit: 'kutu', loc: 'Seydikemer Kapalı Pazar Yeri', date: '2026-07-29',
  eta: '16:30', notes: '', name: '', email: '', phone: '', city: '', confirm: false, photoUrl: '',
};

const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth < 768;
const IS_DEV = Boolean(import.meta.env.DEV);

// The step-by-step need wizard is opened in one of two modes:
//   'coord'  → coordinator publishes a need directly (İhtiyaç oluştur)
//   'public' → a visitor submits a need request for review (İhtiyaç talebi)
export type WizardMode = 'coord' | 'public';

export interface AppApi {
  snap: Snapshot | null;
  backend: 'local' | 'supabase';
  route: Route; tab: Tab; device: Device; role: Role; currentSlug: string;
  frame: boolean; showToolbar: boolean;
  query: string; filter: Filter; subFilter: SubFilter;
  form: typeof emptyForm;
  track: { code: string; email: string };
  reportStage: 'form' | 'done'; lastCode: string; formError: string; copied: boolean;
  modal: ModalState | null; toast: string | null;
  trackedSub: Submission | null; trackError: string;
  wizardMode: WizardMode | null;

  go: (r: Route, extra?: Partial<{ tab: Tab }>) => void;
  openDisaster: (slug: string, tab?: Tab) => void;
  setDevice: (d: Device) => void; setRole: (r: Role) => void; setTab: (t: Tab) => void;
  setQuery: (q: string) => void; setFilter: (f: Filter) => void; setSubFilter: (f: SubFilter) => void;
  clearFilters: () => void;
  setForm: (k: keyof typeof emptyForm, v: string | boolean) => void;
  setTrack: (k: 'code' | 'email', v: string) => void;
  prefillReport: (needId: string, unit: string, loc: string) => void;
  submitDelivery: () => void; copyCode: () => void; reportAnother: () => void;
  openWizard: (mode: WizardMode) => void; closeWizard: () => void;
  publishNeed: (p: NeedPayload) => Promise<boolean>;
  requestNeed: (p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }) => Promise<string | null>;
  bumpNeed: (id: string) => void; togglePause: (id: string) => void;
  openModal: (sub: Submission, kind: VerifyKind) => void; closeModal: () => void;
  setModalQty: (v: string) => void; setModalReason: (v: string) => void; confirmModal: () => void;
  doTrack: () => void; fillDemoCode: () => void;
  showToast: (m: string) => void;
}

const Ctx = createContext<AppApi | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = fromPath(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [route, setRoute] = useState<Route>(initial.route);
  const [tab, setTab] = useState<Tab>(initial.tab ?? 'needs');
  const auth = useAuth();
  const [device, setDevice] = useState<Device>(isMobileWidth() ? 'mobile' : 'desktop');
  const [protoRole, setProtoRole] = useState<Role>(initial.role ?? 'visitor');
  // Effective role: real auth when Supabase is configured, else the dev toggle.
  const role: Role = auth.enabled ? (auth.isCoordinator ? 'coordinator' : 'visitor') : protoRole;
  // The 412px phone mock-up frame is a dev-preview aid only; production is truly responsive.
  const frame = IS_DEV && device === 'mobile';
  // Signed in but email not confirmed → privileged (coordinator) actions are blocked.
  const unverified = auth.enabled && !!auth.user && !auth.emailVerified;
  const [currentSlug, setCurrentSlug] = useState<string>(initial.slug ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [subFilter, setSubFilter] = useState<SubFilter>('Pending');
  const [form, setFormState] = useState(emptyForm);
  const [track, setTrackState] = useState({ code: '', email: '' });
  const [reportStage, setReportStage] = useState<'form' | 'done'>('form');
  const [lastCode, setLastCode] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [trackedSub, setTrackedSub] = useState<Submission | null>(null);
  const [trackError, setTrackError] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load a disaster snapshot (with graceful local fallback when Supabase is empty/unset).
  const loadSnapshot = (slug: string) => {
    let done = false;
    const useLocal = () => fallbackToLocal().getSnapshot(slug || undefined).then((s) => { done = true; applySnap(s); });
    const applySnap = (s: Snapshot) => {
      setSnap(s);
      if (!currentSlug && s.disaster.slug) setCurrentSlug(s.disaster.slug);
      // Handy for debugging which backend served the data.
      if (typeof console !== 'undefined') console.info(`[AfetHUB] backend=${repo.kind} afet=${s.disasters.length} ihtiyaç=${s.needs.length}`);
    };
    repo.getSnapshot(slug || undefined)
      .then((s) => {
        if (done) return;
        // Supabase reachable but not seeded (no needs) → show the local seed so the UI is never empty.
        if (repo.kind === 'supabase' && s.needs.length === 0) { void useLocal(); return; }
        applySnap(s);
      })
      .catch(() => { void useLocal(); });
  };

  useEffect(() => { loadSnapshot(currentSlug); /* initial */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: re-parse the path into state.
  useEffect(() => {
    const onPop = () => {
      const p = fromPath(window.location.pathname);
      setRoute(p.route);
      if (p.tab) setTab(p.tab);
      if (p.role) setProtoRole(p.role);
      if (p.slug && p.slug !== currentSlug) { setCurrentSlug(p.slug); loadSnapshot(p.slug); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  // Reflect state into the URL path (guarded against loops; pushes a history entry per navigation).
  useEffect(() => {
    const slug = currentSlug || snap?.disaster.slug || '';
    const path = toPath(route, tab, slug);
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  }, [route, tab, currentSlug, snap]);

  // Real responsive layout: track viewport width.
  useEffect(() => {
    const onResize = () => setDevice(isMobileWidth() ? 'mobile' : 'desktop');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // When auth is active, keep the route in sync with the signed-in role.
  useEffect(() => {
    if (!auth.enabled || !auth.ready) return;
    if (role === 'coordinator') setRoute((r) => (r.startsWith('coord') ? r : 'coordHome'));
    else setRoute((r) => (r.startsWith('coord') ? 'home' : r));
  }, [role, auth.enabled, auth.ready]);

  const showToast = (m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const api: AppApi = useMemo(() => ({
    snap, backend: repo.kind,
    route, tab, device, role, currentSlug, frame, showToolbar: IS_DEV, query, filter, subFilter,
    form, track, reportStage, lastCode, formError, copied,
    modal, toast, trackedSub, trackError, wizardMode,

    go: (r, extra) => { setRoute(r); if (extra?.tab) setTab(extra.tab); },
    openDisaster: (slug, t) => { setCurrentSlug(slug); setRoute('disaster'); setTab(t ?? 'needs'); if (slug !== currentSlug) loadSnapshot(slug); },
    setDevice,
    setRole: (r) => { setProtoRole(r); setRoute(r === 'coordinator' ? 'coordHome' : 'home'); },
    setTab, setQuery, setFilter, setSubFilter,
    clearFilters: () => { setFilter('All'); setQuery(''); },
    setForm: (k, v) => setFormState((s) => ({ ...s, [k]: v })),
    setTrack: (k, v) => setTrackState((s) => ({ ...s, [k]: v })),
    prefillReport: (needId, unit, loc) => {
      setFormState((s) => ({ ...s, needId, unit, loc }));
      setFormError(''); setReportStage('form'); setRoute('report');
    },

    submitDelivery: () => {
      const qty = parseInt(form.qty, 10);
      if (!qty || qty < 1) return setFormError(tr.report.errQty);
      const loggedIn = auth.enabled && !!auth.user;
      // Signed-in users are already identifiable — contact fields come from their profile.
      const name = loggedIn ? (auth.profile?.fullName || 'Gönüllü') : form.name;
      const email = loggedIn ? (auth.user?.email || '') : form.email;
      if (!loggedIn && (!form.name || !form.email || !form.phone || !form.city)) return setFormError(tr.report.errContact);
      if (!form.confirm) return setFormError(tr.report.errConfirm);
      setFormError('');
      repo.createDelivery({
        needId: form.needId, qty, unit: form.unit, loc: form.loc, date: form.date, eta: form.eta,
        notes: form.notes, name, email, phone: form.phone, city: form.city,
        photoUrl: form.photoUrl || null,
      }).then(({ snapshot, code }) => { setSnap(snapshot); setLastCode(code); setCopied(false); setReportStage('done'); });
    },
    copyCode: () => { try { navigator.clipboard.writeText(lastCode); } catch { /* ignore */ } setCopied(true); },
    reportAnother: () => { setReportStage('form'); setCopied(false); setFormState((s) => ({ ...s, qty: '', notes: '', confirm: false, photoUrl: '' })); },

    openWizard: (mode) => setWizardMode(mode),
    closeWizard: () => setWizardMode(null),
    publishNeed: async (p) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      const s = await repo.publishNeed(p);
      setSnap(s); showToast(tr.coord.publishedToast(p.title));
      return true;
    },
    requestNeed: async (p, contact) => {
      const { snapshot, code } = await repo.submitNeedRequest(p, contact);
      setSnap(snapshot); showToast(tr.needReq.sentToast(code));
      return code;
    },
    bumpNeed: (id) => { if (unverified) return showToast(tr.auth.verifyFirst); repo.bumpNeed(id).then((s) => { setSnap(s); const n = s.needs.find((x) => x.id === id); if (n) showToast(tr.coord.bumpToast(n.name, n.required, n.unit)); }); },
    togglePause: (id) => { if (unverified) return showToast(tr.auth.verifyFirst); repo.togglePause(id).then(setSnap); },

    openModal: (sub, kind) => setModal({ subId: sub.id, kind, qty: String(kind === 'partial' ? Math.max(1, sub.qty - 5) : sub.qty), reason: '' }),
    closeModal: () => setModal(null),
    setModalQty: (v) => setModal((m) => (m ? { ...m, qty: v } : m)),
    setModalReason: (v) => setModal((m) => (m ? { ...m, reason: v } : m)),
    confirmModal: () => {
      if (!modal || !snap) return;
      if (unverified) { setModal(null); return showToast(tr.auth.verifyFirst); }
      const sub = snap.subs.find((s) => s.id === modal.subId);
      const need = sub && snap.needs.find((n) => n.id === sub.needId);
      const qty = Math.max(0, Math.min(parseInt(modal.qty, 10) || 0, sub?.qty ?? 0));
      const kind = modal.kind;
      const contributor = sub?.contributor ?? '';
      const code = sub?.code ?? '';
      const needName = need?.name ?? '';
      const unit = sub?.unit ?? '';
      const remAfter = need ? Math.max(0, need.required - Math.min(need.required, need.verified + qty)) : 0;
      repo.verifySubmission(modal.subId, kind, qty, modal.reason).then((s) => {
        setSnap(s); setModal(null);
        if (kind === 'reject') showToast(tr.toasts.rejected(code));
        else if (kind === 'info') showToast(tr.toasts.infoRequested(contributor));
        else showToast(tr.toasts.approved(qty, unit, needName, remAfter));
      });
    },

    doTrack: () => {
      repo.trackSubmission(track.code, track.email).then((sub) => {
        if (!sub) { setTrackedSub(null); setTrackError(tr.track.notFound); }
        else { setTrackedSub(sub); setTrackError(''); }
      });
    },
    fillDemoCode: () => {
      setTrackState({ code: 'AFT-4821', email: 'ayse@example.com' });
      repo.trackSubmission('AFT-4821', 'ayse@example.com').then((sub) => {
        if (!sub) { setTrackedSub(null); setTrackError(tr.track.notFound); }
        else { setTrackedSub(sub); setTrackError(''); }
      });
    },
    showToast,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snap, route, tab, device, role, unverified, currentSlug, query, filter, subFilter, form, track, reportStage, lastCode, formError, copied, wizardMode, modal, toast, trackedSub, trackError]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
