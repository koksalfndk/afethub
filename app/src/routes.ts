// URL path <-> route mapping.
//
// Kept in its own module so BOTH the store (History-API navigation) and the SEO
// layer (canonical / og:url in src/seo.ts) build paths from a single source of truth,
// without store.tsx having to export a non-component helper (which would break React
// Fast Refresh). Every screen maps to a real, crawlable path. See .claude/rules/09-seo.md.

import type { Route, Tab } from './store';

export function routePath(route: Route, tab: Tab, slug: string): string {
  switch (route) {
    case 'home': return '/';
    case 'disaster': return `/afet/${slug}` + (tab && tab !== 'needs' ? `/${tab}` : '');
    case 'report': return '/bildir';
    case 'track': return '/takip';
    case 'needReq': return '/talep';
    case 'orgs': return '/kurumlar';
    case 'coordHome': return '/koordinasyon';
    case 'coordQueue': return '/koordinasyon/kuyruk';
    case 'coordNeeds': return '/koordinasyon/ihtiyaclar';
    case 'coordLog': return '/koordinasyon/kayit';
    case 'system': return '/sistem';
    case 'components': return '/bilesenler';
    default: return '/';
  }
}
