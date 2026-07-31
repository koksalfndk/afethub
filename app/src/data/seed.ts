import type {
  Disaster, Location, Need, Submission, LogEntry, Announcement, Organization, DisasterReport,
  BannerSlide,
} from '../types';

// ---------------------------------------------------------------------------
// DEMO SEED — sample content, not verified operational data.
//
// The disasters below are placed on the real Turkish geography that was burning
// or flooding in July 2026 (Muğla, Antalya, Çanakkale, Kütahya, Balıkesir
// wildfires; Kastamonu flooding) so the product can be reviewed against a
// realistic national picture. Every quantity, delivery point, submission and
// coordinator name is invented. `demo: true` is set on every disaster and the UI
// must surface that visibly (rules/07 §Seed Content, rules/08 §Initial Disaster).
//
// Canonical priority/status/type keys are English (stable, match DB enums);
// everything a person reads is Turkish.
// ---------------------------------------------------------------------------

const COLOR = {
  verified: '#159947',
  partial: '#F97316',
  neutral: '#102A43',
  pending: '#E6A700',
  rejected: '#D9363E',
} as const;

export const disasters: Disaster[] = [
  {
    id: 'd1',
    slug: 'seydikemer-orman-yangini-21-07-2026',
    legacySlugs: ['seydikemer-orman-yangini', 'seydikemer-orman-yangini-2026-07-21'],
    name: 'Seydikemer Orman Yangını',
    region: 'Seydikemer, Muğla · Türkiye',
    districts: ['Seydikemer'],
    settlements: [],
    province: 'Muğla',
    type: 'Wildfire',
    status: 'Active',
    situation:
      'Kuzey sırtındaki yangın cepheleri kontrol altında; dört mahalle hâlâ tahliye halinde. Sahada 168 gönüllü kayıtlı. Yardım girişi 08:00–22:00 arası kapalı pazar yerinden yapılıyor, bu akşam ikinci bir giriş noktası açılıyor.',
    openedAt: '21 Temmuz',
    updatedLabel: '4 dakika önce',
    volunteers: 168,
    onShift: 24,
    openedByOrgId: null,
    demo: true,
  },
  {
    id: 'd2',
    slug: 'kas-orman-yangini-27-07-2026',
    legacySlugs: ['kas-orman-yangini-2026-07-27'],
    name: 'Kaş Orman Yangını',
    region: 'Kaş, Antalya · Türkiye',
    districts: ['Kaş'],
    settlements: [],
    province: 'Antalya',
    type: 'Wildfire',
    status: 'Active',
    situation:
      'Ova ve Çukurbağ yönündeki iki cephede havadan müdahale sürüyor. Sahil yolu trafiğe açık, iç yollar kapalı. Yardım kabulü kültür merkezinden yapılıyor.',
    openedAt: '27 Temmuz',
    updatedLabel: '11 dakika önce',
    volunteers: 96,
    onShift: 18,
    openedByOrgId: null,
    demo: true,
  },
  {
    id: 'd3',
    slug: 'ayvacik-orman-yangini-28-07-2026',
    legacySlugs: ['ayvacik-orman-yangini-2026-07-28'],
    name: 'Ayvacık Orman Yangını',
    region: 'Ayvacık, Çanakkale · Türkiye',
    districts: ['Ayvacık'],
    settlements: [],
    province: 'Çanakkale',
    type: 'Wildfire',
    status: 'Active',
    situation:
      'Rüzgâr yön değiştirdikten sonra duman yerleşim yerlerine indi. Solunum ve göz şikâyetleri arttı; öncelik tıbbi malzeme.',
    openedAt: '28 Temmuz',
    updatedLabel: '26 dakika önce',
    volunteers: 74,
    onShift: 12,
    openedByOrgId: null,
    demo: true,
  },
  {
    id: 'd4',
    slug: 'tavsanli-orman-yangini-29-07-2026',
    legacySlugs: ['tavsanli-orman-yangini-2026-07-29'],
    name: 'Tavşanlı Orman Yangını',
    region: 'Tavşanlı, Kütahya · Türkiye',
    districts: ['Tavşanlı'],
    settlements: [],
    province: 'Kütahya',
    type: 'Wildfire',
    status: 'Active',
    situation:
      'Operasyon yeni açıldı. İhtiyaç listesi saha ekibinin ilk raporuna göre güncelleniyor; teslim noktası bu akşam kuruluyor.',
    openedAt: '29 Temmuz',
    updatedLabel: '3 dakika önce',
    volunteers: 52,
    onShift: 16,
    openedByOrgId: null,
    demo: true,
  },
  {
    id: 'd5',
    slug: 'kastamonu-sel-taskini-25-07-2026',
    legacySlugs: ['kastamonu-sel-taskini-2026-07-25'],
    name: 'Kastamonu Sel ve Taşkını',
    region: 'Bozkurt ve İnebolu, Kastamonu · Türkiye',
    districts: ['Bozkurt', 'İnebolu'],
    settlements: [],
    province: 'Kastamonu',
    type: 'Flood',
    status: 'Active',
    situation:
      'Dere yataklarındaki su çekildi, temizlik ve kurutma aşamasına geçildi. Elektrik dört mahallede kesik. Öncelik içme suyu, kuru gıda ve temizlik malzemesi.',
    openedAt: '25 Temmuz',
    updatedLabel: '48 dakika önce',
    volunteers: 143,
    onShift: 21,
    openedByOrgId: null,
    demo: true,
  },
  {
    id: 'd6',
    slug: 'balikesir-orman-yangini-05-07-2026',
    legacySlugs: ['balikesir-orman-yangini-2026-07-05'],
    name: 'Balıkesir Orman Yangını',
    region: 'Kepsut, Balıkesir · Türkiye',
    districts: ['Kepsut'],
    settlements: [],
    province: 'Balıkesir',
    type: 'Wildfire',
    status: 'Resolved',
    situation:
      'Yangın söndürüldü ve operasyon kapatıldı. Kalan malzeme yakın operasyonlara aktarıldı; kayıtlar denetim için saklanıyor.',
    openedAt: '5 Temmuz',
    updatedLabel: '2 gün önce',
    volunteers: 88,
    onShift: 0,
    openedByOrgId: null,
    demo: true,
  },
];

