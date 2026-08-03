import { C } from '../theme';

// Kahramanın sağ tarafındaki görsel.
//
// Bir fotoğraf DEĞİL, bilerek. rules/04 §Visual Language operasyonel ekranlarda
// dramatik afet fotoğrafını yasaklıyor: yanan orman görüntüsü ziyaretçiyi hızlandırmaz,
// yalnızca kaygılandırır ve ekranın geri kalanını okunmaz kılar. Buradaki çizim
// AFETİ değil, KOORDİNASYONU anlatıyor: bir harita, üzerinde işaretlenmiş noktalar,
// noktalara giden bir teslimat hattı ve doğrulanmış bir kayıt.
//
// Inline SVG: ~3 KB, ayrı istek yok, LCP'yi geciktirmiyor ve renkler token'lardan
// geliyor — marka rengi değişirse çizim de değişir.
//
// `aria-hidden`: anlatılan her şey solundaki metinde zaten yazıyor. Ekran okuyucuya
// "koordinasyon illüstrasyonu" diye okumak, bilgi vermeyen bir gürültü olurdu.
// Bu yüzden dekoratif işaretlenmiştir (WCAG 1.1.1, decorative image).

export function HomeIllustration({ height = 320 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 520 400" width="100%" height={height} aria-hidden focusable="false"
      style={{ display: 'block', maxWidth: 520, marginLeft: 'auto' }}
    >
      <defs>
        <linearGradient id="ah-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EDF2F7" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id="ah-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F8FBFD" />
        </linearGradient>
      </defs>

      {/* Zemin dairesi — çizimi kahramanın beyazından ayıran tek yüzey. */}
      <circle cx="264" cy="196" r="176" fill="#F0F4F8" />

      {/* Ülke silueti. Gerçek sınır verisi DEĞİL, soyut bir kara parçası: burada
          coğrafi doğruluk iddiası yok, gerçek harita aşağıdaki bölümde duruyor. */}
      <path
        d="M84 214 C120 168 168 158 214 168 C252 176 282 158 322 162 C368 167 404 186 436 208
           C448 216 448 232 434 240 C398 262 352 276 300 278 C244 280 190 272 142 254
           C112 243 92 232 84 226 Z"
        fill="url(#ah-land)" stroke={C.borderSoft} strokeWidth="2" strokeLinejoin="round"
      />

      {/* Teslimat hattı: merkezden iki noktaya. Kesikli çizgi "yolda" demek —
          düz çizgi tamamlanmış bir şeyi anlatırdı. */}
      <path d="M214 226 C246 208 268 198 302 200" fill="none" stroke={C.muted3}
        strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
      <path d="M214 226 C196 246 178 250 158 244" fill="none" stroke={C.muted3}
        strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />

      {/* Üç işaret. Yalnızca biri kırmızı: kırmızı azaldıkça anlamı artıyor
          (rules/01 §No Misleading Urgency). */}
      <g>
        <circle cx="214" cy="226" r="26" fill={C.emergency} opacity=".12" />
        <circle cx="214" cy="226" r="13" fill={C.emergency} />
        <circle cx="214" cy="226" r="4.5" fill="#fff" />
      </g>
      <g>
        <circle cx="302" cy="200" r="10" fill={C.warning} />
        <circle cx="302" cy="200" r="3.5" fill="#fff" />
      </g>
      <g>
        <circle cx="158" cy="244" r="9" fill={C.muted2} />
        <circle cx="158" cy="244" r="3" fill="#fff" />
      </g>

      {/* Kayıt kartı: platformun asıl ürünü bir kutu değil, doğrulanmış bir satır. */}
      <g transform="translate(300 250)">
        <rect x="0" y="0" width="186" height="82" rx="14" fill="url(#ah-card)"
          stroke={C.border} strokeWidth="1.5" />
        <rect x="0" y="0" width="186" height="4" rx="2" fill={C.success} />
        <circle cx="30" cy="42" r="15" fill="#EAF7EF" />
        <path d="M23.5 42.5 l4.5 4.5 l9 -9.5" fill="none" stroke={C.success}
          strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="56" y="30" width="98" height="8" rx="4" fill={C.borderSoft} />
        <rect x="56" y="46" width="64" height="7" rx="3.5" fill={C.borderFaint} />
      </g>

      {/* Teslimat kutusu — "destek malzemesi" tarafı. */}
      <g transform="translate(70 274)">
        <rect x="0" y="14" width="86" height="60" rx="12" fill="#FFF" stroke={C.border} strokeWidth="1.5" />
        <rect x="0" y="14" width="86" height="4" rx="2" fill={C.orange} />
        <path d="M43 18 v56" stroke={C.borderFaint} strokeWidth="2" />
        <rect x="26" y="0" width="34" height="22" rx="7" fill="#FFF3E8" stroke="#F3D7BE" strokeWidth="1.5" />
      </g>

      {/* İki insan silueti: koordinasyon bir yazılım değil, insanlar. Yüz yok —
          temsil edilen kimse yok, bir rol var. */}
      <g transform="translate(196 296)">
        <circle cx="16" cy="12" r="11" fill={C.navy} opacity=".82" />
        <path d="M0 46 a16 16 0 0 1 32 0 z" fill={C.navy} opacity=".82" />
      </g>
      <g transform="translate(238 304)">
        <circle cx="14" cy="10" r="9.5" fill={C.teal} opacity=".8" />
        <path d="M0 40 a14 14 0 0 1 28 0 z" fill={C.teal} opacity=".8" />
      </g>
    </svg>
  );
}
