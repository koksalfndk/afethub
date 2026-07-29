import type { PriorityKey, StatusKey } from './theme';

export type { PriorityKey, StatusKey };

export interface Disaster {
  id: string;
  slug: string;          // URL-safe, e.g. "seydikemer-orman-yangini"
  name: string;
  region: string;
  status: 'Active' | 'Resolved' | 'Archived';
  situation: string;
  openedAt: string;      // display string, e.g. "21 Temmuz"
  updatedLabel: string;  // display string, e.g. "4 dakika önce"
  volunteers: number;    // registered on site
  onShift: number;       // on shift now
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
