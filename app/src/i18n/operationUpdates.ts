// AfetHUB — Saha Güncellemeleri ekranının metinleri (Faz 4-A)
//
// Neden `strings.ts` içinde DEĞİL: o dosya herkese açık ilk pakette. Bu ekran
// kendi rotasında ve tembel iniyor; metinleri de onunla birlikte inmeli
// (Faz 3-C'de `coordPledges.ts` aynı gerekçeyle ayrılmıştı, rules/09 §8).

import type { OperationUpdateType, UpdateReportReason } from '../types';

export const trUpdates = {
  title: 'Saha Güncellemeleri',
  lead: 'Koordinasyon ekibinin, kurumların ve sahadaki kişilerin bu operasyonla ilgili paylaştığı bilgiler.',
  // Modülün ne OLMADIĞINI da söylüyor: bir sohbet alanı değil.
  note: 'Bu akış bir sohbet alanı değildir. Acil bir ihbar, ihtiyaç veya teslimat bildirimi için ilgili formu kullanın.',
  emergency: 'AfetHUB bir sivil koordinasyon platformudur. Acil ve hayati tehlike durumlarında resmi acil yardım birimleriyle iletişime geçin.',

  pinnedTitle: 'Sabit uyarılar',
  pinnedBadge: 'Sabitlendi',
  correctedBadge: 'Düzeltildi',
  correctedNote: 'Bu bilgi koordinasyon ekibi tarafından düzeltildi.',
  verifiedBadge: 'Koordinatör doğruladı',
  unverifiedBadge: 'Doğrulama bekleniyor',
  photoCount: (n: number) => (n === 1 ? '1 fotoğraf' : `${n} fotoğraf`),
  photosLoading: 'Fotoğraflar açılıyor…',
  // Yerel modda imzalanacak kova yok; canlıda ise bağlantı üretilememiş olabilir.
  // Kırık çerçeve göstermek yerine durumu söylüyoruz.
  photosUnavailable: 'Fotoğraflar şu anda görüntülenemiyor.',
  photoAlt: 'Saha fotoğrafı',
  relatedNeed: 'İlgili ihtiyaç',
  relatedLocation: 'Teslim noktası',
  area: 'Yaklaşık bölge',

  // ---- Canlı akış -----------------------------------------------------------
  // Yeni kayıt akışa KENDİLİĞİNDEN girmiyor; kullanıcı isterse gösteriliyor.
  // Okuma sırasında listenin üstten kayması, sahada tek eliyle telefon tutan
  // birine yapılacak şey değil (rules/01 §Emergency First).
  rtLive: 'Canlı',
  rtConnecting: 'Bağlanıyor…',
  rtOffline: 'Canlı bağlantı koptu — akış güncel olmayabilir.',
  rtNew: (n: number) => (n === 1 ? '1 yeni güncelleme' : `${n} yeni güncelleme`),
  rtShow: 'Göster',

  filters: 'Süzgeç',
  filterAll: 'Tümü',
  more: 'Daha Fazla Göster',
  loadingMore: 'Yükleniyor…',
  end: 'Akışın sonuna gelindi.',

  empty: 'Bu operasyon için henüz yayımlanmış saha güncellemesi bulunmuyor.',
  emptyFiltered: 'Bu süzgeçle eşleşen yayımlanmış saha güncellemesi bulunmuyor.',
  loadFailed: 'Saha güncellemeleri yüklenemedi. Tekrar deneyin.',
  retry: 'Tekrar dene',

  // ---- Gönderim ------------------------------------------------------------
  submit: 'Saha Güncellemesi Gönder',
  formTitle: 'Saha güncellemesi gönder',
  formLead: 'Gönderiniz koordinatör incelemesinden sonra yayımlanır. Doğrudan yayına girmez.',
  fType: 'Güncelleme türü',
  fBody: 'Ne oldu?',
  fBodyHint: 'Gördüğünüzü olduğu gibi yazın. En az 3, en fazla 1200 karakter.',
  fNeed: 'İlgili ihtiyaç (isteğe bağlı)',
  fLocation: 'İlgili teslim noktası (isteğe bağlı)',
  fArea: 'Yaklaşık bölge (isteğe bağlı)',
  fAreaHint: 'Mahalle ya da cadde adı yeterli. Ev adresi yazmayın.',
  fName: 'Ad Soyad',
  fEmail: 'E-posta',
  fEmailHint: 'Yalnızca koordinasyon ekibi görür. Yayımlanmaz.',
  fPhone: 'Telefon (isteğe bağlı)',
  fNone: 'Seçilmedi',
  okTruth: 'Yazdığım bilginin doğru olduğunu, tahmin veya duyum olmadığını onaylıyorum.',
  okPrivacy: 'Başkasının adını, telefonunu veya adresini paylaşmadığımı onaylıyorum.',
  send: 'Gönder',
  sending: 'Gönderiliyor…',
  cancel: 'Vazgeç',
  formFailed: 'Gönderilemedi. Yazdıklarınız duruyor; lütfen tekrar deneyin.',
  formTooShort: 'Lütfen en az üç karakter yazın.',
  formNeedsConsent: 'Devam etmek için iki onay kutusunu da işaretleyin.',
  formNeedsEmail: 'Koordinasyon ekibinin size dönebilmesi için e-posta gerekiyor.',
  // Sunucu PII bulursa gönderiyi engellemiyor, işaretliyor. Kullanıcıya bunu
  // söylemek, moderasyonda gecikmenin sebebini baştan açıklıyor.
  piiWarning: 'Metinde telefon numarası veya e-posta adresi görünüyor. Kişisel bilgi içeren gönderiler daha uzun incelenir.',

  // ---- Koordinatör dallanması ----------------------------------------------
  // Sunucu koordinatörün gönderimini DOĞRUDAN yayımlıyor (`submit_operation_update`
  // içindeki `v_coord` kısayolu). Form bu gerçeği misafir metniyle örtemez;
  // 3 Ağustos üretim doğrulamasında tam bu yüzden yanlış vaatli bir yayın oldu.
  coordLead: 'Koordinatör olarak gönderdiğiniz güncelleme incelemeden geçmez, doğrudan yayımlanır.',
  coordPublish: 'Yayınla',
  coordConfirmTitle: 'Doğrudan yayımlanacak',
  coordConfirm: (tur: string) =>
    `Bu metin "${tur}" olarak, adınızla ve "Koordinatör doğruladı" rozetiyle herkese açık akışta hemen görünür. Yayımlandıktan sonra gizleyebilir veya düzeltebilirsiniz.`,
  coordConfirmGo: 'Onayla ve yayınla',
  coordSuccessTitle: 'Güncelleme yayımlandı',
  coordSuccessBody: 'Güncelleme herkese açık akışta görünür durumda. Gerekirse moderasyon ekranından gizleyebilir veya düzeltme yayımlayabilirsiniz.',

  // ---- Fotoğraflar ----------------------------------------------------------
  fPhotos: 'Fotoğraflar (isteğe bağlı, en çok 4)',
  // EXIF vaadi DÜRÜST: `toWebp` canvas'tan yeniden kodluyor ve kameranın
  // yazdığı GPS/EXIF etiketleri bu sırada gerçekten düşüyor (src/imageUpload.ts).
  fPhotosHint: 'Fotoğraflar yüklenmeden önce yeniden boyutlandırılır; kameranın eklediği konum (GPS) etiketleri bu sırada silinir. Yayına ancak koordinatör onayından sonra çıkar.',
  fPhotoAdd: 'Fotoğraf ekle',
  fPhotoRemove: 'Kaldır',
  fPhotoBad: 'Bu dosya eklenemedi. JPEG, PNG veya WebP olmalı ve 8 MB’ı aşmamalı.',
  photosUploading: 'Fotoğraflar yükleniyor…',
  photosDone: (n: number) => (n === 1 ? '1 fotoğraf incelemeye alındı.' : `${n} fotoğraf incelemeye alındı.`),
  // Kısmi başarı GİZLENMİYOR: metin gitti ama fotoğraf gitmediyse kişi bunu bilmeli.
  photosFailed: (basarisiz: number, toplam: number) =>
    `${toplam} fotoğraftan ${basarisiz} tanesi yüklenemedi. Gönderiniz fotoğrafsız iletildi; dilerseniz koordinasyon ekibine e-postayla ulaştırabilirsiniz.`,

  successTitle: 'Saha güncellemeniz incelemeye gönderildi',
  successBody: 'Koordinasyon ekibi bilgiyi doğruladıktan sonra yayımlayabilir. Yayımlanmayan gönderiler herkese açık hiçbir yerde görünmez.',
  successClose: 'Kapat',

  // ---- Raporlama -----------------------------------------------------------
  report: 'Bildir',
  reportTitle: 'Bu güncellemeyi bildir',
  reportLead: 'Bildiriminiz koordinasyon ekibine iletilir. Kim bildirdiği herkese açık hiçbir yerde görünmez.',
  reportReason: 'Neden',
  reportNote: 'Kısa açıklama (isteğe bağlı)',
  reportSend: 'Bildir',
  reportDone: 'Bildiriminiz koordinasyon ekibine iletildi.',
  reportFailed: 'Bildirim gönderilemedi. Lütfen tekrar deneyin.',
} as const;

