import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, DeliveryInput, PriorityKey, StatusKey, DisasterType,
  Organization, OrganizationInput, OrgStatus, OrgKind, OrgScope,
  DisasterReport, DisasterReportInput, ReportStatus,
} from '../types';
import type { Repo, Snapshot, CreateDeliveryResult, Overview, DisasterCard, TopNeed } from './repo';
import type { NeedPayload } from '../needForm';
import { genCode, genNrq, isSameEvent, REPORT_DAY_WINDOW } from './repo';
import { PRI } from '../theme';

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

  async getSnapshot(slug?: string): Promise<Snapshot> {
    const [ds, loc, ne, su, lg, an] = await Promise.all([
      this.db.from('disasters').select('*'),
      this.db.from('locations').select('*'),
      this.db.from('needs').select('*'),
      this.db.from('submissions').select('*').order('submitted_at', { ascending: false }),
      this.db.from('audit_log').select('*').order('created_at', { ascending: false }),
      this.db.from('announcements').select('*').order('created_at', { ascending: false }),
    ]);

    const mapDisaster = (r: Record<string, unknown>): Disaster => ({
      id: String(r.id), slug: String(r.slug ?? ''),
      legacySlugs: Array.isArray(r.legacy_slugs) ? (r.legacy_slugs as string[]) : [],
      name: String(r.name), region: String(r.region ?? ''), province: String(r.province ?? ''),
      type: (r.type as DisasterType) ?? 'Other',
      status: (r.status as Disaster['status']) ?? 'Active', situation: String(r.situation ?? ''),
      openedAt: String(r.opened_at ?? ''), updatedLabel: r.updated_at ? rel(String(r.updated_at)) : '',
      volunteers: Number(r.volunteers ?? 0), onShift: Number(r.on_shift ?? 0),
      demo: r.is_demo === true,
    });
    const disasters: Disaster[] = (ds.data ?? []).map(mapDisaster);
    const disaster = disasters.find((x) => x.slug === slug)
      ?? disasters.find((x) => (x.legacySlugs ?? []).includes(slug ?? ''))
      ?? disasters.find((x) => x.status === 'Active') ?? disasters[0]
      ?? {
        id: 'd1', slug: '', name: '', region: '', province: '', type: 'Other' as const,
        status: 'Active' as const, situation: '', openedAt: '', updatedLabel: '', volunteers: 0, onShift: 0,
      };
    const byId = new Map(disasters.map((x) => [x.id, x] as const));

    const locations: Location[] = (loc.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id), name: String(r.name), address: String(r.address), hours: String(r.hours),
      accepts: String(r.accepts), contact: String(r.contact_name), phone: String(r.contact_phone),
      status: String(r.status), statusTone: String(r.status).match(/00/) ? 'yellow' : 'green',
      coords: r.lat != null && r.lng != null ? `${r.lat}° K, ${r.lng}° D` : '',
      lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0),
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
    }));

    const subs: Submission[] = (su.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), code: String(r.code), contributor: String(r.contributor_name),
      city: String(r.city), needId: String(r.need_id), qty: Number(r.qty), unit: String(r.unit),
      loc: String(r.location_name), submitted: rel(String(r.submitted_at)),
      status: r.status as StatusKey, verifiedQty: r.verified_qty == null ? null : Number(r.verified_qty),
      note: String(r.note), photoUrl: r.photo_url ? String(r.photo_url) : null,
    }));

    const log: LogEntry[] = (lg.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id ?? ''),
      disasterName: byId.get(String(r.disaster_id))?.name ?? '', user: String(r.actor), action: String(r.action), detail: String(r.detail),
      oldValue: String(r.old_value), newValue: String(r.new_value), time: rel(String(r.created_at)),
      color: String(r.color),
    }));

    const announcements: Announcement[] = (an.data ?? []).filter((r: Record<string, unknown>) => String(r.disaster_id) === disaster.id).map((r: Record<string, unknown>) => ({
      id: String(r.id), disasterId: String(r.disaster_id ?? ''), kind: String(r.kind), accent: String(r.accent), time: rel(String(r.created_at)),
      author: String(r.author), title: String(r.title), body: String(r.body),
    }));

    const verifiedTotal = subs.filter((s) => s.status === 'Verified' || s.status === 'Partially verified').length;
    return { disaster, disasters, locations, needs, subs, log, announcements, verifiedTotal };
  }

  // Reads the `disaster_overview` view (migration 0002) so the national counters
  // come from SQL, not from the browser. Falls back to per-row aggregation when
  // the view is not applied yet.
  async getOverview(): Promise<Overview> {
    const [ov, ne, ds] = await Promise.all([
      this.db.from('disaster_overview').select('*'),
      this.db.from('needs').select('*'),
      this.db.from('disasters').select('*'),
    ]);
    const rows = ov.error ? null : (ov.data ?? []);

    const mapDisaster = (r: Record<string, unknown>): Disaster => ({
      id: String(r.id), slug: String(r.slug ?? ''),
      legacySlugs: Array.isArray(r.legacy_slugs) ? (r.legacy_slugs as string[]) : [],
      name: String(r.name), region: String(r.region ?? ''), province: String(r.province ?? ''),
      type: (r.type as DisasterType) ?? 'Other',
      status: (r.status as Disaster['status']) ?? 'Active', situation: String(r.situation ?? ''),
      openedAt: String(r.opened_at ?? ''), updatedLabel: r.updated_at ? rel(String(r.updated_at)) : '',
      volunteers: Number(r.volunteers ?? 0), onShift: Number(r.on_shift ?? 0),
      demo: r.is_demo === true,
    });

    const disasters: Disaster[] = (rows ?? ds.data ?? []).map(mapDisaster);
    const allNeeds = (ne.data ?? []) as Record<string, unknown>[];
    const openOf = (id: string) => allNeeds
      .filter((n) => String(n.disaster_id) === id && Number(n.required_qty) - Number(n.verified_qty) > 0);

    const topOf = (d: Disaster, limit: number): TopNeed[] => openOf(d.id)
      .map((n) => ({
        id: String(n.id), name: String(n.name), priority: n.priority as PriorityKey,
        remaining: Math.max(0, Number(n.required_qty) - Number(n.verified_qty)), unit: String(n.unit),
        disasterId: d.id, disasterName: d.name, disasterSlug: d.slug,
      }))
      .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank
        || y.remaining - x.remaining)
      .slice(0, limit);

    const rowFor = (id: string) => (rows ?? []).find((r) => String(r.id) === id) as Record<string, unknown> | undefined;

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
      };
    }).sort((x, y) => (x.disaster.status === 'Active' ? 0 : 1) - (y.disaster.status === 'Active' ? 0 : 1));

    const active = cards.filter((c) => c.disaster.status === 'Active');
    const [lg, rep] = await Promise.all([
      this.db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(12),
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
      log: (lg.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id), disasterId: String(r.disaster_id ?? ''),
        disasterName: byId.get(String(r.disaster_id))?.name ?? '',
        user: String(r.actor), action: String(r.action), detail: String(r.detail),
        oldValue: String(r.old_value), newValue: String(r.new_value),
        time: rel(String(r.created_at)), color: String(r.color),
      })),
      urgent: active.flatMap((c) => topOf(c.disaster, 3))
        .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank)
        .slice(0, 6),
      reports: (rep.data ?? []).map(this.mapReport).sort((x, y) => y.reportCount - x.reportCount),
      demo: cards.some((c) => c.disaster.demo === true),
    };
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
      status: 'Pending verification', isOfficial: false, verifiedAt: null, createdLabel: 'az önce',
    };
  }

  private mapReport = (r: Record<string, unknown>): DisasterReport => ({
    id: String(r.id), type: (r.type as DisasterType) ?? 'Other',
    province: String(r.province ?? ''), district: String(r.district ?? ''),
    locationNote: String(r.location_note ?? ''),
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
    }).single();
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return { report: this.mapReport(row), merged: row.merged === true };
  }

  async confirmDisasterReport(reportId: string): Promise<DisasterReport> {
    const { data, error } = await this.db.rpc('confirm_disaster_report', { p_report: reportId }).single();
    if (error) throw error;
    return this.mapReport(data as Record<string, unknown>);
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
    await this.db.rpc('verify_submission', { p_submission: subId, p_kind: kind, p_qty: qty, p_reason: reason || null });
    return this.getSnapshot();
  }

  async publishNeed(p: NeedPayload): Promise<Snapshot> {
    const snap0 = await this.getSnapshot();
    await this.db.from('needs').insert({
      disaster_id: snap0.disaster.id, name: p.title, category: p.category, priority: p.priority,
      required_qty: p.required, unit: p.unit || 'adet', location_name: p.loc, details: p.details,
    });
    return this.getSnapshot();
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
