import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContactInput, ContactMessage, ContactStatus, ContactAttachment,
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, RevisionKind, DeliveryInput, PriorityKey, StatusKey, DisasterType,
  Organization, OrganizationInput, OrgStatus, OrgKind, OrgScope,
  DisasterReport, DisasterReportInput, ReportStatus, ReportConfirmInput, ReportConfirmResult,
  ReportQueueItem, BannerSlide, BannerSlideInput, SlideAction,
  OrgEditRequestInput, OrgEditRequest, OrgEditable, EditRequestStatus, DisasterInput,
  OrganizationSave, VolunteerInput, VolunteerApplication, VolunteerStatus,
  AnnouncementInput, LocationInput,
  StaffMember, StaffRole, RoleInvite, OperationStage,
  OperationUpdate, OperationUpdateType, OperationMedia,
} from '../types';
import type {
  Repo, Snapshot, CreateDeliveryResult, Overview, DisasterCard, TopNeed,
  CoordOverview, CoordDisasterRow, CoordQueueItem,
} from './repo';
import type { NeedPayload } from '../needForm';
import { genCode, genNrq, isSameEvent, REPORT_DAY_WINDOW, isLocalSlideImage, disasterSlug, isPublicAuditAction, SLA_HOURS, splitDistricts, auditActionLabel, auditDetailLabel, auditValueLabel, auditActorLabel } from './repo';
import { PRI } from '../theme';
import { submitContactViaFunction } from './sendEmail';
import { RefreshFailedError } from '../util';

