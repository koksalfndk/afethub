// Client-side metadata sync for the path-routed SPA.
//
// Routing is path-based via the History API (see store.ts `routePath`), so each
// screen is a real, crawlable URL. This module keeps the per-route document.title,
// meta description, robots, canonical link and og:url/og:title/og:description in sync
// as the user navigates. Googlebot renders client-side JS, so it will see these
// per-page values; most non-rendering social scrapers still only read the STATIC
// index.html head (prerender/SSR is the follow-up for per-page social cards).
// See .claude/rules/09-seo.md.

import { routePath } from './routes';
import type { Route, Tab } from './store';

const SITE = 'AfetHUB';
const ORIGIN = 'https://afethub.com';
const DEFAULT_DESC =
  'Gerçek zamanlı afet ihtiyaçlarını takip et, teslimatları bildir ve yardımın koordinasyonuna katkı sun. Hesap gerekmez.';

interface RouteMeta {
  title: string;
  description?: string;
  // Public content is indexable; coordinator/system/demo views are operational, not
  // public content, so they are marked noindex to avoid diluting the public index.
  index: boolean;
}

const ROUTE_META: Record<Route, RouteMeta> = {
  home: { title: 'AfetHUB — Afet yardım koordinasyonu', description: DEFAULT_DESC, index: true },
  disaster: {
    title: 'Afet ihtiyaçları ve teslimat',
    description: 'Aktif afet için yayınlanmış ihtiyaçları, kalan miktarları ve teslim noktalarını görüntüleyin.',
    index: true,
  },
  report: {
    title: 'Teslimat bildir',
    description: 'Ulaştırdığınız yardımı bildirin. Koordinatör doğrulamasından sonra ihtiyaç miktarına yansıtılır.',
    index: true,
  },
  track: {
    title: 'Gönderi takibi',
    description: 'Takip kodunuzla bildiriminizin durumunu görüntüleyin.',
    index: true,
  },
  needReq: {
    title: 'İhtiyaç bildir',
    description: 'Sahadaki bir ihtiyacı koordinatör incelemesi için iletin.',
    index: true,
  },
  about: {
    title: 'Hakkımızda',
    description: 'AfetHUB bağımsız bir sivil afet koordinasyon platformudur. Kalan miktar = gerekli − doğrulanan; bekleyen bildirimler sayıları değiştirmez.',
    index: true,
  },
  howItWorks: {
    title: 'Nasıl çalışır',
    description: 'AfetHUB’ın yapısı, kimin ne yapabildiği ve her işlemin adımları: afet bildirme, ihtiyaç çağrısı, yardım bildirimi, takip ve doğrulama zinciri.',
    index: true,
  },
  // Account and panel content management are operational, not public content.
  account: { title: 'Hesabım', index: false },
  coordSlider: { title: 'Slider yönetimi', index: false },
  coordDisasters: { title: 'Afet yönetimi', index: false },
  // Operasyonun koordinasyon görünümü. Herkese açık /afet/<slug> indekslenir,
  // bu ekran indekslenmez: aynı olayın iki sürümü arama sonucunda yarışmamalı.
  coordDisaster: { title: 'Operasyon koordinasyonu', index: false },
  coordOrgEdits: { title: 'Kurum düzeltme talepleri', index: false },
  coordOrgs: { title: 'Kurum yönetimi', index: false },
  coordReports: { title: 'Topluluk bildirimleri', index: false },
  coordStaff: { title: 'Ekip ve gönüllüler', index: false },
  coordOps: { title: 'Duyuru ve teslim noktaları', index: false },
  contact: {
    title: 'İletişim',
    description: 'AfetHUB koordinasyon ekibine yazın. Soru, düzeltme veya iş birliği önerileriniz için iletişim formu ve e-posta adresi.',
    index: true,
  },
  // The panel is auth-gated; it is a real path, so it gets a real entry — noindex.
  coordContact: {
    title: 'İletişim mesajları',
    description: 'Koordinasyon paneli.',
    index: false,
  },
  volunteer: {
    title: 'Gönüllü ol',
    description: 'Afet bölgesinde gönüllü olarak destek vermek için başvurun. Hesap gerekmez; başvurunuz koordinatör incelemesinden sonra değerlendirilir.',
    index: true,
  },
  reportDisaster: {
    title: 'Afet bildir',
    description: 'Yangın, deprem, sel veya şiddetli hava olayını bildirin. Aynı olaya ait bildirimler birleştirilir.',
    index: true,
  },
  orgs: {
    title: 'Kurumlar ve dernekler',
    description: 'Afet ve acil durumlarda çalışan kamu kurumları, belediyeler, dernekler, vakıflar ve gönüllü gruplarının iletişim bilgileri.',
    index: true,
  },
  coordHome: { title: 'Koordinasyon paneli', index: false },
  coordQueue: { title: 'İnceleme kuyruğu', index: false },
  coordNeeds: { title: 'İhtiyaç yönetimi', index: false },
  coordLog: { title: 'Denetim kaydı', index: false },
  system: { title: 'Mimari ve akışlar', index: false },
  components: { title: 'Bileşen kütüphanesi', index: false },
};

function upsertMetaByName(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertMetaByProperty(property: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sync all per-route metadata (title, description, robots, canonical, og:*) for the
 * active route. `slug`/`tab` are used to build the canonical URL for disaster pages.
 */
export function applyRouteMeta(
  route: Route,
  opts?: { disasterName?: string; slug?: string; tab?: Tab },
): void {
  const meta = ROUTE_META[route] ?? ROUTE_META.home;

  let title: string;
  if (route === 'home') {
    title = meta.title;
  } else if (route === 'disaster' && opts?.disasterName) {
    title = `${opts.disasterName} — İhtiyaçlar ve teslimat · ${SITE}`;
  } else {
    title = `${meta.title} · ${SITE}`;
  }
  document.title = title;

  const url = ORIGIN + routePath(route, opts?.tab ?? 'needs', opts?.slug ?? '');
  setCanonical(url);
  upsertMetaByProperty('og:url', url);
  upsertMetaByProperty('og:title', title);

  if (meta.description) {
    upsertMetaByName('description', meta.description);
    upsertMetaByProperty('og:description', meta.description);
  }
  upsertMetaByName('robots', meta.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
}
