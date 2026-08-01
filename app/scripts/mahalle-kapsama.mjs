#!/usr/bin/env node
// Mahalle sınırı kapsama ölçümü.
//
// SORU: Elimizdeki mahalle ADLARININ kaçının OpenStreetMap'te bir SINIRI var?
//
// Neden ölçüyoruz: afet sayfasında "etkilenen alan" boyamak istiyoruz. Ama proje
// kuralı "boş = kaydedilmedi, asla tahmin edilmez". Sınırı olan mahalleleri boyayıp
// olmayanları boş bırakmak, haritayı "buralar etkilenmedi" diye okutur — etkilenmiş
// bir köyün atlanmasına yol açabilir. Bu yüzden önce kapsamayı BİLMEK, sonra karar
// vermek gerekiyor.
//
// Ne yapmıyor: veri indirmiyor, dosya üretmiyor (--geojson verilmedikçe). Yalnızca
// sayıyor. Poligonları gerçekten çekmek ayrı bir adım ve ancak bu sayı yeterliyse
// anlamlı.
//
// KULLANIM
//   node scripts/mahalle-kapsama.mjs                      # kayıtlı tüm illeri ölçer
//   node scripts/mahalle-kapsama.mjs 48 07               # yalnızca Muğla ve Antalya
//   node scripts/mahalle-kapsama.mjs 48 --ilce Seydikemer
//   node scripts/mahalle-kapsama.mjs 48 --json rapor.json
//
// Kaynak: OpenStreetMap, Overpass API. Veri ODbL — türetilmiş bir veri seti
// yayınlanırsa atıf ve aynı lisans yükümlülüğü doğar (bkz. public/maps/README.txt'te
// izlediğimiz yol).
//
// Overpass ORTAK bir kaynak: sorgular yavaş ve aralıklı gönderilir. Sunucuyu
// hızlandırmak için paralel istek atmak, IP'nin geçici olarak engellenmesiyle biter.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTLEMENTS = join(ROOT, 'public', 'data', 'settlements');
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
// İstekler arası bekleme. Overpass'ın adil kullanım kuralı: eşzamanlı slot azdır ve
// arka arkaya sorgu 429 döndürür. 3 saniye, tek kullanıcı için nazik bir aralık.
const GAP_MS = 3000;
const TIMEOUT_S = 90;

// --- Türkçe ad normalleştirme ---------------------------------------------
// "Arsaköy" ile "Arsaköy Mahallesi" aynı yer. OSM adları eki taşır, bizim listemiz
// taşımaz. Ayrıca I/İ sorunu: `toLowerCase()` "İZMİR" → "i̇zmir" üretir ve eşleşmeyi
// bozar; Türkçe yerel ayarı ile küçültüyoruz.
const SUFFIX = /\s+(mahallesi|mah\.?|köyü|koyu|belde(si)?|beldesi)$/i;
export const norm = (s) =>
  String(s ?? '')
    .replace(SUFFIX, '')
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[’'`´]/g, '')
    .replace(/\s+/g, ' ');

// --- Overpass -------------------------------------------------------------
// İlçeyi ADIYLA değil, ilin İÇİNDE arayarak buluyoruz: Türkiye'de aynı adı taşıyan
// ilçeler var (Merkez, Çay, Bala…) ve ad ile sorgulamak yanlış ilçeyi getirir.
const query = (il, ilce) => `[out:json][timeout:${TIMEOUT_S}];
area["name"="${il}"]["admin_level"="4"]->.il;
rel(area.il)["boundary"="administrative"]["admin_level"="6"]["name"="${ilce}"];
map_to_area->.a;
rel(area.a)["boundary"="administrative"]["admin_level"="8"];
out tags;`;

async function overpass(il, ilce) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query(il, ilce)),
  });
  if (res.status === 429 || res.status === 504) {
    throw new Error(`Overpass meşgul (${res.status}) — biraz sonra tekrar deneyin`);
  }
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const j = await res.json();
  return (j.elements ?? []).map((e) => e.tags?.name).filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- il adı: dosya adı plaka, ad gerekli ----------------------------------