// The disaster the app opens on when no slug is given.
export const disaster: Disaster = disasters[0];

// Verified delivery count per disaster (demo figures).
export const verifiedTotals: Record<string, number> = {
  d1: 437, d2: 186, d3: 121, d4: 64, d5: 512, d6: 298,
};

export const locations: Location[] = [
  {
    id: 'loc1', disasterId: 'd1', name: 'Seydikemer Kapalı Pazar Yeri', address: 'Atatürk Cd. 14, Seydikemer / Muğla',
    hours: 'Her gün 08:00 – 22:00', accepts: 'Tıbbi, hijyen, giyim, enerji', contact: 'Elif Kaya',
    phone: '+90 555 210 44 18', status: 'Teslim alıyor', statusTone: 'green', coords: '36.6321° K, 29.3187° D',
    lat: 36.6321, lng: 29.3187,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc2', disasterId: 'd1', name: 'Çamlıyayla Okul Spor Salonu', address: 'Çamlıyayla Mah. Okul Sk. 3, Seydikemer',
    hours: 'Her gün 09:00 – 19:00', accepts: 'Ekipman, giyim, pil', contact: 'Hakan Öz',
    phone: '+90 555 884 02 31', status: "20:00'de açılıyor", statusTone: 'yellow', coords: '36.6688° K, 29.2740° D',
    lat: 36.6688, lng: 29.2740,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc3', disasterId: 'd2', name: 'Kaş Kültür Merkezi', address: 'Andifli Mah., Kaş / Antalya',
    hours: 'Her gün 08:00 – 21:00', accepts: 'Tıbbi, su, ekipman', contact: 'Deniz Aksoy',
    phone: '+90 555 431 09 77', status: 'Teslim alıyor', statusTone: 'green', coords: '36.2020° K, 29.6414° D',
    lat: 36.2020, lng: 29.6414,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc4', disasterId: 'd2', name: 'Ova Mahallesi Muhtarlık Deposu', address: 'Ova Mah. Muhtarlık binası, Kaş',
    hours: 'Her gün 10:00 – 18:00', accepts: 'Giyim, battaniye', contact: 'Seda Yalçın',
    phone: '+90 555 662 71 40', status: "18:00'de kapanıyor", statusTone: 'yellow', coords: '36.2472° K, 29.5901° D',
    lat: 36.2472, lng: 29.5901,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc5', disasterId: 'd3', name: 'Ayvacık İlçe Spor Salonu', address: 'Cumhuriyet Cd. 8, Ayvacık / Çanakkale',
    hours: 'Her gün 09:00 – 20:00', accepts: 'Tıbbi, hijyen, ekipman', contact: 'Burak Şen',
    phone: '+90 555 118 26 03', status: 'Teslim alıyor', statusTone: 'green', coords: '39.6006° K, 26.4048° D',
    lat: 39.6006, lng: 26.4048,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc6', disasterId: 'd4', name: 'Tavşanlı Kapalı Spor Salonu', address: 'Yeni Mah. Stadyum Cd., Tavşanlı / Kütahya',
    hours: 'Her gün 10:00 – 20:00', accepts: 'Tıbbi, su, enerji', contact: 'Gökhan Er',
    phone: '+90 555 907 55 12', status: "Bu akşam 20:00'de açılıyor", statusTone: 'yellow', coords: '39.5450° K, 29.4930° D',
    lat: 39.5450, lng: 29.4930,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc7', disasterId: 'd5', name: 'Bozkurt Toplama Merkezi', address: 'Cumhuriyet Mah. Belediye yanı, Bozkurt / Kastamonu',
    hours: 'Her gün 07:00 – 22:00', accepts: 'Gıda, su, temizlik, giyim', contact: 'Aylin Doğan',
    phone: '+90 555 340 18 92', status: 'Teslim alıyor', statusTone: 'green', coords: '41.9563° K, 34.0125° D',
    lat: 41.9563, lng: 34.0125,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc8', disasterId: 'd5', name: 'İnebolu Halk Eğitim Merkezi', address: 'Sarayköy Mah., İnebolu / Kastamonu',
    hours: 'Her gün 08:00 – 20:00', accepts: 'Gıda, su, yatak', contact: 'Murat Kılıç',
    phone: '+90 555 209 63 84', status: 'Teslim alıyor', statusTone: 'green', coords: '41.9769° K, 33.7625° D',
    lat: 41.9769, lng: 33.7625,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
  {
    id: 'loc9', disasterId: 'd6', name: 'Kepsut Belediyesi Deposu', address: 'Merkez, Kepsut / Balıkesir',
    hours: 'Kapalı', accepts: '—', contact: 'Nihal Aydın',
    phone: '+90 555 771 30 26', status: 'Operasyon kapandı', statusTone: 'yellow', coords: '39.6867° K, 28.1531° D',
    lat: 39.6867, lng: 28.1531,
    // Doluluk hiç ölçülmedi: örnek kayıt gerçek bir ölçüm taklit etmez.
    capacityPct: null, capacityNote: '', capacityUpdated: '',
  },
];

// [id, disasterId, name, category, priority, required, verified, pending, unit, updated, locationName]
type RawNeed = [string, string, string, string, Need['priority'], number, number, number, string, string, string];

const rawNeeds: RawNeed[] = [
  // d1 — Seydikemer
  ['n1', 'd1', 'Maske', 'Sağlık', 'Critical', 100, 30, 15, 'kutu', '4 dakika önce', 'Seydikemer Kapalı Pazar Yeri'],
  ['n2', 'd1', 'Göz Damlası', 'Sağlık', 'Critical', 100, 15, 10, 'adet', '11 dakika önce', 'Seydikemer Kapalı Pazar Yeri'],
  ['n3', 'd1', 'Powerbank', 'Enerji', 'Urgent', 50, 12, 6, 'adet', '18 dakika önce', 'Seydikemer Kapalı Pazar Yeri'],
  ['n4', 'd1', 'Pil', 'Enerji', 'Urgent', 200, 65, 20, 'paket', '24 dakika önce', 'Çamlıyayla Okul Spor Salonu'],
  ['n5', 'd1', 'Kafa Lambası', 'Ekipman', 'Urgent', 40, 8, 2, 'adet', '32 dakika önce', 'Seydikemer Kapalı Pazar Yeri'],
  ['n6', 'd1', 'İş Eldiveni', 'Ekipman', 'Normal', 100, 40, 8, 'çift', '1 saat önce', 'Çamlıyayla Okul Spor Salonu'],
  ['n7', 'd1', 'Islak Mendil', 'Hijyen', 'Normal', 300, 120, 35, 'paket', '1 saat önce', 'Seydikemer Kapalı Pazar Yeri'],
  ['n8', 'd1', 'İş Pantolonu', 'Giyim', 'Normal', 60, 18, 5, 'adet', '2 saat önce', 'Çamlıyayla Okul Spor Salonu'],
  ['n9', 'd1', 'Tişört ve Gömlek', 'Giyim', 'Normal', 150, 55, 12, 'adet', '2 saat önce', 'Seydikemer Kapalı Pazar Yeri'],
  // d2 — Kaş
  ['n10', 'd2', 'Maske', 'Sağlık', 'Critical', 150, 40, 20, 'kutu', '11 dakika önce', 'Kaş Kültür Merkezi'],
  ['n11', 'd2', 'İçme Suyu', 'Gıda ve Su', 'Critical', 5000, 1800, 600, 'litre', '19 dakika önce', 'Kaş Kültür Merkezi'],
  ['n12', 'd2', 'İş Eldiveni', 'Ekipman', 'Urgent', 120, 35, 10, 'çift', '35 dakika önce', 'Kaş Kültür Merkezi'],
  ['n13', 'd2', 'Powerbank', 'Enerji', 'Urgent', 60, 14, 8, 'adet', '52 dakika önce', 'Kaş Kültür Merkezi'],
  ['n14', 'd2', 'Battaniye', 'Barınma', 'Normal', 200, 70, 25, 'adet', '2 saat önce', 'Ova Mahallesi Muhtarlık Deposu'],
  // d3 — Ayvacık
  ['n15', 'd3', 'Göz Damlası', 'Sağlık', 'Critical', 200, 45, 25, 'adet', '26 dakika önce', 'Ayvacık İlçe Spor Salonu'],
  ['n16', 'd3', 'Serum Fizyolojik', 'Sağlık', 'Critical', 300, 90, 40, 'adet', '41 dakika önce', 'Ayvacık İlçe Spor Salonu'],
  ['n17', 'd3', 'Kafa Lambası', 'Ekipman', 'Urgent', 80, 18, 6, 'adet', '1 saat önce', 'Ayvacık İlçe Spor Salonu'],
  ['n18', 'd3', 'Islak Mendil', 'Hijyen', 'Normal', 400, 150, 60, 'paket', '3 saat önce', 'Ayvacık İlçe Spor Salonu'],
  // d4 — Tavşanlı
  ['n19', 'd4', 'Maske', 'Sağlık', 'Critical', 200, 25, 30, 'kutu', '3 dakika önce', 'Tavşanlı Kapalı Spor Salonu'],
  ['n20', 'd4', 'İçme Suyu', 'Gıda ve Su', 'Critical', 8000, 1200, 900, 'litre', '14 dakika önce', 'Tavşanlı Kapalı Spor Salonu'],
  ['n21', 'd4', 'Pil', 'Enerji', 'Urgent', 300, 60, 40, 'paket', '38 dakika önce', 'Tavşanlı Kapalı Spor Salonu'],
  ['n22', 'd4', 'İş Pantolonu', 'Giyim', 'Normal', 90, 20, 8, 'adet', '2 saat önce', 'Tavşanlı Kapalı Spor Salonu'],
  // d5 — Kastamonu
  ['n23', 'd5', 'Kuru Gıda Kolisi', 'Gıda ve Su', 'Critical', 800, 260, 120, 'koli', '48 dakika önce', 'Bozkurt Toplama Merkezi'],
  ['n24', 'd5', 'İçme Suyu', 'Gıda ve Su', 'Critical', 12000, 4200, 1500, 'litre', '52 dakika önce', 'Bozkurt Toplama Merkezi'],
  ['n25', 'd5', 'Temizlik Malzemesi', 'Hijyen', 'Urgent', 500, 140, 60, 'koli', '1 saat önce', 'Bozkurt Toplama Merkezi'],
  ['n26', 'd5', 'Su Motoru', 'Ekipman', 'Urgent', 40, 9, 4, 'adet', '2 saat önce', 'İnebolu Halk Eğitim Merkezi'],
  ['n27', 'd5', 'Yatak ve Battaniye', 'Barınma', 'Normal', 300, 110, 45, 'adet', '3 saat önce', 'İnebolu Halk Eğitim Merkezi'],
  ['n28', 'd5', 'Çizme', 'Giyim', 'Normal', 250, 80, 30, 'çift', '4 saat önce', 'Bozkurt Toplama Merkezi'],
  // d6 — Balıkesir (kapandı)
  ['n29', 'd6', 'Maske', 'Sağlık', 'Completed', 120, 120, 0, 'kutu', '2 gün önce', 'Kepsut Belediyesi Deposu'],
  ['n30', 'd6', 'İçme Suyu', 'Gıda ve Su', 'Completed', 6000, 6000, 0, 'litre', '2 gün önce', 'Kepsut Belediyesi Deposu'],
];

const byId = new Map(disasters.map((d) => [d.id, d] as const));

export const needs: Need[] = rawNeeds.map(([id, dId, name, cat, priority, required, verified, pending, unit, updated, loc]) => {
  const d = byId.get(dId)!;
  return {
    id, disasterId: dId, disasterName: d.name, disasterSlug: d.slug,
    name, cat, priority, required, verified, pending, unit, updated, loc,
  };
});

// [id, code, contributor, city, needId, qty, unit, loc, submitted, status, verifiedQty, note]
type RawSub = [string, string, string, string, string, number, string, string, string, Submission['status'], number | null, string];

const rawSubs: RawSub[] = [
  ['s1', 'AFT-4821', 'Ayşe Yılmaz', 'Muğla', 'n1', 30, 'kutu', 'Seydikemer Kapalı Pazar Yeri', '12 dakika önce', 'Pending verification', null, 'Pazar yerinde giriş kontrolü bekleniyor.'],
  ['s2', 'AFT-4822', 'Mert Demir', 'Fethiye', 'n4', 25, 'paket', 'Çamlıyayla Okul Spor Salonu', '26 dakika önce', 'Pending verification', null, "Saat 17:00'de bir minibüsle geliyor."],
  ['s3', 'AFT-4823', 'Zeynep Arslan', 'İzmir', 'n7', 60, 'paket', 'Seydikemer Kapalı Pazar Yeri', '41 dakika önce', 'Pending verification', null, 'İki palet, boşaltma için yardım isteniyor.'],
  ['s4', 'AFT-4824', 'Barış Koç', 'Denizli', 'n3', 6, 'adet', 'Seydikemer Kapalı Pazar Yeri', '1 saat önce', 'Pending verification', null, 'Şarj kabloları dahil.'],
  ['s5', 'AFT-4818', 'Selin Aydın', 'Antalya', 'n6', 20, 'çift', 'Çamlıyayla Okul Spor Salonu', '3 saat önce', 'Partially verified', 18, '2 çift yanlış bedendi ve sayıma alınamadı.'],
  ['s6', 'AFT-4812', 'Emre Şahin', 'Muğla', 'n9', 40, 'adet', 'Seydikemer Kapalı Pazar Yeri', '5 saat önce', 'Verified', 40, 'Sayıldı ve C bölümünde depolandı.'],
  ['s7', 'AFT-4809', 'Deniz Uysal', 'Aydın', 'n5', 12, 'adet', 'Seydikemer Kapalı Pazar Yeri', '6 saat önce', 'Rejected', 0, 'Ürünler teslim noktasına ulaşmadı.'],
  ['s8', 'AFT-4901', 'Cem Bulut', 'Antalya', 'n11', 600, 'litre', 'Kaş Kültür Merkezi', '22 dakika önce', 'Pending verification', null, 'Bir kamyonet, 15:30 civarı.'],
  ['s9', 'AFT-4903', 'Hande Ergin', 'Burdur', 'n10', 20, 'kutu', 'Kaş Kültür Merkezi', '1 saat önce', 'Pending verification', null, 'FFP2, kutular kapalı.'],
  ['s10', 'AFT-4897', 'Onur Taş', 'Antalya', 'n12', 35, 'çift', 'Kaş Kültür Merkezi', '4 saat önce', 'Verified', 35, 'Girişte sayıldı.'],
  ['s11', 'AFT-5011', 'Pınar Aksu', 'Çanakkale', 'n15', 25, 'adet', 'Ayvacık İlçe Spor Salonu', '35 dakika önce', 'Pending verification', null, 'Eczaneden bağış, son kullanma tarihleri uzun.'],
  ['s12', 'AFT-5008', 'Kerem Yıldız', 'Balıkesir', 'n16', 40, 'adet', 'Ayvacık İlçe Spor Salonu', '2 saat önce', 'Pending verification', null, 'Kolilerde 500 ml şişeler.'],
  ['s13', 'AFT-5102', 'Sinem Kara', 'Kütahya', 'n19', 30, 'kutu', 'Tavşanlı Kapalı Spor Salonu', '18 dakika önce', 'Pending verification', null, 'Teslim noktası açılınca bırakılacak.'],
  ['s14', 'AFT-5104', 'Ali Poyraz', 'Bursa', 'n20', 900, 'litre', 'Tavşanlı Kapalı Spor Salonu', '1 saat önce', 'Pending verification', null, 'Palet üstünde, forklift gerekiyor.'],
  ['s15', 'AFT-5201', 'Merve Altun', 'Kastamonu', 'n23', 120, 'koli', 'Bozkurt Toplama Merkezi', '55 dakika önce', 'Pending verification', null, 'Yerel market bağışı.'],
  ['s16', 'AFT-5204', 'Tuna Beyaz', 'Sinop', 'n24', 1500, 'litre', 'Bozkurt Toplama Merkezi', '2 saat önce', 'Pending verification', null, 'Tanker, 19:00 civarı.'],
  ['s17', 'AFT-5198', 'Nur Sezer', 'Ankara', 'n25', 60, 'koli', 'Bozkurt Toplama Merkezi', '5 saat önce', 'Partially verified', 52, '8 koli ıslanmış, sayıma alınamadı.'],
];

export const subs: Submission[] = rawSubs.map(([id, code, contributor, city, needId, qty, unit, loc, submitted, status, verifiedQty, note]) => ({
  id, code, contributor, city, needId, qty, unit, loc, submitted, status, verifiedQty, note,
}));

// [id, disasterId, user, action, detail, oldValue, newValue, time, color]
type RawLog = [string, string, string, string, string, string, string, string, string];

const rawLog: RawLog[] = [
  ['l1', 'd1', 'Elif Kaya', 'Teslimat doğrulandı', 'Tişört ve Gömlek · AFT-4812 · 40 adet', '15 doğrulandı', '55 doğrulandı', '5 saat önce', COLOR.verified],
  ['l2', 'd1', 'Elif Kaya', 'Teslimat kısmen doğrulandı', "İş Eldiveni · AFT-4818 · 20 çiftin 18'i", '22 doğrulandı', '40 doğrulandı', '3 saat önce', COLOR.partial],
  ['l3', 'd1', 'Elif Kaya', 'Miktar güncellendi', 'Islak Mendil gerekli miktarı artırıldı', '250 gerekli', '300 gerekli', '4 saat önce', COLOR.neutral],
  ['l4', 'd1', 'Sistem', 'Teslimat bildirildi', 'Maske · AFT-4821 · 30 kutu', '—', 'Doğrulama bekliyor', '12 dakika önce', COLOR.pending],
  ['l5', 'd1', 'Elif Kaya', 'İhtiyaç oluşturuldu', 'Göz Damlası · Kritik', '—', '100 gerekli', '8 saat önce', COLOR.neutral],
  ['l6', 'd1', 'Elif Kaya', 'Teslimat reddedildi', 'Kafa Lambası · AFT-4809 · 12 adet', 'Doğrulama bekliyor', 'Reddedildi', '6 saat önce', COLOR.rejected],
  ['l7', 'd2', 'Deniz Aksoy', 'Teslimat doğrulandı', 'İş Eldiveni · AFT-4897 · 35 çift', '0 doğrulandı', '35 doğrulandı', '4 saat önce', COLOR.verified],
  ['l8', 'd2', 'Sistem', 'Teslimat bildirildi', 'İçme Suyu · AFT-4901 · 600 litre', '—', 'Doğrulama bekliyor', '22 dakika önce', COLOR.pending],
  ['l9', 'd2', 'Deniz Aksoy', 'İhtiyaç oluşturuldu', 'İçme Suyu · Kritik', '—', '5000 litre gerekli', '19 dakika önce', COLOR.neutral],
  ['l10', 'd3', 'Burak Şen', 'İhtiyaç oluşturuldu', 'Serum Fizyolojik · Kritik', '—', '300 adet gerekli', '41 dakika önce', COLOR.neutral],
  ['l11', 'd3', 'Sistem', 'Teslimat bildirildi', 'Göz Damlası · AFT-5011 · 25 adet', '—', 'Doğrulama bekliyor', '35 dakika önce', COLOR.pending],
  ['l12', 'd3', 'Burak Şen', 'Duyuru yayınlandı', 'Duman uyarısı ve maske çağrısı', '—', 'Yayında', '2 saat önce', COLOR.neutral],
  ['l13', 'd4', 'Gökhan Er', 'Operasyon açıldı', 'Tavşanlı Orman Yangını koordinasyonu', '—', 'Aktif', '3 saat önce', COLOR.rejected],
  ['l14', 'd4', 'Sistem', 'Teslimat bildirildi', 'Maske · AFT-5102 · 30 kutu', '—', 'Doğrulama bekliyor', '18 dakika önce', COLOR.pending],
  ['l15', 'd5', 'Aylin Doğan', 'Teslimat kısmen doğrulandı', "Temizlik Malzemesi · AFT-5198 · 60 kolinin 52'si", '88 doğrulandı', '140 doğrulandı', '5 saat önce', COLOR.partial],
  ['l16', 'd5', 'Aylin Doğan', 'Miktar güncellendi', 'İçme Suyu gerekli miktarı artırıldı', '9000 gerekli', '12000 gerekli', '1 saat önce', COLOR.neutral],
  ['l17', 'd5', 'Sistem', 'Teslimat bildirildi', 'Kuru Gıda Kolisi · AFT-5201 · 120 koli', '—', 'Doğrulama bekliyor', '55 dakika önce', COLOR.pending],
  ['l18', 'd5', 'Murat Kılıç', 'Teslim noktası eklendi', 'İnebolu Halk Eğitim Merkezi', '—', 'Teslim alıyor', '6 saat önce', COLOR.neutral],
  ['l19', 'd6', 'Nihal Aydın', 'Operasyon kapatıldı', 'Balıkesir Orman Yangını · tüm ihtiyaçlar karşılandı', 'Aktif', 'Çözüldü', '2 gün önce', COLOR.verified],
];

// Demo names are masked here too, the same way the database masks the real ones — the
// seed must not show a shape the live product cannot produce.
const maskActor = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const c = parts[parts.length - 1].slice(0, 1);
  return `${parts[0]} ${c === 'i' ? 'İ' : c === 'ı' ? 'I' : c.toLocaleUpperCase('tr')}.`;
};

