# SEO Rules

Adapted from the `claude-seo` methodology (github.com/AgriciDaniel/claude-seo) for
AfetHUB's stack: React 19 + Vite SPA on Vercel. These rules are binding for any
change that touches routing, `index.html`, metadata, `vercel.json`, `robots.txt`,
`sitemap.xml`, or structured data.

## 1. Canonical Domain (non-negotiable)

The one true origin is the **apex, non-www, HTTPS** host:

> `https://afethub.com`

- `www.afethub.com` must **308 permanent-redirect** to the apex for every path.
  This is enforced in `app/vercel.json` via a host-based redirect.
- Every `<link rel="canonical">`, `og:url`, sitemap `<loc>`, and absolute link in
  structured data must use `https://afethub.com` — never `www.`, never `http://`.
- In Vercel, `afethub.com` must be set as the **Primary** production domain.
- Never introduce a second indexable host (staging, preview) without `noindex`.

## 2. Vercel Config Location

`app/` is the Vercel **Root Directory** (the Vite project lives there), so
`app/vercel.json` is the deployment config. If the Root Directory is ever changed,
move `vercel.json` with it. Verify after deploy that `curl -sI https://www.afethub.com/`
returns `308` with `location: https://afethub.com/`.

## 3. Per-Page Metadata

Every indexable state must have:

- **Title**: 50–60 chars, unique, primary term first, ` · AfetHUB` suffix on
  sub-pages. Home stays `AfetHUB — Afet yardım koordinasyonu`.
- **Meta description**: 150–160 chars, Turkish, calm/non-dramatic (rule 07), no
  marketing exaggeration.
- **One `<h1>`** per screen matching intent.
- **Canonical** link (always the apex).
- **Open Graph**: `og:type`, `og:site_name`, `og:locale=tr_TR`, `og:title`,
  `og:description`, `og:url`, `og:image` (+ width/height/alt).
- **Twitter Card**: `summary_large_image` with title/description/image.

Static defaults live in `app/index.html`. Runtime per-route title/description/robots
sync lives in `app/src/seo.ts` (`applyRouteMeta`), wired from `App.tsx`.

> **Important honesty rule:** `src/seo.ts` updates are **UX-level only** (tab title,
> history, share-sheet). Because routing is hash-based and rendering is client-side,
> crawlers and most social scrapers see only the **static** `index.html` head. Do not
> claim per-route meta improves indexing until path-based routing + SSR/prerender
> exists (see §7).

## 4. Structured Data (JSON-LD)

- JSON-LD only (Google's preferred format); ship it in the **static** `index.html`
  so it's in the initial HTML, not injected late by JS.
- Current graph: `Organization` + `WebSite`. Keep it **truthful** — no unverified
  official affiliation (rule 03/07), no fabricated social profiles, absolute URLs only.
- Add `LocalBusiness`/`Place` only with verified address data. Add `BreadcrumbList`
  and per-page types (`WebPage`, `CollectionPage`) once real URLs exist.
- **Never** use deprecated/retired types: `HowTo` (removed 2023), FAQ **rich
  results** retired for all sites **May 7 2026** (an existing `FAQPage` may stay but
  earns no SERP feature — use `QAPage` for genuine Q&A), `SpecialAnnouncement`,
  `ClaimReview`, `VehicleListing`, `EstimatedSalary`, `CourseInfo`.

## 5. robots.txt

- Lives at `app/public/robots.txt` → served at `/robots.txt`.
- `User-agent: * / Allow: /` — nothing private is served by path (coordinator/system
  views are auth-gated and are not distinct crawlable URLs).
- **AI crawler policy: intentionally ALLOWED** (GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended, etc.). For a public-good platform, AI citations aid reach. To
  reverse, add per-agent `Disallow: /` blocks and record the decision here.
- Must reference the sitemap with an absolute apex URL.

## 6. sitemap.xml

- Lives at `app/public/sitemap.xml` → served at `/sitemap.xml`.
- Apex HTTPS `<loc>` only. No non-canonical, redirected, or `noindex` URLs.
- Omit `<priority>` and `<changefreq>` (Google ignores them).
- Keep `<lastmod>` truthful (W3C datetime, real content-change date) — Google only
  trusts it when consistently accurate.
- **Today it lists only `/`** because hash routes aren't separate URLs. Add one
  `<url>` per real path the moment path routing lands (§7).

## 7. The #1 Structural Limitation — Hash Routing

Routing is hash-based (`#/afet/<slug>`, `#/bildir`, `#/takip`, ...). Search engines
**ignore everything after `#`**, so the entire app collapses to a single indexable
URL. Consequences:

- Per-disaster / per-screen pages **cannot rank** on their own queries.
- Sitemap and canonical can only reference `/`.
- Client-rendered content may be under-indexed.

**To unlock real SEO, migrate to History-API path routing** (`/afet/<slug>`,
`/bildir`, ...):

1. Replace hash parsing in `store.tsx` with `history.pushState` + `popstate`.
2. Add a Vercel SPA rewrite: all paths → `/index.html` (keep `/robots.txt`,
   `/sitemap.xml`, assets as real files).
3. Emit one sitemap `<url>` per real path; make canonical/`og:url` path-aware.
4. Prefer **prerender/SSR** (e.g. `vite-plugin-ssr`/prerender, or a static export of
   key routes) so crawlers get server-rendered content + correct per-page meta.

Treat this as the highest-leverage SEO task after the current foundation. Until then,
do not over-promise multi-page ranking.

## 8. Images & Core Web Vitals

- Social image `og-image.png` is 1200×630. Keep that ratio for any replacement.
- All content `<img>`: descriptive `alt`, explicit `width`/`height` (prevents CLS),
  prefer WebP/AVIF, flag files > 200 KB.
- CWV targets (75th percentile field data): **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**.
  Do **not** reference FID (removed 2024).
- Current JS bundle is ~555 KB (154 KB gzip) in one chunk — over Vite's 500 KB warn.
  Code-split (dynamic `import()` for Leaflet/coordinator screens) before adding
  weight; this protects LCP/INP on the weak-network mobile users AfetHUB targets
  (rule 01/04).

## 9. Security Headers (SEO-adjacent)

`app/vercel.json` sets `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, and HSTS (`max-age=31536000; includeSubDomains`). A tightened
`Content-Security-Policy` is a recommended next step but must be tested against Google
Fonts, Supabase, and Leaflet tile origins before shipping. HSTS `preload` is optional
and requires manual submission to hstspreload.org — only add after confirming all
subdomains are HTTPS-permanent.

## 10. Pre-Deploy SEO Checklist

Before shipping SEO-affecting changes, verify (don't assume):

- [ ] `npm run build` passes (`tsc -b && vite build`).
- [ ] `dist/index.html` contains canonical, OG, Twitter, and JSON-LD.
- [ ] `dist/robots.txt` and `dist/sitemap.xml` exist and reference the apex.
- [ ] After deploy: `www.afethub.com` → `308` → `afethub.com`.
- [ ] Google Rich Results Test passes for the homepage JSON-LD.
- [ ] Submit `https://afethub.com/sitemap.xml` in Google Search Console (apex property).
- [ ] Social preview checked (e.g. share to WhatsApp/X) shows the OG card.

Never claim a build/deploy/redirect works unless it was actually run and observed
(CLAUDE.md “No Fabricated Completion”).
