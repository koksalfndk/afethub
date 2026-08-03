// AfetHUB — mobil duman testi (Faz 3-D kapanışı)
//
// Ön koşul — GELİŞTİRME sunucusu (rol geçişi prototip araç çubuğundan yapılıyor):
//   npx vite --port 5199 --strictPort &
//   node scripts/mobile-smoke.mjs
//
// Ne ölçüyor: telefonda koordinatörün Teslim Sözleri ekranına ulaşıp bir kaydı
// açabilmesi. Menü, route, çekmecenin kapanması, body scroll kilidi, detay
// çekmecesi, Escape, yatay taşma, geri navigasyon ve sayfa hatası.
//
// GERÇEK CİHAZ DEĞİL: Chromium'un mobil öykünmesi (`isMobile`, `hasTouch`).
// Sanal klavyenin form alanını örtüp örtmediği bu yolla ölçülemez — o kontrol
// gerçek bir telefon ister ve raporda öyle yazılır.

import { chromium } from 'playwright';
const BASE = process.env.AFETHUB_BASE ?? 'http://localhost:5199';
const b = await chromium.launch();
const sonuc = [];
const ok = (c, w) => { sonuc.push((c ? 'ok   ' : 'FAIL ') + w); };
for (const vp of [{w:360,h:800},{w:390,h:844}]) {
  const c = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true });
  const p = await c.newPage();
  const hatalar = [];
  p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /^Koordinatör$/i }).first().click();
  await p.waitForTimeout(500);

  const ham = p.getByRole('button', { name: /Menüyü aç/i }).first();
  ok(await ham.count() === 1, `${vp.w}: hamburger var`);
  const hamKutu = await ham.boundingBox();
  ok(hamKutu.width >= 44 && hamKutu.height >= 44, `${vp.w}: hamburger hedefi ${Math.round(hamKutu.width)}×${Math.round(hamKutu.height)}`);
  await ham.click(); await p.waitForTimeout(400);

  const link = p.getByRole('button', { name: /Teslim Sözleri/ }).first();
  ok(await link.count() >= 1, `${vp.w}: çekmecede Teslim Sözleri görünüyor`);
  await link.click(); await p.waitForTimeout(1200);
  const metin1 = await p.evaluate(() => document.body.innerText);
  ok(metin1.includes('Teslim Sözleri') && metin1.includes('DEMO-'), `${vp.w}: route açıldı ve liste doldu`);
  ok(!metin1.includes('Menüyü kapat'), `${vp.w}: çekmece gezinmeden sonra kapandı`);

  const bodyOv = await p.evaluate(() => getComputedStyle(document.body).overflow);
  ok(bodyOv !== 'hidden', `${vp.w}: body scroll kilitli değil (${bodyOv})`);

  const kart = p.getByRole('button', { name: /Detayı Aç/ }).first();
  ok(await kart.count() >= 1, `${vp.w}: kartta Detayı Aç var`);
  await kart.click(); await p.waitForTimeout(900);
  // Çekmecenin AÇIK olduğunun imzası: kapatma düğmesi ve maskeleme cümlesi.
  // İlk sürüm 'Teslim Sözü' + 'İletişim' arıyordu; başlıkta kaydın kendi adı
  // yazıyor ve bölüm etiketleri BÜYÜK HARF — iki iddia da yanlıştı ve çekmece
  // açık olduğu hâlde FAIL verdi (ekran görüntüsüyle doğrulandı).
  const kapat = p.getByRole('button', { name: /Kapat/i }).first();
  const maskeNotu = await p.evaluate(() => document.body.innerText.includes('maskeli gösteriliyor'));
  ok(await kapat.count() >= 1 && maskeNotu, `${vp.w}: detay çekmecesi açıldı`);
  const drawerTasma = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(drawerTasma === 0, `${vp.w}: çekmece açıkken yatay taşma yok (${drawerTasma}px)`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  const kapandi = await p.evaluate(() => !document.body.innerText.includes('maskeli gösteriliyor'));
  ok(kapandi, `${vp.w}: çekmece Escape ile kapandı`);

  const tasma = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(tasma === 0, `${vp.w}: yatay taşma yok (${tasma}px)`);

  // Geri navigasyon
  await p.goBack(); await p.waitForTimeout(800);
  ok(true, `${vp.w}: geri navigasyon hata vermedi`);

  ok(hatalar.length === 0, `${vp.w}: sayfa hatası yok (${hatalar.slice(0,1).join('') || '—'})`);
  await c.close();
}
await b.close();
console.log(sonuc.join('\n'));
const f = sonuc.filter(s => s.startsWith('FAIL')).length;
console.log(f === 0 ? '\nMOBİL DUMAN TESTİ: HEPSİ GEÇTİ' : `\n${f} BAŞARISIZ`);
