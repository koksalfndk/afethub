import type { Disaster, Location, Need, Submission, LogEntry, Announcement } from '../types';

// Seydikemer Wildfire seed — Turkish content. Canonical priority/status keys are
// English (stable, match DB enums); everything the user sees is Turkish.
// The model is multi-disaster: every need/submission/location/announcement is
// tagged with a disasterId, and disasters are addressed by slug.

export const disaster: Disaster = {
  id: 'd1',
  slug: 'seydikemer-orman-yangini',
  name: 'Seydikemer Orman Yangını',
  region: 'Seydikemer, Muğla · Türkiye',
  status: 'Active',
  situation:
    'Kuzey sırtındaki yangın cepheleri kontrol altında; dört mahalle hâlâ tahliye halinde. Sahada 168 gönüllü kayıtlı. Yardım girişi 08:00–22:00 arası kapalı pazar yerinden yapılıyor, bu akşam ikinci bir giriş noktası açılıyor.',
  openedAt: '21 Temmuz',
  updatedLabel: '4 dakika önce',
  volunteers: 168,
  onShift: 24,
};

// All active disasters (only Seydikemer today; the structure supports more).
export const disasters: Disaster[] = [disaster];

export const verifiedTotalSeed = 437;

export const locations: Location[] = [
  {
    id: 'loc1', disasterId: 'd1', name: 'Seydikemer Kapalı Pazar Yeri', address: 'Atatürk Cd. 14, Seydikemer / Muğla',
    hours: 'Her gün 08:00 – 22:00', accepts: 'Tıbbi, hijyen, giyim, enerji', contact: 'Elif Kaya',
    phone: '+90 555 210 44 18', status: 'Teslim alıyor', statusTone: 'green', coords: '36.6321° K, 29.3187° D',
    lat: 36.6321, lng: 29.3187,
  },
  {
    id: 'loc2', disasterId: 'd1', name: 'Çamlıyayla Okul Spor Salonu', address: 'Çamlıyayla Mah. Okul Sk. 3, Seydikemer',
    hours: 'Her gün 09:00 – 19:00', accepts: 'Ekipman, giyim, pil', contact: 'Hakan Öz',
    phone: '+90 555 884 02 31', status: "20:00'de açılıyor", statusTone: 'yellow', coords: '36.6688° K, 29.2740° D',
    lat: 36.6688, lng: 29.2740,
  },
];

const MP = 'Seydikemer Kapalı Pazar Yeri';
const GYM = 'Çamlıyayla Okul Spor Salonu';

type RawNeed = Omit<Need, 'disasterId' | 'disasterName' | 'disasterSlug'>;
const rawNeeds: RawNeed[] = [
  { id: 'n1', name: 'Maske', cat: 'Sağlık', priority: 'Critical', required: 100, verified: 30, pending: 15, unit: 'kutu', updated: '4 dakika önce', loc: MP },
  { id: 'n2', name: 'Göz Damlası', cat: 'Sağlık', priority: 'Critical', required: 100, verified: 15, pending: 10, unit: 'adet', updated: '11 dakika önce', loc: MP },
  { id: 'n3', name: 'Powerbank', cat: 'Enerji', priority: 'Urgent', required: 50, verified: 12, pending: 6, unit: 'adet', updated: '18 dakika önce', loc: MP },
  { id: 'n4', name: 'Pil', cat: 'Enerji', priority: 'Urgent', required: 200, verified: 65, pending: 20, unit: 'paket', updated: '24 dakika önce', loc: GYM },
  { id: 'n5', name: 'Kafa Lambası', cat: 'Ekipman', priority: 'Urgent', required: 40, verified: 8, pending: 2, unit: 'adet', updated: '32 dakika önce', loc: MP },
  { id: 'n6', name: 'İş Eldiveni', cat: 'Ekipman', priority: 'Normal', required: 100, verified: 40, pending: 8, unit: 'çift', updated: '1 saat önce', loc: GYM },
  { id: 'n7', name: 'Islak Mendil', cat: 'Hijyen', priority: 'Normal', required: 300, verified: 120, pending: 35, unit: 'paket', updated: '1 saat önce', loc: MP },
  { id: 'n8', name: 'İş Pantolonu', cat: 'Giyim', priority: 'Normal', required: 60, verified: 18, pending: 5, unit: 'adet', updated: '2 saat önce', loc: GYM },
  { id: 'n9', name: 'Tişört ve Gömlek', cat: 'Giyim', priority: 'Normal', required: 150, verified: 55, pending: 12, unit: 'adet', updated: '2 saat önce', loc: MP },
];

export const needs: Need[] = rawNeeds.map((n) => ({
  ...n, disasterId: disaster.id, disasterName: disaster.name, disasterSlug: disaster.slug,
}));

