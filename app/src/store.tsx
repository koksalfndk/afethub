import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { repo, fallbackToLocal, type Snapshot, type Overview } from './data';
import type {
  Submission, VerifyKind, Organization, OrganizationInput, DisasterReport, DisasterReportInput,
  ReportConfirmInput, ReportConfirmResult, ReportQueueItem,
  BannerSlide, BannerSlideInput, OrgEditRequestInput, OrgEditRequest, DisasterInput,
  OrganizationSave, OrgStatus, VolunteerInput, VolunteerApplication, VolunteerStatus,
  AnnouncementInput, LocationInput,
  StaffMember, StaffRole, RoleInvite, LogEntry,
  ContactInput, ContactMessage, ContactStatus,
} from './types';
import type { NeedPayload } from './needForm';
import { tr } from './i18n/strings';
import { withTimeout } from './util';
import { useAuth } from './auth';
import { sendStaffInvite, sendVolunteerReceipt, sendVolunteerApproved, sendContactMessage } from './data/sendEmail';

export type Route =
  | 'home' | 'disaster' | 'report' | 'track' | 'needReq' | 'orgs' | 'reportDisaster' | 'about' | 'howItWorks' | 'account'
  | 'coordHome' | 'coordQueue' | 'coordNeeds' | 'coordLog' | 'coordSlider' | 'coordDisasters'
  | 'coordOrgEdits' | 'coordOrgs' | 'coordStaff' | 'volunteer' | 'coordOps' | 'coordReports'
  | 'components' | 'system' | 'contact' | 'coordContact';
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
    case 'orgs': return '/kurumlar';
    case 'reportDisaster': return '/afet-bildir';
    case 'about': return '/hakkimizda';
    case 'howItWorks': return '/nasil-calisir';
    case 'account': return '/hesabim';
    case 'coordHome': return '/koordinasyon';
    case 'coordQueue': return '/koordinasyon/kuyruk';
    case 'coordNeeds': return '/koordinasyon/ihtiyaclar';
    case 'coordLog': return '/koordinasyon/kayit';
    case 'coordSlider': return '/koordinasyon/slider';
    case 'coordDisasters': return '/koordinasyon/afetler';
    case 'coordOrgEdits': return '/koordinasyon/kurum-duzeltmeleri';
    case 'coordOrgs': return '/koordinasyon/kurumlar';
    case 'coordReports': return '/koordinasyon/bildirimler';
    case 'coordStaff': return '/koordinasyon/ekip';
    case 'coordOps': return '/koordinasyon/operasyon';
    case 'volunteer': return '/gonullu';
    case 'contact': return '/iletisim';
    case 'coordContact': return '/koordinasyon/iletisim';
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
    case 'kurumlar': return { route: 'orgs' };
    case 'afet-bildir': return { route: 'reportDisaster' };
    case 'hakkimizda': return { route: 'about' };
    case 'nasil-calisir': return { route: 'howItWorks' };
    case 'hesabim': return { route: 'account' };
    case 'gonullu': return { route: 'volunteer' };
    case 'iletisim': return { route: 'contact' };
    // Invite landing. It is not a route of its own: there is no page to show, only the
    // sign-up form to open over the home page (handled by the effect below).
    case 'kayit': return { route: 'home' };
    case 'koordinasyon': {
      const s = parts[1];
      const r: Route = s === 'kuyruk' ? 'coordQueue' : s === 'ihtiyaclar' ? 'coordNeeds'
        : s === 'kayit' ? 'coordLog' : s === 'slider' ? 'coordSlider'
        : s === 'afetler' ? 'coordDisasters'
        : s === 'kurum-duzeltmeleri' ? 'coordOrgEdits'
        : s === 'kurumlar' ? 'coordOrgs'
        : s === 'bildirimler' ? 'coordReports'
        : s === 'ekip' ? 'coordStaff'
        : s === 'iletisim' ? 'coordContact'
        : s === 'operasyon' ? 'coordOps' : 'coordHome';
      return { route: r, role: 'coordinator' };
    }
    case 'sistem': return { route: 'system' };
    case 'bilesenler': return { route: 'components' };
    default: return { route: 'home' };
  }
}

const emptyForm = {
  // loc/needId are replaced by prefillReport() as soon as a need is picked.
  needId: '', qty: '', unit: 'kutu', loc: '', date: new Date().toISOString().slice(0, 10),
  eta: '16:30', notes: '', name: '', email: '', phone: '', city: '', district: '', confirm: false, photoUrl: '',
};

const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth < 768;
const IS_DEV = Boolean(import.meta.env.DEV);

// The step-by-step need wizard is opened in one of two modes:
//   'coord'  → coordinator publishes a need directly (İhtiyaç oluştur)
//   'public' → a visitor submits a need request for review (İhtiyaç talebi)
export type WizardMode = 'coord' | 'public';