// Plakadan il adını türetmiyoruz; yerleşim dosyasının kendisinde il adı yoksa
// `trProvinces` listesinden okunur. Burada küçük bir eşleme yeterli çünkü yalnızca
// kayıtlı dosyalar ölçülüyor.
async function provinceName(plate) {
  const src = await readFile(join(ROOT, 'src', 'trProvinces.ts'), 'utf8');
  // Sayı sınırı şart: `8` deseni `48: 'Muğla'` satırıyla eşleşip yanlış il döndürür.
  const m = src.match(new RegExp(`(?<![0-9])${plate}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`));
  return m ? m[1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.filter((a) => /^\d{1,2}$/.test(a));
  const ilceArg = args.includes('--ilce') ? args[args.indexOf('--ilce') + 1] : null;
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

  const files = (await readdir(SETTLEMENTS)).filter((f) => f.endsWith('.json'));
  const plates = files.map((f) => f.replace('.json', '')).filter((p) => only.length === 0 || only.includes(p));

  if (plates.length === 0) {
    console.error('Ölçülecek il yok. public/data/settlements/ altında dosya var mı?');
    process.exit(1);
  }

  const report = [];
  let grandHave = 0, grandTotal = 0;

  for (const plate of plates) {
    const il = await provinceName(plate);
    if (!il) { console.error(`! ${plate}: il adı bulunamadı, atlanıyor`); continue; }
    const data = JSON.parse(await readFile(join(SETTLEMENTS, `${plate}.json`), 'utf8'));
    const districts = Object.keys(data).filter((d) => !ilceArg || d === ilceArg);

    console.log(`\n=== ${il} (${plate}) — ${districts.length} ilçe ===`);
    for (const ilce of districts) {
      const ours = [...(data[ilce].m ?? []), ...(data[ilce].k ?? [])];
      let osm;
      try {
        osm = await overpass(il, ilce);
      } catch (e) {
        console.log(`  ${ilce.padEnd(18)} HATA: ${e.message}`);
        report.push({ il, plate, ilce, ours: ours.length, osm: null, matched: null, error: String(e.message) });
        await sleep(GAP_MS);
        continue;
      }
      const osmSet = new Set(osm.map(norm));
      const matched = ours.filter((n) => osmSet.has(norm(n)));
      const missing = ours.filter((n) => !osmSet.has(norm(n)));
      const pct = ours.length ? Math.round((matched.length / ours.length) * 100) : 0;
      grandHave += matched.length; grandTotal += ours.length;

      console.log(
        `  ${ilce.padEnd(18)} bizde ${String(ours.length).padStart(4)} · OSM ${String(osm.length).padStart(4)}`
        + ` · eşleşen ${String(matched.length).padStart(4)} · %${String(pct).padStart(3)}`,
      );
      report.push({ il, plate, ilce, ours: ours.length, osm: osm.length, matched: matched.length, pct, missing });
      await sleep(GAP_MS);
    }
  }

  const overall = grandTotal ? Math.round((grandHave / grandTotal) * 100) : 0;
  console.log(`\nTOPLAM: ${grandHave} / ${grandTotal} yerleşimin sınırı var — %${overall}`);
  console.log(
    overall >= 90 ? 'Kapsama yüksek: alan boyama uygulanabilir.'
    : overall >= 60 ? 'Kapsama kısmi: sınırı olmayanlar listede AYRICA belirtilmeli.'
    : 'Kapsama düşük: alan boyama yanıltıcı olur, yalnızca liste gösterilmeli.',
  );

  if (jsonOut) {
    await writeFile(jsonOut, JSON.stringify({ overall, rows: report }, null, 2), 'utf8');
    console.log(`Ayrıntılı rapor: ${jsonOut}`);
  }
}

// Doğrudan çalıştırıldığında ölç; `import` edildiğinde yalnızca yardımcıları ver
// (normalleştirme mantığı böylece ağ olmadan sınanabiliyor).
const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) main().catch((e) => { console.error(e); process.exit(1); });
