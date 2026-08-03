// AfetHUB — herkese açık Saha Güncellemeleri akışı kontrolleri (Faz 4-A)
//
// Ön koşul — GELİŞTİRME sunucusu:
//   npx vite --port 5199 --strictPort &
//   node scripts/operation-update-checks.mjs
//
// Ne ölçüyor: sekmenin varlığı, rotanın adrese yansıması, süzgecin URL'e
// yazılması, boş/dolu durumu, gönderim formunun moderasyonu açıkça söylemesi,
// eksik formun sunucuya gitmeden uyarması ve yatay taşma.
//
// Bir kusuru zaten yakaladı: form paneli mobil alt gezinme çubuğuyla AYNI
// katmandaydı (ikisi de z-index 60) ve "Gönder" düğmesine parmak ulaşamıyordu.

import { chromium } from 'playwright';
const B = process.env.AFETHUB_BASE ?? 'http://localhost:5199';
const b = await chromium.launch();
const out = [];
const ok = (c, w) => out.push((c ? 'ok   ' : 'FAIL ') + w);
for (const vp of [{w:390,h:844},{w:1280,h:900}]) {
  const c = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(B, { waitUntil: 'networkidle' });
  // Bir afet sayfasına git
  const kart = p.getByRole('button', { name: /Detayları Gör/ }).first();
  if (await kart.count() === 0) { ok(false, `${vp.w}: afet kartı bulunamadı`); await c.close(); continue; }
  await kart.click(); await p.waitForTimeout(1500);
  const sekme = p.getByRole('button', { name: /Saha Güncellemeleri/ }).first();
  ok(await sekme.count() >= 1, `${vp.w}: Saha Güncellemeleri sekmesi var`);
  if (await sekme.count() === 0) { await c.close(); continue; }
  await sekme.click(); await p.waitForTimeout(1600);
  const t = await p.evaluate(() => document.body.innerText);
  ok(t.includes('Saha Güncellemeleri'), `${vp.w}: ekran açıldı`);
  ok(t.includes('sohbet alanı değildir'), `${vp.w}: modülün ne olmadığı yazıyor`);
  ok(/henüz yayımlanmış saha güncellemesi bulunmuyor|Sabit uyarılar|Koordinatör doğruladı|Doğrulama bekleniyor/.test(t),
     `${vp.w}: akış ya dolu ya da boş durumu gösteriyor`);
  ok(p.url().includes('/updates'), `${vp.w}: adres /updates (${p.url().split('/').slice(3).join('/')})`);
  // Süzgeç URL'e yansıyor mu
  const guv = p.getByRole('tab', { name: /^Güvenlik$/ }).first();
  ok(await guv.count() === 1, `${vp.w}: Güvenlik süzgeci var`);
  if (await guv.count()) { await guv.click(); await p.waitForTimeout(900); }
  ok(p.url().includes('type=safety_notice'), `${vp.w}: süzgeç adrese yansıdı`);
  // Gönderim formu
  const gonder = p.getByRole('button', { name: /Saha Güncellemesi Gönder/ }).first();
  ok(await gonder.count() >= 1, `${vp.w}: gönderim düğmesi var`);
  if (await gonder.count()) { await gonder.click(); await p.waitForTimeout(900); }
  const t2 = await p.evaluate(() => document.body.innerText);
  ok(t2.includes('koordinatör incelemesinden sonra yayımlanır'), `${vp.w}: form moderasyonu açıkça söylüyor`);
  ok(t2.includes('resmi acil yardım birimleriyle'), `${vp.w}: acil yönlendirme formda`);
  // Onaysız gönderim engelleniyor mu
  const send = p.getByRole('button', { name: /^Gönder$/ }).first();
  if (await send.count()) { await send.click(); await p.waitForTimeout(700); }
  const t3 = await p.evaluate(() => document.body.innerText);
  ok(/en az üç karakter|onay kutusunu/.test(t3), `${vp.w}: eksik form sunucuya gitmeden uyarıyor`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  const tasma = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(tasma === 0, `${vp.w}: yatay taşma yok (${tasma}px)`);
  ok(errs.length === 0, `${vp.w}: sayfa hatası yok (${errs.slice(0,1).join('') || '—'})`);
  await c.close();
}
await b.close();
console.log(out.join('\n'));
const f = out.filter(s => s.startsWith('FAIL')).length;
console.log(f === 0 ? '\nSAHA GÜNCELLEMELERİ: HEPSİ GEÇTİ' : `\n${f} BAŞARISIZ`);
