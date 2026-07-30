import type { PriorityKey, StatusKey } from './theme';

export type { PriorityKey, StatusKey };

// Disaster kinds AfetHUB coordinates. Canonical keys are English (stable, match DB
// enums); Turkish labels live in i18n/strings.ts.
export type DisasterType = 'Wildfire' | 'Flood' | 'Earthquake' | 'Storm' | 'Evacuation' | 'Other';

export interface Disaster {
  id: string;
  // URL-safe and date-stamped so a place that burns twice never collides:
  // "seydikemer-orman-yangini-2026-07-21".
  slug: string;
  legacySlugs?: string[]; // older URLs that must keep resolving
  name: string;
  region: string;         // "Seydikemer, Muğla · Türkiye"
  province: string;       // "Muğla" — used by the national dashboard
  type: DisasterType;
  status: 'Active' | 'Resolved' | 'Archived';
  situation: string;
  openedAt: string;      // display string, e.g. "21 Temmuz"
  updatedLabel: string;  // display string, e.g. "4 dakika önce"
  volunteers: number;    // registered on site
  onShift: number;       // on shift now
  // True while the record is sample content. The UI must label it visibly so it is
  // never mistaken for verified live disaster data (rules/07, rules/08).
  demo?: boolean;
}

export interface Location {
  id: string;
  disasterId: string;
  name: string;
  address: string;
  hours: string;
  accepts: string;
  contact: string;
  phone: string;
  status: string;        // display copy
  statusTone: 'green' | 'yellow';
  coords: string;        // display string, e.g. "36.6321° K, 29.3187° D"
  lat: number;
  lng: number;
}

export interface Need {
  id: string;
  disasterId: string;
  disasterName: string;  // denormalized for cross-disaster lists (home "en acil")
  disasterSlug: string;
  name: string;
  cat: string;           // Turkish category display string
  priority: PriorityKey; // canonical
  required: number;
  verified: number;
  pending: number;
  unit: string;          // Turkish unit display string
  updated: string;       // display string
  loc: string;
  details?: Record<string, string>; // category-specific extra fields (transport/pets/…)
}

export interface Submission {
  id: string;
  code: string;
  contributor: string;
  city: string;
  needId: string;
  qty: number;
  unit: string;
  loc: string;
  submitted: string;     // display string
  status: StatusKey;     // canonical
  verifiedQty: number | null;
  note: string;
  photoUrl?: string | null;
  needName?: string;     // set by the public tracking RPC (Supabase mode)
}

export interface LogEntry {
  id: string;
  disasterId: string;
  disasterName: string;  // denormalized for the cross-disaster activity feed
  user: string;
  action: string;        // Turkish display copy
  detail: string;
  oldValue: string;
  newValue: string;
  time: string;          // display string
  color: string;
}

export interface Announcement {
  id: string;
  disasterId: string;
  kind: string;
  accent: string;
  time: string;
  author: string;
  title: string;
  body: string;
}

// Verification action kinds handled by the data layer / RPC.
export type VerifyKind = 'approve' | 'partial' | 'reject' | 'info';

export interface DeliveryInput {
  needId: string; qty: number; unit: string; loc: string;
  date: string; eta: string; notes: string;
  name: string; email: string; phone: string; city: string;
  photoUrl?: string | null;
}

export type UserRole = 'volunteer' | 'coordinator' | 'admin';

export interface Profile {
  id: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string | null;
}

export interface NeedDraft {
  title: string; cat: string; priority: PriorityKey;
  required: number; unit: string; loc: string; deadline: string;
}

// ---------------------------------------------------------------------------
// Organizations directory (kurumlar ve dernekler)
// ---------------------------------------------------------------------------
export type OrgStatus = 'Pending verification' | 'Verified' | 'Rejected';
export type OrgKind = 'Kamu kurumu' | 'Belediye' | 'Dernek' | 'Vakıf' | 'Meslek odası' | 'Gönüllü grubu' | 'Diğer';
export type OrgScope = 'Ulusal' | 'Bölgesel' | 'İl' | 'İlçe';

// Public projection of an organization. Submitter contact details are
// operational data and never travel to the browser (rules/01, rules/03).
export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  scope: OrgScope;
  province: string;
  district: string;
  services: string[];
  description: string;
  website: string;
  email: string;
  phone: string;
  emergencyPhone: string;
  address: string;
  status: OrgStatus;
  isOfficial: boolean;      // only a coordinator may set this
  // Path to a locally hosted logo (public/logos/*.webp), '' when there is none.
  // Coordinator-set only, and deliberately NOT part of OrganizationInput: letting a
  // visitor supply an image URL would mean rendering a third-party asset that can
  // spoof an institution and track our visitors (rules/03 §File Uploads).
  logo: string;
  verifiedAt: string | null;
  createdLabel: string;     // display string
}

// What a visitor submits. Contact of the submitter is kept server-side only.
export interface OrganizationInput {
  name: string; kind: OrgKind; scope: OrgScope; province: string; district: string;
  services: string[]; description: string; website: string; email: string;
  phone: string; emergencyPhone: string; address: string;
  submittedByName: string; submittedByEmail: string; submittedByPhone: string;
}

// ---------------------------------------------------------------------------
// Citizen disaster reports
//
// A report is NOT a disaster. It is a claim that something is happening. Reports
// about the same event are merged so the dashboard shows one entry with
// "n kişi bildirdi" instead of a wall of duplicates, and a coordinator turns a
// sufficiently corroborated report into a real operation (rules/02 §Need Requests
// applies the same shape: a request is never automatically a published record).
// ---------------------------------------------------------------------------
export type ReportStatus = 'Pending verification' | 'Merged' | 'Published' | 'Rejected';

export interface DisasterReport {
  id: string;
  type: DisasterType;
  province: string;
  district: string;
  locationNote: string;      // landmark / neighbourhood, free text
  occurredOn: string;        // YYYY-MM-DD — the day the event was observed
  description: string;
  reportCount: number;       // how many people reported this same event
  status: ReportStatus;
  disasterSlug: string | null; // set once a coordinator opens an operation from it
  createdLabel: string;
  lastReportLabel: string;
}

export interface DisasterReportInput {
  type: DisasterType;
  province: string;
  district: string;
  locationNote: string;
  occurredOn: string;
  description: string;
  name: string; email: string; phone: string;
}
