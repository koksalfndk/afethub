// AfetHUB — Faz 3-B "Destek Ol" ve teslim sözü akışı arayüz doğrulaması.
//
// Ne yapar: yerel (Supabase'siz) modda derlenmiş uygulamayı gerçek bir tarayıcıda
// açar, ihtiyaç kartından teslim sözü akışını UÇTAN UCA çalıştırır ve ekranda gerçekten
// ne yazdığını ölçer.
//
// Buradaki asıl soru, alan kuralının EKRANDA da tutup tutmadığı: teslim sözü verildikten
// sonra kartta yazan KALAN MİKTAR değişmemeli. `scripts/domain-checks.mjs` bunu veri
// katmanında kanıtlıyor; bu betik aynı şeyi kullanıcının gördüğü sayı üzerinde ölçüyor.
//
// Ön koşul (sırayla):
//   VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-local
//   npx vite preview --outDir dist-local --port 4177 --host 127.0.0.1 &
//   node scripts/support-flow-checks.mjs
//
// Playwright bağımlılık olarak EKLENMEDİ (rules/06 §Package Management); kurulu
// değilse betik bunu söyler ve atlanır — sessizce geçmiş gibi davranmaz.

import { createRequire } from 'node:module';

const BASE = process.env.AFETHUB_BASE ?? 'http://127.0.0.1:4177';
const OP = '/afet/seydikemer-orman-yangini-21-07-2026';

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

