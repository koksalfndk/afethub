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
  // Operasyonun kapsadığı ilçeler. Boş = kaydedilmemiş; asla tahmin edilmez.
  // Dizi çünkü gerçek kayıtlarda birden çok ilçe var ("Bozkurt ve İnebolu").
  // Afet sayfasındaki ilçe haritası bunu boyar (migration 0026).
  districts: string[];
  // İlçenin bir kademe altı: etkilenen mahalle / köyler (migration 0029). Boş =
  // kaydedilmemiş; ASLA "hiçbiri etkilenmedi" demek değil.
  settlements: string[];
  type: DisasterType;
  status: 'Active' | 'Resolved' | 'Archived';
  situation: string;
  openedAt: string;      // display string, e.g. "21 Temmuz"
  updatedLabel: string;  // display string, e.g. "4 dakika önce"
  volunteers: number;    // registered on site
  onShift: number;       // on shift now
  // Who opened the operation. An organization id when a listed institution started it,
  // null when AfetHUB's own coordinators did. Never free text: an unverifiable
  // "started by X" line on a public page would be a claim of affiliation
  // (rules/03 §Legal and Safety Disclaimer).
  openedByOrgId: string | null;
  // Opened automatically once enough people confirmed the same citizen report. The
  // initiator is then the crowd — shown as "Topluluk" — and NOT an organization.
  // Optional so seed and local records keep their current shape.
  openedByCommunity?: boolean;
  // A community-opened operation rests on unverified claims until a coordinator
  // confirms it. False means every public surface must say so; hiding that would let
  // ten clicks publish something that reads exactly like a verified operation
  // (rules/01 §Clear Operational States).
  communityConfirmed?: boolean;
  // True while the record is sample content. The UI must label it visibly so it is
  // never mistaken for verified live disaster data (rules/07, rules/08).
  demo?: boolean;
  // Sahanın durumu — kaydın durumu değil. `status` operasyon KAYDININ durumu
  // (Active/Resolved/Archived); bu alan ziyaretçinin sorduğu şeyi cevaplıyor:
  // "yangın sürüyor mu, söndü mü". null/undefined = BELİRTİLMEDİ ve ekranda öyle
  // yazılır; asla tahmin edilmez (migration 0036).
  operationStage?: OperationStage | null;
  operationStageNote?: string;
  operationStageSetAt?: string;   // display string, '' when never set
}

// Halka açık operasyon aşaması. Kanonik anahtarlar İngilizce (veritabanı enum'u ile
// birebir), Türkçe etiketler i18n/strings.ts içinde.
export type OperationStage =
  | 'initial_response'
  | 'intensive_response'
  | 'evacuation'
  | 'cooling'
  | 'recovery'
  | 'monitoring'
  | 'completed';

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
  // Doluluk: koordinatörün elle girdiği ölçüm, 0-100. null = BİLİNMİYOR ve ekranda
  // öyle yazılır. Bilinmeyeni 0 diye göstermek "yer var" olarak okunur ve sevkiyat
  // dolu bir noktaya yönlendirilir (migration 0025, rules/04 §Empty States).
  capacityPct: number | null;
  capacityNote: string;
  capacityUpdated: string;   // display string, '' when never set
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
  // Koordinatörün "şu anda en çok ihtiyaç duyulan destek" satırında öne çıkardığı sıra
  // (1-4). null/undefined = öne çıkarılmamış (migration 0036).
  featuredRank?: number | null;
  // Verilmiş ama HENÜZ TESLİM EDİLMEMİŞ söz miktarı. Bilgilendiricidir: kalan miktarı
  // azaltmaz, doğrulanan miktara girmez. "Bekleyen doğrulama" ile AYNI ŞEY DEĞİLDİR —
  // biri yola çıkmamış bir niyet, diğeri koordinatörün önündeki bir kayıt
  // (migration 0037).
  pledged?: number;
}

// ---------------------------------------------------------------------------
// Teslim sözü (migration 0037)
// ---------------------------------------------------------------------------
export type PledgeStatus =
  | 'pledged'
  | 'confirmed'
  | 'in_transit'
  | 'delivered_reported'
  | 'fulfilled'
  | 'cancelled'
  | 'expired';

