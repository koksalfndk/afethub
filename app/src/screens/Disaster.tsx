import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../auth';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G, wash, MOBILE_HEADER_H, DESKTOP_HEADER_H } from '../theme';
import { enrichSorted, cols, type EnrichedNeed } from '../select';
import { PriorityBadge, ProgressBar, Chip, StatCard, LiveDot, Ico, DISASTER_ICON, eyebrow, filterPickerStyle, washCard, type IcoName } from '../ui';
import { Picker, toOptions } from '../components/Picker';
import { detailPairs, categoryIcon } from '../needForm';
import { LocationsMap } from '../components/LocationsMap';
import { NeedFilterSheet, activeFilterCount } from '../components/NeedFilterSheet';
import { NeedQuickView } from '../components/NeedQuickView';
import { OperationOverview, OperationStageBlock, FeaturedNeeds } from '../components/OperationOverview';
import { fulfilmentRate } from '../data';
import { isToday, formatDate } from '../util';
import type { Filter, Tab } from '../store';
import type { Location } from '../types';

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
  // Karşılama oranı KALEM SAYISI üzerinden — miktar üzerinden değil. Eski hesap
  // (`toplam doğrulanan / toplam talep edilen`) adet, litre ve kilogramı tek bir
  // bölmede topluyordu; farklı birimler toplanamaz (rules/05 §Quantities). Formül
  // artık `fulfilmentRate()` içinde, tek bir yerde ve gerekçesiyle yazılı.
  const fulfil = fulfilmentRate(activeNeeds, completedNeeds);
  // Canlı teslim sözü toplamı. Doğrulanan ve bekleyen miktarlarla HİÇBİR toplamda
  // birleşmez; kendi satırında durur (migration 0037).
  const pledgedUnits = needs.reduce((x, n) => x + (n.pledged ?? 0), 0);

  // Volunteer and delivery-point figures come from the snapshot, not constants,
  // so the summary can never drift from what the disaster page actually lists.
  const openingSoon = a.snap.locations.filter((l) => l.statusTone === 'yellow').length;
  // KPI hiyerarşisi (direktif §10): ilk üçü karar verdiren sayılar, kalanı
  // bağlam. Eşit görsel ağırlık, ziyaretçiye "hepsi aynı derecede önemli" demek
  // olurdu; `primary` bayrağı kartı büyütüyor.
  type Kpi = { label: string; value: string | number; hint: string; accent: string; icon: IcoName; primary?: boolean };
  const summary: Kpi[] = [
    { label: tr.disaster.summary.activeNeeds, value: activeNeeds, hint: tr.disaster.summary.activeHint, accent: C.navy, icon: 'need', primary: true },
    {
      label: tr.disaster.fulfilRate,
      // Yayınlanmış ihtiyaç yoksa yüzde YOK: %0 "hiçbir şey karşılanmadı" diye
      // okunur, oysa ortada karşılanacak bir şey yok.
      value: fulfil == null ? '—' : `%${fulfil}`,
      hint: fulfil == null ? tr.disaster.fulfilRateNone : tr.disaster.summary.fulfilHint(completedNeeds, needs.length),
      accent: C.success, icon: 'completed', primary: true,
    },
    { label: tr.disaster.summary.verifiedDeliveries, value: a.snap.verifiedTotal, hint: tr.disaster.summary.verifiedHint(formatDate(a.snap.disaster.openedAt)), accent: C.success, icon: 'verified', primary: true },
    { label: tr.disaster.summary.pendingDeliveries, value: pendingSubs.length, hint: tr.disaster.summary.pendingHint(pendingUnits), accent: C.warning, icon: 'pending' },
    { label: tr.disaster.pledge.label, value: pledgedUnits, hint: tr.disaster.summary.pledgeHint, accent: C.info, icon: 'pending' },
    { label: tr.disaster.summary.deliveryPoints, value: a.snap.locations.length, hint: tr.disaster.summary.deliveryPointsHint(openingSoon), accent: C.info, icon: 'pin' },
  ];
  // Gönüllü sayısı YALNIZCA gerçek bir kayıt varsa gösterilir. Sıfır bir kart,
  // "kimse yok" diye okunur; oysa çoğu operasyonda bu sayı henüz hiç girilmedi
  // (direktif §10, rules/04 §Empty States).
  if (a.snap.disaster.volunteers > 0) {
    summary.push({ label: tr.disaster.summary.volunteers, value: a.snap.disaster.volunteers, hint: tr.disaster.summary.volunteersHint(a.snap.disaster.onShift), accent: C.teal, icon: 'people' });
  }

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
        {/* Dokunma hedefi: 13px'lik bir metin bağlantısı telefonda 15 piksel yüksekliğinde
            kalıyordu. Görsel boyut aynı, tıklanabilir alan büyütüldü (rules/04 §Accessibility). */}
        <button onClick={() => a.go('home')} style={{ background: 'none', border: 0, padding: '12px 6px', margin: '-12px -6px', fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer', minHeight: 44 }}>{tr.disaster.allDisasters}</button>
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
          {/* Ana KAYIT durumu. Sahanın durumunu aşağıdaki aşama bloğu anlatıyor;
              bu rozet operasyon kaydının açık olduğunu söyler, o kadar. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>
            <LiveDot size={6} />{tr.disaster.active}
          </span>
        </div>
        {/* Operasyon aşaması — "Aktif" etiketinden DAHA GÖRÜNÜR, çünkü ziyaretçinin
            ilk sorusunu o cevaplıyor. Her sekmede duruyor: telefonda sayfanın en
            üstündeki bilgi bu olmalı (direktif §8, §20). */}
        <OperationStageBlock compact={mob} />
      </div>

      {/* Öne çıkan ihtiyaçlar, metriklerin ÜSTÜNDE: "ben nasıl destek olabilirim"
          sorusu, "operasyon ne kadar ilerledi" sorusundan önce gelir. */}
      {a.tab === 'overview' && <FeaturedNeeds needs={needs} />}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: L.stat }}>
        {summary.map((c) => (
          <StatCard key={c.label} accent={c.accent} icon={c.icon} label={c.label} value={c.value} hint={c.hint} primary={c.primary} />
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

      {a.tab === 'overview' && <OperationOverview needs={needs} mob={mob} twoCol={L.two} />}

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
        <DeliveryPoints
          points={a.snap.locations} needs={needs} mob={mob}
          onNeedsAt={(name) => { a.clearFilters(); a.setLocFilter(name); a.go('disaster', { tab: 'needs' }); }}
          onReportAt={(name) => { a.prefillReport('', '', name); }}
        />
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

// ---------------------------------------------------------------------------
// Teslim noktaları — liste + tek harita.
//
// Neden kart ızgarası değil: her kartın kendi 132 piksellik haritası, noktaların
// BİRBİRİNE GÖRE nerede olduğunu göstermiyordu. Elinde malzemeyle yola çıkan kişinin
// sorusu "bana en yakını hangisi" ve bu soru dört ayrı karede cevapsız kalıyordu.
//
// Kartta hiç görünmeyen ve buraya giren asıl bilgi DOLULUK. Migration 0025 bu sütunu
// tam olarak "dolu bir noktaya sevkiyat yönlendirme" diye eklemişti; şimdiye kadar
// hiçbir ekranda okunmuyordu.
// ---------------------------------------------------------------------------

// %85 eşiği veri katmanıyla aynı (localRepo `pointsAtCapacity`): iki yerde iki farklı
// eşik, panoda "2 nokta doluyor" derken listede üç dolu nokta göstermek demek olurdu.
const CAP_FULL = 85;
const CAP_TIGHT = 70;

function capTone(pct: number): { color: string; word: string } {
  if (pct >= CAP_FULL) return { color: C.errorText, word: tr.disaster.loc.capFull };
  if (pct >= CAP_TIGHT) return { color: C.warningText, word: tr.disaster.loc.capTight };
  return { color: C.successText, word: tr.disaster.loc.capRoom };
}
function capBar(pct: number): string {
  if (pct >= CAP_FULL) return C.emergency;
  if (pct >= CAP_TIGHT) return C.warning;
  return C.success;
}

// Doluluk satırı. Üç ayrı durum, üçü de FARKLI cümle kuruyor:
//   kapalı        → çubuk yok; kapalı bir yerin doluluğu kararı değiştirmiyor
//   ölçüm yok     → çubuk yok; %0 çizmek "bomboş" diye okunur
//   ölçüm var     → çubuk + yüzde + kelime (renk tek başına anlatmaz)
function CapacityRow({ l, compact }: { l: Location; compact?: boolean }) {
  // Ölçüm yoksa çubuk YOK. Durumdan bağımsız: kapalı bir noktanın da ölçümü olmayabilir
  // ve o zaman söylenecek şey "kapalı olduğu için gizliyoruz" değil, ölçüm olmadığıdır.
  if (l.capacityPct == null) {
    return <div style={{ fontSize: 12.5, color: C.muted }}>{tr.disaster.loc.capUnknown}</div>;
  }
  const pct = Math.max(0, Math.min(100, l.capacityPct));
  const open = l.statusTone === 'green';
  const tone = capTone(pct);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 70px', minWidth: 60 }}>
        {/* Nokta şu an teslim almıyorsa çubuk GRİ ve "yer var" denmiyor: sayı gerçek
            ama şu anda oraya gidilmez, renk de öyle demeli. */}
        <ProgressBar pct={pct} color={open ? capBar(pct) : C.muted3} height={8} flat />
      </span>
      <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: open ? tone.color : C.muted, whiteSpace: 'nowrap' }}>
        %{pct}{compact || !open ? '' : ` · ${tone.word}`}
      </span>
      {!compact && l.capacityUpdated && (
        <span style={{ fontSize: 11.5, color: C.muted3, whiteSpace: 'nowrap' }}>{tr.disaster.loc.capUpdated(l.capacityUpdated)}</span>
      )}
    </div>
  );
}

