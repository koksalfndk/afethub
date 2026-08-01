#!/usr/bin/env node
// Yerleşim (mahalle / köy) konum verisi — ölçüm ve kayıt.
//
// ARKA PLAN
// Afet sayfasında "etkilenen alan"ı poligon olarak boyamak istiyorduk. Ölçüm
// (01-08-2026, Seydikemer) gösterdi ki `admin_level` 7-11 arasında TEK BİR sınır
// poligonu yok; buna karşılık 117 yerleşim NOKTA olarak kayıtlı ve 64'ü bizim
// listemizle eşleşiyor. İstanbul'da 968 poligon var — yani kapsama kademeli değil,
// kentte tam / kırsalda hiç. AfetHUB operasyonları kırsalda açıldığı için sınır
// verisi pratikte yok sayılır.
//
// Karar: alan boyanmıyor, yerleşim NOKTA olarak gösteriliyor. Bir nokta iddia ettiği
// şeyi dürüstçe iddia eder ("bu köy etkilendi"); poligon ise sınırın nerede olduğunu
// da iddia eder ve o bilgi bizde yok.
//
// İKİ KİP
//   ölçüm  (varsayılan) — hangi seviyede kaç sınır var, kaç nokta var: sayar, yazmaz
//   --kaydet            — noktaları public/maps/settlements/<plaka>.json olarak yazar
//
// KULLANIM
//   node scripts/mahalle-kapsama.mjs                          # afet-bolgeleri.json'daki tüm ilçeler
//   node scripts/mahalle-kapsama.mjs "Muğla/Seydikemer"       # tek ilçe
//   node scripts/mahalle-kapsama.mjs --kaydet                 # ölç VE kaydet
//   node scripts/mahalle-kapsama.mjs --json rapor.json
//
// Kaynak: OpenStreetMap, Overpass API. Veri **ODbL**. Üretilen dosyaların yanına
// atıf metni yazılıyor (public/maps/settlements/README.txt) — silinmemeli.
//
// Overpass ORTAK bir kaynak: istekler aralıklı gönderilir. Paralel sorgu atmak
// IP'nin geçici engellenmesiyle biter.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTLEMENT_NAMES = join(ROOT, 'public', 'data', 'settlements');   // kendi ad listemiz (varsa)
const OUT_DIR = join(ROOT, 'public', 'maps', 'settlements');            // üretilen konum dosyaları
const REGIONS = join(ROOT, 'scripts', 'afet-bolgeleri.json');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];
// Overpass kullanım kuralları isteği yapanın kendini tanıtmasını ister. Node'un
// `fetch`'i varsayılan olarak göndermiyor ve sunucunun önündeki Apache bunu
// `406 Not Acceptable` ile geri çeviriyor — ilk çalıştırmada alınan hata buydu.
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'application/json',
  'User-Agent': 'AfetHUB-yerlesim-noktalari/1.0 (afet koordinasyon platformu; https://afethub.com)',
};
const GAP_MS = 3000;
const TIMEOUT_S = 90;
// 5 ondalık ≈ 1 metre. Daha fazlası dosyayı şişirir, daha azı köyü kaydırır.
const PRECISION = 5;

