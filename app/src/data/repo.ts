import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, RevisionKind, DeliveryInput, PriorityKey, Organization, OrganizationInput,
  DisasterReport, DisasterReportInput, ReportConfirmInput, ReportConfirmResult, ReportQueueItem,
  BannerSlide, BannerSlideInput, SlideAction,
  OrgEditRequestInput, OrgEditable, OrgEditRequest, DisasterInput,
  OrganizationSave, OrgStatus, VolunteerInput, VolunteerApplication, VolunteerStatus,
  AnnouncementInput, LocationInput,
  StaffMember, StaffRole, RoleInvite,
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
  cat: string;              // Turkish category label — drives the card icon
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

// ---------------------------------------------------------------------------
// Coordinator dashboard (tüm afetler görünümü)
//
// Ayrı bir şekil, çünkü `Overview` HERKESE açık verinin projeksiyonu: ana sayfa
// onu okur. Aşağıdakiler koordinatöre özel sayılar (SLA aşımı, bekleyen gönüllü,
// doluluk) ve `coordinator_overview()` RPC'sinden gelir — is_coordinator() ile
// korunur (rules/05 §Public and Private Views).
//
// Aciliyet skoru BİLEREK sunucudan geliyor ve bileşenleri de yanında taşınıyor:
// tarayıcıda hesaplanan bir skor iki ekranda iki farklı sıralama üretir, ve
// bileşenleri görünmeyen bir skora koordinatör güvenmez.
// ---------------------------------------------------------------------------
export interface CoordDisasterRow {
  id: string;
  slug: string;
  name: string;
  province: string;
  region: string;
  type: string;
  status: Disaster['status'];
  openedAt: string;          // ISO date, '' when unknown
  demo: boolean;
  // Harita pini. null = ne afetin kendi koordinatı ne de bir teslim noktası var;
  // bu afet haritada gösterilmez, listede durur.
  lat: number | null;
  lng: number | null;
  criticalNeeds: number;
  urgentNeeds: number;
  openNeeds: number;
  completedNeeds: number;
  requiredTotal: number;
  verifiedTotal: number;
  pendingSubs: number;
  pendingUnits: number;
  slaBreached: number;       // bekleyen ve SLA saatini aşmış teslimat sayısı
  decidedToday: number;      // bugün doğrulanan/kısmen doğrulanan
  deliveryPoints: number;
  pointsAtCapacity: number;
  pointsCapacityUnknown: number;
  volunteers: number;
  onShift: number;
  pendingVolunteers: number;
  openNeedRequests: number;
  lastActivityAt: string | null;  // ISO
  urgency: number;                // 0-100, afethub_urgency_score()
}

export interface CoordOverview {
  disasters: CoordDisasterRow[];   // aciliyet sırasına göre, sunucudan
  slaHours: number;                // eşiği ekran da yazabilsin diye
}

// Birleşik iş kuyruğunun bir satırı. Bağışçının e-postası ve telefonu burada YOK:
// kuyruk satırı karar vermek için okunur, iletişim kurmak için değil.
export interface CoordQueueItem {
  id: string;
  code: string;
  disasterId: string;
  disasterSlug: string;
  disasterName: string;
  needId: string;
  needName: string;
  needPriority: PriorityKey;
  contributor: string;
  qty: number;
  unit: string;
  loc: string;
  note: string;
  hasPhoto: boolean;
  submittedAt: string;       // ISO
  waitingHours: number;
  slaBreached: boolean;
}

// Bekleyen bir teslimat kaç saat sonra gecikmiş sayılır. afethub_sla_hours() ile
// aynı sayı olmalı; yerel (Supabase'siz) mod bu sabiti kullanır.
export const SLA_HOURS = 24;

export interface CreateDeliveryResult {
  snapshot: Snapshot;
  code: string;
}

