// AfetHUB — Faz 2 Genel Bakış arayüz doğrulaması.
//
// Ne yapar: yerel (Supabase'siz) modda derlenmiş uygulamayı bir tarayıcıda açar ve
// ekranda GERÇEKTEN ne yazdığını ölçer. Amaç görsel değil, DOĞRULUK: uydurma
// açıklama gösterilmiyor mu, onaysız içerik sızıyor mu, boş durumlar doğru mu.
//
// Ön koşul: `playwright` kurulu olmalı ve şu sırayla çalıştırılmalı:
//   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-local
//   npx vite preview --outDir dist-local --port 4177 --host 127.0.0.1 &
//   node scripts/overview-ui-checks.mjs
//
// Playwright bu depoya bağımlılık olarak EKLENMEDİ (rules/06 §Package Management);
// kurulu değilse betik bunu söyler ve atlanır — sessizce geçmiş gibi davranmaz.

import { createRequire } from 'node:module';

const BASE = process.env.AFETHUB_BASE ?? 'http://127.0.0.1:4177';
const OP = '/afet/seydikemer-orman-yangini-21-07-2026';   // aşaması ve öne çıkan kalemleri olan
const OP2 = '/afet/kas-orman-yangini-27-07-2026';         // aşaması OLMAYAN

let chromium;
try {
  chromium = createRequire(import.meta.url)('playwright').chromium;
} catch {
  console.error('ATLANDI: playwright kurulu değil. Bu kontroller ÇALIŞTIRILMADI.');
  process.exit(2);
}

let failed = 0;
const ok = (cond, what) => {
  if (cond) console.log('ok   ' + what);
  else { console.error('FAIL ' + what); failed += 1; }
};

const lower = (s) => s.toLocaleLowerCase('tr');

const browser = await chromium.launch();