export interface AppApi {
  snap: Snapshot | null;
  loadError: string;          // set when even the local fallback failed
  retryLoad: () => void;
  overview: Overview | null;      // national dashboard (home)
  orgs: Organization[];           // organizations directory
  slides: BannerSlide[];          // home banner slides (panel-managed)
  backend: 'local' | 'supabase';
  route: Route; tab: Tab; device: Device; role: Role; currentSlug: string;
  frame: boolean; showToolbar: boolean;
  query: string; filter: Filter; subFilter: SubFilter;
  catFilter: string; locFilter: string; onlyCritical: boolean; updatedToday: boolean;
  form: typeof emptyForm;
  track: { code: string; email: string };
  reportStage: 'form' | 'done'; lastCode: string; formError: string; copied: boolean;
  modal: ModalState | null; toast: string | null;
  trackedSub: Submission | null; trackError: string;
  // "Gönderilerim" on /takip: the signed-in account's own submissions.
  mySubs: Submission[]; mySubsLoading: boolean; mySubsError: string;
  reloadMySubs: () => void;
  // Coordinator queue of correction requests against published organization records.
  orgEdits: OrgEditRequest[]; orgEditsLoading: boolean; orgEditsError: string;
  orgEditsPending: number;
  // Coordinator organization management.
  saveOrganization: (id: string | null, input: OrganizationSave) => Promise<boolean>;
  // Per-operation public content. `author` is taken from the session inside the store so
  // no screen can pass an attribution of its own choosing.
  saveAnnouncement: (id: string | null, input: AnnouncementInput) => Promise<boolean>;
  deleteAnnouncement: (id: string) => Promise<boolean>;
  saveLocation: (id: string | null, input: LocationInput) => Promise<boolean>;
  deleteLocation: (id: string) => Promise<boolean>;
  verifyOrganization: (id: string, status: OrgStatus, reason: string) => Promise<boolean>;
  // Volunteer applications: public submit, coordinator review.
  volunteers: VolunteerApplication[]; volunteersLoading: boolean; volunteersError: string;
  volunteersPending: number;
  reloadVolunteers: () => void;
  submitVolunteer: (input: VolunteerInput) => Promise<boolean>;
  // The signed-in visitor's own applications, for the panel above the form.
  // `myVolunteerLoaded` is separate from `…Loading`: "not loading" is also true BEFORE
  // the first fetch starts, and a screen that decides what to show on that reads an
  // empty list as "this person has no applications".
  myVolunteer: VolunteerApplication[]; myVolunteerLoading: boolean; myVolunteerLoaded: boolean;
  reloadMyVolunteer: () => void;
  updateMyVolunteer: (id: string, input: VolunteerInput) => Promise<boolean>;
  withdrawMyVolunteer: (id: string) => Promise<boolean>;
  setMyVolunteerConsent: (on: boolean) => Promise<boolean>;
  reviewVolunteer: (id: string, status: VolunteerStatus, note: string) => Promise<boolean>;
  // Staff (admin only; the RPCs enforce it).
  staff: StaffMember[]; invites: RoleInvite[]; staffLoading: boolean; staffError: string;
  reloadStaff: () => void;
  // Returns the outcome plus whether the notification e-mail actually went out. The two
  // are reported separately on purpose: the role change succeeds or fails in the
  // database, and telling someone about it is a different thing that can fail on its own.
  grantStaffRole: (email: string, role: StaffRole, note: string, orgId: string | null)
    => Promise<{ outcome: 'granted' | 'invited'; mailed: boolean } | null>;
  revokeStaffRole: (userId: string) => Promise<boolean>;
  cancelRoleInvite: (email: string) => Promise<boolean>;
  reloadOrgEdits: () => void;
  applyOrgEdit: (id: string, fields: string[], note: string) => Promise<boolean>;
  rejectOrgEdit: (id: string, note: string) => Promise<boolean>;
  openTrackedSub: (s: Submission) => void;
  wizardMode: WizardMode | null;
  disasterFormOpen: boolean;
  // "Yardım Bildir" opens over whatever page the visitor is on. It used to navigate to
  // /bildir, which threw them out of the disaster they were reading.
  deliveryOpen: boolean;

