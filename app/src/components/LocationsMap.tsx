import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C } from '../theme';
import type { Location } from '../types';

// Bir operasyonun BÜTÜN teslim noktalarını tek haritada gösterir.
//
// Neden tek harita: her kartın kendi mini haritası, noktaların BİRBİRİNE GÖRE nerede
// olduğunu göstermiyordu. Elinde malzemeyle yola çıkan kişinin sorusu "bana en yakını
// hangisi" ve o soru dört ayrı 132 piksellik karede cevapsız kalıyor.
//
// İşaretçiler NUMARALI ve numaralar yanındaki listeyle aynı. Eşleşme yalnızca renkle
// kurulsaydı renk körü biri için harita ile liste arasında bağ kalmazdı (rules/04
// §Durum yalnızca renkle anlatılmaz).
//
// Kaynak yine Leaflet + OpenStreetMap: anahtar yok, fatura yok, sakladığımız veriyi
// silme yükümlülüğü yok. Kayıt bizim veritabanımızda ve harita sağlayıcısı
// erişilemezken de durur.
export function LocationsMap({ items, selectedId, onSelect, height = 520, bottomPad = 0 }: {
  items: Location[];
  selectedId: string;
  onSelect: (id: string) => void;
  height?: number;
  /** Haritanın altını kapatan bir katman varsa (seçili nokta kartı) yüksekliği.
   *  Çerçeveleme bunu hesaba katar; yoksa alttaki nokta kartın arkasında kalır. */
  bottomPad?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const marks = useRef(new Map<string, L.Marker>());
  // Seçim işaretçiyi yeniden çizdiriyor; en güncel geri çağırma ref'te tutuluyor ki
  // harita her seçimde baştan kurulmasın (kurulum, görüntüyü de sıfırlar).
  const pick = useRef(onSelect);
  pick.current = onSelect;

  // --- kurulum: yalnızca nokta listesi değiştiğinde -------------------------
  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;
    const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);

    const pts: L.LatLngExpression[] = items.map((l) => [l.lat, l.lng]);
    // Tek nokta varsa `fitBounds` sonsuz yakınlaşır; o durumda sabit bir yakınlık.
    if (items.length === 1) map.setView(pts[0], 14);
    else {
      map.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [46, 46], paddingBottomRight: [46, 46 + bottomPad], maxZoom: 15,
      });
    }

    marks.current.clear();
    items.forEach((l, idx) => {
      const m = L.marker([l.lat, l.lng], { icon: numIcon(idx + 1, l, false), keyboard: true, title: l.name }).addTo(map);
      m.on('click', () => pick.current(l.id));
      m.on('keypress', () => pick.current(l.id));
      marks.current.set(l.id, m);
    });

    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; marks.current.clear(); };
  }, [items, bottomPad]);

  // --- seçim: yalnızca ikonu değiştirir, görüntüyü kaydırmaz ----------------
  // Haritayı seçilen noktaya ortalamak, listeden gezinen kişinin bakışını her satırda
  // yerinden ediyordu. Nokta zaten görünür; büyüyen işaretçi yeterli.
  useEffect(() => {
    items.forEach((l, idx) => {
      const m = marks.current.get(l.id);
      m?.setIcon(numIcon(idx + 1, l, l.id === selectedId));
    });
  }, [items, selectedId]);

  return (
    <div ref={ref} style={{ height, width: '100%' }}
      role="application" aria-label="Teslim noktaları haritası" />
  );
}

// Numaralı yuvarlak işaretçi. Renk durumu taşır ama TEK BAŞINA taşımaz: numara hem
// haritada hem listede aynı, ve işaretçinin `title`'ı noktanın adını söyler.
function numIcon(n: number, l: Location, active: boolean): L.DivIcon {
  const bg = l.statusTone === 'yellow' ? C.warning : C.navy;
  const fg = l.statusTone === 'yellow' ? '#3D2D00' : '#fff';
  const size = active ? 36 : 30;
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;`
      + `width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};`
      + `font:700 ${active ? 15 : 13}px Inter,system-ui,sans-serif;border:3px solid #fff;`
      + `box-shadow:0 3px 10px rgba(16,42,67,${active ? '.45' : '.3'})">${n}</span>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}
