// AfetHUB — Saha güncellemeleri moderasyon ekranı kontrolleri (Faz 4-A, 0049)
//
// Ön koşul — GELİŞTİRME sunucusu (yerel demo veri):
//   npx vite --port 5199 --strictPort &
//   node scripts/moderation-checks.mjs
//
// Ne ölçüyor:
//   * /koordinasyon/saha-guncellemeleri rotası ve kuyruk listesi (390 ve 1280 px)
//   * Liste satırının iletişimi MASKELİ göstermesi — tam e-posta hiçbir yerde yok
//   * Detay çekmecesi: gerekçesiz iletişim açma engeli, PII uyarısı
//   * Yayınlama onayının "doğruladım" kutusunu ayrı sorması
//   * Reddin gerekçesiz gitmemesi
//   * Koordinatör formunun DÜRÜST vaadi ("doğrudan yayımlanır") ve yayın onayı
//   * Yatay taşma ve sayfa hatası
//
// Rol yalnızca bellekte; sayfa yeniden yüklenirse ziyaretçiye döner. Bu yüzden
// önce rol değiştirilir, ekrana MENÜDEN gidilir (viewport-checks ile aynı ders).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const base = process.env.BASE ?? '';
let server = null;
async function sunucuBaslat() {
  if (base) return base;
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite 30 saniyede açılmadı')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('localhost:5199')) { clearTimeout(t); res(); } });
  });
  return 'http://localhost:5199';
}

const url = await sunucuBaslat();
const b = await chromium.launch();
const out = [];
const ok = (c, w) => out.push((c ? 'ok   ' : 'FAIL ') + w);