export const log: LogEntry[] = rawLog.map(([id, disasterId, user, action, detail, oldValue, newValue, time, color]) => ({
  id, disasterId, disasterName: byId.get(disasterId)!.name, disasterSlug: byId.get(disasterId)!.slug,
  user: maskActor(user), action, detail, oldValue, newValue, time, color,
}));

export const announcements: Announcement[] = [
  { id: 'a1', disasterId: 'd1', kind: 'Kritik güncelleme', accent: '#D9363E', time: '18 dakika önce', author: 'Elif Kaya', title: 'Bu gece öncelik maske ve göz damlası stoğu', body: "Saat 15:00'teki rüzgâr değişiminden sonra duman seviyesi yükseldi. Lütfen FFP2 maskelere ve serum fizyolojik göz damlalarına öncelik verin; her iki teslim noktası da 22:00'ye kadar giriş masasını açık tutacak.", image: '' },
  { id: 'a2', disasterId: 'd1', kind: 'Lojistik', accent: '#F97316', time: '1 saat önce', author: 'Hakan Öz', title: "İkinci teslim noktası 20:00'de açılıyor", body: 'Çamlıyayla Okul Spor Salonu bu akşam ekipman, giyim ve pil kabul etmeye başlıyor. Ambulans şeridini açık tutmak için araçları doğu kapısından alın.', image: '' },
  { id: 'a3', disasterId: 'd1', kind: 'Çözüldü', accent: '#159947', time: '4 saat önce', author: 'Elif Kaya', title: 'İçme suyu ihtiyacı tamamen karşılandı', body: 'Teşekkürler — 12.000 litre doğrulandı. Depo tıbbi malzemeler için boş kalsın diye lütfen su göndermeyi durdurun.', image: '' },
  { id: 'a4', disasterId: 'd2', kind: 'Lojistik', accent: '#F97316', time: '40 dakika önce', author: 'Deniz Aksoy', title: 'İç yollar kapalı, teslimatı sahil yolundan yapın', body: 'Çukurbağ yönündeki yol müdahale ekiplerine ayrıldı. Kültür merkezine sahil yolundan ulaşın; giriş masası 21:00 civarında kapanıyor.', image: '' },
  { id: 'a5', disasterId: 'd3', kind: 'Kritik güncelleme', accent: '#D9363E', time: '2 saat önce', author: 'Burak Şen', title: 'Duman yerleşim yerine indi: maske ve göz damlası', body: 'Rüzgâr yön değiştirdi. Solunum ve göz şikâyeti artıyor; öncelik FFP2 maske, göz damlası ve serum fizyolojik.', image: '' },
  { id: 'a6', disasterId: 'd5', kind: 'Lojistik', accent: '#F97316', time: '3 saat önce', author: 'Aylin Doğan', title: 'Temizlik ve kurutma aşaması başladı', body: 'Su çekildi. Şu an en çok temizlik malzemesi, su motoru ve çizme gerekiyor. Gıda kolileri Bozkurt merkezine, yatak-battaniye İnebolu’ya bırakılmalı.', image: '' },
];

