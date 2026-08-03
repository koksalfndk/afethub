// AfetHUB — teslim sözü CSV dışa aktarımının doğrulaması (Faz 3-D)
//
// Ön koşul — GELİŞTİRME sunucusu (üretim yapısı DEĞİL):
//   npx vite --port 5199 --strictPort &
//   AFETHUB_BASE=http://localhost:5199 node scripts/csv-checks.mjs
//
// Neden `vite preview` değil: koordinatör rolüne geçiş prototip araç çubuğundan
// yapılıyor ve o çubuk üretim yapısında YOK (`import.meta.env.DEV`). `overview-ui`
// ve `support-flow` betikleri herkese açık akışı ölçtüğü için preview'la
// çalışabiliyor; koordinatör ekranı ölçen betikler dev sunucusuna bağlı.
//
// Ne ölçüyor: dosyanın gerçekten indiği, içeriğinin ekrandaki listeyle aynı
// olduğu, iletişim bilgilerinin MASKELİ geldiği ve zamanların operasyonun saat
// dilimine göre yazıldığı.
//
// Son madde bir üretim bulgusundan geliyor: ilk sürüm tarayıcının yerel saatini
// kullanıyordu. Türkiye'den bakan biri için fark yoktu, o yüzden ilk üretim
// koşusunda görünmedi. Bu yüzden test AYNI dosyayı iki farklı saat diliminde
// indirip karşılaştırıyor — tek saat diliminde koşan bir test bu kusuru
// yakalayamaz.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  console.error('ATLANDI: playwright kurulu değil. Kontroller ÇALIŞTIRILMADI.');
  process.exit(2);
}

const BASE = process.env.AFETHUB_BASE ?? 'http://localhost:5199';
let ok = 0;
const fails = [];
const expect = (cond, what) => {
  if (cond) { ok += 1; console.log(`ok   ${what}`); }
  else { fails.push(what); console.log(`FAIL ${what}`); }
};

async function indir(browser, timezoneId) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, acceptDownloads: true, timezoneId,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Koordinatör$/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Teslim Sözleri/ }).first().click();
  await page.waitForTimeout(1200);

  const btn = page.getByRole('button', { name: /CSV indir/ }).first();
  if (await btn.count() === 0) { await ctx.close(); return null; }
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    btn.click(),
  ]);
  const path = await dl.path();
  const fs = await import('node:fs');
  const metin = fs.readFileSync(path, 'utf8');
  const toast = (await page.evaluate(() => document.body.innerText)).includes('kayıt indirildi');
  const ad = dl.suggestedFilename();
  await ctx.close();
  return { metin, ad, toast };
}

const browser = await chromium.launch();
const tr = await indir(browser, 'Europe/Istanbul');

if (tr === null) {
  console.error('ATLANDI: "CSV indir" düğmesi bulunamadı — ekran açılmamış olabilir.');
  await browser.close();
  process.exit(2);
}

const satirlar = tr.metin.trim().split('\r\n');
expect(tr.metin.charCodeAt(0) === 0xFEFF, 'dosya BOM ile başlıyor (Excel Türkçe karakterleri bozmuyor)');
expect(satirlar[0] === 'sep=;' || satirlar[0] === '﻿sep=;', 'ilk satır ayırıcıyı bildiriyor');
expect(satirlar[1].includes('"Takip kodu"') && satirlar[1].includes('"Son güncelleme"'), 'başlık satırı tam');
expect(satirlar.length > 2, 'en az bir veri satırı var');
expect(tr.toast, 'kaç kayıt indirildiği kullanıcıya söyleniyor');
expect(/^teslim-sozleri-[a-z]+-\d{8}\.csv$/.test(tr.ad), `dosya adı görünüm ve tarih taşıyor (${tr.ad})`);

