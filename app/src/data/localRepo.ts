import type {
  LogEntry, Need, Submission, VerifyKind, DeliveryInput, Organization, OrganizationInput,
  DisasterReport, DisasterReportInput, BannerSlide, BannerSlideInput, OrgEditRequestInput,
} from '../types';
import type { Repo, Snapshot, CreateDeliveryResult, Overview, DisasterCard, TopNeed } from './repo';
import { genCode, genNrq, remaining, isSameEvent, isLocalSlideImage } from './repo';
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

let uid = 0;
const nextId = (p: string) => `${p}_${Date.now()}_${uid++}`;
const find = (id: string) => needs.find((n) => n.id === id);

function addLog(
  disasterId: string,
  entry: Partial<LogEntry> & Pick<LogEntry, 'action' | 'detail' | 'oldValue' | 'newValue' | 'color'>,
) {
  const d = seed.disasters.find((x) => x.id === disasterId);
  log = [{
    id: nextId('l'), disasterId, disasterName: d?.name ?? '',
    user: 'Elif Kaya', time: NOW, ...entry,
  }, ...log];
}

// A retired slug must keep resolving, so a shared link never 404s after a
// disaster is re-slugged with its date.
function currentDisaster(slug?: string) {
  return seed.disasters.find((d) => d.slug === slug)
    ?? seed.disasters.find((d) => (d.legacySlugs ?? []).includes(slug ?? ''))
    ?? seed.disasters.find((d) => d.status === 'Active')
    ?? seed.disasters[0];
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
    locations: seed.locations.filter((l) => mine(l.disasterId)),
    needs: needs.filter((n) => mine(n.disasterId)).map((n) => ({ ...n })),
    // Submissions and audit entries are scoped to the current operation so one
    // disaster page never shows another operation's traffic.
    subs: subs.filter((s) => mine(disasterOfNeed(s.needId))).map((s) => ({ ...s })),
    log: log.filter((l) => mine(l.disasterId)).slice().sort(byRecency).map((l) => ({ ...l })),
    announcements: seed.announcements.filter((a) => mine(a.disasterId)).map((a) => ({ ...a })),
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
          id: n.id, name: n.name, priority: n.priority, remaining: remaining(n), unit: n.unit,
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
        deliveryPoints: seed.locations.filter((l) => l.disasterId === d.id).length,
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
      log: log.slice().sort(byRecency).slice(0, 12).map((l) => ({ ...l })),
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

  async deleteSlide(id: string): Promise<BannerSlide[]> {
    slides = slides.filter((sl) => sl.id !== id);
    return this.listSlides();
  }

  // A correction request never mutates the record it targets — that is the whole
  // point of a verified badge. Here it only lands in the audit trail; the Supabase
  // implementation stores the proposal for the coordinator queue.
  async submitOrgEditRequest(input: OrgEditRequestInput): Promise<void> {
    const target = orgs.find((o) => o.id === input.orgId);
    addLog(activeDisasterId(), {
      user: input.submittedByName || 'Misafir',
      action: 'Kurum düzeltme talebi',
      detail: `${target?.name ?? input.orgId} · ${input.changedFields.length} alan`,
      oldValue: 'Yayındaki kayıt',
      newValue: 'Koordinatör incelemesi bekliyor',
      color: '#E6A700',
    });
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

  // "Ben de bildiriyorum" on an existing report.
  async confirmDisasterReport(reportId: string): Promise<DisasterReport> {
    const r = reports.find((x) => x.id === reportId);
    if (!r) throw new Error('report not found');
    const next = { ...r, reportCount: r.reportCount + 1, lastReportLabel: NOW };
    reports = reports.map((x) => (x.id === reportId ? next : x));
    addLog(activeDisasterId(), {
      user: 'Misafir', action: 'Afet bildirimi doğrulandı',
      detail: `${next.province}${next.district ? ' / ' + next.district : ''} · ${next.type}`,
      oldValue: `${r.reportCount} kişi bildirdi`, newValue: `${next.reportCount} kişi bildirdi`,
      color: '#E6A700',
    });
    return { ...next };
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

  async publishNeed(p: NeedPayload): Promise<Snapshot> {
    const id = nextId('n');
    const target = seed.disasters.find((d) => d.id === activeDisasterId())!;
    needs = [
      { id, disasterId: target.id, disasterName: target.name, disasterSlug: target.slug, name: p.title, cat: p.category, priority: p.priority, required: p.required, verified: 0, pending: 0, unit: p.unit || 'adet', updated: NOW, loc: p.loc, details: p.details },
      ...needs,
    ];
    addLog(target.id, { action: 'İhtiyaç oluşturuldu', detail: `${p.title} · ${p.priority}`, oldValue: '—', newValue: `${p.required} ${p.unit || 'adet'} gerekli`, color: '#102A43' });
    return snap();
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

  async trackSubmission(code: string, _email: string): Promise<Submission | null> {
    const c = (code || '').trim().toUpperCase();
    return subs.find((s) => s.code.toUpperCase() === c) ?? null;
  }
}