export const subs: Submission[] = [
  { id: 's1', code: 'AFT-4821', contributor: 'Ayşe Yılmaz', city: 'Muğla', needId: 'n1', qty: 30, unit: 'kutu', loc: MP, submitted: '12 dakika önce', status: 'Pending verification', verifiedQty: null, note: 'Pazar yerinde giriş kontrolü bekleniyor.' },
  { id: 's2', code: 'AFT-4822', contributor: 'Mert Demir', city: 'Fethiye', needId: 'n4', qty: 25, unit: 'paket', loc: GYM, submitted: '26 dakika önce', status: 'Pending verification', verifiedQty: null, note: "Saat 17:00'de bir minibüsle geliyor." },
  { id: 's3', code: 'AFT-4823', contributor: 'Zeynep Arslan', city: 'İzmir', needId: 'n7', qty: 60, unit: 'paket', loc: MP, submitted: '41 dakika önce', status: 'Pending verification', verifiedQty: null, note: 'İki palet, boşaltma için yardım isteniyor.' },
  { id: 's4', code: 'AFT-4824', contributor: 'Barış Koç', city: 'Denizli', needId: 'n3', qty: 6, unit: 'adet', loc: MP, submitted: '1 saat önce', status: 'Pending verification', verifiedQty: null, note: 'Şarj kabloları dahil.' },
  { id: 's5', code: 'AFT-4818', contributor: 'Selin Aydın', city: 'Antalya', needId: 'n6', qty: 20, unit: 'çift', loc: GYM, submitted: '3 saat önce', status: 'Partially verified', verifiedQty: 18, note: '2 çift yanlış bedendi ve sayıma alınamadı.' },
  { id: 's6', code: 'AFT-4812', contributor: 'Emre Şahin', city: 'Muğla', needId: 'n9', qty: 40, unit: 'adet', loc: MP, submitted: '5 saat önce', status: 'Verified', verifiedQty: 40, note: 'Sayıldı ve C bölümünde depolandı.' },
  { id: 's7', code: 'AFT-4809', contributor: 'Deniz Uysal', city: 'Aydın', needId: 'n5', qty: 12, unit: 'adet', loc: MP, submitted: '6 saat önce', status: 'Rejected', verifiedQty: 0, note: 'Ürünler teslim noktasına ulaşmadı.' },
];

export const log: LogEntry[] = [
  { id: 'l1', user: 'Elif Kaya', action: 'Teslimat doğrulandı', detail: 'Tişört ve Gömlek · AFT-4812 · 40 adet', oldValue: '15 doğrulandı', newValue: '55 doğrulandı', time: '5 saat önce', color: '#159947' },
  { id: 'l2', user: 'Elif Kaya', action: 'Teslimat kısmen doğrulandı', detail: "İş Eldiveni · AFT-4818 · 20 çiftin 18'i", oldValue: '22 doğrulandı', newValue: '40 doğrulandı', time: '3 saat önce', color: '#F97316' },
  { id: 'l3', user: 'Elif Kaya', action: 'Miktar güncellendi', detail: 'Islak Mendil gerekli miktarı artırıldı', oldValue: '250 gerekli', newValue: '300 gerekli', time: '4 saat önce', color: '#102A43' },
  { id: 'l4', user: 'Sistem', action: 'Teslimat bildirildi', detail: 'Maske · AFT-4821 · 30 kutu', oldValue: '—', newValue: 'Doğrulama bekliyor', time: '12 dakika önce', color: '#E6A700' },
  { id: 'l5', user: 'Elif Kaya', action: 'İhtiyaç oluşturuldu', detail: 'Göz Damlası · Kritik', oldValue: '—', newValue: '100 gerekli', time: '8 saat önce', color: '#102A43' },
  { id: 'l6', user: 'Elif Kaya', action: 'Teslimat reddedildi', detail: 'Kafa Lambası · AFT-4809 · 12 adet', oldValue: 'Doğrulama bekliyor', newValue: 'Reddedildi', time: '6 saat önce', color: '#D9363E' },
];

export const announcements: Announcement[] = [
  { id: 'a1', kind: 'Kritik güncelleme', accent: '#D9363E', time: '18 dakika önce', author: 'Elif Kaya', title: 'Bu gece öncelik maske ve göz damlası stoğu', body: "Saat 15:00'teki rüzgâr değişiminden sonra duman seviyesi yükseldi. Lütfen FFP2 maskelere ve serum fizyolojik göz damlalarına öncelik verin; her iki teslim noktası da 22:00'ye kadar giriş masasını açık tutacak." },
  { id: 'a2', kind: 'Lojistik', accent: '#F97316', time: '1 saat önce', author: 'Hakan Öz', title: "İkinci teslim noktası 20:00'de açılıyor", body: 'Çamlıyayla Okul Spor Salonu bu akşam ekipman, giyim ve pil kabul etmeye başlıyor. Ambulans şeridini açık tutmak için araçları doğu kapısından alın.' },
  { id: 'a3', kind: 'Çözüldü', accent: '#159947', time: '4 saat önce', author: 'Elif Kaya', title: 'İçme suyu ihtiyacı tamamen karşılandı', body: 'Teşekkürler — 12.000 litre doğrulandı. Depo tıbbi malzemeler için boş kalsın diye lütfen su göndermeyi durdurun.' },
];