  go: (r: Route, extra?: Partial<{ tab: Tab }>) => void;
  openDisaster: (slug: string, tab?: Tab) => void;
  setDevice: (d: Device) => void; setRole: (r: Role) => void; setTab: (t: Tab) => void;
  setQuery: (q: string) => void; setFilter: (f: Filter) => void; setSubFilter: (f: SubFilter) => void;
  setCatFilter: (c: string) => void; setLocFilter: (l: string) => void;
  toggleOnlyCritical: () => void; toggleUpdatedToday: () => void;
  clearFilters: () => void;
  searchFromHeader: (q: string) => void;
  setForm: (k: keyof typeof emptyForm, v: string | boolean) => void;
  setTrack: (k: 'code' | 'email', v: string) => void;
  prefillReport: (needId: string, unit: string, loc: string) => void;
  submitDelivery: () => void; copyCode: () => void; reportAnother: () => void;
  openWizard: (mode: WizardMode) => void; closeWizard: () => void;
  openDisasterForm: () => void; closeDisasterForm: () => void;
  openDelivery: () => void; closeDelivery: () => void;
  saveDisaster: (id: string | null, input: DisasterInput) => Promise<boolean>;
  publishNeed: (p: NeedPayload) => Promise<boolean>;
  requestNeed: (p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }) => Promise<string | null>;
  bumpNeed: (id: string) => void; togglePause: (id: string) => void;
  openModal: (sub: Submission, kind: VerifyKind) => void; closeModal: () => void;
  setModalQty: (v: string) => void; setModalReason: (v: string) => void; confirmModal: () => void;
  doTrack: () => void; fillDemoCode: () => void;
  showToast: (m: string) => void;
  saveSlide: (id: string | null, input: BannerSlideInput) => Promise<boolean>;
  deleteSlide: (id: string) => Promise<boolean>;
  reorderSlides: (orderedIds: string[]) => Promise<boolean>;
  submitOrganization: (input: OrganizationInput) => Promise<boolean>;
  submitOrgEditRequest: (input: OrgEditRequestInput) => Promise<boolean>;
  findSimilarReports: (input: DisasterReportInput) => Promise<DisasterReport[]>;
  submitDisasterReport: (input: DisasterReportInput) => Promise<{ report: DisasterReport; merged: boolean } | null>;
  // Confirming carries the contact details the modal collects. Returns the server's
  // answer so the caller can tell "sayıldı" from "zaten doğrulamıştınız".
  confirmDisasterReport: (reportId: string, who: ReportConfirmInput) => Promise<ReportConfirmResult | null>;
  // Coordinator queue for community reports.
  reportQueue: ReportQueueItem[]; reportQueueLoading: boolean; reportQueueError: string;
  reloadReportQueue: () => void;
  reviewDisasterReport: (reportId: string, action: 'publish' | 'reject', reason: string) => Promise<boolean>;
  confirmCommunityDisaster: (disasterId: string) => Promise<boolean>;
  // Admin system log: every recorded action. Loaded only when the screen asks, because
  // the private rows name people.
  systemLog: LogEntry[]; systemLogLoading: boolean; systemLogError: string;
  reloadSystemLog: () => void;
  // İletişim. `submitContact` stores the message and then asks the mailer to announce
  // it; the returned boolean is about STORING, never about delivery — presenting a
  // provider failure as "your message was not received" would be a lie to the writer.
  submitContact: (input: ContactInput) => Promise<boolean>;
  contactMessages: ContactMessage[]; contactLoading: boolean; contactError: string;
  reloadContact: () => void;
  setContactStatus: (id: string, status: ContactStatus) => Promise<boolean>;
  // Volunteer drill-down from the operation form. `mode` decides which list the staff
  // screen opens on, so "şu an nöbette · 3" lands on those three people.
  volunteerFilter: { disasterId: string | null; mode: 'approved' | 'onShift' } | null;
  openVolunteers: (disasterId: string | null, mode: 'approved' | 'onShift') => void;
  clearVolunteerFilter: () => void;
  setVolunteerShift: (applicationId: string, onShift: boolean) => Promise<boolean>;
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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [slides, setSlides] = useState<BannerSlide[]>([]);
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
  // Secondary needs filters — empty string / false means "no restriction".
  const [catFilter, setCatFilter] = useState('');
  const [locFilter, setLocFilter] = useState('');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [updatedToday, setUpdatedToday] = useState(false);
  const [form, setFormState] = useState(emptyForm);
  const [track, setTrackState] = useState({ code: '', email: '' });
  const [reportStage, setReportStage] = useState<'form' | 'done'>('form');
  const [lastCode, setLastCode] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode | null>(null);
  const [disasterFormOpen, setDisasterFormOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [trackedSub, setTrackedSub] = useState<Submission | null>(null);
  const [mySubs, setMySubs] = useState<Submission[]>([]);
  const [mySubsLoading, setMySubsLoading] = useState(false);
  const [mySubsError, setMySubsError] = useState('');
  const [orgEdits, setOrgEdits] = useState<OrgEditRequest[]>([]);
  const [orgEditsLoading, setOrgEditsLoading] = useState(false);
  const [orgEditsError, setOrgEditsError] = useState('');
  const [orgEditsPending, setOrgEditsPending] = useState(0);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [systemLog, setSystemLog] = useState<LogEntry[]>([]);
  const [systemLogLoading, setSystemLogLoading] = useState(false);
  const [systemLogError, setSystemLogError] = useState('');
  const [volunteerFilter, setVolunteerFilter] = useState<{ disasterId: string | null; mode: 'approved' | 'onShift' } | null>(null);
  const [reportQueue, setReportQueue] = useState<ReportQueueItem[]>([]);
  const [reportQueueLoading, setReportQueueLoading] = useState(false);
  const [reportQueueError, setReportQueueError] = useState('');
  const [volunteers, setVolunteers] = useState<VolunteerApplication[]>([]);
  const [myVolunteer, setMyVolunteer] = useState<VolunteerApplication[]>([]);
  const [myVolunteerLoading, setMyVolunteerLoading] = useState(false);
  const [myVolunteerLoaded, setMyVolunteerLoaded] = useState(false);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [volunteersError, setVolunteersError] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<RoleInvite[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [trackError, setTrackError] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load a disaster snapshot. Three things can go wrong and all three are handled:
  // the backend is unset, it answers with nothing, or it never answers at all. The
  // last case is why every read is wrapped in withTimeout — an emergency screen must
  // not sit on a spinner forever (rules/04 §Loading States).
  const loadSnapshot = (slug: string) => {
    setLoadError('');
    const applySnap = (s: Snapshot) => {
      setSnap(s);
      setLoadError('');
      if (!currentSlug && s.disaster.slug) setCurrentSlug(s.disaster.slug);
      // Handy for debugging which backend served the data.
      if (typeof console !== 'undefined') console.info(`[AfetHUB] backend=${repo.kind} afet=${s.disasters.length} ihtiyaç=${s.needs.length}`);
    };
    const switchToLocal = (reason: string) => {
      if (typeof console !== 'undefined') console.warn(`[AfetHUB] yerel veriye düşüldü: ${reason}`);
      return fallbackToLocal().getSnapshot(slug || undefined)
        .then(applySnap)
        .catch(() => setLoadError(tr.common.loadFailed));
    };
    withTimeout(repo.getSnapshot(slug || undefined))
      .then((s) => {
        // Backend reachable but not seeded → show the local seed so the UI is never empty.
        //
        // The test is "are there any operations at all", NOT "does this one have needs".
        // With `s.needs.length === 0` a brand-new operation — every community-opened one
        // starts with zero needs — dropped the visitor into the local demo seed, so
        // /afet/karaburun-… rendered the Seydikemer sample. Demo content silently
        // replacing a live operation is the exact failure rules/07 §Seed Content and
        // rules/01 exist to prevent.
        if (repo.kind === 'supabase' && s.disasters.length === 0) { void switchToLocal('backend boş'); return; }
        applySnap(s);
      })
      .catch((e: unknown) => { void switchToLocal(e instanceof Error ? e.message : 'bilinmeyen hata'); });
  };

  const retryLoad = () => { setSnap(null); setLoadError(''); loadSnapshot(currentSlug); };

  useEffect(() => { loadSnapshot(currentSlug); /* initial */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // National dashboard and the organizations directory load independently of the
  // per-disaster snapshot, so a slow disaster page never blocks the home page.
  useEffect(() => {
    withTimeout(repo.getOverview())
      .then((o) => (repo.kind === 'supabase' && o.disasters.length === 0
        ? fallbackToLocal().getOverview().then(setOverview)
        : setOverview(o)))
      .catch(() => fallbackToLocal().getOverview().then(setOverview).catch(() => setLoadError(tr.common.loadFailed)));
    withTimeout(repo.listOrganizations())
      .then(setOrgs)
      .catch(() => fallbackToLocal().listOrganizations().then(setOrgs).catch(() => undefined));
    withTimeout(repo.listSlides())
      .then(setSlides)
      .catch(() => fallbackToLocal().listSlides().then(setSlides).catch(() => undefined));
    // Count only — the sidebar badge needs a number, not the rows. A visitor's call is
    // refused by RLS and simply leaves the badge at 0.
    withTimeout(repo.countOpenOrgEditRequests())
      .then(setOrgEditsPending)
      .catch(() => undefined);
  }, []);

  // Own submissions are loaded when a session exists and cleared when it goes away, so
  // one account's list can never be left on screen for the next.
  // The queue is coordinator-only data (contact details of the requester travel with
  // each row), so it is never loaded speculatively — only when the screen asks.
  const loadOrgEdits = async () => {
    setOrgEditsLoading(true); setOrgEditsError('');
    try {
      const rows = await withTimeout(repo.listOrgEditRequests());
      setOrgEdits(rows);
      setOrgEditsPending(rows.filter((r) => r.status === 'Pending review').length);
    } catch {
      setOrgEditsError(tr.coordOrgEdits.loadFailed);
    } finally {
      setOrgEditsLoading(false);
    }
  };

  // Own applications: loaded only for a signed-in account, because that is the only
  // thing the server can match them on.
  const loadMyVolunteer = async () => {
    if (!auth.enabled || !auth.user) { setMyVolunteer([]); setMyVolunteerLoaded(true); return; }
    setMyVolunteerLoading(true);
    try {
      setMyVolunteer(await withTimeout(repo.listMyVolunteerApplications()));
    } catch {
      setMyVolunteer([]);
    } finally {
      setMyVolunteerLoading(false);
      setMyVolunteerLoaded(true);
    }
  };

  // Same reasoning as the correction queue: the rows carry moderation fields and
  // confirmation counts, so they are fetched only when the panel screen asks.
  const loadReportQueue = async () => {
    setReportQueueLoading(true); setReportQueueError('');
    try {
      setReportQueue(await withTimeout(repo.listReportQueue()));
    } catch {
      setReportQueueError(tr.coordReports.loadFailed);
    } finally {
      setReportQueueLoading(false);
    }
  };

  const loadSystemLog = async () => {
    setSystemLogLoading(true); setSystemLogError('');
    try {
      setSystemLog(await withTimeout(repo.listSystemLog(300)));
    } catch {
      setSystemLogError(tr.coordLog.loadFailed);
    } finally {
      setSystemLogLoading(false);
    }
  };

  // Contact messages carry the writer's address, so this is fetched only when the panel
  // screen asks for it — and RLS is what actually decides whether it answers.
  const loadContact = async () => {
    setContactLoading(true); setContactError('');
    try {
      setContactMessages(await withTimeout(repo.listContactMessages()));
    } catch {
      setContactError(tr.contact.loadFailed);
    } finally {
      setContactLoading(false);
    }
  };

  // Both lists carry contact details, so neither is fetched until its screen asks.
  const loadVolunteers = async () => {
    setVolunteersLoading(true); setVolunteersError('');
    try {
      setVolunteers(await withTimeout(repo.listVolunteerApplications()));
    } catch {
      setVolunteersError(tr.coordVolunteers.loadFailed);
    } finally {
      setVolunteersLoading(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true); setStaffError('');
    try {
      const r = await withTimeout(repo.listStaff());
      setStaff(r.staff); setInvites(r.invites);
    } catch {
      setStaffError(tr.coordStaff.loadFailed);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadMySubs = async () => {
    if (!auth.user) { setMySubs([]); setMySubsError(''); return; }
    setMySubsLoading(true); setMySubsError('');
    try {
      setMySubs(await withTimeout(repo.listMySubmissions()));
    } catch {
      setMySubsError(tr.track.mineFailed);
    } finally {
      setMySubsLoading(false);
    }
  };
  // Invite landing: /kayit?davet=<adres> opens the sign-up form with the address filled
  // in, then strips the query so the address does not sit in the URL bar (or in the next
  // share of that link) longer than it needs to. Nothing is granted here — the role is
  // applied by handle_new_user() once Supabase has verified the address.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.pathname.replace(/\/+$/, '').endsWith('/kayit')) return;
    const invited = url.searchParams.get('davet') ?? '';
    window.history.replaceState({}, '', '/');
    if (auth.enabled && !auth.user) auth.openModal('signUp', invited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.enabled]);

  useEffect(() => { void loadMySubs(); /* eslint-disable-next-line */ }, [auth.user?.id]);

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
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      // A single-page app keeps the scroll offset across a navigation, so a new page
      // would open half-way down. Reset it here — only on a real forward navigation,
      // which is why this sits inside the push branch: on back/forward the path is
      // already current, so the browser's own scroll restoration is left alone.
      window.scrollTo(0, 0);
    }
  }, [route, tab, currentSlug, snap]);

  // Real responsive layout: track viewport width.
  useEffect(() => {
    const onResize = () => setDevice(isMobileWidth() ? 'mobile' : 'desktop');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Previous effective role, so a sign-in can be told apart from a page load that
  // happens to have a session.
  const prevRole = useRef<Role | null>(null);

  // Keep the route consistent with the signed-in role — in ONE direction.
  //
  // What this used to do: push anyone whose role resolved to 'coordinator' onto
  // /koordinasyon from whatever page they were on. That made every public URL
  // unreachable while signed in as a coordinator — opening /gonullu from the receipt
  // e-mail flashed the volunteer page and then bounced to the panel. A coordinator is
  // also a person who volunteers, reports aid and reads a disaster page; the panel is
  // one click away in the header, it does not need to be forced.
  //
  // The other direction stays: someone who is NOT a coordinator sitting on a panel
  // route is sent home, because their session may have been revoked while the tab was
  // open. That is a courtesy, not a protection — the data is held back by RLS
  // (rules/03 §Server-Side Authorization).
  useEffect(() => {
    if (!auth.enabled || !auth.ready) return;
    const before = prevRole.current;
    prevRole.current = role;
    if (role !== 'coordinator') {
      setRoute((r) => (r.startsWith('coord') ? 'home' : r));
      return;
    }
    // Signing in during this session, from the default landing page: the panel is where
    // a coordinator is going. Deep links and any other page are left alone.
    if (before !== null && before !== 'coordinator') {
      setRoute((r) => (r === 'home' ? 'coordHome' : r));
    }
  }, [role, auth.enabled, auth.ready]);

  const showToast = (m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const api: AppApi = useMemo(() => ({
    snap, loadError, retryLoad, overview, orgs, slides, backend: repo.kind,
    route, tab, device, role, currentSlug, frame, showToolbar: IS_DEV, query, filter, subFilter,
    catFilter, locFilter, onlyCritical, updatedToday,
    form, track, reportStage, lastCode, formError, copied,
    modal, toast, trackedSub, trackError, wizardMode, disasterFormOpen, deliveryOpen,
    mySubs, mySubsLoading, mySubsError,
    orgEdits, orgEditsLoading, orgEditsError, orgEditsPending,
    reportQueue, reportQueueLoading, reportQueueError,
    myVolunteer, myVolunteerLoading, myVolunteerLoaded,
    systemLog, systemLogLoading, systemLogError, volunteerFilter,
    contactMessages, contactLoading, contactError,
    volunteers, volunteersLoading, volunteersError,
    volunteersPending: volunteers.filter((v) => v.status === 'Pending review').length,
    staff, invites, staffLoading, staffError,

    go: (r, extra) => { setRoute(r); if (extra?.tab) setTab(extra.tab); },
    openDisaster: (slug, t) => { setCurrentSlug(slug); setRoute('disaster'); setTab(t ?? 'needs'); if (slug !== currentSlug) loadSnapshot(slug); },
    setDevice,
    setRole: (r) => { setProtoRole(r); setRoute(r === 'coordinator' ? 'coordHome' : 'home'); },
    setTab, setQuery, setFilter, setSubFilter,
    setCatFilter, setLocFilter,
    toggleOnlyCritical: () => setOnlyCritical((v) => !v),
    toggleUpdatedToday: () => setUpdatedToday((v) => !v),
    clearFilters: () => {
      setFilter('All'); setQuery(''); setCatFilter(''); setLocFilter('');
      setOnlyCritical(false); setUpdatedToday(false);
    },
    // Header search: type anywhere, land on the needs list already filtered.
    searchFromHeader: (q) => {
      setQuery(q);
      setRoute('disaster');
      setTab('needs');
    },
    setForm: (k, v) => setFormState((s) => ({ ...s, [k]: v })),
    setTrack: (k, v) => setTrackState((s) => ({ ...s, [k]: v })),
    prefillReport: (needId, unit, loc) => {
      setFormState((s) => ({ ...s, needId, unit, loc }));
      // Open as an overlay instead of routing to /bildir: the visitor keeps the
      // operation they were reading behind the form. /bildir still works as a page for
      // a direct link.
      setFormError(''); setReportStage('form'); setDeliveryOpen(true);
    },

    submitDelivery: () => {
      const qty = parseInt(form.qty, 10);
      if (!qty || qty < 1) return setFormError(tr.report.errQty);
      const loggedIn = auth.enabled && !!auth.user;
      // A signed-in reporter may record a delivery on someone else's behalf. What they
      // type wins; the account is only the fallback. Storing the giver's own e-mail is
      // what makes the record appear in THEIR "Gönderilerim" — and, if they have no
      // account yet, what makes it appear the day they open one with that address
      // (my_submissions() matches on contributor_email).
      const name = form.name.trim() || (loggedIn ? (auth.profile?.fullName || 'Gönüllü') : '');
      const email = form.email.trim() || (loggedIn ? (auth.user?.email || '') : '');
      if (!loggedIn && (!form.name || !form.email || !form.phone || !form.city)) return setFormError(tr.report.errContact);
      if (!form.confirm) return setFormError(tr.report.errConfirm);
      setFormError('');
      repo.createDelivery({
        needId: form.needId, qty, unit: form.unit, loc: form.loc, date: form.date, eta: form.eta,
        notes: form.notes, name, email, phone: form.phone,
        city: form.district ? `${form.city} / ${form.district}` : form.city,
        photoUrl: form.photoUrl || null,
      }).then(({ snapshot, code }) => { setSnap(snapshot); setLastCode(code); setCopied(false); setReportStage('done'); });
    },
    copyCode: () => { try { navigator.clipboard.writeText(lastCode); } catch { /* ignore */ } setCopied(true); },
    reportAnother: () => { setReportStage('form'); setCopied(false); setFormState((s) => ({ ...s, qty: '', notes: '', confirm: false, photoUrl: '' })); },

    openWizard: (mode) => setWizardMode(mode),
    openDisasterForm: () => setDisasterFormOpen(true),
    // Opens over the current page; the route is untouched so the disaster stays behind it.
    openDelivery: () => { setFormError(''); setReportStage('form'); setDeliveryOpen(true); },
    closeDelivery: () => setDeliveryOpen(false),
    closeDisasterForm: () => setDisasterFormOpen(false),
    closeWizard: () => setWizardMode(null),
    saveDisaster: async (id, input) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setSnap(await withTimeout(repo.saveDisaster(id, input)));
        // The national dashboard counts operations, so it has to be re-read too.
        setOverview(await withTimeout(repo.getOverview()));
        showToast(id ? tr.coordDisasters.savedEdit : tr.coordDisasters.savedNew);
        return true;
      } catch { showToast(tr.coordDisasters.saveFailed); return false; }
    },
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

    reloadMySubs: () => { void loadMySubs(); },
    reloadOrgEdits: () => { void loadOrgEdits(); },
    reloadVolunteers: () => { void loadVolunteers(); },
    reloadStaff: () => { void loadStaff(); },
    saveAnnouncement: async (id, input) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setSnap(await withTimeout(repo.saveAnnouncement(id, input, auth.profile?.fullName ?? 'Koordinatör')));
        showToast(id ? tr.coordOps.annSavedEdit : tr.coordOps.annSavedNew);
        return true;
      } catch { showToast(tr.coordOps.saveFailed); return false; }
    },
    deleteAnnouncement: async (id) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setSnap(await withTimeout(repo.deleteAnnouncement(id)));
        showToast(tr.coordOps.annDeleted);
        return true;
      } catch { showToast(tr.coordOps.saveFailed); return false; }
    },
    saveLocation: async (id, input) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setSnap(await withTimeout(repo.saveLocation(id, input)));
        // The delivery-point count is part of the national dashboard, so re-read it.
        setOverview(await withTimeout(repo.getOverview()));
        showToast(id ? tr.coordOps.locSavedEdit : tr.coordOps.locSavedNew);
        return true;
      } catch { showToast(tr.coordOps.saveFailed); return false; }
    },
    deleteLocation: async (id) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setSnap(await withTimeout(repo.deleteLocation(id)));
        setOverview(await withTimeout(repo.getOverview()));
        showToast(tr.coordOps.locDeleted);
        return true;
      } catch { showToast(tr.coordOps.saveFailed); return false; }
    },
    saveOrganization: async (id, input) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        // Publishing straight into "Doğrulandı" is an admin power; the store reads the
        // role from the session so no screen can ask for it on its own.
        setOrgs(await withTimeout(repo.saveOrganization(id, input, auth.profile?.role === 'admin')));
        showToast(id ? tr.coordOrgs.savedEdit : tr.coordOrgs.savedNew);
        return true;
      } catch { showToast(tr.coordOrgs.saveFailed); return false; }
    },
    verifyOrganization: async (id, status, reason) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setOrgs(await withTimeout(repo.verifyOrganization(id, status, reason)));
        showToast(status === 'Verified' ? tr.coordOrgs.verifiedToast : tr.coordOrgs.rejectedToast);
        return true;
      } catch { showToast(tr.coordOrgs.saveFailed); return false; }
    },
    // Public action: no account, no role check. The form is the only validation the
    // visitor sees; the table's own constraints are what actually hold.
    submitVolunteer: async (input) => {
      try {
        const id = await withTimeout(repo.submitVolunteerApplication(input));
        // The receipt is attempted after the row exists and is never allowed to fail the
        // application: the person applied, whatever the mail provider does next.
        void sendVolunteerReceipt(id);
        void loadMyVolunteer();
        return true;
      } catch { return false; }
    },
    reloadMyVolunteer: () => { setMyVolunteerLoaded(false); void loadMyVolunteer(); },
    updateMyVolunteer: async (id, input) => {
      try {
        setMyVolunteer(await withTimeout(repo.updateMyVolunteerApplication(id, input)));
        showToast(tr.volunteerMine.updatedToast);
        return true;
      } catch { showToast(tr.volunteerMine.actionFailed); return false; }
    },
    setMyVolunteerConsent: async (on) => {
      try {
        setMyVolunteer(await withTimeout(repo.setMyVolunteerConsent(on)));
        showToast(on ? tr.volunteerMine.consentOnToast : tr.volunteerMine.consentOffToast);
        return true;
      } catch { showToast(tr.volunteerMine.actionFailed); return false; }
    },
    withdrawMyVolunteer: async (id) => {
      try {
        setMyVolunteer(await withTimeout(repo.withdrawMyVolunteerApplication(id)));
        showToast(tr.volunteerMine.withdrawnToast);
        return true;
      } catch { showToast(tr.volunteerMine.actionFailed); return false; }
    },
    reviewVolunteer: async (id, status, note) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setVolunteers(await withTimeout(repo.reviewVolunteerApplication(id, status, note)));
        // Telling the applicant is a separate thing that can fail on its own: the
        // decision is already recorded either way, and the toast says only what we
        // actually know — that the provider accepted the message.
        if (status === 'Approved') {
          const mailed = await sendVolunteerApproved(id);
          showToast(mailed ? tr.coordVolunteers.approvedMailedToast : tr.coordVolunteers.approvedNoMailToast);
        } else {
          showToast(tr.coordVolunteers.reviewedToast);
        }
        return true;
      } catch { showToast(tr.coordVolunteers.actionFailed); return false; }
    },
    grantStaffRole: async (email, role, note, orgId) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return null; }
      let outcome: 'granted' | 'invited';
      try {
        outcome = await withTimeout(repo.grantStaffRole(email, role, note, orgId));
      } catch { showToast(tr.coordStaff.actionFailed); return null; }
      await loadStaff();
      // The grant is already committed. Mail is attempted after it and never allowed to
      // fail the operation — but the caller is told, so the screen can say "yetki verildi,
      // e-posta gönderilemedi" instead of implying the person was notified.
      let mailed = false;
      if (repo.kind === 'supabase') {
        const sent = await sendStaffInvite(email.trim().toLowerCase(), role, orgId, note);
        mailed = sent.ok;
      }
      showToast(outcome === 'granted'
        ? (mailed ? tr.coordStaff.grantedMailedToast : tr.coordStaff.grantedToast)
        : (mailed ? tr.coordStaff.invitedMailedToast : tr.coordStaff.invitedToast));
      return { outcome, mailed };
    },
    revokeStaffRole: async (userId) => {
      try {
        await withTimeout(repo.revokeStaffRole(userId));
        await loadStaff();
        showToast(tr.coordStaff.revokedToast);
        return true;
      } catch { showToast(tr.coordStaff.actionFailed); return false; }
    },
    cancelRoleInvite: async (email) => {
      try {
        await withTimeout(repo.cancelRoleInvite(email));
        await loadStaff();
        return true;
      } catch { showToast(tr.coordStaff.actionFailed); return false; }
    },
    // Applying a correction rewrites a published record, so the directory is re-read
    // and the queue refreshed from the source rather than patched in place.
    applyOrgEdit: async (id, fields, note) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        setOrgs(await withTimeout(repo.applyOrgEditRequest(id, fields, note)));
        await loadOrgEdits();
        showToast(tr.coordOrgEdits.appliedToast);
        return true;
      } catch { showToast(tr.coordOrgEdits.actionFailed); return false; }
    },
    rejectOrgEdit: async (id, note) => {
      if (unverified) { showToast(tr.auth.verifyFirst); return false; }
      try {
        await withTimeout(repo.rejectOrgEditRequest(id, note));
        await loadOrgEdits();
        showToast(tr.coordOrgEdits.rejectedToast);
        return true;
      } catch { showToast(tr.coordOrgEdits.actionFailed); return false; }
    },
    // Selecting a row shows it in the same detail panel the code lookup fills, so there
    // is one place where a submission is rendered.
    openTrackedSub: (sub) => { setTrackedSub(sub); setTrackError(''); },
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
    findSimilarReports: (input) => repo.findSimilarReports(input).catch(() => []),
    submitDisasterReport: async (input) => {
      try {
        const res = await repo.submitDisasterReport(input);
        setOverview(await repo.getOverview());
        showToast(res.merged ? tr.reportDisaster.mergedToast(res.report.reportCount) : tr.reportDisaster.sentToast);
        return res;
      } catch {
        showToast(tr.reportDisaster.sendError);
        return null;
      }
    },
    confirmDisasterReport: async (reportId, who) => {
      try {
        const res = await repo.confirmDisasterReport(reportId, who);
        setOverview(await repo.getOverview());
        // Three different outcomes, three different sentences. Saying "doğrulandı"
        // when the counter did not move would tell the person something untrue.
        if (res.already) showToast(tr.reportDisaster.alreadyToast);
        else if (res.createdSlug) showToast(tr.reportDisaster.openedToast);
        else showToast(tr.reportDisaster.confirmedToast(res.report.reportCount));
        return res;
      } catch {
        showToast(tr.reportDisaster.sendError);
        return null;
      }
    },
    reloadReportQueue: () => { void loadReportQueue(); },
    reloadSystemLog: () => { void loadSystemLog(); },
    reloadContact: () => { void loadContact(); },
    submitContact: async (input) => {
      try {
        const id = await withTimeout(repo.submitContact(input));
        // The message is stored at this point. The mail is a separate, best-effort step:
        // its failure is logged as a warning, not raised, because telling the writer
        // "your message was not received" would be false — we have it (rules/05 §Email).
        void sendContactMessage(id).then((ok) => {
          if (!ok && typeof console !== 'undefined') console.warn('[AfetHUB] iletişim bildirimi gönderilemedi');
        });
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        showToast(msg.includes('rate limited') ? tr.contact.rateLimited : tr.contact.sendError);
        return false;
      }
    },
    setContactStatus: async (id, status) => {
      try {
        setContactMessages(await withTimeout(repo.setContactStatus(id, status)));
        showToast(tr.contact.statusToast);
        return true;
      } catch { showToast(tr.contact.actionFailed); return false; }
    },
    openVolunteers: (disasterId, mode) => {
      setVolunteerFilter({ disasterId, mode });
      setRoute('coordStaff');
    },
    clearVolunteerFilter: () => setVolunteerFilter(null),
    setVolunteerShift: async (applicationId, onShift) => {
      try {
        setVolunteers(await withTimeout(repo.setVolunteerShift(applicationId, onShift)));
        // The operation's "şu an nöbette" figure is derived from these rows, so the
        // snapshot is re-read rather than left showing the previous count.
        setSnap(await repo.getSnapshot(currentSlug || undefined));
        setOverview(await repo.getOverview());
        showToast(onShift ? tr.coordVolunteers.shiftOnToast : tr.coordVolunteers.shiftOffToast);
        return true;
      } catch { showToast(tr.coordVolunteers.actionFailed); return false; }
    },
    reviewDisasterReport: async (reportId, action, reason) => {
      try {
        await withTimeout(repo.reviewDisasterReport(reportId, action, reason));
        await loadReportQueue();
        setOverview(await repo.getOverview());
        setSnap(await repo.getSnapshot(currentSlug || undefined));
        showToast(action === 'publish' ? tr.coordReports.publishedToast : tr.coordReports.rejectedToast);
        return true;
      } catch { showToast(tr.coordReports.actionFailed); return false; }
    },
    confirmCommunityDisaster: async (disasterId) => {
      try {
        await withTimeout(repo.confirmCommunityDisaster(disasterId));
        await loadReportQueue();
        setOverview(await repo.getOverview());
        setSnap(await repo.getSnapshot(currentSlug || undefined));
        showToast(tr.coordReports.confirmedToast);
        return true;
      } catch { showToast(tr.coordReports.actionFailed); return false; }
    },
    // Slide writes are authorised server-side (RLS). A rejected write surfaces as a
    // toast and the list is left untouched — never optimistically "saved".
    saveSlide: async (id, input) => {
      try {
        setSlides(await withTimeout(repo.saveSlide(id, input)));
        showToast(tr.slider.saved);
        return true;
      } catch { showToast(tr.slider.saveFailed); return false; }
    },
    reorderSlides: async (orderedIds) => {
      try {
        setSlides(await withTimeout(repo.reorderSlides(orderedIds)));
        showToast(tr.slider.reordered);
        return true;
      } catch { showToast(tr.slider.saveFailed); return false; }
    },
    deleteSlide: async (id) => {
      try {
        setSlides(await withTimeout(repo.deleteSlide(id)));
        showToast(tr.slider.deleted);
        return true;
      } catch { showToast(tr.slider.saveFailed); return false; }
    },

    submitOrgEditRequest: async (input) => {
      try { await withTimeout(repo.submitOrgEditRequest(input)); return true; }
      catch { return false; }
    },

    submitOrganization: async (input) => {
      try {
        await repo.submitOrganization(input);
        setOrgs(await repo.listOrganizations());
        showToast(tr.orgs.sentToast);
        return true;
      } catch {
        showToast(tr.orgs.sendError);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // Every piece of state exposed on `api` must be listed here, or consumers keep the
  // previous value: `deliveryOpen` and `slides` were missing, so the delivery overlay
  // never appeared and the slide list could go stale after a save.
  }), [snap, loadError, overview, orgs, slides, mySubs, mySubsLoading, mySubsError, orgEdits, orgEditsLoading, orgEditsError, orgEditsPending, reportQueue, reportQueueLoading, reportQueueError, myVolunteer, myVolunteerLoading, myVolunteerLoaded, systemLog, systemLogLoading, systemLogError, contactMessages, contactLoading, contactError, volunteerFilter, volunteers, volunteersLoading, volunteersError, staff, invites, staffLoading, staffError, route, tab, device, role, unverified, currentSlug, query, filter, subFilter, catFilter, locFilter, onlyCritical, updatedToday, form, track, reportStage, lastCode, formError, copied, wizardMode, disasterFormOpen, deliveryOpen, modal, toast, trackedSub, trackError]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
