import type { DisasterType } from '../types';

// Afet türü + kategoriye göre ihtiyaç kalemleri.
//
// Neden kapalı bir liste: kalem adı serbest metinken aynı şey üç kayıtta üç ad
// alıyor ("Maske", "maske", "N95 maske") ve hiçbiri toplanamıyor. Panodaki "en acil
// kalemler" listesi bu adları grupluyor; üç yazım, üç ayrı ihtiyaç demek.
//
// Neden afet türüne göre: bir sel operasyonunda en çok istenen şey kürek ve çizme,
// yangında maske ve göz damlası. Aynı listeyi ikisine de göstermek, koordinatörü her
// seferinde alakasız otuz kalemin içinden aramaya zorlar.
//
// Liste KAPALI DEĞİL: her kategoride "Diğer" var ve seçilince adı elle yazılıyor.
// Sahada listede olmayan bir şey her zaman çıkar; onu engellemek, koordinatörü
// yanlış bir kaleme zorlamak olurdu.
//
// Birim de kalemle birlikte geliyor: "İçme Suyu" litre, "Maske" kutu. Koordinatörün
// her seferinde birim seçmesi hem yavaş hem de yanlış birim seçmeye açık.

export interface NeedPreset {
  name: string;
  unit: string;
  /** Yalnızca bu afet türlerinde önerilir. Boşsa her türde çıkar. */
  types?: DisasterType[];
}

// "Diğer" seçeneğinin değeri. Boş dize değil: boş dize "henüz seçilmedi" demek.
export const OTHER_NEED = '__other__';

const CATALOG: Record<string, NeedPreset[]> = {
  'Sağlık': [
    { name: 'Maske', unit: 'kutu' },
    { name: 'Göz Damlası', unit: 'adet', types: ['Wildfire', 'Storm'] },
    { name: 'Serum Fizyolojik', unit: 'adet' },
    { name: 'İlk Yardım Çantası', unit: 'adet' },
    { name: 'Yara Bandı ve Gazlı Bez', unit: 'paket' },
    { name: 'Ağrı Kesici', unit: 'kutu' },
    { name: 'Antiseptik Solüsyon', unit: 'litre' },
    { name: 'Termometre', unit: 'adet' },
    { name: 'Tekerlekli Sandalye', unit: 'adet', types: ['Earthquake', 'Evacuation'] },
    { name: 'Tetanoz Aşısı Sevkiyatı', unit: 'kutu', types: ['Flood', 'Earthquake'] },
  ],
  'Ekipman': [
    { name: 'İş Eldiveni', unit: 'çift' },
    { name: 'Kafa Lambası', unit: 'adet' },
    { name: 'El Feneri', unit: 'adet' },
    { name: 'Kürek', unit: 'adet', types: ['Flood', 'Earthquake'] },
    { name: 'Su Motoru', unit: 'adet', types: ['Flood'] },
    { name: 'Çadır', unit: 'adet', types: ['Earthquake', 'Evacuation', 'Storm'] },
    { name: 'Branda', unit: 'adet' },
    { name: 'Jeneratör', unit: 'adet' },
    { name: 'Balta ve Testere', unit: 'adet', types: ['Wildfire', 'Storm'] },
    { name: 'Sırt Pompası', unit: 'adet', types: ['Wildfire'] },
    { name: 'Kova', unit: 'adet', types: ['Flood', 'Wildfire'] },
  ],
  'Hijyen': [
    { name: 'Islak Mendil', unit: 'paket' },
    { name: 'Temizlik Malzemesi', unit: 'koli' },
    { name: 'Sabun', unit: 'adet' },
    { name: 'Şampuan', unit: 'adet' },
    { name: 'Diş Fırçası ve Macun', unit: 'set' },
    { name: 'Hijyenik Ped', unit: 'paket' },
    { name: 'Bebek Bezi', unit: 'paket' },
    { name: 'Çöp Poşeti', unit: 'paket' },
    { name: 'Dezenfektan', unit: 'litre' },
  ],
  'Giyim': [
    { name: 'Tişört ve Gömlek', unit: 'adet' },
    { name: 'İş Pantolonu', unit: 'adet' },
    { name: 'Çizme', unit: 'çift', types: ['Flood', 'Storm'] },
    { name: 'Bot', unit: 'çift' },
    { name: 'Mont', unit: 'adet' },
    { name: 'Çorap', unit: 'çift' },
    { name: 'İç Çamaşırı', unit: 'paket' },
    { name: 'Yağmurluk', unit: 'adet', types: ['Flood', 'Storm'] },
    { name: 'Battaniye', unit: 'adet' },
    { name: 'Uyku Tulumu', unit: 'adet', types: ['Earthquake', 'Evacuation'] },
  ],
  'Enerji': [
    { name: 'Powerbank', unit: 'adet' },
    { name: 'Pil', unit: 'paket' },
    { name: 'Şarj Kablosu', unit: 'adet' },
    { name: 'Uzatma Kablosu', unit: 'adet' },
    { name: 'Jeneratör Yakıtı', unit: 'litre' },
    { name: 'Aydınlatma Balonu', unit: 'adet', types: ['Earthquake'] },
  ],
  'Gıda ve Su': [
    { name: 'İçme Suyu', unit: 'litre' },
    { name: 'Kuru Gıda Kolisi', unit: 'koli' },
    { name: 'Konserve', unit: 'adet' },
    { name: 'Bebek Maması', unit: 'kutu' },
    { name: 'Bisküvi ve Kraker', unit: 'koli' },
    { name: 'Termos ve Matara', unit: 'adet' },
    { name: 'Sıcak Yemek Servisi', unit: 'kişi' },
  ],
};

/**
 * Bir afet türü ve kategori için önerilen kalemler.
 *
 * Türe özel olanlar önce, her türde geçerli olanlar sonra: sel operasyonunda listenin
 * başında kürek ve çizme durur. Alfabetik sıralamak, o sırayı kaybetmek olurdu.
 */
export function needPresets(category: string, type: DisasterType | null): NeedPreset[] {
  const all = CATALOG[category] ?? [];
  if (!type) return all.filter((p) => !p.types);
  const specific = all.filter((p) => p.types?.includes(type));
  const general = all.filter((p) => !p.types);
  return [...specific, ...general];
}

/** Kategorinin kapalı bir kalem listesi var mı. Özel kategoriler (Ulaşım, Taşıma,
 *  Evcil Hayvanlar) kendi alanlarını topluyor; onlarda kalem adı sorulmuyor. */
export const hasPresets = (category: string): boolean => (CATALOG[category]?.length ?? 0) > 0;

export const presetUnit = (category: string, name: string): string | null =>
  CATALOG[category]?.find((p) => p.name === name)?.unit ?? null;
