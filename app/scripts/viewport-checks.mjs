// AfetHUB — viewport ölçümleri (Faz 3-D)
//
//   node scripts/viewport-checks.mjs            (dev sunucusunu kendisi başlatır)
//   BASE=http://localhost:5173 node scripts/viewport-checks.mjs
//
// Ne ölçüyor: dört genişlikte YATAY TAŞMA ve 44 pikselden küçük dokunma hedefi.
// Taşmayı `overflow-x: hidden` ile gizlemek bir düzeltme değil, bir örtmedir —
// bu yüzden ölçüm `scrollWidth > clientWidth` üzerinden yapılıyor ve taşmaya
// SEBEP OLAN öğe de raporlanıyor: hangi düğmenin taştığını bilmeden düzeltme
// tahmine dönüşüyor (Faz 3-A'da tam bu oldu; kusur "kısmen düzeltildi" sayılıp
// yeniden ölçülmedi ve Faz 3-C'de hâlâ oradaydı).
//
// Gerçek cihaz DEĞİL: Chromium'un viewport öykünmesi. Rapor bunu böyle yazmalı.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const VIEWPORTS = [
  { w: 360, h: 800, ad: '360×800 (küçük telefon)' },
  { w: 390, h: 844, ad: '390×844 (iPhone sınıfı)' },
  { w: 430, h: 932, ad: '430×932 (büyük telefon)' },
  { w: 768, h: 1024, ad: '768×1024 (tablet — masaüstü düzeni başlıyor)' },
  { w: 1024, h: 768, ad: '1024×768 (küçük dizüstü)' },
];

// Koordinatör ekranları yalnızca koordinatör rolünde var; rol geçişi geliştirme
// araç çubuğundan yapılıyor (üretim yapısında o çubuk yok).
const SAYFALAR = [
  { ad: 'Ana sayfa', hash: '#/', rol: 'visitor' },
  { ad: 'Koordinasyon paneli', hash: '#/', rol: 'coordinator', menu: /^Panel$/, imza: 'Koordinasyon paneli' },
  { ad: 'Teslim sözleri', hash: '#/', rol: 'coordinator', menu: /Teslim Sözleri/, imza: 'Teslim Sözleri' },
];

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

const sonuclar = [];

const url = await sunucuBaslat();
const browser = await chromium.launch();