// ---------------------------------------------------------------------------
// Organizations directory — demo entries.
//
// Public bodies are listed with their published, publicly available contact
// routes only. AfetHUB claims no affiliation with any of them and invents no
// emergency numbers (rules/03 §Legal and Safety Disclaimer, rules/07). The
// association/volunteer rows below are sample content: their contact details are
// placeholders and they are deliberately left "Doğrulama bekliyor" so the
// verification state is visible in the UI.
// ---------------------------------------------------------------------------
// Default banner slides. Editorial content, editable from the panel; these are the
// values the app ships with so the slider is never empty on a fresh database.
export const bannerSlides: BannerSlide[] = [
  {
    id: 'slide1', title: 'Bir olay gördüyseniz bildirin',
    body: 'Yangın, sel, deprem veya şiddetli hava olayını hesap açmadan bildirin. Aynı olaya ait bildirimler birleştirilir ve koordinatör incelemesine tek kayıt olarak düşer.',
    ctaLabel: 'Afet Bildir', action: 'reportDisaster',
    image: '/banners/wildfire.webp', tint: '#D9363E', active: true, sortOrder: 1,
  },
  {
    id: 'slide2', title: 'Sayılar nasıl doğrulanıyor',
    body: 'Kalan miktar yalnızca koordinatörün teslim aldığını onayladığı kadar düşer. Bekleyen bildirimler bilgi amaçlıdır ve hiçbir sayıyı değiştirmez.',
    ctaLabel: 'Doğrulama Nasıl İşler', action: 'howItWorks',
    image: '/banners/coordination.webp', tint: '#159947', active: true, sortOrder: 2,
  },
  {
    id: 'slide3', title: 'Kurumlar ve gönüllü grupları',
    body: 'Afetlerde çalışan kamu kurumlarının, belediyelerin, derneklerin ve gönüllü gruplarının iletişim bilgilerini tek listede bulun; eksik bir kurumu siz de ekleyin.',
    ctaLabel: 'Kurumlar', action: 'orgs',
    image: '/banners/volunteers.webp', tint: '#2A6FB0', active: true, sortOrder: 3,
  },
];

