// AfetHUB — koordinatör teslim sözü ekranının metinleri (Faz 3-C)
//
// Neden `strings.ts` içinde DEĞİL: o dosya herkese açık ilk pakette ve içine
// eklenen her satır, bu ekranı hiç görmeyecek bir ziyaretçinin indirdiği bayta
// dönüşüyor. Faz 3-C ilk ölçümde herkese açık paketi 5,2 kB (gzip) büyütmüştü;
// metinler buraya taşınınca büyüme koordinatör parçasına geçti (rules/09 §8).
//
// Menü etiketi bilerek `tr.nav.pledges` içinde kaldı: kenar çubuğu eager.

export const trPledges = {
  navLabel: 'Teslim Sözleri',
  title: 'Teslim Sözleri',
  lead: 'Bugün ne gelecek, hangisi gecikti, kiminle konuşmak gerekiyor.',
  // Sayının anlamı yazıyor: söz, teslimat değildir.
  note: 'Teslim sözü bir niyettir. Kalan ihtiyaç miktarı yalnızca koordinatör doğrulamasından sonra değişir.',

  cards: {
    overdue: 'Geciken',
    overdueHint: 'tahmini zamanı geçti, hâlâ bekleniyor',
    today: 'Bugün beklenen',
    todayHint: 'bugün için planlanmış',
    reported: 'Teslim bildirildi',
    reportedHint: 'doğrulama bekliyor',
    transit: 'Yolda',
    transitHint: 'yola çıktığı bildirildi',
    cancelled: 'İptal edilen',
    cancelledHint: 'son 30 gün',
  },

  views: {
    all: 'Tümü', today: 'Bugün', upcoming: 'Yaklaşan', overdue: 'Geciken',
    transit: 'Yolda', reported: 'Teslim Bildirildi', done: 'Tamamlanan',
    cancelled: 'İptal', expired: 'Süresi Dolan',
  },
  upcomingWindow: 'Önümüzdeki 7 gün',

  search: 'Takip kodu, ihtiyaç, teslim noktası veya şehir',
  searchHint: 'En az üç karakter. İletişim bilgileriyle arama yapılmaz.',
  sortLabel: 'Sıralama',
  sorts: {
    operational: 'Önce gecikenler', due_asc: 'En yakın teslim zamanı',
    overdue: 'En fazla geciken', created_desc: 'En yeni söz',
    created_asc: 'En eski söz', qty: 'Miktar', priority: 'İhtiyaç önceliği',
  },
  filterOperation: 'Operasyon',
  filterAll: 'Tümü',
  clearFilters: 'Filtreleri temizle',

  colCode: 'Takip kodu', colNeed: 'İhtiyaç', colOperation: 'Operasyon',
  colQty: 'Miktar', colLocation: 'Teslim noktası', colEta: 'Tahmini teslim',
  colStatus: 'Durum', colContact: 'İletişim', colUpdated: 'Son güncelleme',
  colAction: 'İşlem',
  open: 'Detayı Aç',
  noEta: 'Zaman belirtilmedi',
  createdAt: (t: string) => `Oluşturma: ${t}`,
  pageInfo: (from: number, to: number, total: number) => `${total} kayıttan ${from}-${to}`,
  prev: 'Önceki', next: 'Sonraki',

  empty: {
    all: 'Bu filtrelerle eşleşen teslim sözü bulunmuyor.',
    today: 'Bugün için planlanmış teslim sözü bulunmuyor.',
    upcoming: 'Önümüzdeki yedi gün için planlanmış teslim sözü bulunmuyor.',
    overdue: 'Geciken teslim sözü bulunmuyor.',
    transit: 'Şu anda yolda olarak işaretlenmiş teslimat yok.',
    reported: 'Koordinatör doğrulaması bekleyen teslim bildirimi bulunmuyor.',
    done: 'Tamamlanmış teslim sözü bulunmuyor.',
    cancelled: 'İptal edilmiş teslim sözü bulunmuyor.',
    expired: 'Süresi dolmuş teslim sözü bulunmuyor.',
  } as Record<string, string>,
  loadFailed: 'Teslim sözleri yüklenemedi. Filtreleriniz korunuyor; tekrar deneyin.',
  retry: 'Tekrar dene',

  // ---- Detay çekmecesi ---------------------------------------------------
  detailTitle: 'Teslim Sözü',
  sectionDelivery: 'Teslim bilgisi',
  sectionStatus: 'Durum',
  sectionContact: 'İletişim',
  sectionLink: 'Fiziksel teslimat',
  needStat: (req: number, ver: number, rem: number, unit: string) =>
    `${req} ${unit} talep · ${ver} ${unit} doğrulandı · ${rem} ${unit} kalan`,
  notesLabel: 'Söz sahibinin notu',
  cancelReasonLabel: 'İptal nedeni',
  cancelledAtLabel: 'İptal zamanı',
  close: 'Kapat',

  contactMaskedNote: 'İletişim bilgileri maskeli gösteriliyor.',
  reveal: 'İletişim Bilgilerini Göster',
  revealPurpose: 'Kullanım amacı',
  revealPurposeHint: 'Bu kayıt denetim kaydına yazılır. En az üç karakter.',
  revealConfirm: 'Göster',
  revealCancel: 'Vazgeç',
  revealUse: 'Bu bilgileri yalnızca teslimat koordinasyonu amacıyla kullanın.',
  contactFailed: 'İletişim bilgisi alınamadı. Kullanım amacı yazdığınızdan emin olun.',
  hideContact: 'Gizle',
  copyPhone: 'Telefonu kopyala',
  copyEmail: 'E-postayı kopyala',
  copied: 'Kopyalandı.',
  copyFailed: 'Kopyalanamadı. Metni seçip elle kopyalayabilirsiniz.',
  noPhone: 'Telefon paylaşılmamış.',

  actions: {
    confirmed: 'Teyit Et',
    in_transit: 'Yolda Olarak İşaretle',
    delivered_reported: 'Teslim Bildirildi Olarak İşaretle',
    cancelled: 'İptal Et',
  } as Record<string, string>,
  actionReason: 'Gerekçe',
  actionReasonHint: 'Yalnızca denetim kaydına yazılır.',
  cancelTitle: 'Teslim sözünü iptal etmek istiyor musunuz?',
  cancelLead: 'Bu işlem ihtiyaç miktarını etkilemez. Kayıt silinmez, iptal edilmiş olarak kalır.',
  apply: 'Uygula',
  saving: 'Kaydediliyor…',
  statusSaved: 'Teslim sözünün durumu güncellendi.',
  statusFailed: 'Durum güncellenemedi. Lütfen tekrar deneyin.',
  statusRejected: 'Bu geçişe izin verilmiyor. Kayıt olduğu gibi kaldı.',
  readOnly: 'Bu kayıt kapandı; yalnızca görüntülenebilir.',

  linkNone: 'Fiziksel teslimat kaydı bulunamadı.',
  linkNoneHint: 'Söz sahibi teslimatı bildirdiğinde kaydı buradan eşleştirebilirsiniz.',
  linkOpen: 'Fiziksel teslimata bağla',
  linkTitle: 'Hangi teslimat bildirimine bağlanacak?',
  linkLead: 'Yalnızca aynı operasyon ve aynı ihtiyaca ait, başka bir söze bağlı olmayan bildirimler listeleniyor. Bağlama miktarları değiştirmez.',
  linkQtyMatch: 'Miktar eşleşiyor',
  linkPick: 'Bunu bağla',
  linkEmpty: 'Bağlanabilecek bir teslimat bildirimi yok.',
  linkSaved: 'Teslim sözü fiziksel teslimata bağlandı.',
  linkFailed: 'Bağlama yapılamadı. Kayıtların aynı ihtiyaca ait olduğundan emin olun.',
  linked: (code: string) => `Bağlı teslimat bildirimi: ${code}`,
  linkedQty: (q: number, unit: string, v: number | null) =>
    v == null ? `${q} ${unit} bildirildi · doğrulama bekliyor` : `${q} ${unit} bildirildi · ${v} ${unit} doğrulandı`,
  linkNote: 'Bağlama kalan miktarı değiştirmez. Kalan miktar yalnızca teslimat doğrulandığında güncellenir.',
}