for (const sayfa of SAYFALAR) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto(url + sayfa.hash, { waitUntil: 'networkidle' });

    if (sayfa.rol === 'coordinator') {
      // Rol yalnızca BELLEKTE tutuluyor (localStorage'a yazılmıyor), bu yüzden
      // sıra önemli: önce rol değiştirilir, SONRA adres JS ile değiştirilir.
      // `page.goto` ile gitmek sayfayı yeniden yükler ve rolü ziyaretçiye
      // döndürürdü — ilk ölçüm tam bu yüzden koordinatör ekranını hiç görmedi
      // ve "taşma yok" dedi.
      const btn = page.getByRole('button', { name: /^Koordinatör$/i }).first();
      if (await btn.count() === 0) {
        sonuclar.push({ sayfa: sayfa.ad, vp: vp.ad, durum: 'ATLANDI (rol düğmesi yok)' });
        await ctx.close();
        continue;
      }
      await btn.click();
      await page.waitForTimeout(400);

      // Telefon genişliğinde yan panel çizilmiyor; operasyon menüsü başlıktaki
      // çekmecede. Çekmece açılmadan bağlantı DOM'da yok.
      const hamburger = page.getByRole('button', { name: /Menüyü aç/i }).first();
      if (await hamburger.count() > 0) { await hamburger.click(); await page.waitForTimeout(400); }

      // Ekrana yan panelden gidiliyor, adresi elle yazarak değil: adres yazmak
      // uygulamayı yeniden yükler, yeniden yükleme rolü sıfırlar ve ölçüm sessizce
      // koordinasyon paneline düşer. İlk sürüm tam bunu yaptı ve yanlış ekranı
      // "teslim sözleri" diye ölçtü.
      const link = page.getByRole('button', { name: sayfa.menu }).first();
      if (await link.count() === 0) {
        sonuclar.push({ sayfa: sayfa.ad, vp: vp.ad, durum: `ATLANDI (yan panelde "${sayfa.menu}" yok)` });
        await ctx.close();
        continue;
      }
      await link.click();
      await page.waitForTimeout(900);

      // Gerçekten o ekranda mıyız? Değilsek ölçüm ATLANIR: yanlış ekranı ölçüp
      // "temiz" demek, ölçmemekten daha kötüdür.
      const dogru = await page.evaluate((imza) => document.body.innerText.includes(imza), sayfa.imza);
      if (!dogru) {
        sonuclar.push({ sayfa: sayfa.ad, vp: vp.ad, durum: `ATLANDI ("${sayfa.imza}" ekranda yok)` });
        await ctx.close();
        continue;
      }
    }

    const olcum = await page.evaluate(() => {
      const doc = document.documentElement;
      const tasma = doc.scrollWidth - doc.clientWidth;
      const genislik = doc.clientWidth;

      // Prototip araç çubuğu üretim paketinde yok; ölçüm dışı.
      const protoKabuk = document.querySelector('[data-prototype-chrome]');
      const uretimDisi = (el) => protoKabuk !== null && protoKabuk.contains(el);

      // Taşmaya sebep olan öğeler: görünür, genişliği sıfırdan büyük ve sağ
      // kenarı viewport'un dışına çıkan her öğe.
      const sucluler = [];
      for (const el of document.querySelectorAll('body *')) {
        if (uretimDisi(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > genislik + 0.5) {
          sucluler.push({
            etiket: el.tagName.toLowerCase(),
            aria: el.getAttribute('aria-label') ?? '',
            sinif: (el.className && typeof el.className === 'string') ? el.className : '',
            sag: Math.round(r.right),
            kapsayan: el.parentElement ? el.parentElement.tagName.toLowerCase() : '',
          });
        }
      }

      // 44 px altı dokunma hedefi (rules/04 yaklaşık 48 diyor; 44 WCAG 2.2 AA eşiği).
      const kucukHedefler = [];
      for (const el of document.querySelectorAll('button, a, input, select, [role="button"]')) {
        if (uretimDisi(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 44 || r.width < 44) {
          kucukHedefler.push({
            etiket: el.tagName.toLowerCase(),
            metin: (el.textContent ?? '').trim().slice(0, 24),
            aria: el.getAttribute('aria-label') ?? '',
            en: Math.round(r.width), boy: Math.round(r.height),
          });
        }
      }

      return { tasma, sucluler: sucluler.slice(0, 6), kucukHedefler: kucukHedefler.slice(0, 8) };
    });

    sonuclar.push({ sayfa: sayfa.ad, vp: vp.ad, ...olcum });
    await ctx.close();
  }
}

await browser.close();
if (server) server.kill();

// Taşma ile küçük dokunma hedefi ayrı raporlanıyor ve ÇIKIŞ KODUNU yalnızca
// taşma belirliyor. Sebebi: taşma bu fazın düzelttiği kusur ve geri gelirse
// koşu düşmeli; küçük hedefler ise başka ekranlardan gelen ayrı bir borç
// (ana sayfa slider noktaları) — onları da hataya çevirmek betiği kalıcı
// kırmızıya boyar ve kırmızı bir kontrol okunmaz hâle gelir.
let tasmaBulgu = 0;
const hedefSayaci = new Map();

for (const s of sonuclar) {
  if (s.durum) { console.log(`${s.sayfa} · ${s.vp}: ${s.durum}`); continue; }
  const tasmaMetni = s.tasma > 0 ? `TAŞMA ${s.tasma}px` : 'taşma yok';
  console.log(`${s.sayfa} · ${s.vp}: ${tasmaMetni} · 44px altı hedef: ${s.kucukHedefler.length}`);
  if (s.tasma > 0) {
    tasmaBulgu += 1;
    for (const c of s.sucluler) {
      console.log(`    → <${c.etiket}> aria="${c.aria}" class="${String(c.sinif).slice(0, 40)}" sağ=${c.sag}`);
    }
  }
  for (const h of s.kucukHedefler) {
    const anahtar = `${h.etiket} "${h.metin || h.aria}" ${h.en}×${h.boy}`;
    hedefSayaci.set(anahtar, (hedefSayaci.get(anahtar) ?? 0) + 1);
  }
}

if (hedefSayaci.size > 0) {
  console.log('\n44 piksel altı dokunma hedefleri (ayrı borç, çıkış kodunu etkilemez):');
  for (const [k, n] of [...hedefSayaci.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ! ${k}  — ${n} ölçümde`);
  }
}

console.log(tasmaBulgu === 0 ? '\nTAŞMA YOK.' : `\n${tasmaBulgu} ölçümde yatay taşma var.`);
process.exit(tasmaBulgu === 0 ? 0 : 1);