// Turkish relative-time formatter for DB timestamps.
function rel(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

// Supabase implementation. Verification goes through the verify_submission RPC
// (transactional, invariant-enforcing). Mutations re-read the snapshot.
export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;
  private db: SupabaseClient;
  constructor(db: SupabaseClient) { this.db = db; }

  // Kısa ömürlü görüntüleme bağlantısı. Üretilemeyen yol sonuçta yer almaz: kırık bir
  // çerçeve göstermektense fotoğrafı hiç göstermemek doğru (rules/04 §Empty States).
  async signMedia(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const { data, error } = await this.db.storage.from('operation-media').createSignedUrls(paths, 600);
    if (error) throw error;
    const out: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
    }
    return out;
  }

  async getSnapshot(slug?: string): Promise<Snapshot> {
    const [ds, loc, ne, su, lg, an, pl, up, md] = await Promise.all([
      // The overview view, not the table: volunteer figures are derived there from real
      // approved applications (migration 0017). Reading `disasters` directly would show
      // the stale typed-in numbers the table still carries.
      this.db.from('disaster_overview').select('*'),
      this.db.from('locations').select('*'),
      this.db.from('needs').select('*'),
      this.db.from('submissions').select('*').order('submitted_at', { ascending: false }),
      // The masked, allow-listed view — not the table. The table now answers only to an
      // admin, so a visitor's request no longer carries anyone's surname (migration 0024).
      this.db.from('audit_log_public').select('*').order('created_at', { ascending: false }),
      this.db.from('announcements').select('*').order('created_at', { ascending: false }),
      // Kişiye bağlanamayan söz toplamı. Tablonun kendisi herkese açık okunmuyor;
      // bu görünüm yalnızca sayı taşıyor (migration 0037).
      this.db.from('need_pledge_totals').select('need_id, pledged_qty'),
      // Yalnızca yayınlanmış ve moderasyondan geçmiş kayıtlar; görünümün kendisi
      // filtreliyor ve kişisel veri taşımıyor (migration 0038). Sınırlı: akışın
      // tamamını her sayfa açılışında indirmek gereksiz (rules/06 §Unbounded queries).
      this.db.from('operation_updates_public').select('*')
        .order('published_at', { ascending: false }).limit(60),
      this.db.from('operation_media_public').select('*')
        .order('published_at', { ascending: false }).limit(40),
    ]);

    // Görünüm henüz uygulanmamış bir veritabanında sorgu hata döndürür; bu durumda
    // söz toplamı sıfır kabul edilir ve sayfa yine açılır. Sessiz bir catch değil:
    // eksik olan bilgi ekranda "0" olarak değil, hiç gösterilmeyerek karşılık bulur.
    const pledgeByNeed = new Map<string, number>(
      (pl.error ? [] : (pl.data ?? [])).map((r: Record<string, unknown>) =>
        [String(r.need_id), Number(r.pledged_qty ?? 0)] as const),
    );

    const mapDisaster = (r: Record<string, unknown>): Disaster => ({
      id: String(r.id), slug: String(r.slug ?? ''),
      legacySlugs: Array.isArray(r.legacy_slugs) ? (r.legacy_slugs as string[]) : [],
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      settlements: Array.isArray(r.settlements) ? (r.settlements as string[]) : [],
      name: String(r.name), region: String(r.region ?? ''), province: String(r.province ?? ''),
      type: (r.type as DisasterType) ?? 'Other',
      status: (r.status as Disaster['status']) ?? 'Active', situation: String(r.situation ?? ''),
      openedAt: String(r.opened_at ?? ''), updatedLabel: r.updated_at ? rel(String(r.updated_at)) : '',
      volunteers: Number(r.volunteers ?? 0), onShift: Number(r.on_shift ?? 0),
      demo: r.is_demo === true,
      openedByOrgId: r.opened_by_org_id ? String(r.opened_by_org_id) : null,
      openedByCommunity: r.opened_by_community === true,
      communityConfirmed: r.community_confirmed_at != null,
      // Aşama YOKSA null kalır ve ekranda "belirtilmedi" diye okunur; bir varsayılan
      // atamak koordinatörün söylemediği bir şeyi yazmak olurdu (migration 0036).
      operationStage: (r.operation_stage as OperationStage | null) ?? null,
      operationStageNote: String(r.operation_stage_note ?? ''),
      operationStageSetAt: r.operation_stage_set_at ? rel(String(r.operation_stage_set_at)) : '',
    });
    const disasters: Disaster[] = (ds.data ?? []).map(mapDisaster);
    const disaster = disasters.find((x) => x.slug === slug)
      ?? disasters.find((x) => (x.legacySlugs ?? []).includes(slug ?? ''))
      ?? disasters.find((x) => x.status === 'Active') ?? disasters[0]
      ?? {
        id: 'd1', slug: '', name: '', region: '', province: '', type: 'Other' as const,
        status: 'Active' as const, situation: '', openedAt: '', updatedLabel: '', volunteers: 0, onShift: 0,
        openedByOrgId: null,
      };
    const byId = new Map(disasters.map((x) => [x.id, x] as const));

    const locations: Location[] = (loc.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id), name: String(r.name), address: String(r.address), hours: String(r.hours),
      accepts: String(r.accepts), contact: String(r.contact_name), phone: String(r.contact_phone),
      status: String(r.status), statusTone: String(r.status).match(/00/) ? 'yellow' : 'green',
      coords: r.lat != null && r.lng != null ? `${r.lat}° K, ${r.lng}° D` : '',
      lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0),
      capacityPct: r.capacity_pct == null ? null : Number(r.capacity_pct),
      capacityNote: String(r.capacity_note ?? ''),
      capacityUpdated: r.capacity_updated_at ? rel(String(r.capacity_updated_at)) : '',
    }));

    const needs: Need[] = (ne.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id),
      disasterName: byId.get(String(r.disaster_id))?.name ?? disaster.name,
      disasterSlug: byId.get(String(r.disaster_id))?.slug ?? disaster.slug,
      name: String(r.name), cat: String(r.category),
      priority: r.priority as PriorityKey, required: Number(r.required_qty),
      verified: Number(r.verified_qty), pending: Number(r.pending_qty), unit: String(r.unit),
      updated: rel(String(r.updated_at)), loc: String(r.location_name),
      details: (r.details as Record<string, string>) ?? {},
      featuredRank: r.featured_rank == null ? null : Number(r.featured_rank),
      // Teslim sözü toplamı AYRI bir görünümden geliyor ve `verified` / `pending` ile
      // hiçbir aritmetiğe girmiyor: bir söz kalan miktarı azaltmaz (migration 0037).
      pledged: Number(pledgeByNeed.get(String(r.id)) ?? 0),
    }));

    const subs: Submission[] = (su.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), code: String(r.code), contributor: String(r.contributor_name),
      city: String(r.city), needId: String(r.need_id), qty: Number(r.qty), unit: String(r.unit),
      loc: String(r.location_name), submitted: rel(String(r.submitted_at)),
      status: r.status as StatusKey, verifiedQty: r.verified_qty == null ? null : Number(r.verified_qty),
      note: String(r.note), photoUrl: r.photo_url ? String(r.photo_url) : null,
      decidedBy: r.decided_by ? String(r.decided_by) : null,
    }));

    // The public feed reads the same for everyone. RLS lets an admin read private rows
    // too (role grants, moderation), and those belong in the panel's system log — not in
    // the strip a visitor is looking at. Filtering here keeps one feed, one meaning.
    const log: LogEntry[] = (lg.data ?? []).filter((r: Record<string, unknown>) =>
      String(r.disaster_id) === disaster.id && isPublicAuditAction(String(r.action))).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id ?? ''),
      disasterName: byId.get(String(r.disaster_id))?.name ?? '',
      disasterSlug: byId.get(String(r.disaster_id))?.slug ?? '',
      // Türkçeleştirme eşleme katmanında, TEK yerde: 0031 öncesi satırlar İngilizce
      // ve `audit_log` değiştirilemez. Ekranların her biri kendi çevirisini yapsaydı,
      // aynı olay listede iki ayrı adla görünürdü.
      user: auditActorLabel(String(r.action), String(r.actor), String(r.new_value)),
      action: auditActionLabel(String(r.action)),
      detail: auditDetailLabel(String(r.detail)),
      oldValue: auditValueLabel(String(r.old_value)), newValue: auditValueLabel(String(r.new_value)),
      time: rel(String(r.created_at)),
      color: String(r.color),
    }));

    const announcements: Announcement[] = (an.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id ?? ''), kind: String(r.kind), accent: String(r.accent), time: rel(String(r.created_at)),
      author: String(r.author), title: String(r.title), body: String(r.body),
      image: String(r.image ?? ''),
    }));

    const verifiedTotal = subs.filter((s) => s.status === 'Verified' || s.status === 'Partially verified').length;

    // Görünümler henüz uygulanmamışsa (`up.error` / `md.error`) bölüm BOŞ kalır ve
    // ekran "henüz yayımlanmış içerik yok" der. Sessiz bir catch değil: eksik olan
    // içerik uydurulmuyor, yokluğu söyleniyor.
    const updates: OperationUpdate[] = (up.error ? [] : (up.data ?? []))
      .filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id), disasterId: String(r.disaster_id),
        type: r.update_type as OperationUpdateType,
        authorType: r.author_type as OperationUpdate['authorType'],
        authorLabel: String(r.author_label ?? ''),
        organizationId: r.organization_id ? String(r.organization_id) : null,
        body: String(r.body ?? ''),
        verified: r.verification_status === 'coordinator_verified',
        relatedNeedId: r.related_need_id ? String(r.related_need_id) : null,
        relatedNeedName: String(r.related_need_name ?? ''),
        relatedLocationId: r.related_delivery_location_id ? String(r.related_delivery_location_id) : null,
        relatedLocationName: String(r.related_location_name ?? ''),
        approximateLocation: String(r.approximate_location ?? ''),
        pinned: r.is_pinned === true,
        correctsUpdateId: r.corrects_update_id ? String(r.corrects_update_id) : null,
        photoCount: Number(r.photo_count ?? 0),
        publishedAt: String(r.published_at ?? r.created_at ?? ''),
        time: rel(String(r.published_at ?? r.created_at ?? new Date().toISOString())),
      }));

    const media: OperationMedia[] = (md.error ? [] : (md.data ?? []))
      .filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id), disasterId: String(r.disaster_id),
        updateId: String(r.operation_update_id),
        storagePath: String(r.storage_path), fileType: String(r.file_type ?? ''),
        width: r.width == null ? null : Number(r.width),
        height: r.height == null ? null : Number(r.height),
        caption: String(r.caption ?? ''),
        capturedAt: String(r.captured_at ?? ''),
        locationText: String(r.public_location_text ?? ''),
        authorLabel: String(r.author_label ?? ''),
        updateType: r.update_type as OperationUpdateType,
        publishedAt: String(r.published_at ?? ''),
      }));

    return { disaster, disasters, locations, needs, subs, log, announcements, verifiedTotal, updates, media };
  }

  // Reads the `disaster_overview` view (migration 0002) so the national counters
  // come from SQL, not from the browser. Falls back to per-row aggregation when
  // the view is not applied yet.
  async getOverview(): Promise<Overview> {
    const [ov, ne, ds] = await Promise.all([
      this.db.from('disaster_overview').select('*'),
      this.db.from('needs').select('*'),
      this.db.from('disaster_overview').select('*'),
    ]);
    const rows = ov.error ? null : (ov.data ?? []);

    const mapDisaster = (r: Record<string, unknown>): Disaster => ({
      id: String(r.id), slug: String(r.slug ?? ''),
      legacySlugs: Array.isArray(r.legacy_slugs) ? (r.legacy_slugs as string[]) : [],
      districts: Array.isArray(r.districts) ? (r.districts as string[]) : [],
      settlements: Array.isArray(r.settlements) ? (r.settlements as string[]) : [],
      name: String(r.name), region: String(r.region ?? ''), province: String(r.province ?? ''),
      type: (r.type as DisasterType) ?? 'Other',
      status: (r.status as Disaster['status']) ?? 'Active', situation: String(r.situation ?? ''),
      openedAt: String(r.opened_at ?? ''), updatedLabel: r.updated_at ? rel(String(r.updated_at)) : '',
      volunteers: Number(r.volunteers ?? 0), onShift: Number(r.on_shift ?? 0),
      demo: r.is_demo === true,
      openedByOrgId: r.opened_by_org_id ? String(r.opened_by_org_id) : null,
      openedByCommunity: r.opened_by_community === true,
      communityConfirmed: r.community_confirmed_at != null,
      // Aşama YOKSA null kalır ve ekranda "belirtilmedi" diye okunur; bir varsayılan
      // atamak koordinatörün söylemediği bir şeyi yazmak olurdu (migration 0036).
      operationStage: (r.operation_stage as OperationStage | null) ?? null,
      operationStageNote: String(r.operation_stage_note ?? ''),
      operationStageSetAt: r.operation_stage_set_at ? rel(String(r.operation_stage_set_at)) : '',
    });

    const disasters: Disaster[] = (rows ?? ds.data ?? []).map(mapDisaster);
    const allNeeds = (ne.data ?? []) as Record<string, unknown>[];
    const openOf = (id: string) => allNeeds
      .filter((n) => String(n.disaster_id) === id && Number(n.required_qty) - Number(n.verified_qty) > 0);

    const topOf = (d: Disaster, limit: number): TopNeed[] => openOf(d.id)
      .map((n) => ({
        id: String(n.id), name: String(n.name), priority: n.priority as PriorityKey,
        cat: String(n.category ?? ''),
        remaining: Math.max(0, Number(n.required_qty) - Number(n.verified_qty)), unit: String(n.unit),
        disasterId: d.id, disasterName: d.name, disasterSlug: d.slug,
      }))
      .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank
        || y.remaining - x.remaining)
      .slice(0, limit);

    const rowFor = (id: string) => (rows ?? []).find((r) => String(r.id) === id) as Record<string, unknown> | undefined;

    // Görünüm okunamadığında kullanılan yedek toplam. `allNeeds` zaten indirilmiş
    // durumda; ikinci bir istek atmıyor.
    const sumOf = (disasterId: string, col: string) => allNeeds
      .filter((n) => String(n.disaster_id) === disasterId)
      .reduce((x, n) => x + Number(n[col] ?? 0), 0);

    const cards: DisasterCard[] = disasters.map((d) => {
      const r = rowFor(d.id);
      return {
        disaster: d,
        activeNeeds: r ? Number(r.active_needs) : openOf(d.id).length,
        completedNeeds: r ? Number(r.completed_needs) : 0,
        pendingSubs: r ? Number(r.pending_submissions) : 0,
        pendingUnits: r ? Number(r.pending_units) : 0,
        verifiedSubs: r ? Number(r.verified_submissions) : 0,
        deliveryPoints: r ? Number(r.delivery_points) : 0,
        topNeeds: topOf(d, 2),
        // Miktar toplamları görünümden gelir (migration 0035). Görünüm okunamadıysa
        // `needs` tablosundan türetilir — ama bu bir YEDEK yol, tercih değil: aynı
        // toplamı iki yerde hesaplamak, ikisinin ayrışması demektir. Yedek çalıştığında
        // ekranda sayı yerine boşluk kalmasın diye var.
        requiredTotal: r ? Number(r.required_total ?? 0) : sumOf(d.id, 'required_qty'),
        verifiedTotal: r ? Number(r.verified_total ?? 0) : sumOf(d.id, 'verified_qty'),
        remainingTotal: r ? Number(r.remaining_total ?? 0) : sumOf(d.id, 'remaining_qty'),
      };
    }).sort((x, y) => (x.disaster.status === 'Active' ? 0 : 1) - (y.disaster.status === 'Active' ? 0 : 1));

    const active = cards.filter((c) => c.disaster.status === 'Active');
    const [lg, rep] = await Promise.all([
      // The masked public view (migration 0024): already filtered to the allow-list, so
      // there is nothing here to over-fetch and drop.
      this.db.from('audit_log_public').select('*').order('created_at', { ascending: false }).limit(40),
      this.db.from('disaster_reports_public').select('*').eq('status', 'Pending verification').limit(12),
    ]);
    const byId = new Map(disasters.map((d) => [d.id, d] as const));

    return {
      disasters: cards,
      totals: {
        activeDisasters: active.length,
        activeNeeds: active.reduce((x, c) => x + c.activeNeeds, 0),
        verifiedSubs: active.reduce((x, c) => x + c.verifiedSubs, 0),
        pendingSubs: active.reduce((x, c) => x + c.pendingSubs, 0),
        volunteers: active.reduce((x, c) => x + c.disaster.volunteers, 0),
        deliveryPoints: active.reduce((x, c) => x + c.deliveryPoints, 0),
      },
      // Same rule as the snapshot: the national feed is the public one, for everyone.
      log: (lg.data ?? []).filter((r: Record<string, unknown>) => isPublicAuditAction(String(r.action))).slice(0, 12).map((r: Record<string, unknown>) => ({
        id: String(r.id), disasterId: String(r.disaster_id ?? ''),
        disasterName: byId.get(String(r.disaster_id))?.name ?? '',
        disasterSlug: byId.get(String(r.disaster_id))?.slug ?? '',
        user: auditActorLabel(String(r.action), String(r.actor), String(r.new_value)),
      action: auditActionLabel(String(r.action)),
        detail: auditDetailLabel(String(r.detail)),
        oldValue: auditValueLabel(String(r.old_value)), newValue: auditValueLabel(String(r.new_value)),
        time: rel(String(r.created_at)), color: String(r.color),
      })),
      urgent: active.flatMap((c) => topOf(c.disaster, 3))
        .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank)
        .slice(0, 6),
      reports: (rep.data ?? []).map(this.mapReport).sort((x, y) => y.reportCount - x.reportCount),
      demo: cards.some((c) => c.disaster.demo === true),
    };
  }

  // ---- Coordinator dashboard ----------------------------------------------
  // Both calls are RPCs guarded by is_coordinator() inside the database
  // (migration 0025). A visitor's call is refused there, not by this screen being
  // hard to reach (rules/03 §Server-Side Authorization).
  //
  // Numbers are NOT recomputed here. Whatever SQL returned is what the panel shows,
  // so the dashboard and the operation page can never disagree about a count
  // (CLAUDE.md §Source of Truth).
  async getCoordOverview(): Promise<CoordOverview> {
    const { data, error } = await this.db.rpc('coordinator_overview');
    if (error) throw error;
    const num = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const coord = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const disasters: CoordDisasterRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.disaster_id),
      slug: String(r.slug ?? ''),
      name: String(r.name ?? ''),
      province: String(r.province ?? ''),
      region: String(r.region ?? ''),
      type: String(r.type ?? 'Other'),
      status: (r.status as CoordDisasterRow['status']) ?? 'Active',
      openedAt: r.opened_at ? String(r.opened_at) : '',
      demo: r.is_demo === true,
      lat: coord(r.lat),
      lng: coord(r.lng),
      criticalNeeds: num(r.critical_needs),
      urgentNeeds: num(r.urgent_needs),
      openNeeds: num(r.open_needs),
      completedNeeds: num(r.completed_needs),
      requiredTotal: num(r.required_total),
      verifiedTotal: num(r.verified_total),
      pendingSubs: num(r.pending_subs),
      pendingUnits: num(r.pending_units),
      slaBreached: num(r.sla_breached),
      decidedToday: num(r.decided_today),
      deliveryPoints: num(r.delivery_points),
      pointsAtCapacity: num(r.points_at_capacity),
      pointsCapacityUnknown: num(r.points_capacity_unknown),
      volunteers: num(r.volunteers),
      onShift: num(r.on_shift),
      pendingVolunteers: num(r.pending_volunteers),
      openNeedRequests: num(r.open_need_requests),
      lastActivityAt: r.last_activity_at ? String(r.last_activity_at) : null,
      urgency: num(r.urgency),
    }));
    return { disasters, slaHours: SLA_HOURS };
  }

  async getCoordQueue(limit: number): Promise<CoordQueueItem[]> {
    const { data, error } = await this.db.rpc('coordinator_pending_queue', { p_limit: limit });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.submission_id),
      code: String(r.code ?? ''),
      disasterId: String(r.disaster_id ?? ''),
      disasterSlug: String(r.disaster_slug ?? ''),
      disasterName: String(r.disaster_name ?? ''),
      needId: String(r.need_id ?? ''),
      needName: String(r.need_name ?? ''),
      needPriority: (r.need_priority as CoordQueueItem['needPriority']) ?? 'Normal',
      contributor: String(r.contributor ?? ''),
      qty: Number(r.qty ?? 0),
      unit: String(r.unit ?? ''),
      loc: String(r.location_name ?? ''),
      note: String(r.note ?? ''),
      hasPhoto: r.has_photo === true,
      submittedAt: String(r.submitted_at ?? ''),
      waitingHours: Number(r.waiting_hours ?? 0),
      slaBreached: r.sla_breached === true,
    }));
  }

  async setLocationCapacity(locationId: string, pct: number | null, note: string): Promise<Snapshot> {
    const { error } = await this.db.rpc('set_location_capacity', {
      p_location: locationId, p_pct: pct, p_note: note,
    });
    if (error) throw error;
    // Re-read the operation this point belongs to, not the default one: the
    // coordinator is standing on that disaster's page and would otherwise watch the
    // screen jump to another operation's snapshot.
    const { data } = await this.db.from('locations').select('disaster_id').eq('id', locationId).maybeSingle();
    const disasterId = data ? String((data as Record<string, unknown>).disaster_id) : '';
    return disasterId ? this.snapOf(disasterId) : this.getSnapshot();
  }

  // ---- Banner slides -------------------------------------------------------
  // Reads are public. Writes go straight to the table and are authorised by RLS
  // (coordinator/admin only) — the panel screen hiding a button is not authorisation
  // (rules/03 §Server-Side Authorization).
  private mapSlide = (r: Record<string, unknown>): BannerSlide => ({
    id: String(r.id), title: String(r.title ?? ''), body: String(r.body ?? ''),
    ctaLabel: String(r.cta_label ?? ''), action: (r.action as SlideAction) ?? 'home',
    image: String(r.image ?? ''), tint: String(r.tint ?? '#D9363E'),
    active: r.active === true, sortOrder: Number(r.sort_order ?? 0),
  });

  async listSlides(): Promise<BannerSlide[]> {
    const { data } = await this.db.from('banner_slides').select('*').order('sort_order');
    return (data ?? []).map(this.mapSlide);
  }

  async saveSlide(id: string | null, input: BannerSlideInput): Promise<BannerSlide[]> {
    if (!isLocalSlideImage(input.image)) throw new Error('slide image must be a local /banners path');
    const row = {
      title: input.title.trim(), body: input.body.trim(), cta_label: input.ctaLabel.trim(),
      action: input.action, image: input.image.trim(), tint: input.tint,
      active: input.active, sort_order: input.sortOrder,
    };
    const { error } = id
      ? await this.db.from('banner_slides').update(row).eq('id', id)
      : await this.db.from('banner_slides').insert(row);
    if (error) throw error;
    return this.listSlides();
  }

  async reorderSlides(orderedIds: string[]): Promise<BannerSlide[]> {
    // One update per row rather than an upsert: upsert would need every NOT NULL column
    // and could overwrite a field another coordinator just changed.
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await this.db.from('banner_slides')
        .update({ sort_order: i + 1 }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
    return this.listSlides();
  }

  async deleteSlide(id: string): Promise<BannerSlide[]> {
    const { error } = await this.db.from('banner_slides').delete().eq('id', id);
    if (error) throw error;
    return this.listSlides();
  }

  // Read from the public view: it excludes the submitter's contact details, which
  // must never reach the browser (rules/01, rules/03).
  async listOrganizations(): Promise<Organization[]> {
    const { data } = await this.db.from('organizations_public').select('*').order('name');
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), name: String(r.name), kind: r.kind as OrgKind, scope: r.scope as OrgScope,
      province: String(r.province ?? ''), district: String(r.district ?? ''),
      services: Array.isArray(r.services) ? (r.services as string[]) : [],
      description: String(r.description ?? ''), website: String(r.website ?? ''),
      email: String(r.email ?? ''), phone: String(r.phone ?? ''),
      emergencyPhone: String(r.emergency_phone ?? ''), address: String(r.address ?? ''),
      status: r.status as OrgStatus, isOfficial: r.is_official === true,
      logo: String(r.logo ?? ''),
      verifiedAt: r.verified_at ? String(r.verified_at) : null,
      createdLabel: r.created_at ? rel(String(r.created_at)) : '',
    }));
  }

  // Status, official flag and verification fields are not client-writable — RLS in
  // migration 0002 rejects any insert that tries to set them.
  async submitOrganization(input: OrganizationInput): Promise<Organization> {
    const { data, error } = await this.db.from('organizations').insert({
      name: input.name.trim(), kind: input.kind, scope: input.scope,
      province: input.province.trim(), district: input.district.trim(),
      services: input.services.filter(Boolean), description: input.description.trim(),
      website: input.website.trim(), email: input.email.trim(), phone: input.phone.trim(),
      emergency_phone: input.emergencyPhone.trim(), address: input.address.trim(),
      submitted_by_name: input.submittedByName.trim(),
      submitted_by_email: input.submittedByEmail.trim(),
      submitted_by_phone: input.submittedByPhone.trim(),
    }).select('id').single();
    if (error) throw error;
    return {
      id: String(data?.id ?? ''), name: input.name.trim(), kind: input.kind, scope: input.scope,
      province: input.province.trim(), district: input.district.trim(),
      services: input.services.filter(Boolean), description: input.description.trim(),
      website: input.website.trim(), email: input.email.trim(), phone: input.phone.trim(),
      emergencyPhone: input.emergencyPhone.trim(), address: input.address.trim(),
      status: 'Pending verification', isOfficial: false, logo: '', verifiedAt: null, createdLabel: 'az önce',
    };
  }

  // Insert-only for the public: RLS lets anyone file a correction request (no account
  // required, CLAUDE.md §Primary Product Rule) but only a coordinator can read them —
  // the row carries the requester's contact details.
  async submitOrgEditRequest(input: OrgEditRequestInput): Promise<void> {
    const { error } = await this.db.from('organization_edit_requests').insert({
      organization_id: input.orgId,
      proposed: input.proposed,
      changed_fields: input.changedFields,
      note: input.note.trim(),
      submitted_by_name: input.submittedByName.trim(),
      submitted_by_email: input.submittedByEmail.trim(),
      submitted_by_phone: input.submittedByPhone.trim(),
    });
    if (error) throw error;
  }

  // ---- Coordinator review of correction requests ---------------------------
  // Reads go through the `organization_edit_requests_review` view: it carries the
  // record's CURRENT values alongside the proposal, with the same camelCase keys, so
  // the diff is computed against live data rather than a snapshot taken at submission
  // time. The view is coordinator-only (RLS on both underlying tables).
  // head:true — the server sends the count and no rows at all.
  async countOpenOrgEditRequests(): Promise<number> {
    const { count, error } = await this.db
      .from('organization_edit_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending review');
    if (error) throw error;
    return count ?? 0;
  }

  async listOrgEditRequests(): Promise<OrgEditRequest[]> {
    const { data, error } = await this.db
      .from('organization_edit_requests_review')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      orgId: String(r.organization_id),
      orgName: String(r.organization_name ?? ''),
      orgStatus: (r.organization_status as OrgStatus) ?? 'Pending verification',
      proposed: r.proposed as OrgEditable,
      current: r.current_record as OrgEditable,
      changedFields: Array.isArray(r.changed_fields) ? (r.changed_fields as string[]) : [],
      note: String(r.note ?? ''),
      status: (r.status as EditRequestStatus) ?? 'Pending review',
      reviewNote: String(r.review_note ?? ''),
      submittedByName: String(r.submitted_by_name ?? ''),
      submittedByEmail: String(r.submitted_by_email ?? ''),
      submittedByPhone: String(r.submitted_by_phone ?? ''),
      createdLabel: r.created_at ? rel(String(r.created_at)) : '',
      reviewedLabel: r.reviewed_at ? rel(String(r.reviewed_at)) : '',
    }));
  }

  // One transaction inside the RPC: fields copied, request closed, audit entry
  // written. Doing it as three client calls would allow a half-applied correction.
  async applyOrgEditRequest(id: string, fields: string[], note: string): Promise<Organization[]> {
    const { error } = await this.db.rpc('review_org_edit_request_apply', {
      p_request: id, p_fields: fields, p_note: note,
    });
    if (error) throw error;
    return this.listOrganizations();
  }

  async rejectOrgEditRequest(id: string, note: string): Promise<void> {
    const { error } = await this.db.rpc('review_org_edit_request_reject', {
      p_request: id, p_note: note,
    });
    if (error) throw error;
  }

  // ---- Per-operation public content ----------------------------------------
  // No RPC needed: these tables carry no quantities and no invariant to keep, so a
  // plain write under the coordinator RLS policy is enough. The audit entry is written
  // by a trigger (migration 0014) rather than a second client call.
  private async snapOf(disasterId: string): Promise<Snapshot> {
    const { data } = await this.db.from('disasters').select('slug').eq('id', disasterId).maybeSingle();
    return this.getSnapshot(data?.slug ? String(data.slug) : undefined);
  }

  async saveAnnouncement(id: string | null, input: AnnouncementInput, author: string): Promise<Snapshot> {
    const row = {
      disaster_id: input.disasterId, kind: input.kind, accent: input.accent,
      title: input.title.trim(), body: input.body.trim(), image: input.image,
    };
    if (id) {
      const { error } = await this.db.from('announcements').update(row).eq('id', id);
      if (error) throw error;
    } else {
      // `author` comes from the session, not the form: an attribution on a public page
      // that anyone could type is not an attribution.
      const { error } = await this.db.from('announcements').insert({ ...row, author });
      if (error) throw error;
    }
    return this.snapOf(input.disasterId);
  }

  async deleteAnnouncement(id: string): Promise<Snapshot> {
    const { data } = await this.db.from('announcements').select('disaster_id').eq('id', id).maybeSingle();
    const disasterId = data?.disaster_id ? String(data.disaster_id) : '';
    const { error } = await this.db.from('announcements').delete().eq('id', id);
    if (error) throw error;
    return disasterId ? this.snapOf(disasterId) : this.getSnapshot();
  }

  async saveLocation(id: string | null, input: LocationInput): Promise<Snapshot> {
    const row = {
      disaster_id: input.disasterId, name: input.name.trim(), address: input.address.trim(),
      hours: input.hours.trim(), accepts: input.accepts.trim(),
      contact_name: input.contact.trim(), contact_phone: input.phone.trim(),
      status: input.status.trim(), lat: input.lat, lng: input.lng,
    };
    if (id) {
      const { error } = await this.db.from('locations').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await this.db.from('locations').insert(row);
      if (error) throw error;
    }
    return this.snapOf(input.disasterId);
  }

  async deleteLocation(id: string): Promise<Snapshot> {
    const { data } = await this.db.from('locations').select('disaster_id').eq('id', id).maybeSingle();
    const disasterId = data?.disaster_id ? String(data.disaster_id) : '';
    const { error } = await this.db.from('locations').delete().eq('id', id);
    if (error) throw error;
    return disasterId ? this.snapOf(disasterId) : this.getSnapshot();
  }

  // ---- Coordinator organization management ---------------------------------
  // Writes go to the base table (coordinator RLS policy from migration 0002); reads still
  // come back through organizations_public, so the submitter columns never travel.
  async saveOrganization(id: string | null, input: OrganizationSave, publishVerified: boolean): Promise<Organization[]> {
    const row = {
      name: input.name.trim(), kind: input.kind, scope: input.scope,
      province: input.province.trim(), district: input.district.trim(),
      services: input.services.filter(Boolean), description: input.description.trim(),
      website: input.website.trim(), email: input.email.trim(), phone: input.phone.trim(),
      emergency_phone: input.emergencyPhone.trim(), address: input.address.trim(),
      updated_at: new Date().toISOString(),
    };
    if (id) {
      const { error } = await this.db.from('organizations').update(row).eq('id', id);
      if (error) throw error;
    } else if (publishVerified) {
      // Admin-only path: RLS refuses these columns to anyone else, so a coordinator who
      // reached this branch gets an error rather than a quietly downgraded record.
      const { error } = await this.db.from('organizations').insert({
        ...row,
        status: 'Verified',
        is_official: input.kind === 'Kamu kurumu' || input.kind === 'Belediye',
        verified_at: new Date().toISOString(),
      });
      if (error) throw error;
    } else {
      const { error } = await this.db.from('organizations').insert({
        ...row, status: 'Pending verification', is_official: false,
      });
      if (error) throw error;
    }
    return this.listOrganizations();
  }

  // The RPC writes the audit entry and applies the is_official rule in one transaction.
  async verifyOrganization(id: string, status: OrgStatus, reason: string): Promise<Organization[]> {
    const { error } = await this.db.rpc('verify_organization', {
      p_org: id, p_status: status, p_reason: reason,
    });
    if (error) throw error;
    return this.listOrganizations();
  }

  // ---- Volunteer applications ----------------------------------------------
  async submitVolunteerApplication(input: VolunteerInput): Promise<string> {
    const { data, error } = await this.db.from('volunteer_applications').insert({
      disaster_id: input.disasterId,
      full_name: input.fullName.trim(), phone: input.phone.trim(), email: input.email.trim(),
      province: input.province.trim(), district: input.district.trim(),
      skills: input.skills.filter(Boolean), availability: input.availability,
      note: input.note.trim(), consent: input.consent,
      standing_contact_consent: input.standingConsent,
    }).select('id').single();
    if (error) throw error;
    return String((data as Record<string, unknown>)?.id ?? '');
  }

  // Own rows only, decided by the database: my_volunteer_applications() matches the
  // caller's account e-mail (migration 0018). An id passed from the browser is never
  // what grants access.
  async listMyVolunteerApplications(): Promise<VolunteerApplication[]> {
    const { data, error } = await this.db.rpc('my_volunteer_applications');
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), code: String(r.code ?? ''),
      disasterId: r.disaster_id ? String(r.disaster_id) : null,
      disasterName: String(r.disaster_name ?? ''),
      fullName: String(r.full_name ?? ''), phone: String(r.phone ?? ''), email: String(r.email ?? ''),
      province: String(r.province ?? ''), district: String(r.district ?? ''),
      skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
      availability: String(r.availability ?? ''), note: String(r.note ?? ''),
      status: (r.status as VolunteerStatus) ?? 'Pending review',
      reviewNote: String(r.review_note ?? ''),
      createdLabel: r.created_at ? rel(String(r.created_at)) : '',
      reviewedLabel: r.reviewed_at ? rel(String(r.reviewed_at)) : '',
      onShift: r.on_shift === true,
      shiftSinceLabel: r.shift_since ? rel(String(r.shift_since)) : '',
      standingConsent: r.standing_contact_consent === true,
    }));
  }

  async updateMyVolunteerApplication(id: string, input: VolunteerInput): Promise<VolunteerApplication[]> {
    const { error } = await this.db.rpc('update_my_volunteer_application', {
      p_app: id, p_disaster: input.disasterId, p_full_name: input.fullName.trim(),
      p_phone: input.phone.trim(), p_province: input.province.trim(), p_district: input.district.trim(),
      p_skills: input.skills.filter(Boolean), p_availability: input.availability,
      p_note: input.note.trim(), p_standing: input.standingConsent,
    });
    if (error) throw error;
    return this.listMyVolunteerApplications();
  }

  async withdrawMyVolunteerApplication(id: string): Promise<VolunteerApplication[]> {
    const { error } = await this.db.rpc('withdraw_my_volunteer_application', { p_app: id });
    if (error) throw error;
    return this.listMyVolunteerApplications();
  }

  async setMyVolunteerConsent(on: boolean): Promise<VolunteerApplication[]> {
    const { error } = await this.db.rpc('set_my_volunteer_consent', { p_on: on });
    if (error) throw error;
    return this.listMyVolunteerApplications();
  }

  async listVolunteerApplications(): Promise<VolunteerApplication[]> {
    const [apps, ds] = await Promise.all([
      this.db.from('volunteer_applications').select('*').order('created_at', { ascending: false }),
      this.db.from('disasters').select('id,name'),
    ]);
    if (apps.error) throw apps.error;
    const names = new Map((ds.data ?? []).map((d: Record<string, unknown>) => [String(d.id), String(d.name)] as const));
    return (apps.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), code: String(r.code ?? ''),
      disasterId: r.disaster_id ? String(r.disaster_id) : null,
      disasterName: r.disaster_id ? (names.get(String(r.disaster_id)) ?? '') : '',
      fullName: String(r.full_name ?? ''), phone: String(r.phone ?? ''), email: String(r.email ?? ''),
      province: String(r.province ?? ''), district: String(r.district ?? ''),
      skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
      availability: String(r.availability ?? ''), note: String(r.note ?? ''),
      status: (r.status as VolunteerStatus) ?? 'Pending review',
      reviewNote: String(r.review_note ?? ''),
      createdLabel: r.created_at ? rel(String(r.created_at)) : '',
      reviewedLabel: r.reviewed_at ? rel(String(r.reviewed_at)) : '',
      onShift: r.on_shift === true,
      shiftSinceLabel: r.shift_since ? rel(String(r.shift_since)) : '',
      standingConsent: r.standing_contact_consent === true,
    }));
  }

  async reviewVolunteerApplication(id: string, status: VolunteerStatus, note: string): Promise<VolunteerApplication[]> {
    const { error } = await this.db.rpc('review_volunteer_application', {
      p_app: id, p_status: status, p_note: note,
    });
    if (error) throw error;
    return this.listVolunteerApplications();
  }

  // ---- Staff ----------------------------------------------------------------
  // staff_directory() is a SECURITY DEFINER function because the e-mail lives in
  // auth.users, which is not client-readable; it returns nothing unless is_admin().
  async listStaff(): Promise<{ staff: StaffMember[]; invites: RoleInvite[] }> {
    const [dir, inv] = await Promise.all([
      this.db.rpc('staff_directory'),
      this.db.from('role_invites').select('*').is('accepted_at', null).order('created_at', { ascending: false }),
    ]);
    if (dir.error) throw dir.error;
    const staff: StaffMember[] = ((dir.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), fullName: String(r.full_name ?? ''), email: String(r.email ?? ''),
      role: (r.role as StaffRole) ?? 'coordinator',
      createdLabel: r.created_at ? rel(String(r.created_at)) : '',
    }));
    const invites: RoleInvite[] = ((inv.data ?? []) as Record<string, unknown>[]).map((r) => ({
      email: String(r.email ?? ''), role: (r.role as StaffRole) ?? 'coordinator',
      note: String(r.note ?? ''), createdLabel: r.created_at ? rel(String(r.created_at)) : '',
      orgId: r.organization_id ? String(r.organization_id) : null,
      orgName: '',
    }));
    return { staff, invites };
  }

  async grantStaffRole(email: string, role: StaffRole, note: string, orgId: string | null): Promise<'granted' | 'invited'> {
    const { data, error } = await this.db.rpc('grant_staff_role', {
      p_email: email, p_role: role, p_note: note, p_org: orgId,
    });
    if (error) throw error;
    return data === 'granted' ? 'granted' : 'invited';
  }

  async revokeStaffRole(userId: string): Promise<void> {
    const { error } = await this.db.rpc('revoke_staff_role', { p_user: userId });
    if (error) throw error;
  }

  async cancelRoleInvite(email: string): Promise<void> {
    const { error } = await this.db.from('role_invites').delete().eq('email', email.trim().toLowerCase());
    if (error) throw error;
  }

  private mapReport = (r: Record<string, unknown>): DisasterReport => ({
    id: String(r.id), type: (r.type as DisasterType) ?? 'Other',
    province: String(r.province ?? ''), district: String(r.district ?? ''),
    locationNote: String(r.location_note ?? ''),
    settlements: Array.isArray(r.settlements) ? (r.settlements as unknown[]).map(String) : [],
    occurredOn: String(r.occurred_on ?? '').slice(0, 10),
    description: String(r.description ?? ''),
    reportCount: Number(r.report_count ?? 1),
    status: (r.status as ReportStatus) ?? 'Pending verification',
    disasterSlug: r.disaster_slug ? String(r.disaster_slug) : null,
    createdLabel: r.created_at ? rel(String(r.created_at)) : '',
    lastReportLabel: r.last_report_at ? rel(String(r.last_report_at)) : '',
  });

  // Narrow server-side by type/province/date window, then apply the shared rule so
  // client and server agree on what "same event" means.
  async findSimilarReports(input: DisasterReportInput): Promise<DisasterReport[]> {
    const from = new Date(Date.parse(input.occurredOn) - REPORT_DAY_WINDOW * 86_400_000);
    const to = new Date(Date.parse(input.occurredOn) + REPORT_DAY_WINDOW * 86_400_000);
    const { data } = await this.db.from('disaster_reports_public').select('*')
      .eq('type', input.type)
      .eq('status', 'Pending verification')
      .gte('occurred_on', from.toISOString().slice(0, 10))
      .lte('occurred_on', to.toISOString().slice(0, 10));
    return (data ?? []).map(this.mapReport)
      .filter((r) => isSameEvent(r, input))
      .sort((x, y) => y.reportCount - x.reportCount);
  }

  // The RPC owns the merge decision transactionally (migration 0003): it either
  // increments an existing report or inserts a new one, and writes the audit event.
  async submitDisasterReport(input: DisasterReportInput): Promise<{ report: DisasterReport; merged: boolean }> {
    const { data, error } = await this.db.rpc('submit_disaster_report', {
      p_type: input.type, p_province: input.province.trim(), p_district: input.district.trim(),
      p_location_note: input.locationNote.trim(), p_occurred_on: input.occurredOn,
      p_description: input.description.trim(),
      p_name: input.name.trim(), p_email: input.email.trim(), p_phone: input.phone.trim(),
      p_settlements: input.settlements,
    }).single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return { report: this.mapReport(row), merged: row.merged === true };
  }

  // The RPC records WHO confirmed and refuses a second confirmation from the same
  // address (unique constraint, migration 0016). `already` is not an error: the person
  // is told the count did not move, rather than being shown a failure they cannot fix.
  async confirmDisasterReport(reportId: string, who: ReportConfirmInput): Promise<ReportConfirmResult> {
    const { data, error } = await this.db.rpc('confirm_disaster_report', {
      p_report: reportId,
      p_name: who.name.trim(), p_email: who.email.trim(),
      p_province: who.province.trim(), p_district: who.district.trim(),
    }).single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
      report: this.mapReport(row),
      already: row.already === true,
      createdSlug: String(row.created_slug ?? ''),
    };
  }

  // Coordinator queue. Reads the admin view, which applies the caller's own RLS —
  // a visitor's token returns nothing rather than the moderation fields.
  async listReportQueue(): Promise<ReportQueueItem[]> {
    const { data, error } = await this.db.from('disaster_reports_admin').select('*')
      .order('report_count', { ascending: false })
      .order('last_report_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...this.mapReport(r),
      rejectReason: String(r.reject_reason ?? ''),
      disasterId: r.disaster_id ? String(r.disaster_id) : '',
      confirmations: Number(r.confirmations ?? 0),
      contacts: Number(r.contacts ?? 0),
      openedByCommunity: r.opened_by_community === true,
      communityConfirmed: r.community_confirmed_at != null,
    }));
  }

  // The admin system log: every recorded action, nothing filtered, actors in full.
  // RLS is what decides — `audit_log` answers only to is_admin() (0017, tightened in
  // 0024), so a coordinator who reaches this call gets an empty list, not an error and
  // not somebody's surname. The public feed comes from audit_log_public instead.
  async listSystemLog(limit: number): Promise<LogEntry[]> {
    const [lg, ds] = await Promise.all([
      this.db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit),
      this.db.from('disasters').select('id,name,slug'),
    ]);
    if (lg.error) throw lg.error;
    const names = new Map((ds.data ?? []).map((d: Record<string, unknown>) =>
      [String(d.id), { name: String(d.name), slug: String(d.slug ?? '') }] as const));
    return (lg.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id ?? ''),
      disasterName: names.get(String(r.disaster_id))?.name ?? '',
      disasterSlug: names.get(String(r.disaster_id))?.slug ?? '',
      // The admin log is the one place the name is NOT masked: it is the record an
      // administrator is accountable for reading, and it is gated by is_admin().
      user: auditActorLabel(String(r.action), String(r.actor), String(r.new_value)),
      action: auditActionLabel(String(r.action)),
      detail: auditDetailLabel(String(r.detail)),
      oldValue: auditValueLabel(String(r.old_value)), newValue: auditValueLabel(String(r.new_value)),
      time: rel(String(r.created_at)), color: String(r.color),
    }));
  }

  // ---- İletişim ------------------------------------------------------------
  // The RPC does the validating and the rate limiting; this only forwards. The returned
  // id is what the mailer is given — it never learns a recipient from the browser.
  // Goes through the `contact-submit` Edge Function, not straight to the RPC: the
  // Turnstile token has to be checked where the secret lives, and the row has to be
  // written by the request that passed that check (rules/03 §Server-Side Authorization).
  async submitContact(input: ContactInput): Promise<string> {
    const res = await submitContactViaFunction({
      token: input.captchaToken ?? '',
      name: input.name.trim(), email: input.email.trim(),
      topic: input.topic, message: input.message.trim(),
      phone: input.phone.trim(), province: input.province.trim(),
      district: input.district.trim(), website: input.website.trim(),
    });
    if (!res.ok) throw new Error(res.error);
    return res.id;
  }

  async attachContactFiles(messageId: string, files: ContactAttachment[]): Promise<void> {
    if (files.length === 0) return;
    const { error } = await this.db.rpc('attach_contact_files', { p_id: messageId, p_files: files });
    if (error) throw error;
  }

  // Reads the table directly: RLS (contact_read, migration 0025) is what limits this to
  // coordinators. An empty list is what a visitor's token gets, not an error.
  async listContactMessages(): Promise<ContactMessage[]> {
    // Both reads are coordinator-only by RLS (contact_read / contact_att_read); a
    // visitor's token gets two empty lists rather than an error.
    const [msg, att] = await Promise.all([
      this.db.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200),
      this.db.from('contact_attachments').select('*').order('created_at', { ascending: true }).limit(600),
    ]);
    if (msg.error) throw msg.error;
    const byMsg = new Map<string, ContactAttachment[]>();
    for (const r of (att.data ?? []) as Record<string, unknown>[]) {
      const key = String(r.message_id);
      const list = byMsg.get(key) ?? [];
      list.push({ path: String(r.path), name: String(r.name), mime: String(r.mime), bytes: Number(r.bytes ?? 0) });
      byMsg.set(key, list);
    }
    return (msg.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), name: String(r.name), email: String(r.email),
      topic: r.topic as ContactMessage['topic'], message: String(r.message),
      phone: String(r.phone ?? ''), province: String(r.province ?? ''),
      district: String(r.district ?? ''), website: String(r.website ?? ''),
      status: r.status as ContactStatus,
      createdAt: String(r.created_at ?? ''), handledAt: String(r.handled_at ?? ''),
      files: byMsg.get(String(r.id)) ?? [],
    }));
  }

  async setContactStatus(id: string, status: ContactStatus): Promise<ContactMessage[]> {
    const { error } = await this.db.rpc('set_contact_status', { p_id: id, p_status: status });
    if (error) throw error;
    return this.listContactMessages();
  }

  async setVolunteerShift(applicationId: string, onShift: boolean): Promise<VolunteerApplication[]> {
    const { error } = await this.db.rpc('set_volunteer_shift', { p_app: applicationId, p_on: onShift });
    if (error) throw error;
    return this.listVolunteerApplications();
  }

  async reviewDisasterReport(reportId: string, action: 'publish' | 'reject', reason: string): Promise<string> {
    const { data, error } = await this.db.rpc('review_disaster_report', {
      p_report: reportId, p_action: action, p_reason: reason.trim(),
    });
    if (error) throw error;
    return String(data ?? '');
  }

  async confirmCommunityDisaster(disasterId: string): Promise<void> {
    const { error } = await this.db.rpc('confirm_community_disaster', { p_disaster: disasterId });
    if (error) throw error;
  }

  async createDelivery(f: DeliveryInput): Promise<CreateDeliveryResult> {
    const code = genCode(Math.random());
    const snap0 = await this.getSnapshot();
    const need = snap0.needs.find((n) => n.id === f.needId);
    await this.db.from('submissions').insert({
      code, disaster_id: snap0.disaster.id, need_id: f.needId,
      contributor_name: f.name, contributor_email: f.email, contributor_phone: f.phone, city: f.city,
      qty: f.qty, unit: f.unit || need?.unit || 'adet', location_name: f.loc,
      status: 'Pending verification', note: f.notes || 'Giriş kontrolü bekleniyor.',
      photo_url: f.photoUrl ?? null,
    });
    await this.db.from('needs').update({ pending_qty: (need?.pending ?? 0) + f.qty }).eq('id', f.needId);
    return { snapshot: await this.getSnapshot(), code };
  }

  async verifySubmission(subId: string, kind: VerifyKind, qty: number, reason: string): Promise<Snapshot> {
    // `rpc()` HATA FIRLATMAZ; `{ data, error }` döndürür. Bu satırda `error`
    // okunmuyordu: RLS reddettiğinde ya da fonksiyon hata verdiğinde çağrı sessizce
    // geçiyor, ardından snapshot yeniden okunuyor ve arayüz "Onaylandı ✓" diyordu.
    // Dosyadaki diğer bütün RPC çağrıları `if (error) throw error` yapıyor; bu
    // atlanmıştı ve tek başına "aksiyon veritabanına düşmüyor" tablosunu üretiyordu.
    const { error } = await this.db.rpc('verify_submission', {
      p_submission: subId, p_kind: kind, p_qty: qty, p_reason: reason || null,
    });
    if (error) throw error;
    // Buradan SONRASI yalnızca ekranı tazelemek. Karar veritabanına yazıldı; bu
    // okumalar başarısız olursa "kayıt değişmedi" demek yalan olur ve koordinatör
    // aynı teslimatı ikinci kez işler. Ayrı bir hata tipiyle ayrılıyor.
    try {
      // Karar verilen kaydın AİT OLDUĞU operasyon yeniden okunur. `getSnapshot()`
      // argümansız çağrıldığında "ilk aktif afet"e düşüyor: koordinatör Kastamonu
      // sayfasında onay verdiğinde ekran sessizce başka bir operasyonun verisine
      // geçiyor ve karar verilen satır geri gelmiş gibi görünüyordu.
      const { data } = await this.db.from('submissions').select('disaster_id').eq('id', subId).maybeSingle();
      const disasterId = data ? String((data as Record<string, unknown>).disaster_id) : '';
      return disasterId ? await this.snapOf(disasterId) : await this.getSnapshot();
    } catch (e) {
      throw new RefreshFailedError(e);
    }
  }

  async reviseSubmission(subId: string, kind: RevisionKind, qty: number, reason: string): Promise<Snapshot> {
    // Yetki sunucuda: kararı veren koordinatör veya yönetici (migration 0032).
    // Buradaki düğmenin gizlenmesi yetkilendirme DEĞİL, gereksiz reddedilen çağrıyı
    // önleme (rules/03 §Server-Side Authorization).
    const { error } = await this.db.rpc('revise_submission', {
      p_submission: subId, p_kind: kind,
      // 'undo' ve 'reject' miktar taşımaz; null göndermek fonksiyonun kendi
      // varsayılanını kullanmasını sağlar.
      p_qty: kind === 'approve' || kind === 'partial' ? qty : null,
      p_reason: reason || null,
    });
    if (error) throw error;
    try {
      const { data } = await this.db.from('submissions').select('disaster_id').eq('id', subId).maybeSingle();
      const disasterId = data ? String((data as Record<string, unknown>).disaster_id) : '';
      return disasterId ? await this.snapOf(disasterId) : await this.getSnapshot();
    } catch (e) {
      throw new RefreshFailedError(e);
    }
  }

  // Insert/update goes straight to `disasters`; RLS decides whether the caller may.
  async saveDisaster(id: string | null, input: DisasterInput): Promise<Snapshot> {
    const region = [input.district, input.province].filter(Boolean).join(', ') + ' · Türkiye';
    const row = {
      name: input.name.trim(), type: input.type, province: input.province, region,
      status: input.status, situation: input.situation.trim(),
      opened_by_org_id: input.openedByOrgId,
      // Form tek bir alan topluyor ama koordinatör "Bozkurt ve İnebolu" yazabiliyor;
      // aynı ayırma kuralı migration 0026'daki geriye doldurmada da var.
      districts: splitDistricts(input.district),
      settlements: input.settlements,
    };
    if (id) {
      const { error } = await this.db.from('disasters').update(row).eq('id', id);
      if (error) throw error;
      const { data } = await this.db.from('disasters').select('slug').eq('id', id).maybeSingle();
      return this.getSnapshot(data?.slug ? String(data.slug) : undefined);
    }
    const slug = disasterSlug(input.name, new Date());
    const { error } = await this.db.from('disasters').insert({
      ...row, slug, opened_at: new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
    return this.getSnapshot(slug);
  }

  async publishNeed(p: NeedPayload): Promise<Snapshot> {
    // Target the operation the coordinator chose, not whichever one getSnapshot()
    // happens to default to. An unresolvable slug throws rather than writing somewhere.
    const snap0 = await this.getSnapshot(p.disasterSlug || undefined);
    if (p.disasterSlug && snap0.disaster.slug !== p.disasterSlug
      && !(snap0.disaster.legacySlugs ?? []).includes(p.disasterSlug)) {
      throw new Error(`unknown disaster slug: ${p.disasterSlug}`);
    }
    await this.db.from('needs').insert({
      disaster_id: snap0.disaster.id, name: p.title, category: p.category, priority: p.priority,
      required_qty: p.required, unit: p.unit || 'adet', location_name: p.loc, details: p.details,
    });
    return this.getSnapshot(snap0.disaster.slug);
  }

  async bumpNeed(needId: string): Promise<Snapshot> {
    const snap0 = await this.getSnapshot();
    const n = snap0.needs.find((x) => x.id === needId);
    if (n) {
      await this.db.from('needs').update({
        required_qty: n.required + 10,
        priority: n.priority === 'Completed' ? 'Urgent' : n.priority,
      }).eq('id', needId);
    }
    return this.getSnapshot();
  }

  async togglePause(needId: string): Promise<Snapshot> {
    const snap0 = await this.getSnapshot();
    const n = snap0.needs.find((x) => x.id === needId);
    if (n) {
      await this.db.from('needs').update({ priority: n.priority === 'Paused' ? 'Urgent' : 'Paused' }).eq('id', needId);
    }
    return this.getSnapshot();
  }

  async submitNeedRequest(p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }): Promise<{ snapshot: Snapshot; code: string }> {
    const code = genNrq(Math.random());
    const snap0 = await this.getSnapshot();
    await this.db.from('need_requests').insert({
      code, disaster_id: snap0.disaster.id, title: p.title, category: p.category,
      priority: p.priority, qty: p.required, unit: p.unit || 'adet',
      location_name: p.loc, details: p.details,
      name: contact.name, email: contact.email, phone: contact.phone, city: contact.city,
    });
    return { snapshot: snap0, code };
  }

  // Calls my_submissions(), which resolves the caller's e-mail from the session inside
  // the database. Nothing about "whose submissions" is decided in the browser.
  async listMySubmissions(): Promise<Submission[]> {
    const { data, error } = await this.db.rpc('my_submissions');
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.code), code: String(r.code), contributor: '', city: '',
      needId: String(r.need_id ?? ''), qty: Number(r.qty ?? 0), unit: String(r.unit ?? ''),
      loc: String(r.location_name ?? ''), submitted: r.submitted_at ? rel(String(r.submitted_at)) : '',
      status: r.status as StatusKey,
      verifiedQty: r.verified_qty == null ? null : Number(r.verified_qty),
      note: String(r.note ?? ''), photoUrl: r.photo_url ? String(r.photo_url) : null,
      needName: String(r.need_name ?? ''),
    }));
  }

  async trackSubmission(code: string, email: string): Promise<Submission | null> {
    const { data } = await this.db.rpc('track_submission', { p_code: code, p_email: email });
    const r = Array.isArray(data) ? data[0] : null;
    if (!r) return null;
    return {
      id: r.code, code: r.code, contributor: '', city: '', needId: '', qty: Number(r.qty), unit: r.unit,
      loc: r.location_name, submitted: rel(r.submitted_at), status: r.status as StatusKey,
      verifiedQty: r.verified_qty == null ? null : Number(r.verified_qty), note: r.note,
      photoUrl: r.photo_url ?? null, needName: r.need_name ?? '',
    };
  }
}
