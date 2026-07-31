import type {
  LogEntry, Need, Submission, VerifyKind, DeliveryInput, Organization, OrganizationInput,
  DisasterReport, DisasterReportInput, ReportConfirmInput, ReportConfirmResult, ReportQueueItem,
  BannerSlide, BannerSlideInput, OrgEditRequestInput,
  OrgEditRequest, Disaster, DisasterInput, OrganizationSave, OrgStatus,
  VolunteerInput, VolunteerApplication, VolunteerStatus, StaffMember, StaffRole, RoleInvite,
  Announcement, AnnouncementInput, Location, LocationInput,
} from '../types';
import type {
  Repo, Snapshot, CreateDeliveryResult, Overview, DisasterCard, TopNeed,
  CoordOverview, CoordDisasterRow, CoordQueueItem,
} from './repo';
import { genCode, genNrq, remaining, isSameEvent, SLA_HOURS, urgencyScore, splitDistricts, isLocalSlideImage, disasterSlug, orgEditableFrom, orgFieldText, ORG_EDITABLE_KEYS, COMMUNITY_THRESHOLD, isPublicAuditAction } from './repo';
import { disasterTypeLabel } from '../i18n/strings';
import { agoMinutes } from '../util';
import { PRI } from '../theme';
import type { NeedPayload } from '../needForm';
import * as seed from './seed';

// In-memory implementation. Mirrors the approved prototype's behaviour and the
// verify_submission() logic in schema.sql exactly. Audit copy is Turkish.
// State resets on reload (no backend) — intended for the local/preview mode.
const NOW = 'az önce';

let needs: Need[] = seed.needs.map((n) => ({ ...n }));
let subs: Submission[] = seed.subs.map((s) => ({ ...s }));
let log: LogEntry[] = seed.log.map((l) => ({ ...l }));
const verifiedTotals: Record<string, number> = { ...seed.verifiedTotals };
let orgs: Organization[] = seed.organizations.map((o) => ({ ...o }));
let reports: DisasterReport[] = seed.reports.map((r) => ({ ...r }));
let slides: BannerSlide[] = seed.bannerSlides.map((sl) => ({ ...sl }));
// Correction requests filed in this session. Seeded empty on purpose: an invented
// "pending correction" against a real institution is exactly the kind of sample data
// that must not look verified (rules/07 §Seed Content).
let orgEdits: OrgEditRequest[] = [];
// Announcements and delivery points are seeded content that the panel can now edit, so
// they become module state like needs and orgs instead of being read straight from seed.
let announcements: Announcement[] = seed.announcements.map((x) => ({ ...x }));
let locations: Location[] = seed.locations.map((x) => ({ ...x }));
// Volunteer applications and staff both start empty on purpose: an invented "pending
// volunteer" would be a named person who never applied, and a fake coordinator list
// would misrepresent who can act on the platform (rules/07 §Seed Content).
let volunteerApps: VolunteerApplication[] = [];
let roleInvites: RoleInvite[] = [];
// Who confirmed which report. The pair is what makes one e-mail count once, exactly
// as the unique constraint does in migration 0016.
let confirmations: { reportId: string; email: string }[] = [];
// Mirrors gen_volunteer_code() in migration 0019: readable, non-sequential, no 0/O/1/I.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const localVolunteerCode = () => 'GNL-' + Array.from({ length: 6 },
  () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const rejectReasons: Record<string, string> = {};

let uid = 0;
const nextId = (p: string) => `${p}_${Date.now()}_${uid++}`;
const find = (id: string) => needs.find((n) => n.id === id);

function addLog(
  disasterId: string,
  entry: Partial<LogEntry> & Pick<LogEntry, 'action' | 'detail' | 'oldValue' | 'newValue' | 'color'>,
) {
  const d = seed.disasters.find((x) => x.id === disasterId);
  log = [{
    id: nextId('l'), disasterId, disasterName: d?.name ?? '', disasterSlug: d?.slug ?? '',
    user: 'Elif K.', time: NOW, ...entry,
  }, ...log];
}

// Turning a report into an operation. Mirrors open_disaster_from_report() in
// migration 0016: same name, same slug shape, same "waiting for verification" wording,
// so local mode does not teach a behaviour the database will not repeat.
function openFromReport(r: DisasterReport, community: boolean): string {
  if (r.disasterSlug) return r.disasterSlug;
  const place = r.district.trim() || r.province.trim();
  const name = `${place} ${disasterTypeLabel[r.type]}`;
  let slug = disasterSlug(name, new Date());
  let n = 1;
  while (seed.disasters.some((d) => d.slug === slug)) {
    n += 1;
    slug = `${disasterSlug(name, new Date())}-${n}`;
  }
  const created: Disaster = {
    id: nextId('d'), slug, legacySlugs: [],
    name, region: [r.district, r.province].filter(Boolean).join(', ') + ' · Türkiye',
    province: r.province, districts: splitDistricts(r.district), type: r.type, status: 'Active',
    situation: community
      ? `Bu operasyon, aynı olayı bildiren en az ${COMMUNITY_THRESHOLD} kişinin doğrulamasıyla otomatik açıldı. Koordinatör doğrulaması bekleniyor.${r.description ? `\n\n${r.description}` : ''}`
      : r.description,
    openedAt: new Date().toISOString().slice(0, 10), updatedLabel: NOW,
    volunteers: 0, onShift: 0, openedByOrgId: null,
    openedByCommunity: community, communityConfirmed: false,
  };
  seed.disasters.unshift(created);
  reports = reports.map((x) => (x.id === r.id ? { ...x, status: 'Published', disasterSlug: slug } : x));
  if (community) {
    addLog(created.id, {
      user: 'Topluluk', action: 'Topluluk afeti oluşturuldu',
      detail: `${name} · ${r.reportCount} kişi bildirdi`,
      oldValue: 'Topluluk bildirimi', newValue: 'Afet · koordinatör doğrulaması bekleniyor', color: '#E6A700',
    });
  } else {
    addLog(created.id, {
      action: 'Afet oluşturuldu', detail: name, oldValue: '—', newValue: 'Active', color: '#D9363E',
    });
  }
  return slug;
}

// A retired slug must keep resolving, so a shared link never 404s after a
// disaster is re-slugged with its date.
function currentDisaster(slug?: string) {
  return seed.disasters.find((d) => d.slug === slug)
    ?? seed.disasters.find((d) => (d.legacySlugs ?? []).includes(slug ?? ''))
    ?? seed.disasters.find((d) => d.status === 'Active')
    ?? seed.disasters[0];
}

