// AfetHUB — Saha güncellemeleri moderasyon ekranının metinleri (Faz 4-A)
//
// Neden `strings.ts` içinde DEĞİL: o dosya herkese açık ilk pakette. Bu ekran
// yalnızca koordinatörün açtığı tembel bir rota; metinleri de onunla birlikte
// inmeli (`coordPledges.ts` ve `operationUpdates.ts` ile aynı gerekçe, rules/09 §8).

import type { OperationUpdateAuthorType } from '../types';

export const trModeration = {
  title: 'Saha Güncellemeleri',
  lead: 'Sahadan gelen güncellemeleri inceleyin, yayınlayın veya reddedin.',
  // Ekranın en çok yanlış anlaşılabilecek cümlesi baştan: bekleyen içerik hiçbir
  // herkese açık yüzeyde görünmüyor.
  note: 'Bekleyen gönderiler herkese açık hiçbir yerde görünmez. Yayımlama kararı geri alınabilir: yayımlanan bir kayıt gizlenebilir, gizlenen bir kayıt yeniden yayımlanabilir.',

  cards: {
    pending: 'İnceleme bekleyen',
    pendingHint: 'karar verilmemiş gönderi',
    reported: 'Bildirilen',
    reportedHint: 'açık topluluk bildirimi olan',
    info: 'Bilgi istenen',
    infoHint: 'gönderenden yanıt bekleniyor',
    pii: 'Kişisel bilgi',
    piiHint: 'metninde iletişim bilgisi olan',
  },

  filterOperation: 'Operasyon',
  filterAll: 'Tümü',
  refresh: 'Yenile',
  refreshing: 'Yükleniyor…',

  empty: 'İnceleme bekleyen saha güncellemesi yok.',
  emptyHint: 'Yeni gönderiler, açık bildirimler ve bekleyen fotoğraflar burada listelenir.',
  loadFailed: 'Kuyruk yüklenemedi. Tekrar deneyin.',
  retry: 'Tekrar dene',

  colUpdate: 'Gönderi',
  colAuthor: 'Kaynak',
  colFlags: 'İşaretler',
  colWaiting: 'Bekleme',
  colAction: 'İşlem',
  open: 'İncele',

  waiting: (s: string) => `${s} bekliyor`,

  badgePii: 'Kişisel bilgi',
  badgeReports: (n: number) => `${n} bildirim`,
  badgePhotos: (n: number) => `${n} fotoğraf bekliyor`,
  badgeInfo: 'Bilgi istendi',
  badgePublished: 'Yayında',

  authorLabel: {
    coordinator: 'Koordinatör',
    institution: 'Kurum',
    volunteer: 'Gönüllü',
    user: 'Kayıtlı kullanıcı',
    guest: 'Misafir',
    system: 'Sistem',
  } satisfies Record<OperationUpdateAuthorType, string>,

  // ---- Detay çekmecesi ------------------------------------------------------
  detailTitle: 'Gönderi incelemesi',
  close: 'Kapat',
  detailLoadFailed: 'Gönderi yüklenemedi.',

  sectionBody: 'Gönderi metni',
  sectionMeta: 'Bağlam',
  sectionContact: 'Gönderen',
  sectionInfo: 'Bilgi isteği',
  sectionDecision: 'Karar',

  originalBody: 'Gönderenin özgün metni',
  originalNote: 'Bu gönderi düzenlenerek yayımlanmış; aşağıdaki metin gönderenin ilk hâli.',
  piiInBody: 'Metinde telefon numarası veya e-posta adresi görünüyor. Yayımlamadan önce düzenleyerek çıkarmayı değerlendirin.',

  metaOperation: 'Operasyon',
  metaType: 'Tür',
  metaNeed: 'İlgili ihtiyaç',
  metaLocation: 'Teslim noktası',
  metaArea: 'Yaklaşık bölge',
  metaSubmitted: 'Gönderilme',
  metaReports: 'Açık bildirim',
  metaPhotos: 'Fotoğraf',
  photoState: (pending: number, approved: number) =>
    `${approved} onaylı · ${pending} bekliyor`,

  contactMaskedNote: 'İletişim bilgisi maskeli. Tam bilgi yalnızca yazılı bir gerekçeyle açılır ve her erişim denetim kaydına işlenir.',
  reveal: 'İletişim bilgisini aç',
  revealPurpose: 'Kullanım amacı',
  revealPurposeHint: 'Örn: bildirimin teyidi için geri aranacak. Denetim kaydına yazılır.',
  revealConfirm: 'Aç',
  revealCancel: 'Vazgeç',
  revealUse: 'Bu bilgiler yalnızca bu gönderinin doğrulanması için kullanılır. Kopyaladıysanız işiniz bitince silin.',
  hideContact: 'Gizle',
  copyEmail: 'E-postayı kopyala',
  copyPhone: 'Telefonu kopyala',
  copied: 'Kopyalandı.',
  copyFailed: 'Kopyalanamadı.',
  noContact: 'Gönderenin kayıtlı iletişim bilgisi yok.',

  infoRequested: (t: string) => `Bilgi istendi (${t})`,
  infoPendingNote: 'Gönderen yanıt verene kadar kayıt kuyrukta bekler.',

  // ---- Aksiyonlar -----------------------------------------------------------
  actPublish: 'Yayınla',
  actPublishEdited: 'Düzenleyerek Yayınla',
  actRequestInfo: 'Bilgi İste',
  actReject: 'Reddet',
  actHide: 'Gizle',
  actCorrect: 'Düzelt',
  actPin: 'Sabitle',
  actUnpin: 'Sabiti Kaldır',

  // Onay pencereleri SONUCU söylüyor, eylemi değil (rules/04 §Destructive Actions).
  publishTitle: 'Gönderiyi yayınla',
  publishConsequence: 'Gönderi herkese açık akışta görünür olacak.',
  publishVerify: 'Bu bilgiyi ayrıca doğruladım',
  // Yayınlamak tek başına doğrulamak değil; kutu işaretlenmezse misafir bildirimi
  // "Doğrulama bekleniyor" rozetiyle yayımlanır (rules/07 §Critical Distinctions).
  publishVerifyHint: 'İşaretlenmezse gönderi "Doğrulama bekleniyor" rozetiyle yayımlanır. Koordinatör ve kurum kaynaklı güncellemeler her durumda doğrulanmış sayılır.',
  publishReason: 'Not (isteğe bağlı)',

  editTitle: 'Düzenleyerek yayınla',
  editLead: 'Gönderenin özgün metni saklanır ve kayıtta görünür kalır. Yayımlanan, sizin düzenlediğiniz metindir.',
  editBody: 'Yayımlanacak metin',
  editReason: 'Düzenleme gerekçesi',
  editReasonHint: 'Örn: metindeki telefon numarası çıkarıldı. Denetim kaydına yazılır.',

  infoTitle: 'Gönderenden bilgi iste',
  // DÜRÜSTLÜK: e-posta gitmiyor. Bunu ekran açıkça söylüyor; aksi gönderenin
  // boşuna beklemesi demek (Faz 4-B bildirim motoruna kadar).
  infoLead: 'İstek kayda işlenir ve gönderi kuyrukta "Bilgi istendi" olarak işaretlenir. Gönderene otomatik e-posta GİTMEZ; kişiye iletişim bilgisinden kendiniz ulaşın.',
  infoMessage: 'Sorunuz',

  correctTitle: 'Yayımlanmış gönderiyi düzelt',
  // Düzeltme yeni kayıt açar; bunu baştan söylemek "metni yerinde değiştiririm"
  // beklentisini düzeltiyor (migration 0048: eski kayıt `corrected` olur, akıştan
  // düşer ama silinmez; herkes düzeltmenin yapıldığını görür).
  correctLead: 'Düzeltme yeni bir kayıt olarak yayımlanır ve akışta "Düzeltildi" olarak işaretlenir. Eski kayıt akıştan kalkar ama silinmez.',
  correctBody: 'Düzeltilmiş metin',
  correctReason: 'Düzeltme gerekçesi',

  rejectTitle: 'Gönderiyi reddet',
  rejectConsequence: 'Gönderi yayımlanmaz ve kuyruktan düşer. Kayıt silinmez; gerekçesiyle birlikte saklanır.',
  rejectReason: 'Ret gerekçesi',

  hideTitle: 'Gönderiyi gizle',
  hideConsequence: 'Gönderi herkese açık akıştan kaldırılır. Kayıt silinmez ve yeniden yayımlanabilir.',
  hideReason: 'Gizleme gerekçesi',

  reasonRequired: 'Gerekçe gerekli.',
  bodyTooShort: 'Metin en az üç karakter olmalı.',
  msgTooShort: 'Soru en az üç karakter olmalı.',

  confirm: 'Onayla',
  cancel: 'Vazgeç',
  saving: 'Kaydediliyor…',

  doneTitle: {
    publish: 'Gönderi yayımlandı.',
    publishEdited: 'Gönderi düzenlenerek yayımlandı.',
    reject: 'Gönderi reddedildi.',
    hide: 'Gönderi gizlendi.',
    info: 'Bilgi isteği kaydedildi.',
    correct: 'Düzeltme yayımlandı.',
    pin: 'Güncelleme sabitlendi.',
    unpin: 'Sabitleme kaldırıldı.',
  },
  actionFailed: 'İşlem tamamlanamadı. Yazdıklarınız duruyor; lütfen tekrar deneyin.',
} as const;
