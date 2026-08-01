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
    case 'reportDisaster': return '/afet-bildir';
    case 'about': return '/hakkimizda';
    case 'howItWorks': return '/nasil-calisir';
    case 'account': return '/hesabim';
    case 'coordHome': return '/koordinasyon';
    case 'coordQueue': return '/koordinasyon/kuyruk';
    case 'coordNeeds': return '/koordinasyon/ihtiyaclar';
    case 'coordLog': return '/koordinasyon/kayit';
    case 'coordSlider': return '/koordinasyon/slider';
    case 'coordDisasters': return '/koordinasyon/afetler';
    case 'coordOrgEdits': return '/koordinasyon/kurum-duzeltmeleri';
    case 'coordOrgs': return '/koordinasyon/kurumlar';
    case 'coordReports': return '/koordinasyon/bildirimler';
    case 'coordStaff': return '/koordinasyon/ekip';
    case 'coordOps': return '/koordinasyon/operasyon';
    case 'volunteer': return '/gonullu';
    case 'contact': return '/iletisim';
    case 'coordContact': return '/koordinasyon/iletisim';
    case 'system': return '/sistem';
    case 'components': return '/bilesenler';
    default: return '/';
  }
}