export interface Repo {
  readonly kind: 'local' | 'supabase';
  getSnapshot(slug?: string): Promise<Snapshot>;
  // National dashboard data (home page).
  getOverview(): Promise<Overview>;
  // Koordinatör paneli: tüm afetler tek çağrıda. Yedi operasyon için yedi ayrı
  // snapshot çağrısı panelin açılışını yavaşlatırdı (rules/05 §Performance).
  getCoordOverview(): Promise<CoordOverview>;
  // Bütün afetlerden bekleyen teslimatlar, en eski önce.
  getCoordQueue(limit: number): Promise<CoordQueueItem[]>;
  // Teslim noktası doluluğu. null = "bilinmiyor"a geri döndürür; ölçüm geri
  // alınabilir olmalı, yoksa yanlış girilen bir %90 orada kalır.
  setLocationCapacity(locationId: string, pct: number | null, note: string): Promise<Snapshot>;
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
  // Coordinator review of correction requests. `apply` takes the field keys the
  // coordinator accepted, not a whole record: a request may be right about the phone
  // number and wrong about the address, and forcing all-or-nothing would push
  // coordinators into rejecting useful corrections.
  // Just the number waiting, for the sidebar badge. Separate from listOrgEditRequests
  // on purpose: the list rows carry the requester's name, e-mail and phone, and a badge
  // must not be a reason to pull PII into the browser on every coordinator page
  // (rules/05 §Public and Private Views).
  countOpenOrgEditRequests(): Promise<number>;
  listOrgEditRequests(): Promise<OrgEditRequest[]>;
  // Coordinator-side organization management. `saveOrganization(null, …)` creates a
  // record that is published straight away — the coordinator creating it is the
  // reviewer, same reasoning as a coordinator-filed need.
  // `publishVerified` asks for a record that goes live already verified. Only an admin
  // may do that (a coordinator creating a verified "AFAD" out of nothing is the exact
  // affiliation claim the directory exists to prevent), and the RLS policy in migration
  // 0014 is what enforces it — the flag lets the two implementations agree on intent.
  saveOrganization(id: string | null, input: OrganizationSave, publishVerified: boolean): Promise<Organization[]>;
  // Verification is a decision about the institution, kept separate from editing its
  // fields: correcting a phone number must never imply "we checked who these people are".
  verifyOrganization(id: string, status: OrgStatus, reason: string): Promise<Organization[]>;
  applyOrgEditRequest(id: string, fields: string[], note: string): Promise<Organization[]>;
  rejectOrgEditRequest(id: string, note: string): Promise<void>;
  // Citizen disaster reports. `findSimilarReports` is a *suggestion* pass so the
  // reporter can confirm an existing report instead of creating a duplicate; the
  // merge rule itself is enforced when the report is written.
  findSimilarReports(input: DisasterReportInput): Promise<DisasterReport[]>;
  submitDisasterReport(input: DisasterReportInput): Promise<{ report: DisasterReport; merged: boolean }>;
  // Confirming carries contact details and is de-duplicated by e-mail server-side.
  confirmDisasterReport(reportId: string, who: ReportConfirmInput): Promise<ReportConfirmResult>;
  // Coordinator queue for community reports: publish one as an operation, or reject it
  // with a reason. Both are authorised server-side (migration 0016), never by the
  // screen being hard to reach.
  listReportQueue(): Promise<ReportQueueItem[]>;
  reviewDisasterReport(reportId: string, action: 'publish' | 'reject', reason: string): Promise<string>;
  // Clears the "koordinatör doğrulaması bekleniyor" label from a community operation.
  confirmCommunityDisaster(disasterId: string): Promise<void>;
  // The panel's system log: every recorded action, including the ones the public feed
  // never shows. Who may actually read the private rows is decided by RLS
  // (migration 0017), not by which screen calls this.
  listSystemLog(limit: number): Promise<LogEntry[]>;
  // Puts an approved volunteer on shift, or takes them off it. This is the only source
  // of the "şu an nöbette" figure.
  setVolunteerShift(applicationId: string, onShift: boolean): Promise<VolunteerApplication[]>;
  createDelivery(input: DeliveryInput): Promise<CreateDeliveryResult>;
  verifySubmission(subId: string, kind: VerifyKind, qty: number, reason: string): Promise<Snapshot>;
  // Verilmiş bir kararı düzeltir ya da geri alır (migration 0032). Yetki sunucuda:
  // kararı veren koordinatör veya yönetici.
  reviseSubmission(subId: string, kind: RevisionKind, qty: number, reason: string): Promise<Snapshot>;
  // Coordinator-managed operations. A new disaster goes live immediately: the person
  // creating it is the reviewer (rules/03 — authorisation is enforced by RLS, not here).
  saveDisaster(id: string | null, input: DisasterInput): Promise<Snapshot>;
  // Per-operation public content. Both change what the public page tells people to do,
  // so both are audited (triggers in migration 0014, not client-side inserts that a
  // forgotten second call could skip).
  saveAnnouncement(id: string | null, input: AnnouncementInput, author: string): Promise<Snapshot>;
  deleteAnnouncement(id: string): Promise<Snapshot>;
  saveLocation(id: string | null, input: LocationInput): Promise<Snapshot>;
  deleteLocation(id: string): Promise<Snapshot>;
  publishNeed(p: NeedPayload): Promise<Snapshot>;
  bumpNeed(needId: string): Promise<Snapshot>;
  togglePause(needId: string): Promise<Snapshot>;
  submitNeedRequest(p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }): Promise<{ snapshot: Snapshot; code: string }>;
  trackSubmission(code: string, email: string): Promise<Submission | null>;
  // Every submission made with the signed-in account's e-mail. Takes no argument on
  // purpose: the address comes from the session server-side, so one account can never
  // list another's submissions by guessing an e-mail.
  listMySubmissions(): Promise<Submission[]>;
  // Volunteer applications. Submitting needs no account; reading needs a coordinator,
  // because every row is a named person with a phone number.
  // Returns the new application's id: the receipt e-mail is addressed by id, never by an
  // address the browser supplies (migration 0018 + send-volunteer-receipt).
  submitVolunteerApplication(input: VolunteerInput): Promise<string>;
  listVolunteerApplications(): Promise<VolunteerApplication[]>;
  // The signed-in visitor's OWN applications, matched server-side on their account
  // e-mail. Guests are not covered on purpose: without an account there is nothing to
  // match on but a typed address, and that would be a disclosure endpoint.
  listMyVolunteerApplications(): Promise<VolunteerApplication[]>;
  updateMyVolunteerApplication(id: string, input: VolunteerInput): Promise<VolunteerApplication[]>;
  withdrawMyVolunteerApplication(id: string): Promise<VolunteerApplication[]>;
  // The standing "call me about nearby disasters" permission. One answer for the whole
  // person, not per application (migration 0022), and available in every status — it is
  // the one control an approved volunteer keeps.
  setMyVolunteerConsent(on: boolean): Promise<VolunteerApplication[]>;
  reviewVolunteerApplication(id: string, status: VolunteerStatus, note: string): Promise<VolunteerApplication[]>;
  // Staff. Admin-only, enforced by is_admin() inside the RPCs — not by the screen being
  // hard to reach (rules/03 §Server-Side Authorization).
  listStaff(): Promise<{ staff: StaffMember[]; invites: RoleInvite[] }>;
  // Returns 'granted' when an existing account was changed, 'invited' when the grant was
  // stored for a future sign-up. The browser cannot create auth users: that needs the
  // service-role key, which must never ship to a client (rules/03 §Secrets).
  // `orgId` is an optional membership. Assigning one from here IS its verification: an
  // admin picking from the verified list is the check that `org_verified` records, which
  // is why a self-declared membership from the account page stays unverified.
  grantStaffRole(email: string, role: StaffRole, note: string, orgId: string | null): Promise<'granted' | 'invited'>;
  revokeStaffRole(userId: string): Promise<void>;
  cancelRoleInvite(email: string): Promise<void>;
}

