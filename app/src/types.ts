import type { PriorityKey, StatusKey } from './theme';

export type { PriorityKey, StatusKey };

export interface Disaster {
  id: string;
  name: string;
  region: string;
  status: 'Active' | 'Resolved' | 'Archived';
  situation: string;
  openedAt: string;      // display string, e.g. "21 Temmuz"
  updatedLabel: string;  // display string, e.g. "4 dakika önce"
}

export interface Location {
  id: string;
  name: string;
  address: string;
  hours: string;
  accepts: string;
  contact: string;
  phone: string;
  status: string;        // display copy
  statusTone: 'green' | 'yellow';
  coords: string;
}

export interface Need {
  id: string;
  name: string;
  cat: string;           // Turkish category display string
  priority: PriorityKey; // canonical
  required: number;
  verified: number;
  pending: number;
  unit: string;          // Turkish unit display string
  updated: string;       // display string
  loc: string;
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
}

export interface NeedDraft {
  title: string; cat: string; priority: PriorityKey;
  required: number; unit: string; loc: string; deadline: string;
}
