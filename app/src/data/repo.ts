import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, DeliveryInput, PriorityKey, Organization, OrganizationInput,
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
  log: LogEntry[];   // newest first, across every operation
  urgent: TopNeed[]; // most urgent open needs, across every operation
  demo: boolean;     // any visible record is sample content
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
  listOrganizations(): Promise<Organization[]>;
  submitOrganization(input: OrganizationInput): Promise<Organization>;
  createDelivery(input: DeliveryInput): Promise<CreateDeliveryResult>;
  verifySubmission(subId: string, kind: VerifyKind, qty: number, reason: string): Promise<Snapshot>;
  publishNeed(p: NeedPayload): Promise<Snapshot>;
  bumpNeed(needId: string): Promise<Snapshot>;
  togglePause(needId: string): Promise<Snapshot>;
  submitNeedRequest(p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }): Promise<{ snapshot: Snapshot; code: string }>;
  trackSubmission(code: string, email: string): Promise<Submission | null>;
}

// Shared, pure domain helpers — the invariant lives here and in schema.sql.
export const remaining = (n: Need): number => Math.max(0, n.required - n.verified);
export const pct = (n: Need): number => Math.min(100, Math.round((n.verified / n.required) * 100));
export const genCode = (r: number): string => 'AFT-' + (4900 + Math.floor(r * 90));
export const genNrq = (r: number): string => 'NRQ-' + (120 + Math.floor(r * 80));