// Aciliyet skoru — afethub_urgency_score() (migration 0025, 0027 ile güncellendi)
// ile AYNI formül.
// Yetkili hesap veritabanında; bu kopya yalnızca Supabase'siz yerel mod içindir ve
// ikisi birlikte değiştirilmelidir. Ağırlıklar migration dosyasında gerekçeleriyle
// yazılı; burada tekrar edilmiyor ki iki açıklama birbirinden ayrı düşmesin.
export function urgencyScore(x: {
  status: Disaster['status'];
  critical: number; urgent: number; pending: number; slaBreached: number;
  deliveryPoints: number; required: number; verified: number;
}): number {
  // Kalan iş hacmi logaritmik ölçekte: 100 kalem 6, 1.000 kalem 12, 10.000 kalem 18
  // puan. Doğrusal olsaydı tek bir büyük operasyon diğer bütün bileşenleri ezerdi.
  const volume = Math.max(0, Math.min(24,
    Math.round((Math.log10(Math.max(1, x.required - x.verified)) - 1) * 6)));
  const raw = x.critical * 10
    + x.urgent * 3
    + x.pending * 2
    + x.slaBreached * 5
    + (x.status === 'Active' && x.deliveryPoints === 0 ? 15 : 0)
    + (x.required > 0 ? Math.round((1 - Math.min(1, x.verified / x.required)) * 18) : 0)
    + volume;
  const capped = x.status === 'Active' ? raw : Math.min(raw, 20);
  return Math.max(0, Math.min(100, capped));
}