// Tür etiketleri. Sunucudaki enum ile birebir; eksik bir tür gelirse ekran ham
// değeri göstermek yerine anahtarın kendisini yazar ve bu fark edilir.
export const UPDATE_TYPE_LABEL: Record<OperationUpdateType, string> = {
  coordinator_update: 'Koordinatör Güncellemesi',
  institution_update: 'Kurum Güncellemesi',
  field_report: 'Saha Bildirimi',
  delivery_update: 'Teslimat Güncellemesi',
  need_update: 'İhtiyaç Güncellemesi',
  safety_notice: 'Güvenlik Uyarısı',
  public_comment: 'Kullanıcı Yorumu',
  system_event: 'Sistem Kaydı',
};

// Ekrandaki süzgeç çipleri. Sekiz türün hepsini çip yapmak süzgeci bir liste
// hâline getirirdi; bunlar operasyonda gerçekten aranan altı ayrım.
export const UPDATE_FILTERS: { key: OperationUpdateType | ''; label: string }[] = [
  { key: '', label: 'Tümü' },
  { key: 'coordinator_update', label: 'Koordinatör' },
  { key: 'safety_notice', label: 'Güvenlik' },
  { key: 'delivery_update', label: 'Teslimat' },
  { key: 'need_update', label: 'İhtiyaç' },
  { key: 'field_report', label: 'Saha' },
];

export const REPORT_REASON_LABEL: Record<UpdateReportReason, string> = {
  wrong_info: 'Yanlış bilgi',
  personal_data: 'Kişisel bilgi içeriyor',
  safety_risk: 'Güvenlik riski',
  spam: 'Spam',
  duplicate: 'Tekrar',
  off_topic: 'Operasyon dışı',
  inappropriate: 'Uygunsuz içerik',
};