function currentDisasterOrThrow(slug: string) {
  const d = seed.disasters.find((x) => x.slug === slug)
    ?? seed.disasters.find((x) => (x.legacySlugs ?? []).includes(slug));
  if (!d) throw new Error(`unknown disaster slug: ${slug}`);
  return d;
}

const needOf = (id: string) => needs.find((n) => n.id === id);
const disasterOfNeed = (needId: string) => needOf(needId)?.disasterId ?? seed.disasters[0].id;
const activeDisasterId = () => (seed.disasters.find((d) => d.status === 'Active') ?? seed.disasters[0]).id;
const byRecency = (a: { time: string }, b: { time: string }) => agoMinutes(a.time) - agoMinutes(b.time);

function snap(slug?: string): Snapshot {
  const current = currentDisaster(slug);
  const mine = (id: string) => id === current.id;
  return {
    disaster: current,
    disasters: seed.disasters.map((d) => ({ ...d })),
    locations: locations.filter((l) => mine(l.disasterId)).map((l) => ({ ...l })),
    needs: needs.filter((n) => mine(n.disasterId)).map((n) => ({ ...n })),
    // Submissions and audit entries are scoped to the current operation so one
    // disaster page never shows another operation's traffic.
    subs: subs.filter((s) => mine(disasterOfNeed(s.needId))).map((s) => ({ ...s })),
    // Same allow-list the database applies to the public feed (migration 0016), so
    // local mode cannot show a row production would withhold.
    log: log.filter((l) => mine(l.disasterId) && isPublicAuditAction(l.action)).slice().sort(byRecency).map((l) => ({ ...l })),
    announcements: announcements.filter((x) => mine(x.disasterId)).map((x) => ({ ...x })),
    verifiedTotal: verifiedTotals[current.id] ?? 0,
  };
}

export class LocalRepo implements Repo {
  readonly kind = 'local' as const;

  async getSnapshot(slug?: string): Promise<Snapshot> {
    return snap(slug);
  }

  // National dashboard. Counters are derived here, in the data layer, from the
  // same records the disaster pages read (the Supabase implementation reads the
  // `disaster_overview` SQL view instead).
  async getOverview(): Promise<Overview> {
    const topOf = (disasterId: string, limit: number): TopNeed[] =>
      needs
        .filter((n) => n.disasterId === disasterId && remaining(n) > 0)
        .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank
          || remaining(y) - remaining(x))
        .slice(0, limit)
        .map((n) => ({
          id: n.id, name: n.name, priority: n.priority, cat: n.cat, remaining: remaining(n), unit: n.unit,
          disasterId: n.disasterId, disasterName: n.disasterName, disasterSlug: n.disasterSlug,
        }));

    const cards: DisasterCard[] = seed.disasters.map((d) => {
      const mine = needs.filter((n) => n.disasterId === d.id);
      const mySubs = subs.filter((s) => disasterOfNeed(s.needId) === d.id);
      const pend = mySubs.filter((s) => s.status === 'Pending verification');
      return {
        disaster: { ...d },
        activeNeeds: mine.filter((n) => remaining(n) > 0).length,
        completedNeeds: mine.filter((n) => remaining(n) === 0).length,
        pendingSubs: pend.length,
        pendingUnits: pend.reduce((x, s) => x + s.qty, 0),
        verifiedSubs: verifiedTotals[d.id] ?? 0,
        deliveryPoints: locations.filter((l) => l.disasterId === d.id).length,
        topNeeds: topOf(d.id, 2),
      };
    }).sort((x, y) => {
      // Active operations first, then most recently updated.
      const rank = (c: DisasterCard) => (c.disaster.status === 'Active' ? 0 : 1);
      return rank(x) - rank(y) || agoMinutes(x.disaster.updatedLabel) - agoMinutes(y.disaster.updatedLabel);
    });

