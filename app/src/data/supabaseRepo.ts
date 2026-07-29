import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement,
  VerifyKind, DeliveryInput, NeedDraft, PriorityKey, StatusKey,
} from '../types';
import type { Repo, Snapshot, CreateDeliveryResult } from './repo';
import { genCode, genNrq } from './repo';

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
      id: String(r.id), slug: String(r.slug ?? ''), name: String(r.name), region: String(r.region ?? ''),
      status: (r.status as Disaster['status']) ?? 'Active', situation: String(r.situation ?? ''),
      openedAt: String(r.opened_at ?? ''), updatedLabel: r.updated_at ? rel(String(r.updated_at)) : '',
      volunteers: Number(r.volunteers ?? 0), onShift: Number(r.on_shift ?? 0),
    });
    const disasters: Disaster[] = (ds.data ?? []).map(mapDisaster);
    const disaster = disasters.find((x) => x.slug === slug)
      ?? disasters.find((x) => x.status === 'Active') ?? disasters[0]
      ?? { id: 'd1', slug: '', name: '', region: '', status: 'Active' as const, situation: '', openedAt: '', updatedLabel: '', volunteers: 0, onShift: 0 };
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
    }));

    const subs: Submission[] = (su.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), code: String(r.code), contributor: String(r.contributor_name),
      city: String(r.city), needId: String(r.need_id), qty: Number(r.qty), unit: String(r.unit),
      loc: String(r.location_name), submitted: rel(String(r.submitted_at)),
      status: r.status as StatusKey, verifiedQty: r.verified_qty == null ? null : Number(r.verified_qty),
      note: String(r.note),
    }));

    const log: LogEntry[] = (lg.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), user: String(r.actor), action: String(r.action), detail: String(r.detail),
      oldValue: String(r.old_value), newValue: String(r.new_value), time: rel(String(r.created_at)),
      color: String(r.color),
    }));

    const announcements: Announcement[] = (an.data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), kind: String(r.kind), accent: String(r.accent), time: rel(String(r.created_at)),
      author: String(r.author), title: String(r.title), body: String(r.body),
    }));

    const verifiedTotal = subs.filter((s) => s.status === 'Verified' || s.status === 'Partially verified').length;
    return { disaster, disasters, locations, needs, subs, log, announcements, verifiedTotal };
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
    });
    await this.db.from('needs').update({ pending_qty: (need?.pending ?? 0) + f.qty }).eq('id', f.needId);
    return { snapshot: await this.getSnapshot(), code };
  }

  async verifySubmission(subId: string, kind: VerifyKind, qty: number, reason: string): Promise<Snapshot> {
    await this.db.rpc('verify_submission', { p_submission: subId, p_kind: kind, p_qty: qty, p_reason: reason || null });
    return this.getSnapshot();
  }

  async publishNeed(c: NeedDraft): Promise<Snapshot> {
    const snap0 = await this.getSnapshot();
    await this.db.from('needs').insert({
      disaster_id: snap0.disaster.id, name: c.title, category: c.cat, priority: c.priority,
      required_qty: c.required, unit: c.unit || 'adet', location_name: c.loc,
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

  async submitNeedRequest(title: string, name: string): Promise<{ snapshot: Snapshot; code: string }> {
    const code = genNrq(Math.random());
    const snap0 = await this.getSnapshot();
    await this.db.from('need_requests').insert({ code, disaster_id: snap0.disaster.id, title, name });
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
    };
  }
}