export const organizations: Organization[] = [
  {
    id: 'org1', name: 'AFAD — Afet ve Acil Durum Yönetimi Başkanlığı', kind: 'Kamu kurumu', scope: 'Ulusal',
    province: '', district: '', services: ['Afet koordinasyonu', 'Arama kurtarma', 'Barınma', 'Acil yardım', 'Hasar tespiti'],
    description: 'Afet ve acil durumlarda ulusal düzeyde koordinasyonu yürüten kamu kurumu. İl afet ve acil durum müdürlükleri (İl AFAD) üzerinden sahada çalışır. Acil çağrı için 112 kullanılır.',
    website: 'https://www.afad.gov.tr', email: '', phone: '122', emergencyPhone: '112',
    address: 'Ankara', status: 'Verified', isOfficial: true, logo: '/logos/afad.webp', verifiedAt: '2026-07-21', createdLabel: '9 gün önce',
  },
  {
    id: 'org2', name: 'Türk Kızılay', kind: 'Dernek', scope: 'Ulusal',
    province: '', district: '', services: ['Beslenme', 'Barınma', 'Kan tedariki', 'Psikososyal destek', 'Lojistik'],
    description: 'Afetlerde beslenme, barınma, kan tedariki ve psikososyal destek alanlarında çalışan ulusal yardım kuruluşu. Kan bağışı ve yardım hattı için 168 kullanılır.',
    website: 'https://www.kizilay.org.tr', email: '', phone: '168', emergencyPhone: '',
    address: 'Ankara', status: 'Verified', isOfficial: true, logo: '/logos/kizilay.webp', verifiedAt: '2026-07-21', createdLabel: '9 gün önce',
  },
  {
    id: 'org3', name: 'UMKE — Ulusal Medikal Kurtarma Ekipleri', kind: 'Kamu kurumu', scope: 'Ulusal',
    province: '', district: '', services: ['Afet bölgesinde sağlık', 'Medikal kurtarma', 'Triyaj', 'Saha hastanesi'],
    description: 'Sağlık Bakanlığı bünyesinde, afet ve acil durumlarda sahada medikal kurtarma ve sağlık hizmeti veren ekipler. Acil sağlık çağrısı 112 üzerinden yapılır.',
    website: 'https://www.saglik.gov.tr', email: '', phone: '', emergencyPhone: '112',
    address: 'Ankara', status: 'Verified', isOfficial: true, logo: '/logos/umke.webp', verifiedAt: '2026-07-21', createdLabel: '9 gün önce',
  },
  {
    id: 'org4', name: 'Orman Genel Müdürlüğü', kind: 'Kamu kurumu', scope: 'Ulusal',
    province: '', district: '', services: ['Orman yangınıyla mücadele', 'Yangın ihbarı', 'Havadan müdahale'],
    description: 'Orman yangınlarının önlenmesi ve söndürülmesinden sorumlu kamu kurumu. Yangın ihbarı için 177 aranır.',
    website: 'https://www.ogm.gov.tr', email: '', phone: '177', emergencyPhone: '177',
    address: 'Ankara', status: 'Verified', isOfficial: true, logo: '/logos/ogm.webp', verifiedAt: '2026-07-21', createdLabel: '9 gün önce',
  },
  {
    id: 'org5', name: 'AKOM — İstanbul Afet Koordinasyon Merkezi', kind: 'Belediye', scope: 'İl',
    province: 'İstanbul', district: '', services: ['Afet koordinasyonu', 'Hava durumu uyarısı', 'Lojistik', 'Tahliye desteği'],
    description: 'İstanbul Büyükşehir Belediyesi bünyesinde ilin afet ve olağanüstü durum koordinasyonunu yürüten merkez. Belediye çağrı merkezi 153 üzerinden erişilir.',
    website: 'https://akom.ibb.gov.tr', email: '', phone: '153', emergencyPhone: '',
    address: 'İstanbul', status: 'Verified', isOfficial: true, logo: '/logos/akom.webp', verifiedAt: '2026-07-22', createdLabel: '8 gün önce',
  },
  {
    id: 'org6', name: 'AKUT Arama Kurtarma Derneği', kind: 'Dernek', scope: 'Ulusal',
    province: '', district: '', services: ['Arama kurtarma', 'Dağ kurtarma', 'Eğitim', 'Gönüllü koordinasyonu'],
    description: 'Gönüllülerden oluşan arama kurtarma derneği. Deprem, çığ, kayıp kişi ve dağ kazalarında sahada görev alır; kurtarma eğitimleri düzenler.',
    website: 'https://www.akut.org.tr', email: '', phone: '', emergencyPhone: '',
    address: 'İstanbul', status: 'Verified', isOfficial: false, logo: '/logos/akut.webp', verifiedAt: '2026-07-22', createdLabel: '8 gün önce',
  },
  {
    id: 'org7', name: 'TEMA Vakfı', kind: 'Vakıf', scope: 'Ulusal',
    province: '', district: '', services: ['Yangın sonrası ağaçlandırma', 'Erozyonla mücadele', 'Toprak ve su', 'Gönüllü eğitimi'],
    description: 'Türkiye Erozyonla Mücadele, Ağaçlandırma ve Doğal Varlıkları Koruma Vakfı. Yangın sonrası rehabilitasyon, ağaçlandırma ve erozyon çalışmalarında gönüllü koordinasyonu yapar.',
    website: 'https://www.tema.org.tr', email: '', phone: '', emergencyPhone: '',
    address: 'İstanbul', status: 'Verified', isOfficial: false, logo: '/logos/tema.webp', verifiedAt: '2026-07-23', createdLabel: '7 gün önce',
  },
  {
    id: 'org8', name: 'Muğla Büyükşehir Belediyesi Afet Koordinasyon Merkezi', kind: 'Belediye', scope: 'İl',
    province: 'Muğla', district: '', services: ['Lojistik', 'Su tedariki', 'Tahliye desteği'],
    description: 'Demo kayıt: il düzeyinde yardım kabulü ve lojistik koordinasyonu.',
    website: '', email: 'demo-afet@ornek.gov.tr', phone: '+90 252 000 00 00', emergencyPhone: '',
    address: 'Menteşe, Muğla', status: 'Verified', isOfficial: true, logo: '', verifiedAt: '2026-07-23', createdLabel: '7 gün önce',
  },
  {
    id: 'org9', name: 'Seydikemer Gönüllü İtfaiye Destek Grubu', kind: 'Gönüllü grubu', scope: 'İlçe',
    province: 'Muğla', district: 'Seydikemer', services: ['Söndürme desteği', 'Su ikmali', 'Lojistik'],
    description: 'Demo kayıt: ilçedeki gönüllü söndürme ve su ikmal desteği.',
    website: '', email: 'demo-gonullu@ornek.org', phone: '+90 555 000 00 01', emergencyPhone: '',
    address: 'Seydikemer, Muğla', status: 'Pending verification', isOfficial: false, logo: '', verifiedAt: null, createdLabel: '2 saat önce',
  },
  {
    id: 'org10', name: 'Kastamonu Yardımlaşma Vakfı', kind: 'Vakıf', scope: 'İl',
    province: 'Kastamonu', district: '', services: ['Gıda', 'Barınma', 'Temizlik malzemesi'],
    description: 'Demo kayıt: sel bölgesinde gıda ve temizlik malzemesi dağıtımı.',
    website: '', email: 'demo-vakif@ornek.org', phone: '+90 366 000 00 02', emergencyPhone: '',
    address: 'Merkez, Kastamonu', status: 'Pending verification', isOfficial: false, logo: '', verifiedAt: null, createdLabel: '5 saat önce',
  },
  {
    id: 'org11', name: 'Çanakkale Veteriner Hekimler Odası', kind: 'Meslek odası', scope: 'İl',
    province: 'Çanakkale', district: '', services: ['Hayvan sağlığı', 'Barınak desteği'],
    description: 'Demo kayıt: yangın bölgesinde hayvan sağlığı desteği.',
    website: '', email: 'demo-oda@ornek.org', phone: '+90 286 000 00 03', emergencyPhone: '',
    address: 'Merkez, Çanakkale', status: 'Pending verification', isOfficial: false, logo: '', verifiedAt: null, createdLabel: '1 gün önce',
  },
];

