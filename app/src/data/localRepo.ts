import type { LogEntry, Need, Submission, VerifyKind, DeliveryInput, NeedDraft } from '../types';
import type { Repo, Snapshot, CreateDeliveryResult } from './repo';
import { genCode, genNrq } from './repo';
import * as seed from './seed';

// In-memory implementation. Mirrors the approved prototype's behaviour and the
// verify_submission() logic in schema.sql exactly. Audit copy is Turkish.
// State resets on reload (no backend) — intended for the local/preview mode.
const NOW = 'az önce';

let needs: Need[] = seed.needs.map((n) => ({ ...n }));
let subs: Submission[] = seed.subs.map((s) => ({ ...s }));
let log: LogEntry[] = seed.log.map((l) => ({ ...l }));
let verifiedTotal = seed.verifiedTotalSeed;

let uid = 0;
const nextId = (p: string) => `${p}_${Date.now()}_${uid++}`;
const find = (id: string) => needs.find((n) => n.id === id);

function addLog(entry: Partial<LogEntry> & Pick<LogEntry, 'action' | 'detail' | 'oldValue' | 'newValue' | 'color'>) {
  log = [{ id: nextId('l'), user: 'Elif Kaya', time: NOW, ...entry }, ...log];
}

function snap(): Snapshot {
  return {
    disaster: seed.disaster,
    locations: seed.locations,
    needs: needs.map((n) => ({ ...n })),
    subs: subs.map((s) => ({ ...s })),
    log: log.map((l) => ({ ...l })),
    announcements: seed.announcements,
    verifiedTotal,
  };
}

export class LocalRepo implements Repo {
  readonly kind = 'local' as const;

  async getSnapshot(): Promise<Snapshot> {
    return snap();
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
        note: f.notes || 'Giriş kontrolü bekleniyor.',
      },
      ...subs,
    ];
    addLog({
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
      addLog({ action: 'Teslimat reddedildi', detail: `${need.name} · ${sub.code} · ${sub.qty} ${sub.unit}`, oldValue: 'Doğrulama bekliyor', newValue: 'Reddedildi', color: '#D9363E' });
      return snap();
    }
    if (kind === 'info') {
      subs = subs.map((x) => (x.id === sub.id ? { ...x, status: 'Information requested', note: reason || 'Koordinatör teslimatın fotoğrafını istedi.' } : x));
      addLog({ action: 'Bilgi istendi', detail: `${need.name} · ${sub.code}`, oldValue: 'Doğrulama bekliyor', newValue: 'Bilgi istendi', color: '#E6A700' });
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
    verifiedTotal += 1;

    addLog({
      action: partial ? 'Teslimat kısmen doğrulandı' : 'Teslimat doğrulandı',
      detail: `${need.name} · ${sub.code} · ${sub.qty} ${sub.unit} içinden ${qty}`,
      oldValue: `${before} doğrulandı`, newValue: `${after} doğrulandı`,
      color: partial ? '#F97316' : '#159947',
    });
    if (nowComplete) {
      addLog({ action: 'İhtiyaç tamamlandı', detail: `${need.name} gerekli miktara ulaştı`, oldValue: 'Aktif', newValue: 'Tamamlandı', color: '#159947' });
    }
    return snap();
  }

  async publishNeed(c: NeedDraft): Promise<Snapshot> {
    const id = nextId('n');
    needs = [
      { id, name: c.title, cat: c.cat, priority: c.priority, required: c.required, verified: 0, pending: 0, unit: c.unit || 'adet', updated: NOW, loc: c.loc },
      ...needs,
    ];
    addLog({ action: 'İhtiyaç oluşturuldu', detail: `${c.title} · ${c.priority}`, oldValue: '—', newValue: `${c.required} gerekli`, color: '#102A43' });
    return snap();
  }

  async bumpNeed(needId: string): Promise<Snapshot> {
    const n = find(needId);
    if (!n) return snap();
    const before = n.required;
    needs = needs.map((x) => (x.id === needId ? { ...x, required: x.required + 10, priority: x.priority === 'Completed' ? 'Urgent' : x.priority, updated: NOW } : x));
    addLog({ action: 'Miktar güncellendi', detail: `${n.name} gerekli miktarı artırıldı`, oldValue: `${before} gerekli`, newValue: `${before + 10} gerekli`, color: '#102A43' });
    return snap();
  }

  async togglePause(needId: string): Promise<Snapshot> {
    const n = find(needId);
    if (!n) return snap();
    const next = n.priority === 'Paused' ? 'Urgent' : 'Paused';
    needs = needs.map((x) => (x.id === needId ? { ...x, priority: next, updated: NOW } : x));
    addLog({ action: next === 'Paused' ? 'İhtiyaç duraklatıldı' : 'İhtiyaç sürdürüldü', detail: n.name, oldValue: n.priority, newValue: next, color: '#E6A700' });
    return snap();
  }

  async submitNeedRequest(title: string, name: string): Promise<{ snapshot: Snapshot; code: string }> {
    const code = genNrq(Math.random());
    addLog({ user: name || 'Misafir', action: 'İhtiyaç talebi gönderildi', detail: `${title || 'Başlıksız ihtiyaç'} · ${code}`, oldValue: '—', newValue: 'Doğrulama bekliyor', color: '#E6A700' });
    return { snapshot: snap(), code };
  }

  async trackSubmission(code: string, _email: string): Promise<Submission | null> {
    const c = (code || '').trim().toUpperCase();
    return subs.find((s) => s.code.toUpperCase() === c) ?? null;
  }
}
