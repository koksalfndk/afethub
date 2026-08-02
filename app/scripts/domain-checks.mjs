// AfetHUB — saf alan (domain) kuralları için hızlı doğrulama.
//
// Tarayıcı gerektirmez. `src/data/repo.ts` içindeki saf fonksiyonları rolldown ile
// (Vite 8'in zaten getirdiği bağımlılık) derleyip çalıştırır; yeni bir test
// bağımlılığı eklemez (rules/06 §Package Management).
//
// Çalıştırma:  node scripts/domain-checks.mjs
//
// Burada doğrulananlar, ekranda okunacak sayıların kurallarıdır: farklı birimler tek
// bir yüzdede toplanmaz, ihtiyaç yokken yüzde üretilmez, koordinatörün elle seçimi
// otomatik seçimin önüne geçer.

import { build } from 'rolldown';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'afethub-domain-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export { fulfilmentRate, pickFeaturedNeeds, looksLikeContactDetails, isLivePledge,
         PLEDGE_LIVE_STATUSES, OPERATION_STAGES, MAX_FEATURED_NEEDS,
         SITUATION_STALE_DAYS } from ${JSON.stringify(new URL('../src/data/repo.ts', import.meta.url).pathname)};
export { LocalRepo } from ${JSON.stringify(new URL('../src/data/localRepo.ts', import.meta.url).pathname)};
`);
const out = join(dir, 'bundle.mjs');
await build({ input: entry, output: { file: out, format: 'esm' }, logLevel: 'silent', platform: 'node' });
const D = await import(pathToFileURL(out).href);

let failed = 0;
const ok = (cond, what) => {
  if (cond) { console.log('ok   ' + what); } else { console.error('FAIL ' + what); failed += 1; }
};

// ---- Karşılama oranı --------------------------------------------------------
ok(D.fulfilmentRate(0, 0) === null,
  'yayınlanmış ihtiyaç yokken yüzde ÜRETİLMEZ (null, %0 değil)');
ok(D.fulfilmentRate(9, 0) === 0,
  'hiçbiri tamamlanmadıysa oran %0');
ok(D.fulfilmentRate(0, 4) === 100,
  'hepsi tamamlandıysa oran %100');
ok(D.fulfilmentRate(1, 1) === 50,
  'oran KALEM SAYISI üzerinden hesaplanır');
// Farklı birimlerin toplanmadığının kanıtı: fonksiyon miktar almıyor, yalnızca sayı.
ok(D.fulfilmentRate.length === 2,
  'oran fonksiyonu miktar/birim almaz — farklı birimler toplanamaz');

// ---- Öne çıkan ihtiyaçlar ---------------------------------------------------
const needs = [
  { id: 'a', featuredRank: 2, remaining: 10, priority: 'Normal' },
  { id: 'b', featuredRank: 1, remaining: 0, priority: 'Critical' },
  { id: 'c', featuredRank: null, remaining: 90, priority: 'Critical' },
  { id: 'd', featuredRank: null, remaining: 40, priority: 'Urgent' },
  { id: 'e', featuredRank: null, remaining: 0, priority: 'Critical' },
  { id: 'f', featuredRank: null, remaining: 70, priority: 'Normal' },
];
const manual = D.pickFeaturedNeeds(needs);
ok(manual.manual === true && manual.items.map((n) => n.id).join(',') === 'b,a',
  'manuel seçim otomatik seçimin ÖNÜNE geçer ve sırası korunur');

const auto = D.pickFeaturedNeeds(needs.map((n) => ({ ...n, featuredRank: null })));
ok(auto.manual === false,
  'manuel seçim yoksa otomatik yedeğe düşülür');
ok(auto.items.every((n) => n.remaining > 0),
  'otomatik seçim yalnızca KALANI OLAN kalemlerden gelir');
ok(auto.items.every((n) => n.priority === 'Critical' || n.priority === 'Urgent'),
  'otomatik seçim yalnızca kritik/acil kalemlerden gelir');
ok(auto.items.map((n) => n.id).join(',') === 'c,d',
  'otomatik seçim önce kritik, sonra kalan miktara göre sıralanır');
ok(D.pickFeaturedNeeds(new Array(9).fill(0).map((_, i) => (
  { id: 'x' + i, featuredRank: null, remaining: 5, priority: 'Critical' }
))).items.length === D.MAX_FEATURED_NEEDS,
  'en fazla ' + D.MAX_FEATURED_NEEDS + ' kalem öne çıkarılır');
ok(D.pickFeaturedNeeds([]).items.length === 0,
  'ihtiyaç yokken öne çıkan liste boş kalır');

// ---- Teslim sözü ------------------------------------------------------------
ok(D.PLEDGE_LIVE_STATUSES.join(',') === 'pledged,confirmed,in_transit',
  'canlı söz durumları `need_pledge_totals` görünümüyle aynı');
ok(!D.isLivePledge('delivered_reported') && !D.isLivePledge('fulfilled'),
  'teslimata dönüşmüş söz canlı toplamda İKİNCİ KEZ sayılmaz');
ok(!D.isLivePledge('cancelled') && !D.isLivePledge('expired'),
  'iptal ve süresi geçmiş sözler toplamda yok');

// ---- Kişisel veri uyarısı ---------------------------------------------------
ok(D.looksLikeContactDetails('Bana 0532 111 22 33 numarasindan ulasin'),
  'metindeki telefon numarası yakalanır');
ok(D.looksLikeContactDetails('yazin: biri@ornek.com'),
  'metindeki e-posta adresi yakalanır');
ok(!D.looksLikeContactDetails('Kuzey hattinda 12 ekip calisiyor'),
  'sıradan bir saha cümlesi yanlışlıkla bayraklanmaz');

// ---- Sabitler ---------------------------------------------------------------
ok(D.OPERATION_STAGES.length === 7 && D.OPERATION_STAGES[0] === 'initial_response',
  'yedi operasyon aşaması, müdahaleden izlemeye sıralı');
ok(D.SITUATION_STALE_DAYS > 0,
  'durum özeti bayatlama eşiği tek bir yerde tanımlı');

// ---- Teslim sözü akışı, uçtan uca (Faz 3-B) ---------------------------------
//
// Buradaki asıl soru tek bir cümle: SÖZ MİKTARI DEĞİŞTİRİR Mİ? Cevabın hayır olması
// gerekiyor ve bunu iddia etmek yetmez — akış çalıştırılıp sayılar ÖNCE ve SONRA
// karşılaştırılıyor. LocalRepo, canlı RPC'lerin davranışını birebir taklit ediyor;
// aynı kural sunucu tarafında `supabase/tests/0036_0038_operation_detail.sql`
// içinde ayrıca doğrulanıyor.
{
  const repo = new D.LocalRepo();
  const before = await repo.getSnapshot();
  const target = before.needs.find((n) => n.required > n.verified);
  const snapOf = (s, id) => s.needs.find((n) => n.id === id);
  const b = snapOf(before, target.id);

  const code = await repo.createDeliveryPledge({
    needId: target.id, qty: 5, unit: target.unit,
    locationId: before.locations[0]?.id ?? '', estimatedDeliveryAt: '',
    name: 'Test Kisi', email: 'test@example.com', phone: '', city: 'Mugla', notes: '',
  });
  ok(typeof code === 'string' && code.length > 0, 'teslim sözü bir takip kodu döndürür');

  const after = await repo.getSnapshot();
  const a1 = snapOf(after, target.id);
  ok(a1.required === b.required, 'teslim sözü talep edilen miktarı DEĞİŞTİRMEZ');
  ok(a1.verified === b.verified, 'teslim sözü doğrulanan miktarı ARTIRMAZ');
  ok(a1.pending === b.pending, 'teslim sözü doğrulama bekleyen miktara GİRMEZ');
  ok((a1.required - a1.verified) === (b.required - b.verified),
    'teslim sözü kalan miktarı AZALTMAZ');
  ok((a1.pledged ?? 0) === (b.pledged ?? 0) + 5,
    'teslim sözü yalnızca kendi ayrı toplamını artırır');

  // Aynı gönderimin tekrarı (ağ yeniden denemesi) ikinci kayıt üretmez.
  const again = await repo.createDeliveryPledge({
    needId: target.id, qty: 5, unit: target.unit,
    locationId: before.locations[0]?.id ?? '', estimatedDeliveryAt: '',
    name: 'Test Kisi', email: 'test@example.com', phone: '', city: 'Mugla', notes: '',
  });
  ok(again === code, 'aynı gönderimin tekrarı İKİNCİ bir söz oluşturmaz');
  const dupSnap = await repo.getSnapshot();
  ok((snapOf(dupSnap, target.id).pledged ?? 0) === (b.pledged ?? 0) + 5,
    'tekrar gönderim söz toplamını ikinci kez artırmaz');

  // Takip kodu TEK BAŞINA yetmez: e-posta eşleşmesi zorunlu (rules/02 §Tracking Codes).
  ok((await repo.trackDeliveryPledge(code, 'baska@example.com')) === null,
    'yanlış e-posta ile takip kodu kayıt AÇMAZ');
  const tracked = await repo.trackDeliveryPledge(code, 'test@example.com');
  ok(tracked !== null && tracked.status === 'pledged', 'doğru e-posta ile kayıt açılır');
  // Takip yanıtı özel alan taşımamalı.
  const leaked = ['email', 'phone', 'name', 'city', 'id', 'needId', 'disasterId']
    .filter((k) => k in tracked);
  ok(leaked.length === 0, 'takip yanıtı e-posta, telefon, ad ve veritabanı kimliği TAŞIMAZ');

  // İptal de miktara dokunmaz.
  ok((await repo.cancelDeliveryPledge(code, 'test@example.com', 'Planım değişti')) === 'cancelled',
    'söz sahibi kendi sözünü iptal edebilir');
  const afterCancel = await repo.getSnapshot();
  const a2 = snapOf(afterCancel, target.id);
  ok(a2.required === b.required && a2.verified === b.verified,
    'iptal talep ve doğrulanan miktarı DEĞİŞTİRMEZ');
  ok((a2.pledged ?? 0) === (b.pledged ?? 0), 'iptal edilen söz canlı toplamdan düşer');
  // İkinci iptal yan etki üretmez.
  ok((await repo.cancelDeliveryPledge(code, 'test@example.com', '')) === 'cancelled',
    'ikinci iptal isteği yeni bir yan etki üretmez');
}

console.log(failed === 0 ? '\n=== DOMAIN CHECKS: HEPSİ GEÇTİ ===' : `\n=== ${failed} KONTROL BAŞARISIZ ===`);
process.exit(failed === 0 ? 0 : 1);