// Tek bir metin alanından ilçe listesi. Koordinatör "Bozkurt ve İnebolu" ya da
// "Bozkurt, İnebolu" yazabiliyor; migration 0026'daki geriye doldurma da aynı kuralı
// uyguluyor — ikisi birlikte değişmeli, yoksa aynı metin iki farklı listeye çevrilir.
export function splitDistricts(value: string): string[] {
  return (value ?? '')
    .split(/\s+ve\s+|,/)
    .map((x) => x.trim())
    .filter(Boolean);
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

// What a volunteer can offer. A fixed list rather than free text so a coordinator can
// filter on it; "Diğer" plus the note field covers everything else. Shared with the
// coordinator queue so the two never drift apart.
export const VOLUNTEER_SKILLS = [
  'Sahada yardım dağıtımı', 'Depo ve tasnif', 'Nakliye / araç', 'Sağlık personeli',
  'Psikososyal destek', 'Çeviri', 'Yemek ve ikram', 'Hayvan bakımı',
  'Teknik (elektrik, tesisat, inşaat)', 'İletişim ve kayıt', 'Diğer',
] as const;

export const VOLUNTEER_AVAILABILITY = [
  'Hafta içi gündüz', 'Hafta içi akşam', 'Hafta sonu', 'Tam zamanlı', 'Uzaktan',
] as const;

// Which editable fields differ between the published record and the proposal.
// Shared so the UI badge, the validation and the stored `changed_fields` can never
// disagree about what "changed" means.
export const ORG_EDITABLE_KEYS = [
  'name', 'kind', 'scope', 'province', 'district', 'services',
  'description', 'website', 'email', 'phone', 'emergencyPhone', 'address',
] as const;

// The editable projection of a published record. Used both to pre-fill the public
// correction form and to render the "current value" side of the coordinator's diff, so
// the two can never disagree about what a field currently holds.
export function orgEditableFrom(o: Organization): OrgEditable {
  return {
    name: o.name, kind: o.kind, scope: o.scope, province: o.province, district: o.district,
    services: o.services.slice(), description: o.description, website: o.website,
    email: o.email, phone: o.phone, emergencyPhone: o.emergencyPhone, address: o.address,
  };
}

// A field's value as one comparable string. Both sides of the diff go through this, so
// a services list reordered but otherwise identical is not reported as a change.
export function orgFieldText(v: OrgEditable, k: string): string {
  const raw = (v as unknown as Record<string, unknown>)[k];
  return Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
}

export function changedOrgFields(current: Organization, proposed: OrgEditable): string[] {
  const norm = (v: unknown): string => (Array.isArray(v)
    ? v.slice().sort().join('|')
    : String(v ?? '').trim());
  return ORG_EDITABLE_KEYS.filter((k) => norm(current[k]) !== norm(proposed[k]));
}

// Slug for a new operation: name + the day it was opened, so two fires in the same
// place in different years never collide. Derived, never typed by hand.
export function disasterSlug(name: string, openedOn: Date): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  const base = name.toLocaleLowerCase('tr')
    .replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const dd = String(openedOn.getDate()).padStart(2, '0');
  const mm = String(openedOn.getMonth() + 1).padStart(2, '0');
  return `${base}-${dd}-${mm}-${openedOn.getFullYear()}`;
}

export const REPORT_DAY_WINDOW = 2;

// What the public live feed may show. Mirrors audit_is_public() in migration 0016,
// which is where it is actually enforced — this copy exists so the in-memory local
// mode behaves like production instead of teaching a laxer rule. Allow-list, not
// deny-list: an action nobody listed stays coordinator-only.
const PUBLIC_AUDIT_ACTIONS = new Set([
  'İhtiyaç oluşturuldu', 'Miktar güncellendi', 'İhtiyaç tamamlandı', 'Need completed',
  'Teslimat bildirildi', 'Teslimat doğrulandı', 'Teslimat kısmen doğrulandı', 'Teslimat reddedildi',
  'Delivery verified', 'Delivery partially verified', 'Delivery rejected',
  'Duyuru yayınlandı', 'Duyuru güncellendi', 'Duyuru kaldırıldı',
  'Teslim noktası eklendi', 'Teslim noktası güncellendi', 'Teslim noktası kaldırıldı',
  'Afet oluşturuldu', 'Afet durumu güncellendi', 'Operasyon açıldı', 'Afet kaydı güncellendi',
  'Topluluk afeti oluşturuldu', 'Topluluk afeti doğrulandı',
  'Kurum eklendi', 'Kurum doğrulandı',
  'Afet bildirimi gönderildi', 'Afet bildirimi birleştirildi', 'Afet bildirimi doğrulandı',
]);

export const isPublicAuditAction = (action: string): boolean => PUBLIC_AUDIT_ACTIONS.has(action);

