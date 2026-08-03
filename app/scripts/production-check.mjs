// AfetHUB — üretim sağlık kontrolleri, tek komut.
//
//   npm run production-check
//   DATABASE_URL=postgres://... npm run production-check
//
// Ne yapar: `scripts/health/*.sql` içindeki SALT OKUNUR sorguları sırayla
// çalıştırır, bulgu üretenleri yazar ve bulgu varsa sıfırdan farklı bir kodla
// çıkar. Hiçbir dosya veri değiştirmiyor; betik bunu çalıştırmadan ÖNCE de
// denetliyor (aşağıdaki `FORBIDDEN` taraması) — "salt okunur" iddiası bir yorum
// satırına bırakılmamalı.
//
// psql gerekiyor. Yoksa betik bunu söyler ve ATLAR; sessizce başarılı görünmez.

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'health');

// Bilinen istisnalar: gerçek ama açıklanmış bulgular. Sessizce gizlenmiyor,
// AYRI bir bölümde yazılıyor (direktif §35).
const KNOWN = [
  {
    file: 'orphan.sql',
    match: /SOZ-YWVXSJ/,
    why: 'Faz 1 canlı doğrulama kaydı; temizlik adımında silindi. Denetim kaydı duruyor. rules/06 §Live Verification Records bu yüzden yazıldı.',
  },
];

// Yalnızca GERÇEK ifadeleri arıyor. İlk sürüm `permissions.sql`i yanlışlıkla
// reddetti: dosya `privilege_type in ('TRUNCATE', ...)` yazıyor ve tarama, dizge
// sabitinin içindeki kelimeyi komut sandı. Artık dizge sabitleri de çıkarılıyor.
const FORBIDDEN = /(^|;)\s*(insert\s+into|update\s+|delete\s+from|truncate|drop\s+|alter\s+|create\s+|grant\s+|revoke\s+)/i;

const url = process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('DATABASE_URL tanımlı değil.');
  console.error('Kullanım: DATABASE_URL="postgres://..." npm run production-check');
  process.exit(2);
}
try { execSync('command -v psql', { stdio: 'ignore' }); }
catch {
  console.error('ATLANDI: psql bulunamadı. Kontroller ÇALIŞTIRILMADI.');
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let findings = 0, known = 0, failed = 0;

for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8');
  // Yorumları çıkarıp öyle bakıyoruz: "-- delete from" bir açıklama, komut değil.
  const code = sql
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .replace(/'(?:[^']|'')*'/g, "''");   // dizge sabitlerini boşalt
  if (FORBIDDEN.test(code)) {
    console.error(`HATA  ${f}: salt okunur olmayan ifade içeriyor, çalıştırılmadı.`);
    failed += 1;
    continue;
  }

  let out = '';
  try {
    out = execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off', '-f', join(dir, f)],
      { encoding: 'utf8' });
  } catch (e) {
    console.error(`HATA  ${f}: sorgu çalışmadı.`);
    console.error(String(e.stdout ?? e.message).split('\n').slice(0, 4).join('\n'));
    failed += 1;
    continue;
  }

  // `bulgu` sütunu sıfırdan büyük olan satırlar ilgilendiriyor. audit.sql bir
  // envanter; sayı üretmiyor, olduğu gibi yazılıyor.
  const rows = out.split('\n').filter((l) => /\|/.test(l) && !/^-+\+/.test(l));
  const hits = rows.filter((l) => /\|\s*[1-9]\d*\s*\|/.test(l));
  const excused = hits.filter((l) => KNOWN.some((k) => k.file === f && k.match.test(l)));
  const real = hits.filter((l) => !excused.includes(l));

  if (f === 'audit.sql') {
    console.log(`\n== ${f} (envanter) ==\n${out.trim()}`);
    continue;
  }
  if (real.length === 0 && excused.length === 0) {
    console.log(`ok    ${f}`);
    continue;
  }
  if (real.length > 0) {
    findings += real.length;
    console.error(`\nBULGU ${f}`);
    real.forEach((l) => console.error('      ' + l.trim()));
  }
  if (excused.length > 0) {
    known += excused.length;
    console.log(`\nBİLİNEN İSTİSNA ${f}`);
    excused.forEach((l) => {
      const k = KNOWN.find((x) => x.file === f && x.match.test(l));
      console.log('      ' + l.trim());
      console.log('      → ' + k.why);
    });
  }
}

console.log('');
if (failed > 0) console.error(`${failed} dosya çalıştırılamadı.`);
if (known > 0) console.log(`${known} bilinen istisna (açıklandı, hata sayılmıyor).`);
if (findings > 0) {
  console.error(`=== ${findings} BULGU ===`);
  process.exit(1);
}
if (failed > 0) process.exit(1);
console.log('=== ÜRETİM SAĞLIK KONTROLLERİ: TEMİZ ===');
