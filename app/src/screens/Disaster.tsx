import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G, wash, MOBILE_HEADER_H, DESKTOP_HEADER_H } from '../theme';
import { enrichSorted, cols } from '../select';
import { PriorityBadge, ProgressBar, Chip, StatCard, LiveDot, Ico, DISASTER_ICON, eyebrow, filterPickerStyle, washCard, type IcoName } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { detailPairs, categoryIcon } from '../needForm';
import { LocationMap } from '../components/LocationMap';
import { NeedFilterSheet, activeFilterCount } from '../components/NeedFilterSheet';
import { NeedQuickView } from '../components/NeedQuickView';
import { isToday, formatDate } from '../util';
import type { Filter, Tab } from '../store';

const FILTERS: Filter[] = ['All', 'Critical', 'Urgent', 'Normal', 'Completed'];

// Rail layout: "Operasyon" is what a visitor acts on, "Kayıtlar" is what they read.
const SECTION_GROUPS: [string, Tab[]][] = [
  ['Operasyon', ['overview', 'needs', 'locations']],
  ['Kayıtlar', ['announcements', 'activity']],
];
const SECTION_ICON: Record<Tab, IcoName> = {
  overview: 'activity', needs: 'need', locations: 'pin', announcements: 'critical', activity: 'activity',
};
const opBtn = (primary: boolean) => (primary
  ? {
      background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
      height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    }
  : {
      background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
      height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    });