// Eski kayıtlar için İngilizce → Türkçe aksiyon adı.
//
// `verify_submission` migration 0031'e kadar denetim kaydına İngilizce yazıyordu.
// O satırlar DÜZELTİLEMEZ: `audit_log` bir immutability trigger'ı taşıyor ve
// denetim kaydının geriye dönük değiştirilmemesi kasıtlı — bir olay kaydı, sonradan
// düzeltilebiliyorsa kayıt değildir. Bu yüzden çeviri görüntüleme anında yapılır ve
// saklanan satıra dokunulmaz.
//
// Yeni satırlar zaten Türkçe geliyor; bu eşleme yalnızca geçmişi okunur kılıyor ve
// listede aynı olayın iki ayrı adla görünmesini engelliyor.
const LEGACY_ACTION_TR: Record<string, string> = {
  'Delivery verified': 'Teslimat doğrulandı',
  'Delivery partially verified': 'Teslimat kısmen doğrulandı',
  'Delivery rejected': 'Teslimat reddedildi',
  'Information requested': 'Bilgi istendi',
  'Need completed': 'İhtiyaç tamamlandı',
};

export const auditActionLabel = (action: string): string => LEGACY_ACTION_TR[action] ?? action;

// Aynı satırların İngilizce detay metni ("30 of 30 kutu", "· Storm"). Yalnızca
// TANINAN kalıplar çevrilir; tanınmayan metin olduğu gibi bırakılır — anlamadığı bir
// cümleyi tahminle Türkçeleştiren bir eşleyici, kaydı bozar.
const EN_DISASTER_TYPE: Record<string, string> = {
  Wildfire: 'Orman Yangını', Flood: 'Sel ve Taşkın', Earthquake: 'Deprem',
  Storm: 'Fırtına', Evacuation: 'Tahliye', Other: 'Diğer',
};

export const auditDetailLabel = (detail: string): string =>
  detail
    // "30 of 30 kutu" → "30 kutu bildirildi, 30 doğrulandı". Birim ayrılmadan
    // kalmalı: "30 bildirildi, 30 doğrulandı · kutu" cümle olmaktan çıkıyor.
    .replace(/(\d+)\s+of\s+(\d+)\s+(\S+)/g, '$2 $3 bildirildi, $1 doğrulandı')
    // Afet türü yalnızca "· <Tür>" biçiminde ve satırın SONUNDAYSA çevrilir; metnin
    // ortasındaki aynı kelime bir yer adı olabilir.
    .replace(/·\s*(Wildfire|Flood|Earthquake|Storm|Evacuation|Other)\s*$/,
      (_m, t: string) => `· ${EN_DISASTER_TYPE[t] ?? t}`);

// Satırın "kim" sütunu.
//
// Topluluk doğrulamalarında ("Afet bildirimi doğrulandı") aktör bir koordinatör
// değil, bildirimi teyit eden VATANDAŞ. Adı herkese açık akışta yayınlamak, bir
// afeti bildiren kişiyi ismiyle teşhir etmek olurdu — migration 0024 zaten tam bunun
// için `audit_log_public` görünümünü maskeliyor ve satıra 'Misafir' / 'Topluluk'
// yazıyor.
//
// Anlamlı bilgi kişi değil, O ANA KADAR KAÇ KİŞİNİN aynı olayı bildirdiği: bir afet
// operasyonu bu sayı eşiği geçince kendiliğinden açılıyor. O sayı zaten satırda
// duruyor ("4 kişi bildirdi"), yalnızca yanlış sütunda görünüyordu.
export const auditActorLabel = (action: string, actor: string, newValue: string): string =>
  action === 'Afet bildirimi doğrulandı' && newValue.trim() ? newValue.trim() : actor;

export const auditValueLabel = (value: string): string =>
  value.replace(/^(\d+)\s+verified$/, '$1 doğrulanmış')
    .replace(/^Pending verification$/, 'Doğrulama bekliyor')
    .replace(/^Verified$/, 'Doğrulandı')
    .replace(/^Partially verified$/, 'Kısmen doğrulandı')
    .replace(/^Rejected$/, 'Reddedildi')
    .replace(/^Information requested$/, 'Bilgi istendi')
    .replace(/^Active$/, 'Aktif')
    .replace(/^Completed$/, 'Tamamlandı');

// How many people must report the same event before an operation opens by itself.
// Mirrors community_report_threshold() in migration 0016 — change both together, or
// the card will promise a number the database does not act on.
export const COMMUNITY_THRESHOLD = 10;

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