// Kullanıcının KENDİ harita uygulamasında açılan yol tarifi bağlantısı. Bir API
// anahtarı, bir betik ya da bir faturalandırma hesabı gerektirmiyor; kayıtlı
// koordinat yeterli. (Eski "Haritada Aç" düğmesinin hiç `onClick`'i yoktu.)
const directionsUrl = (l: Location): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

type PointFilter = 'all' | 'open' | 'room';

function DeliveryPoints({ points, needs, mob, onNeedsAt, onReportAt }: {
  points: Location[];
  needs: EnrichedNeed[];
  mob: boolean;
  onNeedsAt: (name: string) => void;
  onReportAt: (name: string) => void;
}) {
  const [filter, setFilter] = useState<PointFilter>('all');
  const [selId, setSelId] = useState('');

  // Noktada açık kalem sayısı: ihtiyaçlar zaten teslim noktası adını taşıyor.
  const openAt = (name: string) => needs.filter((n) => n.loc === name && n.remaining > 0).length;

  const isOpen = (l: Location) => l.statusTone === 'green';
  const hasRoom = (l: Location) => isOpen(l) && l.capacityPct != null && l.capacityPct < CAP_FULL;
  const shown = points.filter((l) => (filter === 'open' ? isOpen(l) : filter === 'room' ? hasRoom(l) : true));

  // Seçim türetiliyor: süzgeç değişince seçili nokta listeden düşmüş olabilir ve
  // haritada olmayan bir noktanın kartını göstermek yanlış olurdu.
  const sel = shown.find((l) => l.id === selId) ?? shown[0] ?? null;

  if (points.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: C.muted }}>{tr.disaster.loc.none}</div>
      </div>
    );
  }

  const chip = (k: PointFilter, label: string) => (
    <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} style={{
      background: filter === k ? C.navy : C.surface,
      border: `1px solid ${filter === k ? C.navy : C.borderSoft}`,
      color: filter === k ? '#fff' : C.heading2,
      borderRadius: 20, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', minHeight: 40,
    }}>{label}</button>
  );

  const statusPill = (l: Location) => (
    <span style={{
      fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 5,
      color: isOpen(l) ? C.successText : C.warningText,
      background: isOpen(l) ? '#EAF7EF' : '#FFF8E5',
      border: `1px solid ${isOpen(l) ? '#C9E9D6' : '#F2DFA8'}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 7px', background: isOpen(l) ? C.success : C.warning }} />
      {l.status}
    </span>
  );

  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, padding: '12px 14px', borderBottom: `1px solid ${C.borderFaint}`, flexWrap: 'wrap' }}>
        {chip('all', tr.disaster.loc.fAll(points.length))}
        {chip('open', tr.disaster.loc.fOpen(points.filter(isOpen).length))}
        {chip('room', tr.disaster.loc.fRoom(points.filter(hasRoom).length))}
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, color: C.muted }}>{tr.disaster.loc.emptyFilter}</div>
          <button onClick={() => setFilter('all')} style={{
            marginTop: 10, background: C.navy, border: 0, color: '#fff', borderRadius: 9,
            padding: '10px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44,
          }}>{tr.disaster.loc.clearFilter}</button>
        </div>
      ) : shown.map((l, idx) => {
        const on = sel?.id === l.id;
        return (
          <button key={l.id} onClick={() => setSelId(l.id)} aria-current={on ? 'true' : undefined} style={{
            display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left', width: '100%',
            padding: '13px 14px', border: 0, borderBottom: `1px solid ${C.borderFaint}`,
            background: on ? '#F7FBFF' : C.surface, cursor: 'pointer',
            boxShadow: on ? `inset 3px 0 0 ${C.navy}` : undefined, font: 'inherit',
          }}>
            {/* Numara haritadaki işaretçiyle AYNI — eşleşme renkten bağımsız kuruluyor. */}
            <span style={{
              width: 24, height: 24, flex: '0 0 24px', borderRadius: 7, marginTop: 2,
              background: isOpen(l) ? C.navy : C.warning, color: isOpen(l) ? '#fff' : '#3D2D00',
              fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{idx + 1}</span>
            {/* Durum rozeti adın SAĞINDA değil altında: 380 piksellik sütunda ikisi
                genişlik için yarışınca her nokta adı iki satıra kırılıyordu. */}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: C.navy, lineHeight: 1.3 }}>{l.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>{l.address} · {l.hours}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, flexWrap: 'wrap' }}>
                {statusPill(l)}
                <span style={{ flex: '1 1 90px', minWidth: 80 }}><CapacityRow l={l} compact /></span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const detail = sel && (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 11,
      boxShadow: mob ? undefined : '0 14px 38px rgba(11,30,48,.18)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>
            {shown.indexOf(sel) + 1} · {sel.name}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sel.address} · {sel.coords}</div>
        </div>
        {statusPill(sel)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: '6px 10px', fontSize: 13 }}>
        <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.hours}</span>
        <span style={{ color: C.heading2 }}>{sel.hours}</span>
        <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.accepts}</span>
        <span style={{ color: C.heading2 }}>{sel.accepts}</span>
        <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.contact}</span>
        <span style={{ color: C.heading2 }}>
          {sel.contact} · <a href={`tel:${sel.phone.replace(/\s/g, '')}`} style={{ color: C.info, fontWeight: 600, textDecoration: 'none' }}>{sel.phone}</a>
        </span>
        <span style={{ color: C.muted2, fontWeight: 600 }}>{tr.disaster.loc.capacity}</span>
        <span><CapacityRow l={sel} /></span>
      </div>
      {sel.capacityNote && (
        <div style={{ fontSize: 12.5, color: C.muted, background: C.canvas, border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '9px 11px' }}>{sel.capacityNote}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Yeni sekme + `noreferrer`: ziyaretçi okuduğu operasyonu kaybetmiyor. */}
        <a href={directionsUrl(sel)} target="_blank" rel="noreferrer"
          aria-label={tr.disaster.loc.directionsAria(sel.name)} style={{
            background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
            padding: '11px 15px', fontSize: 13.5, fontWeight: 600, minHeight: 44,
            display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
          }}><Ico n="pin" size={15} color="#fff" />{tr.disaster.loc.directions}</a>
        <button
          onClick={() => onNeedsAt(sel.name)}
          disabled={openAt(sel.name) === 0}
          title={openAt(sel.name) === 0 ? tr.disaster.loc.noNeedsAt : undefined}
          style={{
            background: C.surface, border: `1px solid ${C.borderSoft}`,
            color: openAt(sel.name) === 0 ? C.muted3 : C.navy, borderRadius: 9,
            padding: '11px 15px', fontSize: 13.5, fontWeight: 600,
            cursor: openAt(sel.name) === 0 ? 'not-allowed' : 'pointer', minHeight: 44,
          }}>{tr.disaster.loc.viewNeedsAt(openAt(sel.name))}</button>
        <button onClick={() => onReportAt(sel.name)} style={{
          background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
          padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44,
        }}>{tr.disaster.loc.reportHere}</button>
      </div>
    </div>
  );

  // Telefonda üst üste: süzgeç + liste, sonra harita, sonra seçili noktanın kartı.
  // Haritanın üstüne binen bir kart 390 pikselde haritadan geriye bir şerit bırakıyor.
  if (mob) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>{list}</div>
        {shown.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <LocationsMap items={shown} selectedId={sel?.id ?? ''} onSelect={setSelId} height={300} />
          </div>
        )}
        {detail}
      </div>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'grid', gridTemplateColumns: '380px 1fr' }}>
      <div style={{ borderRight: `1px solid ${C.border}` }}>{list}</div>
      <div style={{ position: 'relative', minHeight: 520 }}>
        {/* `bottomPad`: detay kartı haritanın alt ~240 pikselini kapatıyor. Onsuz
            güneydeki nokta kartın altında kalıyor ve haritada hiç görünmüyordu. */}
        {shown.length > 0 && <LocationsMap items={shown} selectedId={sel?.id ?? ''} onSelect={setSelId} height={520} bottomPad={240} />}
        {/* Kart haritanın ÜSTÜNDE duruyor ama `zIndex` Leaflet'in kendi katmanlarının
            (400-700) üzerinde olmalı; 500'ün altında kalırsa işaretçiler kartın önüne
            geçiyor. */}
        {detail && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 800 }}>{detail}</div>
        )}
      </div>
    </div>
  );
}