// Ziyaretçinin doldurduğu form. Hesap gerekmez (CLAUDE.md §Primary Product Rule).
export interface DeliveryPledgeInput {
  needId: string;
  qty: number;
  unit: string;
  locationId: string | null;
  // ISO 8601. Boş = tarih verilmedi; hatırlatma da yapılamaz.
  estimatedDeliveryAt: string;
  name: string; email: string; phone: string; city: string;
  notes: string;
}

// Kişinin KENDİ kaydını takip ederken gördüğü şekil. Başkasının kaydına ulaşmanın
// yolu yok: kod tek başına yetmiyor, e-posta eşleşmesi şart (rules/02 §Tracking Codes).
export interface DeliveryPledgeTracking {
  code: string;
  qty: number;
  unit: string;
  needName: string;
  locationName: string;
  estimatedDeliveryAt: string;
  status: PledgeStatus;
  notes: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Koordinatör teslim sözü operasyonu (migration 0044)
// ---------------------------------------------------------------------------

// Listedeki bir satır. İletişim alanları MASKELİ gelir ve maskesiz hâli bu tipte
// HİÇ bulunmaz — tam bilgi ayrı bir çağrının ayrı bir tipidir (`PledgeContact`).
export interface CoordPledgeRow {
  id: string;
  code: string;
  disasterId: string;
  disasterName: string;
  needId: string;
  needName: string;
  needPriority: PriorityKey;
  qty: number;
  unit: string;
  locationName: string;
  estimatedAt: string;
  status: PledgeStatus;
  // Gecikme dakikası SUNUCUDAN gelir; istemci saati kullanılmaz. null = gecikme yok.
  overdueMinutes: number | null;
  contactMasked: string;
  emailMasked: string;
  phoneMasked: string;
  city: string;
  hasPhone: boolean;
  submissionId: string | null;
  submissionCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoordPledgePage {
  rows: CoordPledgeRow[];
  total: number;
}

export interface PledgeSummary {
  today: number;
  transit: number;
  overdue: number;
  reported: number;
  cancelled: number;
  upcoming: number;
  active: number;   // rozet sayısı: iptal ve süresi dolmuş hariç
}

export type PledgeView =
  | 'all' | 'today' | 'upcoming' | 'overdue' | 'transit'
  | 'reported' | 'done' | 'cancelled' | 'expired';

export type PledgeSort =
  | 'operational' | 'due_asc' | 'overdue' | 'created_asc' | 'created_desc' | 'qty' | 'priority';

export interface PledgeFilter {
  view: PledgeView;
  disasterId: string;
  needId: string;
  locationId: string;
  city: string;
  search: string;
  from: string;
  to: string;
  sort: PledgeSort;
  page: number;
}

export interface CoordPledgeDetail extends CoordPledgeRow {
  disasterSlug: string;
  needUnit: string;
  needRequired: number;
  needVerified: number;
  needRemaining: number;
  notes: string;
  cancelReason: string;
  cancelledAt: string;
  submissionStatus: string;
  submissionQty: number | null;
  submissionVerified: number | null;
}

// Tam iletişim. Yalnızca gerekçeli, denetlenen bir çağrıdan döner ve istemcide
// uzun süre tutulmaz (ekran kapanınca düşer).
export interface PledgeContact {
  fullName: string;
  email: string;
  phone: string;
  city: string;
}

export interface LinkableSubmission {
  id: string;
  code: string;
  qty: number;
  unit: string;
  locationName: string;
  submittedAt: string;
  status: string;
  contributorMasked: string;
  qtyMatches: boolean;
}

// ---------------------------------------------------------------------------
// Saha güncellemeleri (migration 0038)
// ---------------------------------------------------------------------------
export type OperationUpdateType =
  | 'coordinator_update'
  | 'institution_update'
  | 'field_report'
  | 'delivery_update'
  | 'need_update'
  | 'safety_notice'
  | 'public_comment'
  | 'system_event';

export type OperationUpdateStatus =
  | 'draft' | 'moderation_pending' | 'published' | 'rejected' | 'hidden' | 'corrected' | 'archived';

export type OperationUpdateAuthorType =
  | 'coordinator' | 'institution' | 'volunteer' | 'user' | 'guest' | 'system';

export type UpdateReportReason =
  | 'wrong_info' | 'personal_data' | 'safety_risk' | 'spam'
  | 'inappropriate' | 'duplicate' | 'off_topic';

// Herkese açık akışta bir kart. KİŞİSEL VERİ TAŞIMAZ: `authorLabel` bir rol ya da
// doğrulanmış bir kurum adıdır, kişi adı değil (migration 0038 §Gizlilik Mimarisi).
export interface OperationUpdate {
  id: string;
  disasterId: string;
  type: OperationUpdateType;
  authorType: OperationUpdateAuthorType;
  authorLabel: string;
  organizationId: string | null;
  body: string;
  // 'coordinator_verified' değilse arayüz bunu kesin bilgi gibi göstermemeli
  // (rules/07 §Critical Distinctions).
  verified: boolean;
  relatedNeedId: string | null;
  relatedNeedName: string;
  relatedLocationId: string | null;
  relatedLocationName: string;
  approximateLocation: string;
  pinned: boolean;
  correctsUpdateId: string | null;
  photoCount: number;
  publishedAt: string;   // ISO
  time: string;          // display string
}

export interface OperationUpdateInput {
  disasterId: string;
  type: OperationUpdateType;
  body: string;
  relatedNeedId: string | null;
  relatedLocationId: string | null;
  approximateLocation: string;
  // Misafir için zorunlu: moderasyon geri dönüş yapabilsin ve kötüye kullanım
  // sınırlanabilsin diye. Hiçbir herkese açık yüzeye çıkmaz.
  name: string; email: string; phone: string;
}

// Galeri kaydı. `storagePath` ÖZEL bir kovadaki nesne yolu — tek başına erişim vermez;
// görüntü kısa ömürlü imzalı bir bağlantıyla açılır (migration 0038 §Depolama).
export interface OperationMedia {
  id: string;
  disasterId: string;
  updateId: string;
  storagePath: string;
  fileType: string;
  width: number | null;
  height: number | null;
  caption: string;
  capturedAt: string;
  locationText: string;
  authorLabel: string;
  updateType: OperationUpdateType;
  publishedAt: string;
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
  // Kararı veren koordinatör (migration 0031). null = karar verilmemiş YA DA 0031
  // öncesinde verilmiş; ikinci durumda kaydı yalnızca yönetici düzeltebilir.
  // Arayüz düğmeyi buna bakarak gösterir; asıl kural sunucuda (revise_submission).
  decidedBy?: string | null;
}

export interface LogEntry {
  id: string;
  disasterId: string;
  disasterName: string;  // denormalized for the cross-disaster activity feed
  disasterSlug: string;  // so the feed can link the entry to its operation page
  user: string;          // masked to "Köksal F." by the database, never a full name
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
  // '' , a shipped path, or 'upload:<object>.webp' in our own bucket. Never a remote
  // URL — see the check constraint in migration 0014.
  image: string;
}

// What a coordinator may write on an announcement. `author` is filled from the session,
// not typed: a hand-typed author on a public page is an unverifiable attribution.
export interface AnnouncementInput {
  disasterId: string;
  kind: string;
  accent: string;
  title: string;
  body: string;
  image: string;
}

export interface LocationInput {
  disasterId: string;
  name: string; address: string; hours: string; accepts: string;
  contact: string; phone: string; status: string;
  lat: number | null; lng: number | null;
}

// Verification action kinds handled by the data layer / RPC.
export type VerifyKind = 'approve' | 'partial' | 'reject' | 'info';
// Verilmiş bir kararın düzeltilmesi. 'undo' kaydı doğrulama kuyruğuna geri koyar.
export type RevisionKind = VerifyKind | 'undo';

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
  role: UserRole;              // platform role — only an admin may change it
  avatarUrl?: string | null;
  // Contact kept on the account so a contributor never retypes it (rules/01
  // §Registration Must Be Optional). Never rendered on a public surface.
  phone: string;
  city: string;
  district: string;
  // Which institution / association / volunteer group the person belongs to.
  // A self-declared membership is NOT proof of affiliation: it stays
  // "Doğrulama bekliyor" until a coordinator confirms it, exactly like an
  // organization record itself.
  orgId: string | null;
  orgTitle: string;            // their role inside that organization, free text
  orgVerified: boolean;        // coordinator-set only
}

// What the account form may write. Role, verification and id are excluded on
// purpose: a user cannot promote themselves or self-verify a membership.
export interface ProfileInput {
  fullName: string; phone: string; city: string; district: string;
  orgId: string | null; orgTitle: string;
}

// ---------------------------------------------------------------------------
// Home banner slides (koordinatör tarafından yönetilir)
// ---------------------------------------------------------------------------
// The slider is editorial content, not operational data, so it is managed from
// the panel rather than derived. `image` is a local path only — the same rule as
// organization logos: a remote URL supplied through the admin UI would render a
// third-party asset to every visitor (rules/03 §File Uploads).
export type SlideAction = 'reportDisaster' | 'howItWorks' | 'orgs' | 'home' | 'track';

export interface BannerSlide {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  action: SlideAction;
  image: string;               // '/banners/*.webp' or ''
  tint: string;                // hex, used by the generated fallback artwork
  active: boolean;
  sortOrder: number;
}

export interface BannerSlideInput {
  title: string; body: string; ctaLabel: string; action: SlideAction;
  image: string; tint: string; active: boolean; sortOrder: number;
}

// What a coordinator may set on an operation. Slug is derived, not typed: it carries
// the date so a place that burns twice never collides, and a hand-typed slug would
// break existing links.
export interface DisasterInput {
  name: string; type: DisasterType; province: string; district: string;
  // Koordinatörün seçtiği yerleşimler. Serbest metin değil: seçici, ilin gerçek
  // mahalle/köy listesinden okutuyor, böylece ad yazımı kayıtlar arasında tutarlı.
  settlements: string[];
  status: Disaster['status']; situation: string;
  openedByOrgId: string | null;
  // No volunteer figures here on purpose. "Kayıtlı gönüllü" and "şu an nöbette" are
  // counted from approved volunteer applications (migration 0017); a typed-in number
  // was a public figure with nobody behind it (CLAUDE.md §Source of Truth).
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

// The editable shape of an organization record. Status, isOfficial, logo and
// verification are absent on purpose: those are coordinator decisions, never part of
// what a visitor may propose.
export interface OrgEditable {
  name: string; kind: OrgKind; scope: OrgScope; province: string; district: string;
  services: string[]; description: string; website: string; email: string;
  phone: string; emergencyPhone: string; address: string;
}

// A correction request against an already-published record. It is a PROPOSAL: the
// record it targets is not touched until a coordinator applies it. Keeping the
// proposal separate is what makes "doğrulanmış" mean anything (rules/02 §Need
// Requests applies the same shape — a request is never automatically a record).
export interface OrgEditRequestInput {
  orgId: string;
  proposed: OrgEditable;
  changedFields: string[];   // which keys differ from the current record
  note: string;              // why — required
  submittedByName: string; submittedByEmail: string; submittedByPhone: string;
}

export type EditRequestStatus = 'Pending review' | 'Applied' | 'Rejected';

// A correction request as the coordinator reviews it. `current` is the record as it is
// RIGHT NOW, not as it was when the request was filed — a diff against a stale
// snapshot would ask the coordinator to approve a change that no longer applies.
// Requester contact travels here because this shape is coordinator-only (the review
// view is behind is_coordinator()); it must never reach a public screen.
export interface OrgEditRequest {
  id: string;
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  proposed: OrgEditable;
  current: OrgEditable;
  changedFields: string[];
  note: string;
  status: EditRequestStatus;
  reviewNote: string;
  submittedByName: string;
  submittedByEmail: string;
  submittedByPhone: string;
  createdLabel: string;
  reviewedLabel: string;
}

// ---------------------------------------------------------------------------
// Volunteer applications
// ---------------------------------------------------------------------------
// A volunteer application is a person offering to help, not a member of staff and not
// an account. Approving one does NOT create a login and does not move a disaster's
// `volunteers` counter — that counter is who is registered on site.
export type VolunteerStatus = 'Pending review' | 'Approved' | 'On hold' | 'Rejected' | 'Withdrawn';

export interface VolunteerInput {
  // See VolunteerApplication.standingConsent. Separate from `consent`, which is the
  // permission to store the contact details at all.
  standingConsent: boolean;
  disasterId: string | null;   // null = general pool
  fullName: string;
  phone: string;
  email: string;
  province: string;
  district: string;
  skills: string[];
  availability: string;
  note: string;
  consent: boolean;
}

// Coordinator-side shape. Carries contact details, so it never reaches a public screen.
export interface VolunteerApplication {
  id: string;
  // Human-readable reference, "GNL-XXXXXX". A number to quote on the phone, never a
  // credential: knowing it grants nothing (migration 0019, same rule as tracking codes).
  code: string;
  disasterId: string | null;
  disasterName: string;        // '' for the general pool
  fullName: string;
  phone: string;
  email: string;
  province: string;
  district: string;
  skills: string[];
  availability: string;
  note: string;
  status: VolunteerStatus;
  reviewNote: string;
  createdLabel: string;
  reviewedLabel: string;
  // On shift right now — coordinator-set on an approved application, and the only
  // source of the "şu an nöbette" figure. There is no automatic end to a shift, so
  // `shiftSinceLabel` is shown next to it rather than left implicit.
  onShift: boolean;
  shiftSinceLabel: string;
  // "Aktif gönüllü": standing permission for coordinators to make contact about a
  // disaster near this person without asking first. Off by default and revocable at any
  // time — including on an approved application, because a consent that cannot be taken
  // back is not a consent (rules/03 §Data Minimization).
  standingConsent: boolean;
}

// ---------------------------------------------------------------------------
// Staff (coordinator / admin) management
// ---------------------------------------------------------------------------
export type StaffRole = 'coordinator' | 'admin';

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
  createdLabel: string;
}

// A pending grant for an address that has no account yet. An invite is NOT access: it
// does nothing until that person completes sign-up and e-mail verification themselves.
export interface RoleInvite {
  email: string;
  role: StaffRole;
  note: string;
  createdLabel: string;
  // Membership that will be applied when this person signs up. Assigned by an admin, so
  // it lands already verified — unlike a membership the person declares themselves.
  orgId: string | null;
  orgName: string;      // resolved for display; '' when the id no longer matches a record
}

// What a coordinator may write on an organization record. Unlike OrgEditable this
// includes the fields only a coordinator decides.
export interface OrganizationSave {
  name: string; kind: OrgKind; scope: OrgScope; province: string; district: string;
  services: string[]; description: string; website: string; email: string;
  phone: string; emergencyPhone: string; address: string;
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
  // Etkilenen mahalle / köyler (migration 0034). BOŞ = kaydedilmedi; asla
  // "hiçbiri etkilenmedi" demek değil. Birleştirilen bildirimlerde birleşim alınır.
  settlements: string[];
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
  settlements: string[];
  occurredOn: string;
  description: string;
  name: string; email: string; phone: string;
}

// Confirming someone else's report ("Bildirimi Doğrula"). The contact details are
// required: an anonymous counter can be driven to any number by one person, and the
// threshold that opens an operation would then mean nothing. The e-mail is not
// verified — it de-duplicates, it does not prove identity — which is why the public
// figure stays "n kişi bildirdi" and never "doğrulandı".
export interface ReportConfirmInput {
  name: string;
  email: string;
  province: string;
  district: string;
}

export interface ReportConfirmResult {
  report: DisasterReport;
  // True when this address had already confirmed: the counter did not move.
  already: boolean;
  // Slug of the operation this confirmation just opened, '' when none was opened.
  createdSlug: string;
}

// The coordinator's view of the queue. Carries the moderation fields the public
// projection deliberately omits.
export interface ReportQueueItem extends DisasterReport {
  rejectReason: string;
  disasterId: string;      // '' until the report became an operation
  confirmations: number;   // rows in disaster_report_confirmations
  contacts: number;        // people who left contact details
  openedByCommunity: boolean;
  communityConfirmed: boolean;
}

// ---- İletişim (contact form) ------------------------------------------------
// A message from the public contact page. It is stored before it is mailed, so a
// provider failure loses the notification and not the message (migration 0025).
export type ContactTopic = 'Genel' | 'Kurum' | 'Gönüllü' | 'Basın' | 'Teknik' | 'Diğer';
export type ContactStatus = 'Yeni' | 'Okundu' | 'Kapatıldı';

export interface ContactInput {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  // Optional, and empty by default. A coordinator answering "kurumumuz destek olmak
  // istiyor" can act on a phone number and a city; nobody is asked for them.
  phone: string;
  province: string;
  district: string;
  website: string;
  /** Turnstile token. Meaningless in the browser: only the Edge Function can judge it. */
  captchaToken?: string;
}

// One stored file. `path` is an object path inside the private bucket, never a URL:
// the app decides where files come from, and the panel opens them through a short-lived
// signed URL (migration 0026).
export interface ContactAttachment {
  path: string;
  name: string;
  mime: string;
  bytes: number;
}

// What a coordinator sees in the panel queue. The e-mail is here because answering is
// the whole point of the page — it is coordinator-only data, never public.
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  phone: string;
  province: string;
  district: string;
  website: string;
  status: ContactStatus;
  createdAt: string;
  handledAt: string;
  files: ContactAttachment[];
}