    const active = cards.filter((c) => c.disaster.status === 'Active');
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
      log: log.filter((l) => isPublicAuditAction(l.action)).slice().sort(byRecency).slice(0, 12).map((l) => ({ ...l })),
      reports: reports
        .filter((r) => r.status === 'Pending verification')
        .slice()
        .sort((x, y) => y.reportCount - x.reportCount
          || agoMinutes(x.lastReportLabel) - agoMinutes(y.lastReportLabel))
        .map((r) => ({ ...r })),
      urgent: active
        .flatMap((c) => topOf(c.disaster.id, 3))
        .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank)
        .slice(0, 6),
      demo: cards.some((c) => c.disaster.demo === true),
    };
  }

  // ---- Coordinator dashboard ----------------------------------------------
  // The in-memory twin of `coordinator_overview()`. It exists so the panel is
  // usable without Supabase, and it deliberately uses the SAME score helper as the
  // migration mirrors — two formulas would mean two different orderings depending
  // on which backend was running.
  //
  // What it cannot mirror: authorization. Local mode has no session, so there is
  // nothing to check. That is a property of running without a database, not a
  // relaxed rule — every read here is guarded by is_coordinator() in production.
  async getCoordOverview(): Promise<CoordOverview> {
    const rows: CoordDisasterRow[] = seed.disasters.map((d) => {
      const mine = needs.filter((n) => n.disasterId === d.id);
      const mySubs = subs.filter((s) => disasterOfNeed(s.needId) === d.id);
      const pend = mySubs.filter((s) => s.status === 'Pending verification');
      const points = locations.filter((l) => l.disasterId === d.id);
      const critical = mine.filter((n) => n.priority === 'Critical' && remaining(n) > 0).length;
      const urgent = mine.filter((n) => n.priority === 'Urgent' && remaining(n) > 0).length;
      const requiredTotal = mine.reduce((x, n) => x + n.required, 0);
      const verifiedTotal = mine.reduce((x, n) => x + n.verified, 0);
      // Waiting time comes from the relative label the local records carry; a
      // submission whose age cannot be read is NOT counted as breached — guessing
      // would put a red "SLA aşıldı" badge on a row nobody can verify.
      const slaBreached = pend.filter((s) => agoMinutes(s.submitted) >= SLA_HOURS * 60).length;
      return {
        id: d.id, slug: d.slug, name: d.name, province: d.province, region: d.region,
        type: d.type, status: d.status,
        // Local records carry a display string ("21 Temmuz"), not a date. Passing it
        // through as if it were ISO would make "3. gün" a lie, so it stays empty.
        openedAt: '', demo: d.demo === true,
        lat: points.length ? points.reduce((x, l) => x + l.lat, 0) / points.length : null,
        lng: points.length ? points.reduce((x, l) => x + l.lng, 0) / points.length : null,
        criticalNeeds: critical,
        urgentNeeds: urgent,
        openNeeds: mine.filter((n) => remaining(n) > 0).length,
        completedNeeds: mine.filter((n) => remaining(n) === 0).length,
        requiredTotal,
        verifiedTotal,
        pendingSubs: pend.length,
        pendingUnits: pend.reduce((x, s) => x + s.qty, 0),
        slaBreached,
        // No decision timestamps in memory, so "bugün doğrulanan" stays 0 rather
        // than counting every verified row and calling it today's work.
        decidedToday: 0,
        deliveryPoints: points.length,
        pointsAtCapacity: points.filter((l) => l.capacityPct != null && l.capacityPct >= 85).length,
        pointsCapacityUnknown: points.filter((l) => l.capacityPct == null).length,
        volunteers: d.volunteers,
        onShift: d.onShift,
        pendingVolunteers: volunteerApps.filter((v) => v.disasterId === d.id && v.status === 'Pending review').length,
        openNeedRequests: 0,
        lastActivityAt: null,
        urgency: urgencyScore({
          status: d.status, critical, urgent, pending: pend.length,
          slaBreached, deliveryPoints: points.length, required: requiredTotal, verified: verifiedTotal,
        }),
      };
    }).sort((x, y) => y.urgency - x.urgency || x.name.localeCompare(y.name, 'tr'));
    return { disasters: rows, slaHours: SLA_HOURS };
  }

  async getCoordQueue(limit: number): Promise<CoordQueueItem[]> {
    const byId = new Map(seed.disasters.map((d) => [d.id, d] as const));
    return subs
      .filter((s) => s.status === 'Pending verification')
      .map((s) => {
        const need = needs.find((n) => n.id === s.needId);
        const d = need ? byId.get(need.disasterId) : undefined;
        const mins = agoMinutes(s.submitted);
        return {
          id: s.id, code: s.code,
          disasterId: d?.id ?? '', disasterSlug: d?.slug ?? '', disasterName: d?.name ?? '',
          needId: s.needId, needName: need?.name ?? '', needPriority: need?.priority ?? 'Normal',
          contributor: s.contributor, qty: s.qty, unit: s.unit, loc: s.loc, note: s.note,
          hasPhoto: !!s.photoUrl,
          submittedAt: '', waitingHours: Number.isFinite(mins) ? Math.round(mins / 60) : 0,
          slaBreached: Number.isFinite(mins) && mins >= SLA_HOURS * 60,
        };
      })
      .sort((x, y) => y.waitingHours - x.waitingHours)
      .slice(0, Math.max(1, limit));
  }

  async setLocationCapacity(locationId: string, pct: number | null, note: string): Promise<Snapshot> {
    const l = locations.find((x) => x.id === locationId);
    if (l) {
      l.capacityPct = pct;
      l.capacityNote = note;
      l.capacityUpdated = 'az önce';
    }
    return this.getSnapshot();
  }

  // ---- Banner slides -------------------------------------------------------
  // Writes stay in memory: without Supabase there is nowhere to persist to, and
  // pretending otherwise would be worse than saying so in the UI.
  async listSlides(): Promise<BannerSlide[]> {
    return slides.slice().sort((x, y) => x.sortOrder - y.sortOrder);
  }

  async saveSlide(id: string | null, input: BannerSlideInput): Promise<BannerSlide[]> {
    if (!isLocalSlideImage(input.image)) throw new Error('slide image must be a local /banners path');
    if (id) {
      slides = slides.map((sl) => (sl.id === id ? { ...sl, ...input } : sl));
    } else {
      slides = [...slides, { id: nextId('slide'), ...input }];
    }
    return this.listSlides();
  }

  async reorderSlides(orderedIds: string[]): Promise<BannerSlide[]> {
    const pos = new Map(orderedIds.map((id, i) => [id, i + 1] as const));
    slides = slides.map((sl) => ({ ...sl, sortOrder: pos.get(sl.id) ?? sl.sortOrder }));
    return this.listSlides();
  }

  async deleteSlide(id: string): Promise<BannerSlide[]> {
    slides = slides.filter((sl) => sl.id !== id);
    return this.listSlides();
  }

  // A correction request never mutates the record it targets — that is the whole
  // point of a verified badge. Here it only lands in the audit trail; the Supabase
  // implementation stores the proposal for the coordinator queue.
  async submitOrgEditRequest(input: OrgEditRequestInput): Promise<void> {
    const target = orgs.find((o) => o.id === input.orgId);
    if (target) {
      orgEdits.unshift({
        id: `oer-${orgEdits.length + 1}-${target.id}`,
        orgId: target.id, orgName: target.name, orgStatus: target.status,
        proposed: input.proposed, current: orgEditableFrom(target),
        changedFields: input.changedFields.slice(), note: input.note.trim(),
        status: 'Pending review', reviewNote: '',
        submittedByName: input.submittedByName.trim(),
        submittedByEmail: input.submittedByEmail.trim(),
        submittedByPhone: input.submittedByPhone.trim(),
        createdLabel: NOW, reviewedLabel: '',
      });
    }
    addLog(activeDisasterId(), {
      user: input.submittedByName || 'Misafir',
      action: 'Kurum düzeltme talebi',
      detail: `${target?.name ?? input.orgId} · ${input.changedFields.length} alan`,
      oldValue: 'Yayındaki kayıt',
      newValue: 'Koordinatör incelemesi bekliyor',
      color: '#E6A700',
    });
  }

  // Requests are re-projected against the CURRENT record on every read, so a diff is
  // never shown against a stale "current" value.
  async countOpenOrgEditRequests(): Promise<number> {
    return orgEdits.filter((r) => r.status === 'Pending review').length;
  }

  async listOrgEditRequests(): Promise<OrgEditRequest[]> {
    return orgEdits.map((r) => {
      const live = orgs.find((o) => o.id === r.orgId);
      return live ? { ...r, orgName: live.name, orgStatus: live.status, current: orgEditableFrom(live) } : { ...r };
    });
  }

  async applyOrgEditRequest(id: string, fields: string[], note: string): Promise<Organization[]> {
    const req = orgEdits.find((r) => r.id === id);
    if (!req) throw new Error('edit request not found');
    if (req.status !== 'Pending review') throw new Error('edit request already reviewed');
    const target = orgs.find((o) => o.id === req.orgId);
    if (!target) throw new Error('organization not found');
    // Only fields the requester actually changed, and only from the allow-list. The
    // authoritative version of this rule is review_org_edit_request_apply() in
    // migration 0012; this mirrors it so local mode cannot behave more permissively.
    const keys = fields.filter((k) => req.changedFields.includes(k)
      && (ORG_EDITABLE_KEYS as readonly string[]).includes(k));
    if (keys.length === 0) throw new Error('no applicable fields selected');
    const before = orgEditableFrom(target);
    for (const k of keys) {
      const v = (req.proposed as unknown as Record<string, unknown>)[k];
      (target as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? v.slice() : v;
    }
    req.status = 'Applied';
    req.reviewNote = note.trim();
    req.reviewedLabel = NOW;
    addLog(activeDisasterId(), {
      user: 'Koordinatör',
      action: 'Kurum düzeltmesi uygulandı',
      detail: `${target.name} · ${keys.length} alan`,
      oldValue: keys.map((k) => orgFieldText(before, k)).join(' | ') || '—',
      newValue: keys.map((k) => orgFieldText(orgEditableFrom(target), k)).join(' | '),
      color: '#159947',
    });
    return this.listOrganizations();
  }

  async rejectOrgEditRequest(id: string, note: string): Promise<void> {
    const req = orgEdits.find((r) => r.id === id);
    if (!req) throw new Error('edit request not found');
    if (req.status !== 'Pending review') throw new Error('edit request already reviewed');
    if (note.trim().length < 5) throw new Error('reject reason required');
    req.status = 'Rejected';
    req.reviewNote = note.trim();
    req.reviewedLabel = NOW;
    addLog(activeDisasterId(), {
      user: 'Koordinatör',
      action: 'Kurum düzeltmesi reddedildi',
      detail: req.orgName,
      oldValue: `Talep edilen: ${req.changedFields.length} alan`,
      newValue: note.trim(),
      color: '#D9363E',
    });
  }


  // ---- Per-operation public content ----------------------------------------
  async saveAnnouncement(id: string | null, input: AnnouncementInput, author: string): Promise<Snapshot> {
    if (!input.title.trim()) throw new Error('title required');
    const d = seed.disasters.find((x) => x.id === input.disasterId);
    if (!d) throw new Error('unknown disaster');
    if (id) {
      const target = announcements.find((x) => x.id === id);
      if (!target) throw new Error('announcement not found');
      Object.assign(target, {
        kind: input.kind, accent: input.accent, title: input.title.trim(),
        body: input.body.trim(), image: input.image, time: NOW,
      });
      addLog(d.id, {
        user: author || 'Koordinatör', action: 'Duyuru güncellendi',
        detail: target.title, oldValue: 'Yayındaki duyuru', newValue: 'Güncellendi', color: '#2A6FB0',
      });
    } else {
      announcements = [{
        id: nextId('an'), disasterId: input.disasterId, kind: input.kind, accent: input.accent,
        time: NOW, author: author || 'Koordinatör', title: input.title.trim(),
        body: input.body.trim(), image: input.image,
      }, ...announcements];
      addLog(d.id, {
        user: author || 'Koordinatör', action: 'Duyuru yayınlandı',
        detail: input.title.trim(), oldValue: '—',
        newValue: input.image ? 'Görselli duyuru' : 'Duyuru', color: '#2A6FB0',
      });
    }
    return snap(d.slug);
  }

  async deleteAnnouncement(id: string): Promise<Snapshot> {
    const target = announcements.find((x) => x.id === id);
    if (!target) throw new Error('announcement not found');
    const d = seed.disasters.find((x) => x.id === target.disasterId);
    announcements = announcements.filter((x) => x.id !== id);
    addLog(target.disasterId, {
      user: 'Koordinatör', action: 'Duyuru kaldırıldı',
      detail: target.title, oldValue: target.title, newValue: '—', color: '#D9363E',
    });
    return snap(d?.slug);
  }

  async saveLocation(id: string | null, input: LocationInput): Promise<Snapshot> {
    if (!input.name.trim()) throw new Error('name required');
    const d = seed.disasters.find((x) => x.id === input.disasterId);
    if (!d) throw new Error('unknown disaster');
    // statusTone and the display coordinate string are derived, never stored twice:
    // a hand-set tone could disagree with the status text next to it.
    const derived = {
      statusTone: /00/.test(input.status) ? ('yellow' as const) : ('green' as const),
      coords: input.lat != null && input.lng != null ? `${input.lat}° K, ${input.lng}° D` : '',
      lat: input.lat ?? 0, lng: input.lng ?? 0,
    };
    if (id) {
      const target = locations.find((x) => x.id === id);
      if (!target) throw new Error('location not found');
      const before = target.status;
      Object.assign(target, {
        name: input.name.trim(), address: input.address.trim(), hours: input.hours.trim(),
        accepts: input.accepts.trim(), contact: input.contact.trim(), phone: input.phone.trim(),
        status: input.status.trim(), ...derived,
      });
      addLog(d.id, {
        user: 'Koordinatör', action: 'Teslim noktası güncellendi',
        detail: target.name, oldValue: before || '—', newValue: target.status || '—', color: '#E6A700',
      });
    } else {
      locations = [...locations, {
        id: nextId('loc'), disasterId: input.disasterId,
        name: input.name.trim(), address: input.address.trim(), hours: input.hours.trim(),
        accepts: input.accepts.trim(), contact: input.contact.trim(), phone: input.phone.trim(),
        status: input.status.trim(),
        // A new point has never been measured. Not 0 — unknown (migration 0025).
        capacityPct: null, capacityNote: '', capacityUpdated: '',
        ...derived,
      }];
      addLog(d.id, {
        user: 'Koordinatör', action: 'Teslim noktası eklendi',
        detail: input.name.trim(), oldValue: '—',
        newValue: input.address.trim() || input.name.trim(), color: '#159947',
      });
    }
    return snap(d.slug);
  }

  async deleteLocation(id: string): Promise<Snapshot> {
    const target = locations.find((x) => x.id === id);
    if (!target) throw new Error('location not found');
    const d = seed.disasters.find((x) => x.id === target.disasterId);
    locations = locations.filter((x) => x.id !== id);
    addLog(target.disasterId, {
      user: 'Koordinatör', action: 'Teslim noktası kaldırıldı',
      detail: target.name, oldValue: target.name, newValue: '—', color: '#D9363E',
    });
    return snap(d?.slug);
  }

  // ---- Coordinator organization management ---------------------------------
  async saveOrganization(id: string | null, input: OrganizationSave, publishVerified: boolean): Promise<Organization[]> {
    if (id) {
      const target = orgs.find((o) => o.id === id);
      if (!target) throw new Error('organization not found');
      Object.assign(target, { ...input, services: input.services.slice() });
      addLog(activeDisasterId(), {
        user: 'Koordinatör', action: 'Kurum kaydı güncellendi',
        detail: target.name, oldValue: 'Yayındaki kayıt', newValue: 'Güncellendi', color: '#2A6FB0',
      });
      return this.listOrganizations();
    }
    // Only an admin's record goes live verified; a coordinator's lands in the review
    // queue like a visitor's. Mirrors organizations_public_insert in migration 0014 —
    // local mode must never behave more permissively than the database.
    const created: Organization = {
      id: nextId('org'), ...input, services: input.services.slice(),
      status: publishVerified ? 'Verified' : 'Pending verification',
      isOfficial: publishVerified && (input.kind === 'Kamu kurumu' || input.kind === 'Belediye'),
      logo: '', verifiedAt: publishVerified ? new Date().toISOString() : null, createdLabel: NOW,
    };
    orgs = [created, ...orgs];
    addLog(activeDisasterId(), {
      user: 'Koordinatör', action: 'Kurum eklendi',
      detail: `${created.name}${created.province ? ` · ${created.province}` : ''}`,
      oldValue: '—', newValue: created.status === 'Verified' ? 'Doğrulandı' : 'Doğrulama bekliyor',
      color: created.status === 'Verified' ? '#159947' : '#E6A700',
    });
    return this.listOrganizations();
  }

  async verifyOrganization(id: string, status: OrgStatus, reason: string): Promise<Organization[]> {
    const target = orgs.find((o) => o.id === id);
    if (!target) throw new Error('organization not found');
    if (status === 'Rejected' && reason.trim().length === 0) throw new Error('reject reason required');
    const before = target.status;
    target.status = status;
    target.verifiedAt = status === 'Verified' ? new Date().toISOString() : null;
    if (status === 'Verified' && (target.kind === 'Kamu kurumu' || target.kind === 'Belediye')) {
      target.isOfficial = true;
    }
    addLog(activeDisasterId(), {
      user: 'Koordinatör',
      action: status === 'Verified' ? 'Kurum doğrulandı' : status === 'Rejected' ? 'Kurum reddedildi' : 'Kurum durumu güncellendi',
      detail: target.name, oldValue: before, newValue: status,
      color: status === 'Verified' ? '#159947' : status === 'Rejected' ? '#D9363E' : '#E6A700',
    });
    return this.listOrganizations();
  }

  // ---- Volunteer applications ----------------------------------------------
  async submitVolunteerApplication(input: VolunteerInput): Promise<string> {
    if (!input.consent) throw new Error('consent required');
    if (!input.phone.trim() && !input.email.trim()) throw new Error('contact required');
    const d = input.disasterId ? seed.disasters.find((x) => x.id === input.disasterId) : undefined;
    const id = nextId('vol');
    volunteerApps.unshift({
      id, code: localVolunteerCode(),
      disasterId: input.disasterId, disasterName: d?.name ?? '',
      fullName: input.fullName.trim(), phone: input.phone.trim(), email: input.email.trim(),
      province: input.province, district: input.district,
      skills: input.skills.slice(), availability: input.availability, note: input.note.trim(),
      status: 'Pending review', reviewNote: '', createdLabel: NOW, reviewedLabel: '',
      onShift: false, shiftSinceLabel: '', standingConsent: input.standingConsent,
    });
    addLog(d?.id ?? activeDisasterId(), {
      user: input.fullName.trim() || 'Gönüllü', action: 'Gönüllü başvurusu alındı',
      detail: [input.province, input.skills[0]].filter(Boolean).join(' · ') || 'Genel havuz',
      oldValue: '—', newValue: 'Koordinatör incelemesi bekliyor', color: '#E6A700',
    });
    return id;
  }

  // Local mode has no session, so "mine" is matched on the address in the form — the
  // Supabase implementation matches the ACCOUNT's address server-side instead, which is
  // the part that actually protects the rows.
  async listMyVolunteerApplications(): Promise<VolunteerApplication[]> {
    return volunteerApps.map((v) => ({ ...v, skills: v.skills.slice() }));
  }

  async updateMyVolunteerApplication(id: string, input: VolunteerInput): Promise<VolunteerApplication[]> {
    const app = volunteerApps.find((v) => v.id === id);
    if (!app) throw new Error('not authorized');
    if (app.status === 'Rejected' || app.status === 'Withdrawn') throw new Error('application closed');
    if (input.skills.length === 0) throw new Error('at least one skill required');
    const d = input.disasterId ? seed.disasters.find((x) => x.id === input.disasterId) : undefined;
    const wasApproved = app.status === 'Approved';
    Object.assign(app, {
      disasterId: input.disasterId, disasterName: d?.name ?? '',
      fullName: input.fullName.trim(), phone: input.phone.trim(),
      province: input.province, district: input.district,
      skills: input.skills.slice(), availability: input.availability, note: input.note.trim(),
      // Editing an approved application puts it back in the queue: the approval was a
      // decision about the previous version (mirrors migration 0018).
      status: wasApproved ? 'Pending review' : app.status,
      reviewNote: wasApproved ? '' : app.reviewNote,
      onShift: wasApproved ? false : app.onShift,
      shiftSinceLabel: wasApproved ? '' : app.shiftSinceLabel,
    });
    addLog(d?.id ?? activeDisasterId(), {
      user: app.fullName || 'Gönüllü', action: 'Gönüllü başvurusu güncellendi',
      detail: app.fullName, oldValue: wasApproved ? 'Approved' : app.status,
      newValue: app.status, color: '#2A6FB0',
    });
    return this.listMyVolunteerApplications();
  }

  // One answer for the person: every application carries the same value (migration 0022).
  async setMyVolunteerConsent(on: boolean): Promise<VolunteerApplication[]> {
    const app = volunteerApps[0];
    if (!app) throw new Error('not authorized');
    volunteerApps.forEach((v) => { v.standingConsent = on; });
    addLog(activeDisasterId(), {
      user: app.fullName || 'Gönüllü',
      action: on ? 'Aktif gönüllü izni verildi' : 'Aktif gönüllü izni geri alındı',
      detail: app.fullName, oldValue: on ? 'İzin yok' : 'İzinli',
      newValue: on ? 'İzinli' : 'İzin yok', color: '#2A6FB0',
    });
    return this.listMyVolunteerApplications();
  }

  async withdrawMyVolunteerApplication(id: string): Promise<VolunteerApplication[]> {
    const app = volunteerApps.find((v) => v.id === id);
    if (!app) throw new Error('not authorized');
    // Mirrors migration 0021: once accepted, the roster does not change without the
    // coordinator knowing.
    if (app.status === 'Approved') throw new Error('an approved application cannot be withdrawn');
    const before = app.status;
    app.status = 'Withdrawn';
    app.onShift = false;
    app.shiftSinceLabel = '';
    addLog(activeDisasterId(), {
      user: app.fullName || 'Gönüllü', action: 'Gönüllü başvurusu geri çekildi',
      detail: app.fullName, oldValue: before, newValue: 'Withdrawn', color: '#8095A8',
    });
    return this.listMyVolunteerApplications();
  }

  async listVolunteerApplications(): Promise<VolunteerApplication[]> {
    return volunteerApps.map((v) => ({ ...v, skills: v.skills.slice() }));
  }

  async setVolunteerShift(applicationId: string, onShift: boolean): Promise<VolunteerApplication[]> {
    const app = volunteerApps.find((v) => v.id === applicationId);
    if (!app) throw new Error('application not found');
    if (onShift && app.status !== 'Approved') throw new Error('only an approved volunteer can be on shift');
    app.onShift = onShift;
    app.shiftSinceLabel = onShift ? NOW : '';
    addLog(app.disasterId ?? activeDisasterId(), {
      user: 'Koordinatör',
      action: onShift ? 'Gönüllü nöbete alındı' : 'Gönüllü nöbetten çıktı',
      detail: app.fullName,
      oldValue: onShift ? 'Nöbette değil' : 'Nöbette',
      newValue: onShift ? 'Nöbette' : 'Nöbette değil', color: '#2A6FB0',
    });
    return this.listVolunteerApplications();
  }

  // Unfiltered, unlike the public feed: this is what the panel's system log shows.
  async listSystemLog(limit: number): Promise<LogEntry[]> {
    return log.slice().sort(byRecency).slice(0, limit).map((l) => ({ ...l }));
  }

  async reviewVolunteerApplication(id: string, status: VolunteerStatus, note: string): Promise<VolunteerApplication[]> {
    const app = volunteerApps.find((v) => v.id === id);
    if (!app) throw new Error('application not found');
    if (app.status !== 'Pending review' && app.status !== 'On hold') throw new Error('application already decided');
    if ((status === 'Rejected' || status === 'On hold') && note.trim().length < 5) throw new Error('reason required');
    const before = app.status;
    app.status = status;
    app.reviewNote = note.trim();
    app.reviewedLabel = NOW;
    addLog(app.disasterId ?? activeDisasterId(), {
      user: 'Koordinatör', action: 'Gönüllü başvurusu değerlendirildi',
      detail: app.fullName, oldValue: before, newValue: status,
      color: status === 'Approved' ? '#159947' : status === 'Rejected' ? '#D9363E' : '#E6A700',
    });
    return this.listVolunteerApplications();
  }

  // ---- Staff ----------------------------------------------------------------
  // Without a backend there are no accounts to list, so the staff table is empty and
  // only invites can be recorded. Saying so is better than inventing colleagues.
  async listStaff(): Promise<{ staff: StaffMember[]; invites: RoleInvite[] }> {
    return { staff: [], invites: roleInvites.map((i) => ({ ...i })) };
  }

  async grantStaffRole(email: string, role: StaffRole, note: string, orgId: string | null): Promise<'granted' | 'invited'> {
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) throw new Error('invalid e-mail');
    const org = orgId ? orgs.find((o) => o.id === orgId && o.status === 'Verified') : undefined;
    if (orgId && !org) throw new Error('organization must exist and be verified');
    roleInvites = [
      { email: clean, role, note: note.trim(), createdLabel: NOW, orgId: org?.id ?? null, orgName: org?.name ?? '' },
      ...roleInvites.filter((i) => i.email !== clean),
    ];
    addLog(activeDisasterId(), {
      user: 'Yönetici', action: 'Yetki daveti oluşturuldu',
      detail: [clean, org?.name].filter(Boolean).join(' · '),
      oldValue: '—', newValue: role, color: '#E6A700',
    });
    return 'invited';
  }

  async revokeStaffRole(): Promise<void> {
    throw new Error('no backend');
  }

  async cancelRoleInvite(email: string): Promise<void> {
    roleInvites = roleInvites.filter((i) => i.email !== email.trim().toLowerCase());
  }

  // Directory entries are public as soon as they are submitted; the pending ones
  // carry a "Doğrulama bekliyor" badge until a coordinator verifies them.
  async listOrganizations(): Promise<Organization[]> {
    const rank = (o: Organization) => (o.status === 'Verified' ? 0 : 1);
    return orgs
      .filter((o) => o.status !== 'Rejected')
      .slice()
      .sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name, 'tr'))
      .map((o) => ({ ...o }));
  }

  // Suggestion pass: what the reporter probably means before they create a new row.
  async findSimilarReports(input: DisasterReportInput): Promise<DisasterReport[]> {
    return reports
      .filter((r) => r.status === 'Pending verification' && isSameEvent(r, input))
      .sort((x, y) => y.reportCount - x.reportCount)
      .map((r) => ({ ...r }));
  }

  // Writing a report applies the merge rule itself, so a duplicate cannot be
  // created by racing the suggestion step or by skipping the UI.
  async submitDisasterReport(input: DisasterReportInput): Promise<{ report: DisasterReport; merged: boolean }> {
    const existing = reports.find((r) => r.status === 'Pending verification' && isSameEvent(r, input));
    if (existing) {
      const merged = { ...existing, reportCount: existing.reportCount + 1, lastReportLabel: NOW };
      reports = reports.map((r) => (r.id === existing.id ? merged : r));
      addLog(activeDisasterId(), {
        user: input.name || 'Misafir', action: 'Afet bildirimi birleştirildi',
        detail: `${merged.province}${merged.district ? ' / ' + merged.district : ''} · ${merged.type}`,
        oldValue: `${existing.reportCount} kişi bildirdi`, newValue: `${merged.reportCount} kişi bildirdi`,
        color: '#E6A700',
      });
      return { report: { ...merged }, merged: true };
    }

    const created: DisasterReport = {
      id: nextId('rep'), type: input.type,
      province: input.province.trim(), district: input.district.trim(),
      locationNote: input.locationNote.trim(), occurredOn: input.occurredOn,
      description: input.description.trim(),
      reportCount: 1, status: 'Pending verification', disasterSlug: null,
      createdLabel: NOW, lastReportLabel: NOW,
    };
    reports = [created, ...reports];
    addLog(activeDisasterId(), {
      user: input.name || 'Misafir', action: 'Afet bildirimi gönderildi',
      detail: `${created.province}${created.district ? ' / ' + created.district : ''} · ${created.type}`,
      oldValue: '—', newValue: '1 kişi bildirdi', color: '#E6A700',
    });
    return { report: { ...created }, merged: false };
  }

  // "Bildirimi Doğrula" on an existing report. Mirrors migration 0016: one e-mail
  // counts once, and the threshold opens an operation whose initiator is the crowd.
  async confirmDisasterReport(reportId: string, who: ReportConfirmInput): Promise<ReportConfirmResult> {
    const r = reports.find((x) => x.id === reportId);
    if (!r) throw new Error('report not found');
    if (r.status !== 'Pending verification') throw new Error('report not open');
    const email = who.email.trim().toLowerCase();
    if (who.name.trim().length < 3) throw new Error('name required');
    if (email.indexOf('@') < 1) throw new Error('email required');
    if (who.province.trim().length < 2) throw new Error('province required');

    if (confirmations.some((c) => c.reportId === reportId && c.email === email)) {
      return { report: { ...r }, already: true, createdSlug: '' };
    }
    confirmations = [...confirmations, { reportId, email }];

    const next = { ...r, reportCount: r.reportCount + 1, lastReportLabel: NOW };
    reports = reports.map((x) => (x.id === reportId ? next : x));
    addLog(activeDisasterId(), {
      user: 'Topluluk', action: 'Afet bildirimi doğrulandı',
      detail: `${next.province}${next.district ? ' / ' + next.district : ''} · ${disasterTypeLabel[next.type]}`,
      oldValue: `${r.reportCount} kişi bildirdi`, newValue: `${next.reportCount} kişi bildirdi`,
      color: '#E6A700',
    });

    let createdSlug = '';
    if (next.reportCount >= COMMUNITY_THRESHOLD && !next.disasterSlug) {
      createdSlug = openFromReport(next, true);
    }
    const after = reports.find((x) => x.id === reportId)!;
    return { report: { ...after }, already: false, createdSlug };
  }

  async listReportQueue(): Promise<ReportQueueItem[]> {
    return reports
      .slice()
      .sort((x, y) => y.reportCount - x.reportCount)
      .map((r) => {
        const d = r.disasterSlug ? seed.disasters.find((x) => x.slug === r.disasterSlug) : undefined;
        return {
          ...r,
          rejectReason: rejectReasons[r.id] ?? '',
          disasterId: d?.id ?? '',
          confirmations: confirmations.filter((c) => c.reportId === r.id).length,
          contacts: 0,
          openedByCommunity: d?.openedByCommunity === true,
          communityConfirmed: d?.communityConfirmed === true,
        };
      });
  }

  async reviewDisasterReport(reportId: string, action: 'publish' | 'reject', reason: string): Promise<string> {
    const r = reports.find((x) => x.id === reportId);
    if (!r) throw new Error('report not found');
    if (action === 'publish') return openFromReport(r, false);
    if (reason.trim().length < 5) throw new Error('reason required');
    if (r.disasterSlug) throw new Error('report already published');
    rejectReasons[reportId] = reason.trim();
    reports = reports.map((x) => (x.id === reportId ? { ...x, status: 'Rejected' } : x));
    return '';
  }

  async confirmCommunityDisaster(disasterId: string): Promise<void> {
    const i = seed.disasters.findIndex((d) => d.id === disasterId);
    if (i < 0) throw new Error('disaster not found');
    const d = seed.disasters[i];
    if (!d.openedByCommunity || d.communityConfirmed) throw new Error('not a pending community operation');
    seed.disasters[i] = { ...d, communityConfirmed: true, updatedLabel: NOW };
    addLog(disasterId, {
      action: 'Topluluk afeti doğrulandı', detail: d.name,
      oldValue: 'Doğrulama bekliyor', newValue: 'Koordinatör doğruladı', color: '#159947',
    });
  }

  async submitOrganization(input: OrganizationInput): Promise<Organization> {
    // A visitor can never publish an entry as verified or as an official body.
    const created: Organization = {
      id: nextId('org'),
      name: input.name.trim(),
      kind: input.kind,
      scope: input.scope,
      province: input.province.trim(),
      district: input.district.trim(),
      services: input.services.filter(Boolean),
      description: input.description.trim(),
      website: input.website.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      emergencyPhone: input.emergencyPhone.trim(),
      address: input.address.trim(),
      status: 'Pending verification',
      isOfficial: false,
      // Logos are coordinator-set only; a submitted entry starts without one.
      logo: '',
      verifiedAt: null,
      createdLabel: NOW,
    };
    orgs = [created, ...orgs];
    addLog(activeDisasterId(), {
      user: input.submittedByName || 'Misafir',
      action: 'Kurum kaydı gönderildi',
      detail: `${created.name}${created.province ? ' · ' + created.province : ''}`,
      oldValue: '—', newValue: 'Doğrulama bekliyor', color: '#E6A700',
    });
    return { ...created };
  }

  async createDelivery(f: DeliveryInput): Promise<CreateDeliveryResult> {
    const need = find(f.needId)!;
    const code = genCode(Math.random());
    const unit = f.unit || need.unit;
    needs = needs.map((n) => (n.id === f.needId ? { ...n, pending: n.pending + f.qty, updated: NOW } : n));
    subs = [
      {
        id: code, code, contributor: f.name, city: f.city, needId: f.needId, qty: f.qty, unit,
        loc: f.loc, submitted: NOW, status: 'Pending verification', verifiedQty: null,
        note: f.notes || 'Giriş kontrolü bekleniyor.', photoUrl: f.photoUrl ?? null,
      },
      ...subs,
    ];
    addLog(need.disasterId, {
      user: 'Sistem', action: 'Teslimat bildirildi',
      detail: `${need.name} · ${code} · ${f.qty} ${unit}`,
      oldValue: '—', newValue: 'Doğrulama bekliyor', color: '#E6A700',
    });
    return { snapshot: snap(), code };
  }

  async verifySubmission(subId: string, kind: VerifyKind, qtyIn: number, reason: string): Promise<Snapshot> {
    const sub = subs.find((s) => s.id === subId);
    if (!sub) return snap();
    const need = find(sub.needId)!;

    if (kind === 'reject') {
      subs = subs.map((x) => (x.id === sub.id ? { ...x, status: 'Rejected', verifiedQty: 0, note: reason || 'Teslim noktasında doğrulanamadı.' } : x));
      needs = needs.map((n) => (n.id === need.id ? { ...n, pending: Math.max(0, n.pending - sub.qty), updated: NOW } : n));
      addLog(need.disasterId, { action: 'Teslimat reddedildi', detail: `${need.name} · ${sub.code} · ${sub.qty} ${sub.unit}`, oldValue: 'Doğrulama bekliyor', newValue: 'Reddedildi', color: '#D9363E' });
      return snap();
    }
    if (kind === 'info') {
      subs = subs.map((x) => (x.id === sub.id ? { ...x, status: 'Information requested', note: reason || 'Koordinatör teslimatın fotoğrafını istedi.' } : x));
      addLog(need.disasterId, { action: 'Bilgi istendi', detail: `${need.name} · ${sub.code}`, oldValue: 'Doğrulama bekliyor', newValue: 'Bilgi istendi', color: '#E6A700' });
      return snap();
    }

    // approve / partial
    const qty = Math.max(0, Math.min(qtyIn || 0, sub.qty));
    const before = need.verified;
    const after = Math.min(need.required, before + qty);
    const partial = qty < sub.qty;
    const nowComplete = need.required - after <= 0;

    subs = subs.map((x) => (x.id === sub.id ? {
      ...x, status: partial ? 'Partially verified' : 'Verified', verifiedQty: qty,
      note: reason || (partial ? `${sub.qty - qty} ürün doğrulanamadı.` : 'Girişte sayıldı ve kabul edildi.'),
    } : x));
    needs = needs.map((n) => (n.id === need.id ? {
      ...n, verified: after, pending: Math.max(0, n.pending - sub.qty), updated: NOW,
      priority: nowComplete ? 'Completed' : n.priority,
    } : n));
    verifiedTotals[need.disasterId] = (verifiedTotals[need.disasterId] ?? 0) + 1;

    addLog(need.disasterId, {
      action: partial ? 'Teslimat kısmen doğrulandı' : 'Teslimat doğrulandı',
      detail: `${need.name} · ${sub.code} · ${sub.qty} ${sub.unit} içinden ${qty}`,
      oldValue: `${before} doğrulandı`, newValue: `${after} doğrulandı`,
      color: partial ? '#F97316' : '#159947',
    });
    if (nowComplete) {
      addLog(need.disasterId, { action: 'İhtiyaç tamamlandı', detail: `${need.name} gerekli miktara ulaştı`, oldValue: 'Aktif', newValue: 'Tamamlandı', color: '#159947' });
    }
    return snap();
  }

  // Seed disasters live in a module-level array; a coordinator edit mutates that copy.
  // In local mode this resets on reload, which the panel states.
  async saveDisaster(id: string | null, input: DisasterInput): Promise<Snapshot> {
    const region = [input.district, input.province].filter(Boolean).join(', ') + ' · Türkiye';
    if (id) {
      const before = seed.disasters.find((d) => d.id === id);
      if (!before) throw new Error(`unknown disaster: ${id}`);
      const next: Disaster = {
        ...before, name: input.name.trim(), type: input.type, province: input.province,
        districts: splitDistricts(input.district),
        region, status: input.status, situation: input.situation.trim(),
        openedByOrgId: input.openedByOrgId, updatedLabel: NOW,
      };
      const i = seed.disasters.findIndex((d) => d.id === id);
      seed.disasters[i] = next;
      addLog(id, {
        action: 'Afet kaydı güncellendi', detail: next.name,
        oldValue: before.status, newValue: next.status, color: '#102A43',
      });
      return snap(next.slug);
    }
    const created: Disaster = {
      id: nextId('d'), slug: disasterSlug(input.name, new Date()), legacySlugs: [],
      name: input.name.trim(), region, province: input.province, type: input.type,
      districts: splitDistricts(input.district),
      status: input.status, situation: input.situation.trim(),
      openedAt: new Date().toISOString().slice(0, 10), updatedLabel: NOW,
      // Counted from approved volunteer applications, never typed (migration 0017).
      volunteers: 0, onShift: 0,
      openedByOrgId: input.openedByOrgId,
    };
    seed.disasters.unshift(created);
    addLog(created.id, {
      action: 'Afet operasyonu açıldı', detail: created.name,
      oldValue: '—', newValue: 'Aktif', color: '#D9363E',
    });
    return snap(created.slug);
  }

  async publishNeed(p: NeedPayload): Promise<Snapshot> {
    const id = nextId('n');
    // The need belongs to the operation the coordinator picked. A slug that does not
    // resolve is an error, not a reason to fall back to "the first active disaster" —
    // that silent fallback let a need land on the wrong operation.
    const target = p.disasterSlug
      ? currentDisasterOrThrow(p.disasterSlug)
      : seed.disasters.find((d) => d.id === activeDisasterId())!;
    needs = [
      { id, disasterId: target.id, disasterName: target.name, disasterSlug: target.slug, name: p.title, cat: p.category, priority: p.priority, required: p.required, verified: 0, pending: 0, unit: p.unit || 'adet', updated: NOW, loc: p.loc, details: p.details },
      ...needs,
    ];
    addLog(target.id, { action: 'İhtiyaç oluşturuldu', detail: `${p.title} · ${p.priority}`, oldValue: '—', newValue: `${p.required} ${p.unit || 'adet'} gerekli`, color: '#102A43' });
    // Return the snapshot of the operation that was actually written to, so the UI
    // cannot show a success while looking at a different disaster.
    return snap(target.slug);
  }

  async bumpNeed(needId: string): Promise<Snapshot> {
    const n = find(needId);
    if (!n) return snap();
    const before = n.required;
    needs = needs.map((x) => (x.id === needId ? { ...x, required: x.required + 10, priority: x.priority === 'Completed' ? 'Urgent' : x.priority, updated: NOW } : x));
    addLog(n.disasterId, { action: 'Miktar güncellendi', detail: `${n.name} gerekli miktarı artırıldı`, oldValue: `${before} gerekli`, newValue: `${before + 10} gerekli`, color: '#102A43' });
    return snap();
  }

  async togglePause(needId: string): Promise<Snapshot> {
    const n = find(needId);
    if (!n) return snap();
    const next = n.priority === 'Paused' ? 'Urgent' : 'Paused';
    needs = needs.map((x) => (x.id === needId ? { ...x, priority: next, updated: NOW } : x));
    addLog(n.disasterId, { action: next === 'Paused' ? 'İhtiyaç duraklatıldı' : 'İhtiyaç sürdürüldü', detail: n.name, oldValue: n.priority, newValue: next, color: '#E6A700' });
    return snap();
  }

  async submitNeedRequest(p: NeedPayload, contact: { name: string; email: string; phone: string; city: string }): Promise<{ snapshot: Snapshot; code: string }> {
    const code = genNrq(Math.random());
    addLog(activeDisasterId(), { user: contact.name || 'Misafir', action: 'İhtiyaç talebi gönderildi', detail: `${p.title || 'Başlıksız ihtiyaç'} · ${code}`, oldValue: '—', newValue: 'Doğrulama bekliyor', color: '#E6A700' });
    return { snapshot: snap(), code };
  }

  // No auth in local mode, so "mine" cannot be resolved. The seed submissions are
  // returned so the screen can be reviewed; the UI labels them as demo rather than
  // implying they belong to the visitor.
  async listMySubmissions(): Promise<Submission[]> {
    return subs
      .slice()
      .sort((x, y) => agoMinutes(x.submitted) - agoMinutes(y.submitted))
      .map((s) => ({ ...s }));
  }

  async trackSubmission(code: string, _email: string): Promise<Submission | null> {
    const c = (code || '').trim().toUpperCase();
    return subs.find((s) => s.code.toUpperCase() === c) ?? null;
  }
}