export function Disaster() {
  const a = useApp();
  const auth = useAuth();
  // Declared before the snapshot guard: a hook after an early return would change hook
  // order between the loading and loaded renders.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Hızlı bakış penceresinde açık olan kalem — nesnenin kendisi DEĞİL, kimliği.
  // Anlık görüntü arka planda yenilendiğinde (bir teslimat doğrulandı) pencere
  // donmuş bir kopyayı değil, güncel sayıları göstermeli.
  const [quickId, setQuickId] = useState<string | null>(null);

  // Ana sayfadaki "Acil ihtiyaçlar" kutusundan gelindiğinde o kalemin penceresi
  // kendiliğinden açılır. Anlık görüntü henüz yüklenmemiş olabileceği için efekt
  // snap'e de bağlı: niyet, kalem gerçekten listede belirene kadar bekler.
  useEffect(() => {
    const want = a.focusNeedId;
    if (!want) return;
    if (!a.snap?.needs.some((n) => n.id === want)) return;
    setQuickId(want);
    a.clearFocusNeed();
  }, [a.focusNeedId, a.snap, a]);
  // A zero-height marker, NOT the bar itself: the bar is sticky, so once it is stuck its
  // bounding rect reports the pinned position (top = header height) and the computed
  // scroll target collapses to "where we already are".
  const listAnchorRef = useRef<HTMLDivElement | null>(null);
  // Closing the sheet brings the list back under the filter bar. Without this the visitor
  // filtered nine needs down to two and was left looking at whatever was at their old
  // scroll offset — usually blank space below a much shorter list.
  const closeFilters = () => {
    setFiltersOpen(false);
    const el = listAnchorRef.current;
    if (!el) return;
    const y = window.scrollY + el.getBoundingClientRect().top - MOBILE_HEADER_H - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  };
  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  // The operation's initiator, resolved to a listed organization. Only a VERIFIED record
  // may be named: an id pointing at a pending (or removed) organization falls back to
  // AfetHUB's own team rather than publishing an unchecked affiliation.
  const startedBy = a.orgs.find((o) => o.id === a.snap!.disaster.openedByOrgId && o.status === 'Verified');
  // An operation opened by corroborated citizen reports has no institution behind it:
  // the initiator is the crowd, and that is stated rather than left blank.
  const byCommunity = a.snap.disaster.openedByCommunity === true;
  const needs = enrichSorted(a.snap.needs);
  const quickNeed = quickId ? (needs.find((n) => n.id === quickId) ?? null) : null;
  const pendingSubs = a.snap.subs.filter((s) => s.status === 'Pending verification');
  const pendingUnits = pendingSubs.reduce((x, s) => x + s.qty, 0);
  const activeNeeds = needs.filter((n) => n.remaining > 0).length;
  const completedNeeds = needs.length - activeNeeds;
  const totalReq = needs.reduce((x, n) => x + n.required, 0);
  const totalVer = needs.reduce((x, n) => x + n.verified, 0);
  const fulfil = Math.round((totalVer / totalReq) * 100);

  // Volunteer and delivery-point figures come from the snapshot, not constants,
  // so the summary can never drift from what the disaster page actually lists.
  const openingSoon = a.snap.locations.filter((l) => l.statusTone === 'yellow').length;
  const summary: { label: string; value: number; hint: string; accent: string; icon: IcoName }[] = [
    { label: tr.disaster.summary.activeNeeds, value: activeNeeds, hint: tr.disaster.summary.activeHint, accent: C.navy, icon: 'need' },
    { label: tr.disaster.summary.completedNeeds, value: completedNeeds, hint: tr.disaster.summary.completedHint, accent: C.success, icon: 'completed' },
    { label: tr.disaster.summary.pendingDeliveries, value: pendingSubs.length, hint: tr.disaster.summary.pendingHint(pendingUnits), accent: C.warning, icon: 'pending' },
    { label: tr.disaster.summary.verifiedDeliveries, value: a.snap.verifiedTotal, hint: tr.disaster.summary.verifiedHint(formatDate(a.snap.disaster.openedAt)), accent: C.success, icon: 'verified' },
    { label: tr.disaster.summary.volunteers, value: a.snap.disaster.volunteers, hint: tr.disaster.summary.volunteersHint(a.snap.disaster.onShift), accent: C.teal, icon: 'people' },
    { label: tr.disaster.summary.deliveryPoints, value: a.snap.locations.length, hint: tr.disaster.summary.deliveryPointsHint(openingSoon), accent: C.info, icon: 'pin' },
  ];

  // Needs filtering: free-text search plus the secondary filters (category,
  // delivery point, critical-only, updated today). Every clause is additive.
  const q = a.query.trim().toLowerCase();
  const visibleNeeds = needs.filter((n) => {
    const priorityOk = a.filter === 'All' || (a.filter === 'Completed' ? n.remaining === 0 : n.priority === a.filter);
    const searchOk = !q
      || n.name.toLowerCase().includes(q)
      || n.cat.toLowerCase().includes(q)
      || n.loc.toLowerCase().includes(q);
    return priorityOk && searchOk
      && (!a.catFilter || n.cat === a.catFilter)
      && (!a.locFilter || n.loc === a.locFilter)
      && (!a.onlyCritical || n.priority === 'Critical')
      && (!a.updatedToday || isToday(n.updated));
  });
  const categories = Array.from(new Set(needs.map((n) => n.cat))).sort((x, y) => x.localeCompare(y, 'tr'));
  const dropOffs = Array.from(new Set(needs.map((n) => n.loc))).sort((x, y) => x.localeCompare(y, 'tr'));
  // Count only the controls that live in the sheet, so the badge matches what is inside.
  const sheetCount = activeFilterCount(a);
  const anyFilter = a.filter !== 'All' || !!q || !!a.catFilter || !!a.locFilter || a.onlyCritical || a.updatedToday;
  const criticalNeeds = needs.filter((n) => n.priority === 'Critical').slice(0, 3);

  const cardBase = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, position: 'relative' as const, overflow: 'hidden' as const };
  const sectionCount: Record<Tab, number> = {
    overview: 0, needs: activeNeeds, locations: a.snap.locations.length,
    announcements: a.snap.announcements.length, activity: a.snap.log.length,
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: tr.disaster.tabs.overview },
    { key: 'needs', label: tr.disaster.tabs.needs },
    { key: 'locations', label: tr.disaster.tabs.locations },
    { key: 'announcements', label: tr.disaster.tabs.announcements },
    { key: 'activity', label: tr.disaster.tabs.activity },
  ];

  return (
    <div style={{
      display: mob ? 'flex' : 'grid', flexDirection: mob ? 'column' : undefined,
      gridTemplateColumns: mob ? undefined : '272px minmax(0,1fr)',
      gap: mob ? 20 : 26,
      // In the mobile column layout the cross axis is horizontal, so `start` would
      // shrink-wrap the content to its max-content width and overflow the viewport.
      alignItems: mob ? 'stretch' : 'start',
    }}>
      {!mob && (
        <aside aria-label={tr.disaster.sectionsLabel} style={{
          // Negative margins pull the rail out to the header's bottom edge and the
          // left edge of the page, so it reads as the shell's menu rather than a card
          // floating inside the content. main's padding is 24px/28px.
          alignSelf: 'stretch', margin: '-24px 0 -40px -28px',
          // A slightly recessed panel: the menu is a different surface from the white
          // content cards, so it reads as navigation without needing a heavy border.
          background: C.chipNavyBg, borderRight: `1px solid ${C.borderSoft}`,
          minHeight: `calc(100vh - ${DESKTOP_HEADER_H}px)`,
        }}>
          {/* The rail column is as tall as the page so its edge runs the full length;
              the menu itself is what stays in view. Sticking the tall column instead
              does nothing — a sticky element taller than the viewport scrolls away. */}
          <div style={{
            // Offset by the header height — the header is sticky, so `top: 0` would put
            // the rail behind it.
            position: 'sticky', top: DESKTOP_HEADER_H, padding: '18px 12px 22px',
            display: 'flex', flexDirection: 'column', gap: 3,
            maxHeight: `calc(100vh - ${DESKTOP_HEADER_H}px)`, overflowY: 'auto',
          }}>
          <div style={{ ...cardBase, background: C.surface, padding: 12, marginBottom: 6 }}>
            <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: G.heroRibbon }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <LiveDot color={C.success} /><span style={eyebrow}>{tr.home.liveOps}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 7 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, flex: '0 0 30px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: C.errorSurface, border: `1px solid ${C.errorBorder}`,
              }}><Ico n={DISASTER_ICON[a.snap.disaster.type]} size={17} color={C.emergency} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{a.snap.disaster.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted2 }}>{disasterTypeLabel[a.snap.disaster.type]}</div>
              </div>
            </div>
            <div className="tnum" style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
              {a.snap.disaster.province} · {tr.common.updated(a.snap.disaster.updatedLabel)}
            </div>
            <button onClick={a.openDelivery} className="hv-emergency" style={{ ...opBtn(true), width: '100%', marginTop: 10 }}>{tr.home.reportAid}</button>
            {/* 'coordScoped': bu sayfa ZATEN bir operasyonun sayfası, sihirbaz afet
                adımını sormaz. Ziyaretçi akışı da aynı sebeple kapsamlı. */}
            <button onClick={() => a.openWizard(auth.isCoordinator ? 'coordScoped' : 'public')} className="hv-navy" style={{ ...opBtn(false), width: '100%', marginTop: 7 }}>{tr.header.reportNeed}</button>
          </div>
          {SECTION_GROUPS.map(([group, keys]) => (
            <div key={group}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3, padding: '10px 11px 5px' }}>{group}</div>
              {keys.map((k) => {
                const t = tabs.find((x) => x.key === k)!;
                const on = a.tab === k;
                const n = sectionCount[k];
                return (
                  <button key={k} onClick={() => a.setTab(k)} aria-current={on ? 'page' : undefined} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: on ? G.navActive : 'none', border: 0, borderRadius: 10, padding: '10px 11px',
                    fontSize: 14, fontWeight: 600, color: on ? '#fff' : C.heading2, cursor: 'pointer', minHeight: 44,
                  }}>
                    <Ico n={SECTION_ICON[k]} size={17} color={on ? '#fff' : C.muted} />
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {n ? (
                      <span className="tnum" style={{
                        fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
                        background: on ? 'rgba(255,255,255,.18)' : (k === 'needs' ? C.errorSurface : C.borderFaint),
                        color: on ? '#fff' : (k === 'needs' ? C.errorText : C.muted),
                      }}>{n}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
          </div>
        </aside>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <div>
        <button onClick={() => a.go('home')} style={{ background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>{tr.disaster.allDisasters}</button>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: L.h2, fontWeight: 700, letterSpacing: '-.02em', margin: 0, color: C.navy }}>{a.snap.disaster.name}</h1>
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 4 }}>{tr.disaster.openedUpdated(a.snap.disaster.region, formatDate(a.snap.disaster.openedAt), a.snap.disaster.updatedLabel)}</div>
            {/* Who opened the operation. Falls back to AfetHUB's own team, and an id that no
                longer resolves to a VERIFIED organization also falls back rather than
                printing an unchecked affiliation on a public page (rules/03 §Legal and
                Safety Disclaimer). */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9, background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '4px 11px 4px 9px' }}>
              <Ico n={byCommunity ? 'people' : startedBy ? 'org' : 'shield'} size={13} color={C.muted2} />
              <span style={{ fontSize: 12.5, color: C.muted }}>
                {tr.disaster.startedBy}: <strong style={{ color: C.navy, fontWeight: 600 }}>
                  {byCommunity ? tr.disaster.startedByCommunity : startedBy?.name ?? tr.disaster.startedByAfethub}
                </strong>
              </span>
            </div>
            {/* An operation the crowd opened is published, but it rests on unverified
                claims until a coordinator confirms it. Saying so here is the whole
                reason it may be published at all (rules/01 §Clear Operational States;
                rules/07 §Critical Distinctions). */}
            {byCommunity && !a.snap.disaster.communityConfirmed && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 9,
                background: '#FFFDF4', border: '1px solid #F2DFA8', borderLeft: `3px solid ${C.warning}`,
                borderRadius: 10, padding: '9px 12px', maxWidth: '68ch',
              }}>
                <span style={{ paddingTop: 1 }}><Ico n="critical" size={14} color={C.warningText} /></span>
                <span style={{ fontSize: 12.5, color: C.heading2 }}>
                  <b style={{ color: C.warningText }}>{tr.disaster.communityPendingTitle}</b> {tr.disaster.communityPendingBody}
                </span>
              </div>
            )}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>
            <LiveDot size={6} />{tr.disaster.active}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {summary.map((c) => (
          <StatCard key={c.label} accent={c.accent} icon={c.icon} label={c.label} value={c.value} hint={c.hint} />
        ))}
      </div>

      {/* Section navigation. On desktop it is a left rail led by the operation's own
          card (the two operation-scoped actions live there, since neither makes sense
          without an operation). Below 900px the rail would eat a third of the screen,
          so it collapses into a horizontal chip row. */}
      {mob ? (
        <>
          <div style={{ ...cardBase, background: G.heroCard, padding: 14 }}>
            <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: G.heroRibbon }} />
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button onClick={a.openDelivery} className="hv-emergency" style={{ ...opBtn(true), flex: '1 1 150px' }}>{tr.home.reportAid}</button>
              <button onClick={() => a.openWizard(auth.isCoordinator ? 'coordScoped' : 'public')} className="hv-navy" style={{ ...opBtn(false), flex: '1 1 130px' }}>{tr.header.reportNeed}</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {tabs.map((t) => (
              <button key={t.key} onClick={() => a.setTab(t.key)} aria-current={a.tab === t.key ? 'page' : undefined} style={{
                whiteSpace: 'nowrap', border: `1px solid ${a.tab === t.key ? C.navy : C.borderSoft}`,
                background: a.tab === t.key ? C.navy : C.surface, color: a.tab === t.key ? '#fff' : C.heading2,
                borderRadius: 20, padding: '9px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40,
              }}>{t.label}{sectionCount[t.key] ? ` · ${sectionCount[t.key]}` : ''}</button>
            ))}
          </div>
        </>
      ) : null}

      {a.tab === 'overview' && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 8px' }}>{tr.disaster.situation}</h3>
            <p style={{ fontSize: 14, color: C.text, margin: 0 }}>{a.snap.disaster.situation}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, background: C.canvas }}>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.disaster.fulfilRate}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.success }}>{fulfil}%</div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 12, background: C.canvas }}>
                <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{tr.disaster.awaitingVerification}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.warning }}>{tr.disaster.units(pendingUnits)}</div>
              </div>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px' }}>{tr.disaster.criticalNeeds}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criticalNeeds.map((n) => (
                <div key={n.id} style={{ border: '1px solid #F6C9C9', background: '#FEF7F7', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>
                      <Ico n={categoryIcon(n.cat)} size={15} color={C.emergency} />{n.name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.emergency }}>{tr.disaster.left(n.remaining)}</span>
                  </div>
                  <div style={{ marginTop: 10 }}><ProgressBar pct={n.pctVal} color={C.emergency} height={6} track="#F1D6D6" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {a.tab === 'needs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mob && <div ref={listAnchorRef} aria-hidden style={{ height: 0 }} />}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            // The search + filter block stays under the header while the list scrolls, so
            // narrowing a long list never means scrolling back to the top. `top` is the
            // header's height, taken from theme.ts rather than written here twice.
            //
            // zIndex 20 sits under the header (30) and over the cards, so a card scrolls
            // behind this bar instead of through it.
            position: 'sticky', top: mob ? MOBILE_HEADER_H : DESKTOP_HEADER_H, zIndex: 20,
            background: C.canvas,
            borderBottom: `1px solid ${C.borderFaint}`,
            // The bar has to be opaque across the full width it covers, and slightly wider
            // than the cards so their borders do not peek out at the edges while scrolling.
            // Mobile bleeds to the screen edges (main padding 14px); desktop stays inside
            // its grid column, because -28px there would run under the left rail.
            ...(mob
              ? { margin: '-16px -14px 0', padding: '10px 14px' }
              : { margin: '0 -4px', padding: '2px 4px 12px' }),
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: mob ? 'nowrap' : 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', minWidth: 0, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '0 12px', minHeight: 44 }}>
                <Ico n="search" size={15} color={C.muted2} />
                <input
                  type="search" name="need-search" autoComplete="off"
                  value={a.query}
                  onChange={(e) => a.setQuery(e.target.value)}
                  placeholder={mob ? tr.disaster.searchNeedsShort : tr.disaster.searchNeeds}
                  aria-label={tr.disaster.searchNeeds}
                  style={{ border: 0, background: 'none', outline: 'none', fontSize: 14, color: C.navy, padding: '11px 0', width: '100%', minWidth: 0 }}
                />
              </label>
              {/* Priority is no longer a visible chip row on mobile: it is one of the
                  three groups inside the sheet, and duplicating it here cost two lines
                  above the first need card. */}
              {mob ? (
                <button onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} style={{
                  display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
                  background: sheetCount > 0 ? C.navy : C.surface,
                  border: `1px solid ${sheetCount > 0 ? C.navy : C.borderSoft}`,
                  color: sheetCount > 0 ? '#fff' : C.navy,
                  borderRadius: 9, minHeight: 44, padding: '0 13px', fontSize: 13.5, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  <Ico n="filter" size={15} />
                  {sheetCount > 0 ? tr.disaster.filtersMore.openWith(sheetCount) : tr.disaster.filtersMore.open}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FILTERS.map((f) => <Chip key={f} label={tr.disaster.filters[f]} active={a.filter === f} onClick={() => a.setFilter(f)} />)}
                </div>
              )}
            </div>
            {/* The count only appears once something is narrowing the list — otherwise it
                would spend a line saying "9 / 9". */}
            {mob && (anyFilter || !!q) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>
                  {tr.disaster.filtersMore.count(visibleNeeds.length, needs.length)}
                </span>
                <button onClick={a.clearFilters} style={{
                  marginLeft: 'auto', background: 'none', border: 0, padding: '2px 0',
                  fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline',
                }}>{tr.disaster.filtersMore.clear}</button>
              </div>
            )}

            {/* Secondary filters — narrow the list without adding a second toolbar. On a
                phone they move into a bottom sheet: two wrapping rows of chips and selects
                pushed the first need card off the screen and said nothing about what any
                of them was for. */}
            {!mob && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 168 }}>
                <Picker value={a.catFilter} onChange={a.setCatFilter} style={filterPickerStyle}
                  ariaLabel={tr.disaster.filtersMore.allCategories} placeholder={tr.disaster.filtersMore.allCategories}
                  options={[{ value: '', label: tr.disaster.filtersMore.allCategories }, ...toOptions(categories)]} />
              </span>
              <span style={{ minWidth: 168 }}>
                <Picker value={a.locFilter} onChange={a.setLocFilter} style={filterPickerStyle}
                  ariaLabel={tr.disaster.filtersMore.allLocations} placeholder={tr.disaster.filtersMore.allLocations}
                  options={[{ value: '', label: tr.disaster.filtersMore.allLocations }, ...toOptions(dropOffs)]} />
              </span>
              <Chip label={tr.disaster.filtersMore.onlyCritical} active={a.onlyCritical} onClick={a.toggleOnlyCritical} accent={C.emergency} />
              <Chip label={tr.disaster.filtersMore.updatedToday} active={a.updatedToday} onClick={a.toggleUpdatedToday} />
              <Chip label={tr.disaster.filtersMore.myArea} active={false} onClick={() => {}} disabled />
              <span style={{ flex: 1, minWidth: 4 }} />
              <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{tr.disaster.filtersMore.count(visibleNeeds.length, needs.length)}</span>
              {anyFilter && (
                <button onClick={a.clearFilters} style={{ background: 'none', border: 0, padding: '6px 2px', fontSize: 12.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}>{tr.disaster.filtersMore.clear}</button>
              )}
            </div>
            )}

          </div>

          {visibleNeeds.length > 0 ? (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.need }}>
              {visibleNeeds.map((n) => (
                // Priority is carried by the top border AND the badge — never colour alone (rule 04).
                <div key={n.id} style={{ ...washCard(n.barColor), padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    {/* Category icon left of the title. The tile is a fixed 34px so titles
                        line up across the grid whatever the icon is. */}
                    <span style={{
                      width: 34, height: 34, flex: '0 0 34px', borderRadius: 9, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: wash(n.barColor, 8), border: `1px solid ${C.borderFaint}`,
                    }}><Ico n={categoryIcon(n.cat)} size={17} color={n.barColor} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16.5, fontWeight: 700, color: C.navy }}>{n.name}</div>
                      <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>{n.cat} · {tr.common.updated(n.updated)}</div>
                    </div>
                  </div>

                  {/* Remaining is the decision-driving number, so it is the largest
                      element on the card — never the requested quantity (rule 04). */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div className="tnum" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em', color: n.barColor }}>{n.remaining}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginTop: 4 }}>
                        {n.done ? tr.disaster.coveredWord : `${n.unit} ${tr.disaster.remainingWord}`}
                      </div>
                    </div>
                    <PriorityBadge p={n.priority} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 600, color: C.heading2 }}>
                      <span className="tnum">{tr.disaster.verifiedUnit(n.verified, n.required, n.unit)}</span>
                      <span className="tnum" style={{ color: C.muted2, fontWeight: 500 }}>{n.pctVal}%</span>
                    </div>
                    <div style={{ marginTop: 7 }}><ProgressBar pct={n.pctVal} color={n.barColor} height={8} /></div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, fontWeight: 600 }}>
                      <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.successText }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.success, flex: '0 0 7px' }} />
                        {tr.disaster.verifiedInline(n.verified)}
                      </span>
                      <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.warningText }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.warning, flex: '0 0 7px' }} />
                        {tr.disaster.pendingInline(n.pending)}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: 12.5, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ico n="pin" size={14} color={C.muted2} />{tr.common.dropOff(n.loc)}
                  </div>
                  {detailPairs(n.details).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detailPairs(n.details).map(([k, val]) => (
                        <span key={k} style={{ fontSize: 12, color: C.heading2, background: C.chipNavyBg, border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '3px 8px' }}>
                          <b style={{ fontWeight: 600 }}>{k}:</b> {val}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Primary action stays visually dominant; details is a quiet secondary. */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button onClick={() => a.prefillReport(n.id, n.unit, n.loc)} className={n.done ? undefined : 'hv-emergency'} style={{ flex: '1 1 160px', background: n.done ? C.muted3 : C.emergency, border: `1px solid ${n.done ? C.muted3 : C.emergency}`, color: '#fff', borderRadius: 9, padding: '13px 16px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{n.done ? tr.disaster.fullyCovered : tr.disaster.iDelivered}</button>
                    <button onClick={() => setQuickId(n.id)} className="hv-navy" style={{ flex: '0 0 auto', background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.heading2, borderRadius: 9, padding: '13px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>{tr.common.details}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.disaster.noNeedsTitle}</div>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.disaster.noNeedsBody}</div>
              <button onClick={a.clearFilters} style={{ marginTop: 14, background: C.navy, border: 0, color: '#fff', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.disaster.clearFilters}</button>
            </div>
          )}
        </div>
      )}

      {a.tab === 'locations' && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.two }}>
          {a.snap.locations.map((l) => (
            <div key={l.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ height: 132, position: 'relative', borderBottom: `1px solid ${C.border}` }}>
                <LocationMap lat={l.lat} lng={l.lng} tone={l.statusTone} label={l.name} />
                <span style={{ position: 'absolute', bottom: 8, left: 10, zIndex: 500, background: 'rgba(255,255,255,.92)', border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: '4px 8px', fontSize: 11.5, fontWeight: 600, color: C.heading2 }}>{l.coords}</span>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{l.address}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: l.statusTone === 'green' ? C.successText : C.warningText, background: l.statusTone === 'green' ? '#EAF7EF' : '#FFF8E5', border: `1px solid ${l.statusTone === 'green' ? '#C9E9D6' : '#F2DFA8'}`, borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap' }}>{l.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: '6px 10px', fontSize: 13 }}>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.hours}</span><span style={{ color: C.heading2 }}>{l.hours}</span>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.accepts}</span><span style={{ color: C.heading2 }}>{l.accepts}</span>
                  <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.contact}</span><span style={{ color: C.heading2 }}>{l.contact} · {l.phone}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '11px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.openMap}</button>
                  <button onClick={() => a.go('disaster', { tab: 'needs' })} style={{ background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9, padding: '11px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.common.viewNeeds}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {a.tab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {a.snap.announcements.map((an) => (
            <div key={an.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${an.accent}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: an.accent }}>{an.kind}</span>
                <span style={{ fontSize: 12, color: C.muted2 }}>{an.time} · {an.author}</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 6, color: C.navy }}>{an.title}</div>
              <div style={{ fontSize: 14, color: C.text, marginTop: 4 }}>{an.body}</div>
            </div>
          ))}
        </div>
      )}

      {a.tab === 'activity' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0 }}>{tr.disaster.activityLog}</h3>
            <span style={{ fontSize: 12, color: C.muted2 }}>{tr.disaster.immutableNote}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            {a.snap.log.map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, marginTop: 5 }} />
                  <span style={{ flex: 1, width: 2, background: C.border }} />
                </div>
                <div style={{ paddingBottom: 18 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{e.action}</span>
                    <span style={{ fontSize: 12.5, color: C.muted2 }}>{e.time} · {e.user}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: C.text, marginTop: 3 }}>{e.detail}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12.5, color: C.muted }}>
                    <span style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 7px' }}>{tr.disaster.was(e.oldValue)}</span>
                    <span>→</span>
                    <span style={{ background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 6, padding: '3px 7px', color: C.successText, fontWeight: 600 }}>{tr.disaster.now(e.newValue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    {mob && (
        <NeedFilterSheet
          open={filtersOpen} onClose={closeFilters}
          categories={categories} dropOffs={dropOffs}
          shown={visibleNeeds.length} total={needs.length}
        />
      )}
    {/* Kalem silinmiş ya da süzgeç dışına düşmüş olabilir; kimlik listede yoksa
        pencere hiç açılmaz — boş bir pencere göstermektense kapalı kalır. */}
    {quickNeed && <NeedQuickView need={quickNeed} onClose={() => setQuickId(null)} />}
    </div>
  );
}