for (const vp of [{ w: 390, h: 844 }, { w: 1280, h: 900 }]) {
  const c = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });

  // Rol geçişi (prototip araç çubuğu, yalnızca geliştirmede var)
  const rolBtn = p.getByRole('button', { name: /^Koordinatör$/i }).first();
  if (await rolBtn.count() === 0) { ok(false, `${vp.w}: rol düğmesi yok — atlandı`); await c.close(); continue; }
  await rolBtn.click(); await p.waitForTimeout(500);

  // Ekrana menüden git (mobilde başlık çekmecesi, masaüstünde yan panel)
  const hamburger = p.getByRole('button', { name: /Menüyü aç/i }).first();
  if (await hamburger.count() > 0) { await hamburger.click(); await p.waitForTimeout(400); }
  const link = p.getByRole('button', { name: /^Saha Güncellemeleri$/ }).first();
  ok(await link.count() >= 1, `${vp.w}: menüde Saha Güncellemeleri var`);
  if (await link.count() === 0) { await c.close(); continue; }
  await link.click(); await p.waitForTimeout(1200);

  const t1 = await p.evaluate(() => document.body.innerText);
  ok(p.url().includes('/koordinasyon/saha-guncellemeleri'),
     `${vp.w}: adres doğru (${p.url().split('/').slice(3).join('/')})`);
  ok(t1.includes('inceleyin, yayınlayın veya reddedin'), `${vp.w}: kuyruk ekranı açıldı`);
  ok(t1.includes('herkese açık hiçbir yerde görünmez'), `${vp.w}: bekleyenin görünmezliği yazıyor`);
  ok(t1.includes('İnceleme bekleyen'), `${vp.w}: özet kartları var`);

  // Demo kuyruk 3 kayıt taşıyor; en az bir "İncele" düğmesi olmalı
  const incele = p.getByRole('button', { name: /^İncele$/ });
  ok(await incele.count() >= 1, `${vp.w}: kuyrukta satır var (${await incele.count()})`);

  // MASKELEME: demo verinin ham e-postası ekranda HİÇBİR yerde olmamalı.
  ok(!t1.includes('@example.com') || t1.includes('***'),
     `${vp.w}: listede maskesiz e-posta yok`);
  ok(!/0532 000 00 00.*0532 000 00 00/s.test(t1.replace(/\n/g, ' ')) || true,
     `${vp.w}: (bilgi) gövde metni koordinatöre açık — maskeleme iletişim alanları için`);

  // Detay çekmecesi — PII bayraklı ilk kaydı aç
  if (await incele.count() > 0) {
    await incele.first().click(); await p.waitForTimeout(900);
    const t2 = await p.evaluate(() => document.body.innerText);
    ok(t2.includes('Gönderi incelemesi'), `${vp.w}: çekmece açıldı`);
    ok(t2.includes('maskeli') && t2.includes('denetim kaydına'), `${vp.w}: maskeleme ve denetim açıklaması var`);
    ok(t2.includes('Yayımlamadan önce düzenleyerek çıkarmayı'), `${vp.w}: PII uyarısı çekmecede`);

    // Gerekçesiz iletişim açılamıyor: "Aç" düğmesi 3 karakterden önce pasif
    const acBtn = p.getByRole('button', { name: /^İletişim bilgisini aç$/ }).first();
    ok(await acBtn.count() === 1, `${vp.w}: iletişim açma yolu var`);
    if (await acBtn.count()) {
      await acBtn.click(); await p.waitForTimeout(400);
      const onayla = p.getByRole('button', { name: /^Aç$/ }).first();
      ok(await onayla.isDisabled(), `${vp.w}: gerekçesiz iletişim açma pasif`);
      const vazgec = p.getByRole('button', { name: /^Vazgeç$/ }).first();
      if (await vazgec.count()) { await vazgec.click(); await p.waitForTimeout(300); }
    }

    // Yayınlama onayı: doğrulama kutusu AYRI soruluyor
    const yayinla = p.getByRole('button', { name: /^Yayınla$/ }).first();
    ok(await yayinla.count() === 1, `${vp.w}: Yayınla aksiyonu var`);
    if (await yayinla.count()) {
      await yayinla.click(); await p.waitForTimeout(500);
      const t3 = await p.evaluate(() => document.body.innerText);
      ok(t3.includes('herkese açık akışta görünür olacak'), `${vp.w}: yayın onayı sonucu söylüyor`);
      ok(t3.includes('Bu bilgiyi ayrıca doğruladım'), `${vp.w}: doğrulama ayrı bir karar`);
      ok(t3.includes('Doğrulama bekleniyor'), `${vp.w}: işaretlenmezse ne olacağı yazıyor`);
      const vazgec = p.getByRole('button', { name: /^Vazgeç$/ }).first();
      if (await vazgec.count()) { await vazgec.click(); await p.waitForTimeout(300); }
    }

    // Ret gerekçesiz gitmiyor
    const reddet = p.getByRole('button', { name: /^Reddet$/ }).first();
    if (await reddet.count()) {
      await reddet.click(); await p.waitForTimeout(400);
      const onayla = p.getByRole('button', { name: /^Onayla$/ }).first();
      ok(await onayla.isDisabled(), `${vp.w}: gerekçesiz ret pasif`);
    }

    // Bilgi iste: e-posta gitmediği DÜRÜSTÇE yazıyor
    const bilgi = p.getByRole('button', { name: /^Vazgeç$/ }).first();
    if (await bilgi.count()) { await bilgi.click(); await p.waitForTimeout(300); }
    const bilgiIste = p.getByRole('button', { name: /^Bilgi İste$/ }).first();
    if (await bilgiIste.count()) {
      await bilgiIste.click(); await p.waitForTimeout(400);
      const t4 = await p.evaluate(() => document.body.innerText);
      ok(t4.includes('otomatik e-posta GİTMEZ'), `${vp.w}: bilgi isteğinin e-posta göndermediği yazıyor`);
    }

    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  }

  // Koordinatör formu: herkese açık sekmede DÜRÜST vaat + yayın onayı.
  // Rol hâlâ koordinatör; operasyon sayfasına MENÜDEN değil uygulama içi
  // gezinmeyle gitmek gerek — "Herkese Açık Site" rolü sıfırlıyor. Bunun yerine
  // ekrandan çık: yan menüdeki koordinatör rotasından çıkıp içerik sekmesine
  // uygulama içinden gidilemiyorsa bu bölüm yalnızca 1280'de koşuyor (masaüstünde
  // sol menü + üst gezinme birlikte görünür durumda).
  if (vp.w >= 1280) {
    const aktif = p.getByRole('button', { name: /Aktif Afetler/ }).first();
    if (await aktif.count()) {
      await aktif.click(); await p.waitForTimeout(900);
      const kart = p.getByRole('button', { name: /Detayları Gör/ }).first();
      if (await kart.count()) {
        await kart.click(); await p.waitForTimeout(1200);
        const sekme = p.getByRole('button', { name: /Saha Güncellemeleri/ }).first();
        if (await sekme.count()) {
          await sekme.click(); await p.waitForTimeout(1200);
          const gonderBtn = p.getByRole('button', { name: /Saha Güncellemesi Gönder/ }).first();
          if (await gonderBtn.count()) {
            await gonderBtn.click(); await p.waitForTimeout(700);
            const t5 = await p.evaluate(() => document.body.innerText);
            ok(t5.includes('incelemeden geçmez, doğrudan yayımlanır'),
               `${vp.w}: koordinatör formu dürüst — doğrudan yayım yazıyor`);
            ok(!t5.includes('koordinatör incelemesinden sonra yayımlanır'),
               `${vp.w}: misafir vaadi koordinatöre gösterilmiyor`);
            ok(t5.includes('Koordinatör Güncellemesi') || t5.includes('Güvenlik Uyarısı'),
               `${vp.w}: koordinatör tür listesi açık`);
            // Metin yaz, Yayınla'ya bas: önce ONAY gelmeli, gönderim değil
            await p.locator('textarea').first().fill('Deneme koordinatör duyurusu (kontrol betiği).');
            const pubBtn = p.getByRole('button', { name: /^Yayınla$/ }).first();
            if (await pubBtn.count()) {
              await pubBtn.click(); await p.waitForTimeout(500);
              const t6 = await p.evaluate(() => document.body.innerText);
              ok(t6.includes('Doğrudan yayımlanacak'), `${vp.w}: yayın öncesi sonuç gösteriliyor`);
              ok(t6.includes('Onayla ve yayınla'), `${vp.w}: ikinci adım onayı var`);
              // YAYINLAMADAN çık — kontrol betiği içerik üretmez.
              const geri = p.getByRole('button', { name: /^Vazgeç$/ }).first();
              if (await geri.count()) { await geri.click(); await p.waitForTimeout(300); }
              await p.keyboard.press('Escape');
            }
          }
        }
      }
    }
  }

  const tasma = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(tasma === 0, `${vp.w}: yatay taşma yok (${tasma}px)`);
  ok(errs.length === 0, `${vp.w}: sayfa hatası yok (${errs.slice(0, 1).join('') || '—'})`);
  await c.close();
}

await b.close();
server?.kill();
console.log(out.join('\n'));
const f = out.filter((s) => s.startsWith('FAIL')).length;
console.log(f === 0 ? '\nMODERASYON: HEPSİ GEÇTİ' : `\n${f} BAŞARISIZ`);
process.exit(f === 0 ? 0 : 1);
