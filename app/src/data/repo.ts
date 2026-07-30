import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, DeliveryInput, PriorityKey, Organization, OrganizationInput,
  DisasterReport, DisasterReportInput, BannerSlide, BannerSlideInput, SlideAction,
  OrgEditRequestInput, OrgEditable,
} from '../types';
import type { NeedPayload } from '../needForm';

// A snapshot is the full operational state the UI renders from. Mutations return
// a fresh snapshot so the store can re-render. This same interface is backed by
// the in-memory LocalRepo now and by SupabaseRepo when env vars are present.
export interface Snapshot {
  disaster: Disaster;        // the current disaster (by slug)
  disasters: Disaster[];     // all disasters, for the home listing / navigation
  locations: Location[];     // current disaster's delivery points
  needs: Need[];             // current disaster's needs
  subs: Submission[];        // current disaster's submissions
  log: LogEntry[];
  announcements: Announcement[];
  verifiedTotal: number;
}

// ---------------------------------------------------------------------------
// National dashboard. Counters are produced by the data layer (SQL view
// `disaster_overview` in Supabase mode) — never recomputed as authoritative
// totals in the browser (CLAUDE.md §Source of Truth, rules/05 §Aggregates).
// ---------------------------------------------------------------------------
export interface TopNeed {
  id: string; name: string; priority: PriorityKey;
  remaining: number; unit: string;
  disasterId: string; disasterName: string; disasterSlug: string;
}

export interface DisasterCard {
  disaster: Disaster;
  activeNeeds: number;
  completedNeeds: number;
  pendingSubs: number;
  pendingUnits: number;
  verifiedSubs: number;
  deliveryPoints: number;
  topNeeds: TopNeed[];      // most urgent open needs of this operation
}

export interface Overview {
  disasters: DisasterCard[];
  totals: {
    activeDisasters: number; activeNeeds: number; verifiedSubs: number;
    pendingSubs: number; volunteers: number; deliveryPoints: number;
  };
  log: LogEntry[];      // newest first, across every operation
  urgent: TopNeed[];    // most urgent open needs, across every operation
  reports: DisasterReport[]; // citizen reports still awaiting coordinator review
  demo: boolean;        // any visible record is sample content
}

export interface CreateDeliveryResult {
  snapshot: Snapshot;
  code: string;
}

export interface Repo {
  readonly kind: 'local' | 'supabase';
  getSnapshot(slug?: string): Promise<Snapshot>;
  // National dashboard data (home page).
  getOverview(): Promise<Overview>;
  // Organizations directory. Entries are public as soon as they are submitted and
  // carry "Doğrulama bekliyor" until a coordinator verifies them.
  listSlides(): Promise<BannerSlide[]>;
  saveSlide(id: string | null, input: BannerSlideInput): Promise<BannerSlide[]>;
  deleteSlide(id: string): Promise<BannerSlide[]>;
  // Persist a new order. Takes the ids in their new sequence and assigns 1..n, so the
  // number shown in the editor is always the position in the list — there is no way for
  // the two to disagree.
  reorderSlides(orderedIds: string[]): Promise<BannerSlide[]>;
  listOrganizations(): Promise<Organization[]>;
  submitOrganization(input: OrganizationInput): Promise<Organization>;
  submitOrgEditRequest(input: OrgEditRequestInput): Promise<void>;
  // Citizen disaster reports. `findSimilarReports` is a *suggestion* pass so the
  // reporter can confirm an existing report instead of creating a duplicate; the
  // merge rule itself is enforced when the report is written.
  findSimilarReports(input: DisasterReportInput): Promise<DisasterReport[]>;
  submitDisasterReport(input: DisasterReportInput): Promise<{ report: DisasterReport; merged: boolean }>;
  confirmDisasterReport(reportId: string): Promise<DisasterReport>;
  createDelivery(input: DeliveryInput): Promise<CreateDeliveryResult>;
  verifySubmission(subId: string, kind: VerifyKind, qty: number, reason: string): Promise<Snapshot>;
  publishNeed(p: NeedPayload): Promise<Snapshot>;
  bumpNeed(needId: string): Promise<Snapshot>;
  togglePause(needId: string): Promise<Snapshot>;
  submitNeedRequest(p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }): Promise<{ snapshot: Snapshot; code: string }>;
  trackSubmission(code: string, email: string): Promise<Submission | null>;
  // Every submission made with the signed-in account's e-mail. Takes no argument on
  // purpose: the address comes from the session server-side, so one account can never
  // list another's submissions by guessing an e-mail.
  listMySubmissions(): Promise<Submission[]>;
}

// Shared, pure domain helpers — the invariant lives here and in schema.sql.
export const remaining = (n: Need): number => Math.max(0, n.required - n.verified);
export const pct = (n: Need): number => Math.min(100, Math.round((n.verified / n.required) * 100));
export const genCode = (r: number): string => 'AFT-' + (4900 + Math.floor(r * 90));
export const genNrq = (r: number): string => 'NRQ-' + (120 + Math.floor(r * 80));

// ---- Report de-duplication rule (shared by client suggestions and the writer) --
// Two reports describe the same event when they share the disaster type and the
// province, were observed within REPORT_DAY_WINDOW days of each other, and name
// the same district (or the district is left blank on one side). Keep this rule in
// one place: the SQL trigger in migration 0003 mirrors it exactly.
// Banner slides. Reads are public (the slider is public content); writes are
// coordinator-only and enforced by RLS, not by hiding the screen (rules/03).
export const SLIDE_ACTIONS: SlideAction[] = ['reportDisaster', 'howItWorks', 'orgs', 'home', 'track'];
// A slide image is either a file we ship or an object in our own Storage bucket
// ('upload:<name>.webp'). An arbitrary https URL is still refused: the value must never
// name a third-party host (rules/03 §File Uploads). Mirrored by the check constraint in
// migration 0008 — change both together.
export const isLocalSlideImage = (v: string): boolean =>
  v === ''
  || /^\/banners\/[A-Za-z0-9._-]+\.(webp|png|svg|jpg)$/.test(v)
  || /^upload:[A-Za-z0-9._/-]+\.webp$/.test(v);

// Which editable fields differ between the published record and the proposal.
// Shared so the UI badge, the validation and the stored `changed_fields` can never
// disagree about what "changed" means.
export const ORG_EDITABLE_KEYS = [
  'name', 'kind', 'scope', 'province', 'district', 'services',
  'description', 'website', 'email', 'phone', 'emergencyPhone', 'address',
] as const;

export function changedOrgFields(current: Organization, proposed: OrgEditable): string[] {
  const norm = (v: unknown): string => (Array.isArray(v)
    ? v.slice().sort().join('|')
    : String(v ?? '').trim());
  return ORG_EDITABLE_KEYS.filter((k) => norm(current[k]) !== norm(proposed[k]));
}

export const REPORT_DAY_WINDOW = 2;

const norm = (v: string) => v.trim().toLocaleLowerCase('tr');
const dayDiff = (a: string, b: string): number => {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Number.POSITIVE_INFINITY;
  return Math.abs(t1 - t2) / 86_400_000;
};

export function isSameEvent(
  a: { type: string; province: string; district: string; occurredOn: string },
  b: { type: string; province: string; district: string; occurredOn: string },
): boolean {
  if (a.type !== b.type) return false;
  if (norm(a.province) !== norm(b.province)) return false;
  const da = norm(a.district), db = norm(b.district);
  if (da && db && da !== db) return false;
  return dayDiff(a.occurredOn, b.occurredOn) <= REPORT_DAY_WINDOW;
}