// Konsol hatası da bir kusurdur: üretimde sessizce yutulan bir istisna burada görünür.
const consoleErrors = [];
// Dış kaynak (Google Fonts) bu kapalı ortamda çözülemiyor; bu bir uygulama kusuru
// DEĞİL, ortam kısıtı. Yalnızca uygulamanın kendi hataları toplanıyor.
const external = (t) => /fonts\.googleapis|fonts\.gstatic|tile\.openstreetmap|ERR_TUNNEL/.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !external(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}${OP}/needs`, { waitUntil: 'networkidle' });

// ---- 1) Kart üzerindeki birincil eylem --------------------------------------
// TAM ad ile bağlanıyor: başarı ekranındaki "Başka bir ihtiyaç için destek ol"
// düğmesi de aynı deseni taşıyor ve gevşek bir eşleşme kartı kaybettiriyordu.
const ctaName = await page.getByRole('button', { name: /için destek ol$/i }).first()
  .getAttribute('aria-label');
const cta = page.getByRole('button', { name: ctaName, exact: true });
await cta.waitFor({ state: 'visible' });
ok((await cta.textContent())?.trim() === 'Destek Ol',
  'ihtiyaç kartındaki birincil eylem "Destek Ol"');
ok(await page.getByRole('button', { name: 'Bunu teslim ettim' }).count() === 0,
  'kartta artık doğrudan "Bunu teslim ettim" düğmesi YOK');

// Kartın tamamı: kalan miktar bu metnin içinde. Söz sonrası birebir karşılaştırılacak.
// Düğmeden yukarı iki kap: eylem satırı, sonra kartın kendisi.
const cardText = () => cta.evaluate((el) =>
  el.parentElement.parentElement.innerText.replace(/\s+/g, ' ').trim());
const cardBefore = await cardText();

// Söz formu YALNIZCA tıklayınca inmeli (rules/09 §8): sayfa yüklenirken ağa hiç
// SupportSheet parçası istenmemiş olmalı.
const chunkRequests = [];
page.on('request', (r) => { if (/SupportSheet/.test(r.url())) chunkRequests.push(r.url()); });
ok(chunkRequests.length === 0, 'destek formu sayfa açılışında İNDİRİLMİYOR');

// ---- 2) Seçim ekranı ---------------------------------------------------------
await cta.click();
const dialog = page.getByRole('dialog');
await dialog.waitFor({ state: 'visible' });
const chooseText = await dialog.innerText();
ok(/Nasıl destek olacaksınız/i.test(chooseText), 'seçim ekranı açılıyor');
ok(/Teslim Edeceğim/.test(chooseText) && /Teslim Ettim/.test(chooseText),
  'iki niyet ayrı ayrı sunuluyor');
ok(/kalan ihtiyaç miktarını azaltmaz/i.test(chooseText),
  'sözün kalan miktarı azaltmadığı seçim ekranında YAZILI');
ok(/koordinatör doğrulamasından sonra/i.test(chooseText),
  'teslimatın doğrulama gerektirdiği seçim ekranında YAZILI');
ok(chunkRequests.length > 0, 'destek formu yalnızca tıklamadan SONRA indiriliyor');

// Dokunma hedefleri
const smallTargets = await dialog.evaluate((root) => {
  const bad = [];
  for (const el of root.querySelectorAll('button,select,input,textarea,a[href]')) {
    if (el.type === 'checkbox') continue; // etiketin kendisi 44px yüksekliğinde
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 44) bad.push(`${el.tagName}:${Math.round(r.height)}`);
  }
  return bad;
});
ok(smallTargets.length === 0, `pencerede 44px altında dokunma hedefi yok (bulunan: ${smallTargets.join(', ')})`);

// Escape kapatır ve odak tetikleyiciye döner.
await page.keyboard.press('Escape');
await dialog.waitFor({ state: 'detached' });
ok(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? '').includes('destek ol')),
  'Escape pencereyi kapatır ve odak tetikleyici düğmeye DÖNER');

// ---- 3) Teslim sözü formu — doğrulama ---------------------------------------
await cta.click();
await dialog.waitFor({ state: 'visible' });
await dialog.getByRole('button', { name: /^Teslim Edeceğim/ }).click();
await dialog.getByRole('button', { name: 'Teslim Sözü Oluştur', exact: true }).waitFor();
ok(/kalan ihtiyaç miktarını azaltmaz/i.test(await dialog.innerText()),
  'söz formunun başında miktar kuralı YAZILI');

// Boş gönderim: pencere KAPANMAZ, alan hataları çıkar.
await dialog.getByRole('button', { name: 'Teslim Sözü Oluştur', exact: true }).click();
ok(await dialog.isVisible(), 'geçersiz gönderimde pencere kapanmıyor');
const errText = await dialog.innerText();
ok(/düzeltilmesi gereken alanlar/i.test(errText), 'özet hata mesajı gösteriliyor');
ok(/Miktar sıfırdan büyük olmalı/.test(errText), 'miktar alanı için ayrı hata yazılıyor');
ok(/Geçerli bir e-posta/.test(errText), 'e-posta alanı için ayrı hata yazılıyor');
ok(/iki onayı da işaretleyin/.test(errText), 'onay kutuları zorunlu');

// ---- 4) Kalanın üzerinde miktar: uyarır ama ENGELLEMEZ ----------------------
const qty = dialog.locator('input[id$="-qty"]');
await qty.fill('999999');
ok(/başka bir ihtiyaca yönlendirilmesi/i.test(await dialog.innerText()),
  'kalanın üzerindeki miktar için uyarı çıkıyor');

await qty.fill('5');
// Teslim noktası seçiliyor: hem sözün kartında görünmesi hem de bildirim formuna
// taşınması bu alana bağlı.
await dialog.locator('select[id$="-loc"]').selectOption({ index: 1 });
await dialog.locator('input[id$="-name"]').fill('Test Kisi');
await dialog.locator('input[id$="-email"]').fill('test@example.com');
await dialog.locator('input[id$="-city"]').fill('Muğla');
// Bilgiler hata sonrası KORUNUYOR mu (rules/04 §Forms).
ok(await dialog.locator('input[id$="-name"]').inputValue() === 'Test Kisi',
  'hata sonrası girilen bilgiler formda duruyor');

const boxes = dialog.locator('input[type="checkbox"]');
await boxes.nth(0).check();
await boxes.nth(1).check();

// ---- 5) Gönderim ve başarı ekranı -------------------------------------------
await dialog.getByRole('button', { name: 'Teslim Sözü Oluştur', exact: true }).click();
await dialog.getByText('Takip kodu', { exact: true }).waitFor();
const doneText = await dialog.innerText();
const code = (doneText.match(/DEMO-[A-Z0-9]+/) ?? [])[0] ?? '';
ok(code.length > 0, 'başarı ekranı bir takip kodu gösteriyor');
ok(/Teslim planınız kaydedildi/i.test(doneText), 'başarı başlığı teslimat DEĞİL, plan diyor');
ok(!/başarıyla ulaştı|teslim edildi/i.test(doneText),
  'başarı ekranı "ulaştı/teslim edildi" gibi doğrulanmamış bir iddia YAZMIYOR');
ok(/kalan ihtiyaç miktarını değiştirmez/i.test(doneText),
  'başarı ekranı miktarın değişmediğini yazıyor');
ok(/yerel önizleme modu/i.test(doneText),
  'yerel modda kaydın sunucuda oluşmadığı açıkça işaretleniyor');

// ---- 6) DEĞİŞMEZ KURAL: kartta kalan miktar aynı ----------------------------
//
// Kart pencerenin ARKASINDA duruyor ve okunabiliyor. Sayfa YENİDEN YÜKLENMİYOR:
// yerel modda kayıtlar bellekte tutuluyor, bir reload sözü de silerdi. Bu yüzden
// buradan sonrası tamamen uygulama içi gezinme (pushState/popstate) ile ilerliyor.
const cardAfter = await cardText();
ok(cardAfter === cardBefore,
  'teslim sözünden sonra ihtiyaç kartındaki sayıların HİÇBİRİ değişmedi');

// ---- 7) Takip ekranı ---------------------------------------------------------
await page.getByRole('button', { name: 'Teslim planımı görüntüle' }).click();
await page.waitForURL(/\/takip/);
ok(await page.getByLabel('Takip kodu').inputValue() === code,
  'takip formu koddan önceden dolduruluyor — kişi kodu yeniden yazmıyor');
ok(await page.getByLabel('E-posta').inputValue() === 'test@example.com',
  'takip formu e-postadan da önceden dolduruluyor');

await page.getByRole('button', { name: 'Takip et', exact: true }).click();
await page.getByText('Teslim sözü verildi').first().waitFor();
const trackText = await page.locator('main').innerText();
ok(/Teslim sözü verildi/.test(trackText), 'takip ekranı sözün durumunu YAZIYLA gösteriyor');
ok(/kalan ihtiyaç miktarını azaltmaz/i.test(trackText),
  'takip kartı miktar kuralını tekrar yazıyor');
ok(!/test@example\.com/.test(trackText), 'takip kartı e-posta adresini EKRANA YAZMIYOR');
ok(!/Test Kisi/.test(trackText), 'takip kartı ad soyad bilgisini EKRANA YAZMIYOR');
ok(!/\+?90[\s\d]{9,}|0\s?5\d{2}[\s\d]{7,}/.test(trackText), 'takip kartında telefon numarası görünmüyor');
ok(await page.getByRole('button', { name: 'Planımı İptal Et' }).isVisible(),
  'canlı bir söz için iptal eylemi sunuluyor');
ok(/AYRI bir teslimat bildirimi oluşturur/.test(trackText),
  'teslimat bildiriminin AYRI bir kayıt olduğu yazılı');

// Sözden teslimat bildirimine geçiş (direktif md. 10). Söz KAYBOLMUYOR, yeni ve ayrı
// bir kayıt açılıyor; forma yalnızca gerçekten taşınabilen bilgiler taşınıyor.
await page.getByRole('button', { name: 'Teslim ettim olarak bildir' }).click();
const rep = page.getByRole('dialog');
await rep.waitFor({ state: 'visible' });
const repText = await rep.innerText();
ok(/Teslimat bildir/i.test(repText), 'söz kartından mevcut teslimat bildirimi akışı açılıyor');
ok(/Maske/.test(repText), 'bildirim formunda ihtiyaç kalemi önceden seçili');
ok(/Hesap gerekmez/i.test(repText), 'bildirim için hesap istenmiyor');
// E-posta alanı sihirbazın ilerideki adımında; miktar girilip ilerleniyor.
await rep.locator('input[type="number"]').first().fill('5');
for (let i = 0; i < 3 && await rep.locator('input[type="email"]').count() === 0; i += 1) {
  const next = rep.getByRole('button', { name: 'Devam', exact: true });
  if (await next.count() === 0) break;
  await next.click();
  await page.waitForTimeout(300);
}
ok(await rep.locator('input[type="email"]').count() > 0
   && await rep.locator('input[type="email"]').first().inputValue() === 'test@example.com',
  'takip kutusuna yazılan e-posta bildirim formuna taşınıyor');
await rep.getByRole('button', { name: 'Kapat' }).click();
await rep.waitFor({ state: 'detached' });
ok(await page.getByRole('button', { name: 'Planımı İptal Et' }).isVisible(),
  'bildirim formu kapatılınca teslim sözü hâlâ duruyor');

// Yanlış e-posta ayrı bir kayıt AÇMAMALI (rules/02 §Tracking Codes).
await page.getByLabel('E-posta').fill('baska@example.com');
await page.getByRole('button', { name: 'Takip et', exact: true }).click();
await page.waitForTimeout(400);
ok(await page.getByRole('button', { name: 'Planımı İptal Et' }).count() === 0,
  'takip kodu TEK BAŞINA kaydı açmıyor — e-posta eşleşmesi zorunlu');

// ---- 8) İptal ----------------------------------------------------------------
await page.getByLabel('E-posta').fill('test@example.com');
await page.getByRole('button', { name: 'Takip et', exact: true }).click();
await page.getByRole('button', { name: 'Planımı İptal Et' }).click();
const confirmText = await page.locator('main').innerText();
ok(/Teslim planını iptal etmek istiyor musunuz/.test(confirmText), 'iptal onay adımı var');
ok(/Bu işlem ihtiyaç miktarını etkilemez/.test(confirmText),
  'iptalin sonucu onaydan ÖNCE yazılıyor');
await page.getByRole('button', { name: 'Planı İptal Et', exact: true }).click();
await page.getByText('İptal edildi').first().waitFor();
ok(await page.getByRole('button', { name: 'Planımı İptal Et' }).count() === 0,
  'iptal edilen söz için iptal eylemi artık sunulmuyor');

// ---- 9) İptalden sonra da miktarlar aynı ------------------------------------
await page.goBack();                       // pushState geri alınıyor — sayfa YENİLENMİYOR
await page.waitForURL(new RegExp(OP.replace(/[/-]/g, '\\$&')));
await cta.waitFor({ state: 'visible' });
const cardFinal = await cardText();
ok(cardFinal === cardBefore, 'iptalden sonra da kartta hiçbir sayı değişmedi');

// ---- 10) Telefon: alt sayfa (bottom sheet) ----------------------------------
{
  const m = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(`${BASE}${OP}/needs`, { waitUntil: 'networkidle' });
  const mcta = mp.getByRole('button', { name: /için destek ol$/i }).first();
  await mcta.waitFor({ state: 'visible' });
  await mcta.click();
  const md = mp.getByRole('dialog');
  await md.waitFor({ state: 'visible' });
  ok(/Nasıl destek olacaksınız/i.test(await md.innerText()), 'telefonda da seçim ekranı açılıyor');
  // Alt sayfa ekranın ALTINA yaslanıyor: tek elle ulaşılabilir olması gereken yer.
  const box = await md.boundingBox();
  ok(box.y + box.height >= 780 - 2, 'telefonda pencere alt sayfa olarak açılıyor');
  await md.getByRole('button', { name: /^Teslim Edeceğim/ }).click();
  await md.getByRole('button', { name: 'Teslim Sözü Oluştur', exact: true }).waitFor();
  // Yatay taşma yok — içerik kırpılmıyor, gizlenmiyor.
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, `telefonda yatay taşma yok (ölçülen: ${overflow}px)`);
  const cut = await md.evaluate((root) => Array.from(root.querySelectorAll('input,select,textarea,button'))
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length);
  ok(cut === 0, 'telefonda hiçbir form alanı ekranın dışına taşmıyor');
  await m.close();
}

ok(consoleErrors.length === 0, `tarayıcı konsolunda hata yok (bulunan: ${consoleErrors.slice(0, 3).join(' | ')})`);

await browser.close();
console.log(failed === 0 ? '\n=== FAZ 3-B AKIŞ KONTROLLERİ: HEPSİ GEÇTİ ===' : `\n=== ${failed} KONTROL BAŞARISIZ ===`);
process.exit(failed === 0 ? 0 : 1);