// Maskeleme SÜTUN BAZINDA ölçülüyor. İlk sürüm dosyanın tamamında "Ad Soyad"
// kalıbı aradı ve "Seydikemer Kapalı Pazar Yeri" ile "Göz Damlası" yüzünden
// yanlış pozitif verdi: teslim noktası ve ihtiyaç adı zaten herkese açık veri.
// Maskelenmesi gereken üç sütun bellidir; kontrol de tam onlara bakmalı.
const hucreler = (satir) => satir.replace(/^"|"$/g, '').split('";"');
const basliklar = hucreler(satirlar[1]);
const veriSatirlari = satirlar.slice(2).map(hucreler);
const sutun = (ad) => basliklar.indexOf(ad);

const iAd = sutun('Söz sahibi (maskeli)');
const iMail = sutun('E-posta (maskeli)');
const iTel = sutun('Telefon (maskeli)');
expect(iAd >= 0 && iMail >= 0 && iTel >= 0, 'maskeli iletişim sütunları başlıkta var');

const adlar = veriSatirlari.map((r) => r[iAd] ?? '');
const mailler = veriSatirlari.map((r) => r[iMail] ?? '');
const telefonlar = veriSatirlari.map((r) => r[iTel] ?? '');

// Maskeli ad: her parça yıldızla biter (`A*** T***`). Yıldızsız bir parça,
// maskelemeden geçmemiş bir kelime demektir.
expect(adlar.every((v) => v === '' || v.split(/\s+/).every((p) => p.endsWith('***'))),
  `söz sahibi sütununda maskelenmemiş kelime yok (${adlar.join(' / ') || 'boş'})`);
expect(mailler.every((v) => v === '' || /^.\*\*\*@/.test(v)),
  `e-posta sütunu maskeli (${mailler.join(' / ') || 'boş'})`);
expect(telefonlar.every((v) => v === '' || /^[•• ]+\d{4}$/.test(v)),
  `telefon sütunu yalnızca son dört haneyi taşıyor (${telefonlar.join(' / ') || 'boş'})`);

// Ham iletişim verisi dosyanın HİÇBİR yerinde olmamalı — yanlış sütuna yazılmış
// bir değer yukarıdaki üç kontrolden kaçardı.
expect(!/@/.test(tr.metin.replace(/"[^"]*\*\*\*@[^"]*"/g, '""')),
  'dosyada maskelenmemiş e-posta yok');
expect(!/\b0?5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/.test(tr.metin),
  'dosyada maskelenmemiş telefon numarası yok');

// Saat dilimi: aynı liste, iki farklı tarayıcı saat diliminde AYNI zamanları
// yazmalı. Zamanlar operasyonun saat diliminde (Europe/Istanbul).
const ny = await indir(browser, 'America/New_York');
await browser.close();

if (ny === null) {
  console.log('FAIL ikinci saat diliminde dosya indirilemedi');
  fails.push('ikinci saat dilimi ölçümü');
} else {
  const zamanlariAl = (m) => m.trim().split('\r\n').slice(2)
    .map((s) => (s.match(/"(\d{4}-\d{2}-\d{2} \d{2}:\d{2})"/g) ?? []).join('|'));
  const a = zamanlariAl(tr.metin).join('\n');
  const b = zamanlariAl(ny.metin).join('\n');
  expect(a === b, 'zamanlar tarayıcının saat diliminden BAĞIMSIZ (Europe/Istanbul)');
  if (a !== b) console.log(`     TR: ${a}\n     NY: ${b}`);
  expect(tr.ad === ny.ad, 'dosya adındaki gün de saat diliminden bağımsız');
}

console.log(fails.length === 0
  ? `\n=== CSV KONTROLLERİ: HEPSİ GEÇTİ (${ok}) ===`
  : `\n=== CSV KONTROLLERİ: ${fails.length} BAŞARISIZ ===\n${fails.map((f) => ' - ' + f).join('\n')}`);
process.exit(fails.length === 0 ? 0 : 1);
