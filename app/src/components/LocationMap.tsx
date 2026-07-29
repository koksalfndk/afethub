import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C } from '../theme';

// Free, key-less map: Leaflet + OpenStreetMap tiles. Renders a compact map
// centered on one delivery point with a coloured marker matching its status.
export function LocationMap({ lat, lng, tone = 'green', label, height = 132 }: {
  lat: number; lng: number; tone?: 'green' | 'yellow'; label?: string; height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const map = L.map(el, { zoomControl: false, scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map);
    const color = tone === 'yellow' ? C.warning : C.emergency;
    const icon = L.divIcon({
      className: '',
      html: `<span style="display:block;width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(16,42,67,.35)"></span>`,
      iconSize: [20, 20], iconAnchor: [10, 10],
    });
    const marker = L.marker([lat, lng], { icon }).addTo(map);
    if (label) marker.bindTooltip(label, { direction: 'top', offset: [0, -8] });
    // Leaflet needs a size recalculation once the container has laid out.
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); };
  }, [lat, lng, tone, label]);

  return <div ref={ref} style={{ height, width: '100%' }} aria-label={label ? `${label} haritası` : 'Harita'} />;
}
