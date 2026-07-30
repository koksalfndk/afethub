import type { PriorityKey } from './theme';
import type { IcoName } from './ui';

// Category-driven need creation. Standard categories collect item + qty + unit;
// the special ones (transport / logistics / pets) collect their own fields and
// map them onto the same quantity model, keeping extra info in `details`.

export interface Category { key: string; label: string; icon: IcoName; special: boolean; }

export const CATEGORIES: Category[] = [
  { key: 'Sağlık', label: 'Sağlık', icon: 'catHealth', special: false },
  { key: 'Ekipman', label: 'Ekipman', icon: 'catEquipment', special: false },
  { key: 'Hijyen', label: 'Hijyen', icon: 'catHygiene', special: false },
  { key: 'Giyim', label: 'Giyim', icon: 'catClothing', special: false },
  { key: 'Enerji', label: 'Enerji', icon: 'catEnergy', special: false },
  { key: 'Gıda ve Su', label: 'Gıda ve Su', icon: 'catFood', special: false },
  { key: 'Ulaşım', label: 'Ulaşım', icon: 'catTransport', special: true },
  { key: 'Taşıma', label: 'Taşıma', icon: 'catHaulage', special: true },
  { key: 'Evcil Hayvanlar', label: 'Evcil Hayvanlar', icon: 'catPets', special: true },
];

export const PRIORITIES: PriorityKey[] = ['Critical', 'Urgent', 'Normal'];
export const PASSENGER_VEHICLES = ['Otobüs', 'Minibüs', 'Ambulans', 'Otomobil', 'Diğer'];
export const CARGO_VEHICLES = ['Kamyon', 'Kamyonet', 'Van', 'Pikap', 'Diğer'];
export const ANIMALS = ['Kedi', 'Köpek', 'Kuş', 'Çiftlik hayvanı', 'Diğer'];
export const PET_NEEDS = ['Mama', 'Su', 'Veteriner', 'Barınak', 'Nakil', 'Kafes/Taşıma'];

export interface NeedPayload {
  // Which operation the need belongs to. Previously absent, which meant the data layer
  // fell back to "the first active disaster" — a coordinator looking at Kaş could
  // publish into Seydikemer without any sign of it. Always set explicitly.
  disasterSlug: string;
  category: string;
  title: string;
  priority: PriorityKey;
  required: number;
  unit: string;
  loc: string;
  deadline: string;
  details: Record<string, string>;
}

// The flat field bag the wizard mutates.
export interface WizardValues {
  disasterSlug: string;
  category: string;
  priority: PriorityKey;
  // standard
  title: string; required: string; unit: string;
  // transport / logistics
  vehicle: string; from: string; to: string; when: string; capacity: string; load: string;
  // pets
  animal: string; count: string; petNeeds: string[];
  // shared
  loc: string; deadline: string;
  // contact (public flow, when not signed in)
  name: string; email: string; phone: string; city: string;
}

export const emptyWizard = (loc: string, disasterSlug = ''): WizardValues => ({
  disasterSlug, category: '', priority: 'Critical',
  title: '', required: '', unit: '',
  vehicle: '', from: '', to: '', when: '', capacity: '', load: '',
  animal: '', count: '', petNeeds: [],
  loc, deadline: '',
  name: '', email: '', phone: '', city: '',
});

// Builds the canonical payload (title/required/unit/details) from raw values.
export function buildPayload(v: WizardValues): NeedPayload {
  const base = { disasterSlug: v.disasterSlug, category: v.category, priority: v.priority, loc: v.loc, deadline: v.deadline };
  if (v.category === 'Ulaşım') {
    return {
      ...base, title: `Ulaşım: ${v.from || '?'} → ${v.to || '?'}`,
      required: parseInt(v.capacity, 10) || 0, unit: 'kişi',
      details: { 'Araç': v.vehicle, 'Nereden': v.from, 'Nereye': v.to, 'Tarih/Saat': v.when },
    };
  }
  if (v.category === 'Taşıma') {
    return {
      ...base, title: `Taşıma: ${v.from || '?'} → ${v.to || '?'}`,
      required: parseInt(v.required, 10) || 1, unit: 'sefer',
      details: { 'Araç': v.vehicle, 'Yük': v.load, 'Nereden': v.from, 'Nereye': v.to, 'Tarih': v.when },
    };
  }
  if (v.category === 'Evcil Hayvanlar') {
    return {
      ...base, title: `Evcil hayvan: ${v.animal || 'karışık'}`,
      required: parseInt(v.count, 10) || 0, unit: 'hayvan',
      details: { 'Tür': v.animal, 'İhtiyaçlar': v.petNeeds.join(', ') },
    };
  }
  // standard supply category
  return {
    ...base, title: v.title,
    required: parseInt(v.required, 10) || 0, unit: v.unit || 'adet',
    details: {},
  };
}

// Non-empty detail entries, for compact display on cards.
export function detailPairs(details?: Record<string, string> | null): [string, string][] {
  if (!details) return [];
  return Object.entries(details).filter(([, val]) => val && String(val).trim());
}
