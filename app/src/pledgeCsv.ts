// Teslim sözü listesinin CSV'ye çevrilmesi (Faz 3-D).
//
// Bu dosya YALNIZCA biçimlendirme yapar. Hangi satırların dışa aktarılacağına
// sunucu karar verir (`list_delivery_pledges_for_coordinator`), iletişim alanları
// oraya zaten maskeli gelir ve burada maskesiz bir alan ÜRETİLEMEZ — `CoordPledgeRow`
// tipinde maskesiz iletişim bilgisi yok. Dosya, ekranda görünenden fazlasını
// taşımaz (rules/03 §Contact Information).

import type { CoordPledgeRow } from './types';
import { trPledges } from './i18n/coordPledges';
import { tr } from './i18n/strings';

// Excel'in Türkçe yerel ayarında varsayılan ayırıcı noktalı virgül. Virgülle
// yazılan dosya tek sütuna düşüyor; `sep=;` satırı ve BOM bunu çözüyor. Aynı
// dosya LibreOffice ve pandas tarafından da doğru okunuyor.
const AYIRICI = ';';

function hucre(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  // Formül enjeksiyonu: `=`, `+`, `-`, `@` ile başlayan bir hücreyi Excel formül
  // sanar. Takip kodu ve ihtiyaç adı kullanıcıdan gelen metinler olabildiği için
  // baştaki bu karakterler tek tırnakla etkisizleştiriliyor.
  const guvenli = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guvenli.replace(/"/g, '""')}"`;
}

// ISO'ya yakın ama okunur: `2026-08-02 09:46`. Türkçe biçim (`02.08.2026`) Excel'de
// metin olarak sıralanınca ay ve günü karıştırıyor; dışa aktarılan bir dosyanın
// ilk işi sıralanmak oluyor.
// Saat dilimi operasyonun saat dilimi: `Europe/Istanbul`. Sunucu da, ekrandaki
// `etaText` de bunu kullanıyor.
//
// İlk sürüm tarayıcının YEREL saatini kullanıyordu. Türkiye'den bakan biri için
// fark yok, o yüzden ilk üretim koşusunda da görünmedi — ama yurt dışından
// bağlanan bir koordinatörde ekranda "18:00", dosyada "15:00" yazardı. Aynı
// kaydın iki farklı saati, teslim saatini konuşan iki kişi demektir.
const TZ = 'Europe/Istanbul';

function zaman(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // `en-CA` bilerek: `YYYY-MM-DD` üretiyor. Biçim sıralanabilir kalmalı, dil
  // seçimi bir yerelleştirme kararı değil.
  const tarih = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const saat = d.toLocaleTimeString('tr-TR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return `${tarih} ${saat}`;
}

function gecikme(dk: number | null): string {
  if (dk == null || dk <= 0) return '';
  const saat = Math.floor(dk / 60);
  const gun = Math.floor(saat / 24);
  if (gun >= 1) return `${gun} gün`;
  if (saat >= 1) return `${saat} saat`;
  return `${dk} dakika`;
}

const BASLIKLAR = [
  trPledges.colCode, trPledges.colOperation, trPledges.colNeed, trPledges.csv.priority,
  trPledges.csv.qty, trPledges.csv.unit, trPledges.colLocation, trPledges.colEta,
  trPledges.colStatus, trPledges.csv.overdue, trPledges.csv.city,
  trPledges.csv.contactMasked, trPledges.csv.emailMasked, trPledges.csv.phoneMasked,
  trPledges.csv.submissionCode, trPledges.csv.createdAt, trPledges.colUpdated,
];

export function pledgeRowsToCsv(rows: CoordPledgeRow[]): string {
  const satirlar = rows.map((r) => [
    hucre(r.code), hucre(r.disasterName), hucre(r.needName), hucre(r.needPriority),
    hucre(r.qty), hucre(r.unit), hucre(r.locationName), hucre(zaman(r.estimatedAt)),
    // Durum etiketi ekranda kullanılanla AYNI kaynaktan: dosyada "in_transit",
    // ekranda "Yolda" yazsaydı iki ayrı sözlük doğar ve zamanla ayrışırdı.
    hucre(tr.support.statusLabel[r.status] ?? r.status), hucre(gecikme(r.overdueMinutes)), hucre(r.city),
    hucre(r.contactMasked), hucre(r.emailMasked), hucre(r.phoneMasked),
    hucre(r.submissionCode), hucre(zaman(r.createdAt)), hucre(zaman(r.updatedAt)),
  ].join(AYIRICI));

  return [
    `sep=${AYIRICI}`,
    BASLIKLAR.map(hucre).join(AYIRICI),
    ...satirlar,
  ].join('\r\n');
}

// Dosya adı: görünüm + tarih. Aynı gün iki farklı görünüm indirildiğinde
// dosyalar birbirini ezmiyor ve hangisinin ne olduğu adından okunuyor.
export function pledgeCsvFileName(view: string): string {
  // Dosya adındaki gün de operasyonun günü: gece yarısına yakın bir indirmede
  // dosya adı ile içerideki tarihler farklı güne düşmemeli.
  const gun = new Date().toLocaleDateString('en-CA', { timeZone: TZ }).replaceAll('-', '');
  return `teslim-sozleri-${view}-${gun}.csv`;
}

// BOM olmadan Excel dosyayı Windows-1254 sanıp Türkçe karakterleri bozuyor.
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sekme kapanmadan da belleğin bırakılması için: blob URL'leri açıkça
  // iptal edilmezse sayfa ömrü boyunca yaşar.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