// --- Türkçe ad normalleştirme ---------------------------------------------
// "Arsaköy" ile "Arsaköy Mahallesi" aynı yer. OSM adları eki taşır, bizim listemiz
// taşımaz. Ayrıca I/İ sorunu: `toLowerCase()` "İZMİR" → "i̇zmir" üretir ve eşleşmeyi
// bozar; Türkçe yerel ayarıyla küçültülüyor.
const SUFFIX = /\s+(mahallesi|mah\.?|köyü|koyu|belde(si)?|beldesi)$/i;
export const norm = (s) =>
  String(s ?? '')
    .replace(SUFFIX, '')
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[’'`´]/g, '')
    .replace(/\s+/g, ' ');

// --- Overpass -------------------------------------------------------------
// İlçe ADIYLA değil, ilin İÇİNDE aranıyor: Türkiye'de aynı adı taşıyan ilçeler var
// (Merkez, Çay, Bala…) ve yalnızca adla sorgulamak yanlış ilçeyi getirir.
//
// Tek bir `admin_level`'a bakılmıyor: mahalle her ilde 8 değil, 9/10 da olabiliyor.
// 7-11 birlikte sorulup seviye seviye raporlanıyor — "veri yok" ile "yanlış yere
// baktık" ancak böyle ayrılır.
const boundaryQuery = (il, ilce) => `[out:json][timeout:${TIMEOUT_S}];
area["name"="${il}"]["admin_level"="4"]->.il;
rel(area.il)["boundary"="administrative"]["admin_level"="6"]["name"="${ilce}"]->.d;
.d out tags;
.d map_to_area->.a;
rel(area.a)["boundary"="administrative"]["admin_level"~"^(7|8|9|10|11)$"];
out tags;`;

// Nokta sorgusu. `out center` de isteniyor çünkü bazı yerleşimler node değil
// way/relation olarak işaretlenmiş; merkezleri yine de bir nokta verir.
const pointQuery = (il, ilce) => `[out:json][timeout:${TIMEOUT_S}];
area["name"="${il}"]["admin_level"="4"]->.il;
rel(area.il)["boundary"="administrative"]["admin_level"="6"]["name"="${ilce}"];
map_to_area->.a;
(
  node(area.a)["place"~"^(neighbourhood|village|hamlet|suburb|quarter|town)$"];
  way(area.a)["place"~"^(neighbourhood|village|hamlet|suburb|quarter|town)$"];
  rel(area.a)["place"~"^(neighbourhood|village|hamlet|suburb|quarter|town)$"];
);
out center tags;`;

// YEDEK YOL. `map_to_area` bazı ilçelerde boş alan üretiyor: ilçe rölasyonu var ama
// kapalı bir çokgen oluşturmadığı için Overpass ondan bir "alan" türetemiyor. Tavşanlı
// (Kütahya) tam olarak böyle çıktı — 126 yerleşimimiz varken 0 nokta döndü.
//
// O durumda ilçenin SINIR KUTUSU (bounding box) kullanılıyor. Kutu ilçeden büyüktür ve
// komşu ilçelerin köylerini de kapsar; bu yüzden sonuç KENDİ RESMÎ LİSTEMİZLE
// süzülüyor. Listemiz olmayan bir ilçede bu yedek ÇALIŞTIRILMIYOR — süzemeyeceğimiz
// veriyi kaydetmek, yanlış ilçeye köy yazmak olurdu.
const bboxQuery = (il, ilce) => `[out:json][timeout:${TIMEOUT_S}];
area["name"="${il}"]["admin_level"="4"]->.il;
rel(area.il)["boundary"="administrative"]["admin_level"="6"]["name"="${ilce}"];
out bb;`;

const bboxPointQuery = (b) => `[out:json][timeout:${TIMEOUT_S}];
(
  node(${b.minlat},${b.minlon},${b.maxlat},${b.maxlon})["place"~"^(neighbourhood|village|hamlet|suburb|quarter|town)$"];
  way(${b.minlat},${b.minlon},${b.maxlat},${b.maxlon})["place"~"^(neighbourhood|village|hamlet|suburb|quarter|town)$"];
);
out center tags;`;

// Teşhis: aynı adı taşıyan tüm idari rölasyonları döker. "0 nokta" sonucunun
// sebebini tahmin etmek yerine görmek için.
const diagQuery = (il, ilce) => `[out:json][timeout:${TIMEOUT_S}];
area["name"="${il}"]["admin_level"="4"]->.il;
(
  rel(area.il)["name"="${ilce}"];
  way(area.il)["name"="${ilce}"]["boundary"="administrative"];
);
out tags bb;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const host = (u) => new URL(u).host;

async function ask(body) {
  let last = null;
  for (const url of ENDPOINTS) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: HEADERS, body });
    } catch (e) {
      last = `${host(url)}: ağ hatası (${e.message})`;
      continue;
    }
    if (res.status === 429 || res.status === 504) {
      await sleep(5000);
      res = await fetch(url, { method: 'POST', headers: HEADERS, body });
    }
    if (!res.ok) {
      last = `${host(url)}: HTTP ${res.status} ${(await res.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}`;
      continue;
    }
    const text = await res.text();
    try { return JSON.parse(text).elements ?? []; }
    catch { last = `${host(url)}: JSON değil — ${text.slice(0, 120)}`; }
  }
  throw new Error(last ?? 'bilinmeyen hata');
}

async function boundaries(il, ilce) {
  const els = await ask('data=' + encodeURIComponent(boundaryQuery(il, ilce)));
  const districtFound = els.some((e) => e.tags?.admin_level === '6');
  const byLevel = new Map();
  for (const e of els) {
    const lv = e.tags?.admin_level;
    if (!lv || lv === '6' || !e.tags?.name) continue;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(e.tags.name);
  }
  return { districtFound, byLevel };
}

async function points(il, ilce) {
  return elsToPoints(await ask('data=' + encodeURIComponent(pointQuery(il, ilce))));
}

function elsToPoints(els) {
  const out = [];
  for (const e of els) {
    const name = e.tags?.name;
    // Koordinatı olmayan öğe ATILIR. Adı olup yeri olmayan bir kayıt haritada
    // sessizce 0,0'a — Gine Körfezi'ne — düşerdi.
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!name || lat == null || lon == null) continue;
    out.push({
      ad: name,
      lat: Number(lat.toFixed(PRECISION)),
      lng: Number(lon.toFixed(PRECISION)),
      tur: e.tags.place,
      osm: `${e.type}/${e.id}`,
    });
  }
  return out;
}

async function districtBBox(il, ilce) {
  const els = await ask('data=' + encodeURIComponent(bboxQuery(il, ilce)));
  const b = els.find((e) => e.bounds)?.bounds;
  return b ?? null;
}

async function pointsInBBox(b) {
  const els = await ask('data=' + encodeURIComponent(bboxPointQuery(b)));
  return elsToPoints(els);
}

async function diagnose(il, ilce) {
  const els = await ask('data=' + encodeURIComponent(diagQuery(il, ilce)));
  return els.map((e) => ({
    tip: `${e.type}/${e.id}`,
    admin: e.tags?.admin_level ?? '—',
    boundary: e.tags?.boundary ?? '—',
    place: e.tags?.place ?? '—',
    alan: e.bounds ? 'var' : 'YOK',
  }));
}

// --- kendi ad listemiz (varsa) --------------------------------------------
// Yalnızca ÇAPRAZ KONTROL için: OSM'den gelen adların resmî listeyle örtüşüp
// örtüşmediğini gösterir. Liste yoksa kayıt yine yapılır — OSM'de bulunan her
// yerleşim yazılır, hiçbiri resmî listeye göre elenmez.
async function ourNames(plate, ilce) {
  try {
    const d = JSON.parse(await readFile(join(SETTLEMENT_NAMES, `${plate}.json`), 'utf8'));
    const e = d[ilce];
    return e ? [...(e.m ?? []), ...(e.k ?? [])] : null;
  } catch { return null; }
}

// --- atıf ------------------------------------------------------------------
// ODbL, türetilmiş veriyi paylaşırken kaynağın belirtilmesini ve aynı lisansın
// korunmasını ister. Metin üretilen dosyaların YANINDA duruyor ki dosyalar
// kopyalandığında yükümlülük de birlikte gitsin (il haritasında da aynı yol).
const README = `AfetHUB — yerleşim (mahalle / köy) konum verisi
================================================

Bu klasördeki <plaka>.json dosyaları, operasyon açılmış ilçelerdeki yerleşimlerin
NOKTA konumlarını içerir. Sınır (poligon) verisi DEĞİLDİR — ölçüm, kırsal ilçelerde
OpenStreetMap'te yerleşim sınırı bulunmadığını gösterdi (bkz. proje notu
"mahalle-sinir-arastirmasi").

Kaynak
------
OpenStreetMap katkıcıları, Overpass API üzerinden.
Üretim: app/scripts/mahalle-kapsama.mjs --kaydet

Lisans
------
Open Database License (ODbL) v1.0
https://opendatacommons.org/licenses/odbl/1-0/

Zorunlu atıf metni:
  "Contains information from OpenStreetMap, which is made available
   under the Open Database License (ODbL)."
  (c) OpenStreetMap contributors - https://www.openstreetmap.org/copyright

Yukumluluk
----------
ODbL "share-alike" bir lisanstir: bu veriden turetilmis bir VERI TABANI
yayinlanirsa ayni lisansla yayinlanmak zorundadir. Yalnizca haritada gosterim
(produced work) icin atif yeterlidir.

BU DOSYA VE YANINDAKI VERI DOSYALARI SILINMEMELIDIR.
`;

// --- ana akış --------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const save = argv.includes('--kaydet');
  const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
  const explicit = argv.filter((a) => a.includes('/') && !a.startsWith('--') && !a.endsWith('.json'));

  const cfg = JSON.parse(await readFile(REGIONS, 'utf8')).bolgeler;
  let regions = cfg;
  if (explicit.length > 0) {
    regions = explicit.map((pair) => {
      const [il, ilce] = pair.split('/').map((x) => x.trim());
      const known = cfg.find((r) => r.il === il && r.ilce === ilce);
      // Plakayı tahmin etmiyoruz: bilinmeyen bir ilçe için yanlış dosyaya yazmak,
      // sessizce başka bir ilin verisini bozmak olurdu.
      if (!known) throw new Error(`${pair}: afet-bolgeleri.json içinde yok, plaka bilinmiyor`);
      return known;
    });
  }

  console.log(`${regions.length} ilçe ${save ? 'ölçülüp kaydedilecek' : 'ölçülecek'}.\n`);

  const report = [];
  const byPlate = new Map();      // plaka -> { il, ilceler: { ilçe -> { ad -> {...} } } }
  let measured = 0, failed = 0;

  for (const r of regions) {
    const label = `${r.il} / ${r.ilce}`;
    let b;
    try {
      b = await boundaries(r.il, r.ilce);
    } catch (e) {
      console.log(`  ${label.padEnd(24)} HATA: ${e.message}`);
      report.push({ ...r, error: String(e.message) });
      failed += 1;
      await sleep(GAP_MS);
      continue;
    }

    if (!b.districtFound) {
      // "İlçe bulunamadı" ile "sınır yok" AYRI sonuçlar. Aynı satırda göstermek
      // yanlış karara götürür.
      console.log(`  ${label.padEnd(24)} İLÇE BULUNAMADI (OSM'de bu adla admin_level=6 rölasyonu yok)`);
      report.push({ ...r, districtFound: false });
      failed += 1;
      await sleep(GAP_MS);
      continue;
    }

    const levels = {};
    for (const [lv, names] of b.byLevel) levels[lv] = names.length;
    const boundaryTotal = Object.values(levels).reduce((a, x) => a + x, 0);

    await sleep(GAP_MS);
    let pts;
    try {
      pts = await points(r.il, r.ilce);
    } catch (e) {
      console.log(`  ${label.padEnd(24)} sınır ${boundaryTotal} · NOKTA HATASI: ${e.message}`);
      report.push({ ...r, levels, boundaryTotal, points: null, error: String(e.message) });
      failed += 1;
      await sleep(GAP_MS);
      continue;
    }

    const official = await ourNames(r.plaka, r.ilce);
    const officialSet = official ? new Set(official.map(norm)) : null;

    // Alan sorgusu boş döndüyse yedek yola geç. YALNIZCA resmî listemiz varsa:
    // sınır kutusu komşu ilçeleri de kapsıyor ve süzemeyeceğimiz veriyi kaydetmek
    // yanlış ilçeye köy yazmak olurdu.
    let viaBBox = false;
    if (pts.length === 0 && officialSet) {
      await sleep(GAP_MS);
      try {
        const bb = await districtBBox(r.il, r.ilce);
        if (bb) {
          await sleep(GAP_MS);
          const wide = await pointsInBBox(bb);
          pts = wide.filter((p) => officialSet.has(norm(p.ad)));
          viaBBox = true;
          console.log(`  ${''.padEnd(24)} alan sorgusu boş → sınır kutusu denendi:`
            + ` kutuda ${wide.length} nokta, resmî listeyle ${pts.length} eşleşme`);
        }
      } catch (e) {
        console.log(`  ${''.padEnd(24)} yedek sorgu da başarısız: ${e.message}`);
      }
    }

    // Aynı ad birden çok kez gelebilir (bir köy hem node hem way olarak işaretli).
    // İlk kayıt tutulur; ad başına tek konum yeterli.
    const uniq = new Map();
    for (const p of pts) if (!uniq.has(norm(p.ad))) uniq.set(norm(p.ad), p);
    const list = [...uniq.values()].sort((a, x) => a.ad.localeCompare(x.ad, 'tr'));

    const matched = officialSet ? list.filter((p) => officialSet.has(norm(p.ad))).length : null;

    // Hâlâ boşsa sebebini SÖYLE, tahmin etme: aynı adı taşıyan rölasyonları döker.
    if (list.length === 0) {
      await sleep(GAP_MS);
      try {
        const rows = await diagnose(r.il, r.ilce);
        console.log(`  ${''.padEnd(24)} TEŞHİS — "${r.ilce}" adlı ${rows.length} nesne:`);
        for (const x of rows.slice(0, 8)) {
          console.log(`  ${''.padEnd(26)} ${x.tip}  admin=${x.admin} boundary=${x.boundary} place=${x.place} sınırkutusu=${x.alan}`);
        }
      } catch { /* teşhis amaçlı */ }
    }

    const lvTxt = boundaryTotal ? Object.entries(levels).map(([lv, n]) => `L${lv}:${n}`).join(' ') : 'sınır yok';
    const matchTxt = official
      ? ` · resmî listede ${matched}/${official.length}`
      : ' · resmî liste yok, çapraz kontrol atlandı';
    console.log(`  ${label.padEnd(24)} ${String(list.length).padStart(4)} nokta · [${lvTxt}]${matchTxt}`);

    if (viaBBox && list.length > 0) {
      // Kaydın nereden geldiği raporda duruyor: sınır kutusu yolu ilçe sınırını
      // garanti etmez, yalnızca resmî ad listesiyle süzülmüştür.
      console.log(`  ${''.padEnd(24)} not: bu ilçenin kaydı sınır kutusu + resmî ad süzgeciyle üretildi`);
    }

    if (save && list.length > 0) {
      if (!byPlate.has(r.plaka)) byPlate.set(r.plaka, { il: r.il, ilceler: {} });
      byPlate.get(r.plaka).ilceler[r.ilce] = Object.fromEntries(
        list.map((p) => [p.ad, { lat: p.lat, lng: p.lng, tur: p.tur, osm: p.osm }]),
      );
    }

    report.push({ ...r, levels, boundaryTotal, points: list.length, official: official?.length ?? null, matched, viaBBox });
    measured += 1;
    await sleep(GAP_MS);
  }

  console.log('');
  if (measured === 0) {
    // Ölçülememiş bir şeyi "yok" diye raporlamak, üzerine karar verilecek bir yalan.
    console.log(`ÖLÇÜM YAPILAMADI — ${failed} ilçenin hiçbirine yanıt alınamadı.`);
    console.log('Overpass meşgul olabilir; birkaç dakika sonra tekrar deneyin.');
    process.exitCode = 2;
  } else {
    const totalPts = report.reduce((a, x) => a + (x.points ?? 0), 0);
    const totalBnd = report.reduce((a, x) => a + (x.boundaryTotal ?? 0), 0);
    console.log(`ÖZET: ${measured} ilçe ölçüldü${failed ? `, ${failed} ilçe HATA` : ''}`);
    console.log(`  toplam ${totalPts} yerleşim noktası, ${totalBnd} sınır poligonu`);
    if (totalBnd === 0) console.log('  → hiç sınır yok: alan boyama uygulanamaz, nokta gösterimi uygulanabilir.');
  }

  if (save && byPlate.size > 0) {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(join(OUT_DIR, 'README.txt'), README, 'utf8');
    for (const [plaka, v] of byPlate) {
      const file = join(OUT_DIR, `${plaka}.json`);
      // Var olan dosyanın ÜZERİNE YAZILMAZ, birleştirilir: betik tek ilçe için de
      // çalıştırılabiliyor ve o çalıştırma diğer ilçelerin kaydını silmemeli.
      let existing = {};
      try { existing = JSON.parse(await readFile(file, 'utf8')); } catch { /* ilk kez */ }
      const merged = {
        _kaynak: 'OpenStreetMap katkıcıları · ODbL 1.0 · https://www.openstreetmap.org/copyright',
        _not: 'Yerleşim NOKTA konumları. Sınır (poligon) verisi değildir.',
        il: v.il,
        ilceler: { ...(existing.ilceler ?? {}), ...v.ilceler },
      };
      await writeFile(file, JSON.stringify(merged, null, 1), 'utf8');
      const n = Object.values(merged.ilceler).reduce((a, x) => a + Object.keys(x).length, 0);
      console.log(`  yazıldı: public/maps/settlements/${plaka}.json (${v.il}, ${n} yerleşim)`);
    }
    console.log('  yazıldı: public/maps/settlements/README.txt (ODbL atıfı — silmeyin)');
  } else if (save) {
    console.log('  kaydedilecek nokta bulunamadı, dosya yazılmadı.');
  }

  if (jsonOut) {
    await writeFile(jsonOut, JSON.stringify({ measured, failed, rows: report }, null, 2), 'utf8');
    console.log(`Ayrıntılı rapor: ${jsonOut}`);
  }
}

// Doğrudan çalıştırıldığında ölç; `import` edildiğinde yalnızca yardımcıları ver
// (normalleştirme mantığı böylece ağ olmadan sınanabiliyor).
const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) main().catch((e) => { console.error(e); process.exit(1); });