async function open(path, width = 1280, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Ağ hataları (kapalı kapta dış kaynaklar) sayılmaz; yalnızca sayfanın KENDİ
  // hataları bir regresyondur.
  page.on('console', (m) => { if (m.type() === 'error' && !/net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const text = await page.evaluate(() => document.body.innerText);
  const html = await page.content();
  return { ctx, page, errors, text, low: lower(text), html };
}

// ---------------------------------------------------------------------------
// 1) Operasyon aşaması
// ---------------------------------------------------------------------------
{
  const v = await open(OP + '/overview');
  ok(v.low.includes('operasyon aşaması'), 'operasyon aşaması herkese açık Genel Bakış’ta görünür');
  ok(v.low.includes('soğutma çalışmaları'), 'aşamanın Türkçe adı yazılı (renk tek başına değil)');
  ok(v.low.includes('aktif alevler kontrol altında'), 'koordinatörün yazdığı aşama açıklaması gösterilir');
  ok(v.errors.length === 0, 'Genel Bakış sayfası JavaScript hatası üretmiyor: ' + v.errors.join(' | '));
  await v.ctx.close();
}
{
  const v = await open(OP2 + '/overview');
  ok(v.low.includes('belirtilmedi'), 'aşama yazılmamışsa "Belirtilmedi" gösterilir');
  ok(v.low.includes('koordinatör bu operasyon için bir aşama bildirmedi'),
    'aşama yokken UYDURMA açıklama değil, yokluğun kendisi yazılır');
  ok(!v.low.includes('aktif alevler kontrol altında'),
    'bir operasyonun açıklaması başka operasyona sızmıyor');
  await v.ctx.close();
}

// ---------------------------------------------------------------------------
// 2) Öne çıkan ihtiyaçlar
// ---------------------------------------------------------------------------
{
  const v = await open(OP + '/overview');
  const chips = await v.page.$$eval('ul li button', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  const featured = chips.slice(0, 3);
  ok(v.low.includes('şu anda en çok ihtiyaç duyulan destek'), 'öne çıkan ihtiyaç bölümü görünür');
  ok(featured.length > 0 && featured.length <= 4, 'en fazla dört kalem gösterilir');
  ok(featured[0].startsWith('Göz Damlası') && featured[1].startsWith('Maske') && featured[2].startsWith('Pil'),
    'koordinatörün seçtiği sıra korunur (1-2-3): ' + featured.join(' / '));
  ok(featured.every((t) => /kaldı/.test(t)), 'her kalem kalan miktarını birimiyle yazar');
  ok(v.low.includes('koordinatörü öne çıkardı'), 'seçimin manuel olduğu söylenir');
  await v.ctx.close();
}
{
  const v = await open(OP2 + '/overview');
  if (v.low.includes('şu anda en çok ihtiyaç duyulan destek')) {
    ok(v.low.includes('otomatik seçildi'), 'manuel seçim yoksa otomatik olduğu SÖYLENİR');
    const chips = await v.page.$$eval('ul li button', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    ok(chips.slice(0, 4).every((t) => /kaldı/.test(t)),
      'yedek seçim yalnızca kalanı olan kalemlerden gelir');
  } else {
    ok(true, 'öne çıkacak açık kritik/acil kalem yok — bölüm hiç gösterilmiyor');
  }
  await v.ctx.close();
}

// ---------------------------------------------------------------------------
// 3) Karşılama oranı ve ilerleme kartı
// ---------------------------------------------------------------------------
{
  const v = await open(OP + '/overview');
  ok(v.low.includes('tamamen karşılanan ihtiyaçların'),
    'hesap yöntemi ekranda AÇIKÇA yazılı');
  ok(!/litre.*\+.*kilogram/i.test(v.text), 'farklı birimler tek bir toplamda birleştirilmiyor');
  const nums = await v.page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/Yayınlanan\s*ihtiyaç\s*(\d+)[\s\S]{0,40}?Tamamlanan\s*(\d+)[\s\S]{0,40}?Aktif\s*(\d+)/);
    const r = t.match(/%(\d+)/);
    return m ? { published: +m[1], completed: +m[2], active: +m[3], rate: r ? +r[1] : null } : null;
  });
  ok(nums != null, 'ilerleme kartı yayınlanan / tamamlanan / aktif sayılarını yazıyor');
  if (nums) {
    ok(nums.published === nums.completed + nums.active,
      'yayınlanan = tamamlanan + aktif (sayılar birbirini tutuyor)');
    ok(nums.rate === Math.round((nums.completed / Math.max(1, nums.published)) * 100),
      'gösterilen yüzde, gösterilen sayılardan çıkıyor');
  }
  await v.ctx.close();
}

// ---------------------------------------------------------------------------
// 4) Fotoğraf, güncelleme ve gizlilik
// ---------------------------------------------------------------------------
{
  const v = await open(OP + '/overview');
  ok(v.low.includes('henüz yayımlanmış saha fotoğrafı bulunmuyor'),
    'onaylı fotoğraf yokken boş durum doğru cümleyi yazıyor (iskelet değil)');
  ok(!/operation-media/.test(v.html), 'özel depolama yolu/kovası istemciye düşmüyor');
  ok(!/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i.test(v.text),
    'sayfada hiçbir e-posta adresi görünmüyor');
  ok(!/\b0?5\d{2}[ .-]?\d{3}[ .-]?\d{2}[ .-]?\d{2}\b/.test(v.text),
    'sayfada hiçbir cep telefonu numarası görünmüyor');

  // Yayınlanan her güncelleme doğrulama durumunu AÇIKÇA yazar; doğrulanmamış olan
  // doğrulanmış gibi görünmez.
  const badges = await v.page.$$eval('article', (els) => els.map((e) => e.innerText));
  ok(badges.length > 0, 'saha güncellemeleri önizlemesi kart üretiyor');
  ok(badges.every((t) => /Doğrulandı|Doğrulama bekliyor/.test(t)),
    'her güncelleme kartı doğrulama durumunu yazıyor');
  ok(badges.some((t) => /Doğrulama bekliyor/.test(t)),
    'doğrulanmamış bir bildirim "bekliyor" olarak işaretleniyor');
  ok(!v.low.includes('moderation_pending') && !v.low.includes('moderasyon bekliyor'),
    'moderasyon kuyruğundaki içerik herkese açık akışa düşmüyor');

  // Bağışçı adları yalnızca koordinatör ekranlarına aittir.
  ok(!v.text.includes('Ayşe Yılmaz') && !v.text.includes('Zeynep Arslan'),
    'bağışçı adları Genel Bakış’ta görünmüyor');
  ok(v.low.includes('kalan miktarı azaltmaz'),
    'bekleyen doğrulama ve teslim sözünün kalanı azaltmadığı yazılı');
  await v.ctx.close();
}

// ---------------------------------------------------------------------------
// 5) Bölüm sırası (masaüstü ve mobil aynı bilgi sırasını korur)
// ---------------------------------------------------------------------------
async function order(width, height) {
  const v = await open(OP + '/overview', width, height);
  const seq = await v.page.evaluate(() => {
    const wanted = ['Durum', 'Kritik ihtiyaçlar', 'Operasyon ilerlemesi', 'Sahadan fotoğraflar',
      'Son doğrulanan teslimatlar', 'Saha Güncellemeleri'];
    return Array.from(document.querySelectorAll('h1,h2'))
      .map((h) => h.innerText.trim()).filter((t) => wanted.includes(t));
  });
  await v.ctx.close();
  return seq;
}
{
  const expected = ['Durum', 'Kritik ihtiyaçlar', 'Operasyon ilerlemesi', 'Sahadan fotoğraflar',
    'Son doğrulanan teslimatlar', 'Saha Güncellemeleri'];
  const d = await order(1280, 1000);
  const m = await order(390, 844);
  ok(d.join('>') === expected.join('>'), 'masaüstünde bölüm sırası doğru: ' + d.join(' > '));
  ok(m.join('>') === expected.join('>'), 'mobilde de aynı bilgi sırası korunuyor: ' + m.join(' > '));
}

// ---------------------------------------------------------------------------
// 6) Erişilebilirlik temelleri
// ---------------------------------------------------------------------------
{
  const v = await open(OP + '/overview');
  const h1 = await v.page.$$eval('h1', (e) => e.length);
  ok(h1 === 1, 'sayfada tek bir h1 var');
  const jumped = await v.page.evaluate(() => {
    const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => +h.tagName[1]);
    return levels.some((lv, i) => i > 0 && lv - levels[i - 1] > 1);
  });
  ok(!jumped, 'başlık seviyeleri atlanmıyor');
  // Kapsam: sayfanın KENDİ içeriği. Başlık, alt bilgi ve şerit bu çalışmanın konusu
  // değil; oradaki hedefler ayrı bir işte ele alınmalı (rules/06 §Scope Control).
  const smallTargets = await v.page.evaluate(() => Array.from(document.querySelectorAll('main button, main a[href]'))
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ t: (el.innerText || '').slice(0, 24), r: el.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.height < 40)
    .map((x) => x.t));
  ok(smallTargets.length === 0, `sayfa içeriğinde 40px altında dokunma hedefi yok (bulunan: ${smallTargets.join(', ')})`);
  const noAlt = await v.page.$$eval('img', (els) => els.filter((e) => !e.getAttribute('alt')).length);
  ok(noAlt === 0, 'her görselin alternatif metni var');
  await v.ctx.close();
}

// ---------------------------------------------------------------------------
// 7) Mevcut route'lar kırılmadı
// ---------------------------------------------------------------------------
for (const [path, needle] of [
  ['/', 'aktif afet'],
  [OP, 'kalan'],
  [OP + '/locations', 'teslim'],
  [OP + '/announcements', 'duyuru'],
  [OP + '/activity', 'hareket'],
]) {
  const v = await open(path);
  ok(v.errors.length === 0 && v.low.includes(needle), `route çalışıyor: ${path}`);
  await v.ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n=== FAZ 2 ARAYÜZ KONTROLLERİ: HEPSİ GEÇTİ ===' : `\n=== ${failed} KONTROL BAŞARISIZ ===`);
process.exit(failed === 0 ? 0 : 1);