// Citizen reports awaiting coordinator review. `reportCount` is how many people
// reported the same event after de-duplication — the dashboard shows it as
// "n kişi bildirdi", which is a claim count, never a verified fact.
export const reports: DisasterReport[] = [
  {
    id: 'rep1', type: 'Wildfire', province: 'İzmir', district: 'Karaburun',
    locationNote: 'Sarpıncık yolu, kıyı sırtı', occurredOn: '2026-07-30',
    description: 'Sırtta duman görülüyor, rüzgâr kuzeyden. Henüz ekip gelmedi.',
    reportCount: 7, status: 'Pending verification', disasterSlug: null,
    createdLabel: '38 dakika önce', lastReportLabel: '6 dakika önce',
  },
  {
    id: 'rep2', type: 'Flood', province: 'Rize', district: 'Ardeşen',
    locationNote: 'Dere kenarı, alt mahalle', occurredOn: '2026-07-29',
    description: 'Sağanak sonrası dere taştı, iki sokak su altında.',
    reportCount: 3, status: 'Pending verification', disasterSlug: null,
    createdLabel: '5 saat önce', lastReportLabel: '2 saat önce',
  },
  {
    id: 'rep3', type: 'Storm', province: 'Ankara', district: 'Çankaya',
    locationNote: 'Ayrancı, ağaç devrilmesi', occurredOn: '2026-07-29',
    description: 'Fırtınada ağaçlar devrildi, bir sokak kapandı.',
    reportCount: 2, status: 'Pending verification', disasterSlug: null,
    createdLabel: '1 gün önce', lastReportLabel: '20 saat önce',
  },
];
