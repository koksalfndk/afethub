import { useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel, priorityLabel } from '../i18n/strings';
import { categoryIcon } from '../needForm';
import { C, G, PRI, D, type PriorityKey } from '../theme';
import { LiveDot, Ico, DISASTER_ICON, PriorityBadge, MetricCell, ProgressBar, eyebrow, srOnly, type IcoName } from '../ui';
import { agoMinutes, clockLabel, formatDate } from '../util';
import { HeroBanner } from '../components/HeroBanner';
import { HomeOperationsMap } from '../components/HomeOperationsMap';
import { ReportConfirmModal } from '../components/ReportConfirmModal';
import { COMMUNITY_THRESHOLD } from '../data/repo';
import type { DisasterType, DisasterReport } from '../types';
import type { DisasterCard } from '../data/repo';

// Icon per disaster kind — a colour-coded category marker, never decoration.
const TYPE_ORDER: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];

function chipStyle(active: boolean) {
  return {
    background: active ? C.navy : C.surface,
    border: `1px solid ${active ? C.navy : C.borderSoft}`,
    color: active ? '#fff' : C.heading2,
    borderRadius: 20, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40,
  } as const;
}

// An operation's headline priority is the worst priority among its open needs —
// derived, never stored, so it cannot drift from the needs themselves.
function worstPriority(c: DisasterCard): PriorityKey {
  let worst: PriorityKey = 'Normal';
  for (const n of c.topNeeds) {
    if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[worst] ?? PRI.Normal).rank) worst = n.priority;
  }
  return worst;
}

// The home page is the national dashboard: one row per operation. A single
// disaster's detail lives on its own date-stamped page (/afet/<slug>).
//
// Layout: the six national counters live in ONE dark strip instead of six white
// cards, and operations are table rows instead of cards. Same information, five
// surfaces instead of twelve — the previous version made a visitor scan a dozen
// separate boxes to answer "where is it worst right now" (rules/04 §Dense dashboard
// layouts, §Content Hierarchy). Mobile keeps cards: a six-column table at 390px
// is unusable.
// Sayaç şeridinin yüksekliği. Negatif üst boşluk bunun yarısı: şerit kahramanın
// alt kenarını tam ortasından kesiyor.
const HERO_STRIP_H = 92;
// Dış kapsayıcının satırlar arası boşluğu. Negatif üst boşluk bunu da geri almalı;
// yoksa şerit kahramanın kenarının bu kadar altında kalır.
const HOME_GAP = 14;

// "Nasıl yardımcı olabilirim" listesi. Tek yerde tanımlı, çünkü aynı dört yol
// başlıkta, ana sayfada ve nasıl-çalışır sayfasında geçiyor.
const HELP_ACTIONS: { key: 'volunteer' | 'supply' | 'donate' | 'report'; icon: IcoName; run: (a: ReturnType<typeof useApp>) => void }[] = [
  { key: 'volunteer', icon: 'people',   run: (a) => a.go('volunteer') },
  { key: 'supply',    icon: 'need',     run: (a) => a.go('report') },
  { key: 'donate',    icon: 'org',      run: (a) => a.go('orgs') },
  { key: 'report',    icon: 'critical', run: (a) => a.openDisasterForm() },
];

function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: '-.01em', color: C.navy }}>{title}</h2>
      {link && onLink && (
        <button onClick={onLink} className="lnk" style={{
          marginLeft: 'auto', background: 'none', border: 0, padding: 0,
          font: 'inherit', fontSize: 13, fontWeight: 600, color: C.info, cursor: 'pointer',
        }}>{link}</button>
      )}
    </div>
  );
}

export function Home() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const ov = a.overview;

  const [type, setType] = useState<DisasterType | ''>('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [q, setQ] = useState('');
  // Open by default. A feed of what actually happened in the last hours is the thing
  // that tells a visitor these numbers are being kept up to date; behind a click it was
  // read as decoration. It still collapses, and it is the same feed for everyone —
  // signed in or not (audit_is_public in the database decides, not the session).
  const [feedOpen, setFeedOpen] = useState(true);
  // Operasyonların tamamı KATLI geliyor. Ana sayfa yönlendirme ekranı; ama listeye
  // gidilecek başka bir yer olmadığı için kaldırmak yerine kapalı tutuluyor.
  const [showAll, setShowAll] = useState(false);
  // The report being confirmed, if any. Confirming is a form, not a click: see
  // ReportConfirmModal for why the counter cannot be anonymous.
  const [confirming, setConfirming] = useState<DisasterReport | null>(null);

  if (!ov) return <div style={{ padding: 40, color: C.muted }}>{tr.common.loading}</div>;

  const needle = q.trim().toLowerCase();
  const visible = ov.disasters.filter((c) => {
    const d = c.disaster;
    return (!type || d.type === type)
      && (!onlyActive || d.status === 'Active')
      && (!needle
        || d.name.toLowerCase().includes(needle)
        || d.province.toLowerCase().includes(needle)
        || d.region.toLowerCase().includes(needle));
  });
  const presentTypes = TYPE_ORDER.filter((t) => ov.disasters.some((c) => c.disaster.type === t));

  // Dark strip cells. Colour lives on the figure only; the labels stay muted so the
  // strip reads as one instrument panel rather than six competing badges.
  // DÖRT sayı, altı değil. Hepsinin arkasında gerçek bir kayıt var: uydurulabilecek
  // ya da hesaplanamayacak bir ölçü ("destekçi sayısı" gibi) buraya konmadı.
  const provinces = new Set(ov.disasters.filter((c) => c.disaster.status === 'Active').map((c) => c.disaster.province));
  const cells: { label: string; value: number; unit: string; tone: string; icon: IcoName }[] = [
    { label: tr.home.statDisasters, value: ov.totals.activeDisasters, unit: tr.home.statDisastersUnit(provinces.size), tone: '#FF8A8F', icon: 'pin' },
    { label: tr.home.statVolunteers, value: ov.totals.volunteers, unit: tr.home.statVolunteersUnit, tone: '#7FD8CF', icon: 'people' },
    { label: tr.home.statNeeds, value: ov.totals.activeNeeds, unit: tr.home.statNeedsUnit, tone: '#9BC7ED', icon: 'need' },
    { label: tr.home.statVerified, value: ov.totals.verifiedSubs, unit: tr.home.statVerifiedUnit, tone: '#6EE7A8', icon: 'verified' },
  ];

  // Özet listede en ağır dört operasyon: önce önceliğe, sonra açık ihtiyaç sayısına.
  const topDisasters = ov.disasters
    .filter((c) => c.disaster.status === 'Active')
    .slice()
    .sort((x, y) => (PRI[worstPriority(x)] ?? PRI.Normal).rank - (PRI[worstPriority(y)] ?? PRI.Normal).rank
      || y.activeNeeds - x.activeNeeds)
    .slice(0, 4);

  // Acil ihtiyaçlar KALEM ADIYLA toplanır. `ov.urgent` operasyon başına satır
  // veriyor; olduğu gibi basıldığında "Maske" kutusu üç kez yan yana çıkıyordu ve
  // ziyaretçi üç ayrı ihtiyaç sanıyordu. Kaç bölgede aranıyorsa o yazılır.
  const urgentByName = (() => {
    const m = new Map<string, { name: string; cat: string; priority: PriorityKey; remaining: number; unit: string; ops: Set<string>; slug: string }>();
    for (const n of ov.urgent) {
      const cur = m.get(n.name);
      if (cur) {
        cur.remaining += n.remaining;
        cur.ops.add(n.disasterId);
        if ((PRI[n.priority] ?? PRI.Normal).rank < (PRI[cur.priority] ?? PRI.Normal).rank) cur.priority = n.priority;
      } else {
        m.set(n.name, { name: n.name, cat: n.cat, priority: n.priority, remaining: n.remaining, unit: n.unit, ops: new Set([n.disasterId]), slug: n.disasterSlug });
      }
    }
    return [...m.values()]
      .sort((x, y) => (PRI[x.priority] ?? PRI.Normal).rank - (PRI[y.priority] ?? PRI.Normal).rank || y.ops.size - x.ops.size)
      .slice(0, 8);
  })();

  const panel = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
    overflow: 'hidden' as const,
  };
  const th = {
    textAlign: 'left' as const, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' as const,
    color: C.muted2, fontWeight: 700, padding: '10px 12px', background: '#F7FAFC',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' as const,
  };
  const td = { padding: '11px 12px', borderBottom: `1px solid ${C.borderFaint}`, verticalAlign: 'middle' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ---- Kahraman + dört sayı ------------------------------------------
          Ana sayfa bir kontrol paneli değil, yönlendirme ekranı. Ziyaretçi beş
          saniyede üç şeyi anlamalı: nerede afet var, neye ihtiyaç var, nasıl destek
          olabilir. Bu yüzden altı sayaçlık ulusal şerit dörde indi ve tekrar eden
          operasyon tabloları katlanan bir bölüme taşındı.

          Sayaç şeridi kahramanın ALT KENARINI dikey ortasından kesiyor. Kahramanın
          içine konup taşırılamıyor: orada `overflow: hidden` var ve taşan yarısı
          kırpılırdı. Bu yüzden dışarıda duruyor ve negatif üst boşlukla çekiliyor. */}
      <HeroBanner bottomInset={mob ? 0 : HERO_STRIP_H / 2 + 10} />
      {/* Mobilde şerit slider'ın ALTINDA, normal akışta. 390 px'te kenarını kesmek
          hem sayıları hem fotoğrafı okunmaz yapıyordu; orada kesişme bir tasarım
          değil, sıkışma olurdu. */}
      <div style={{
        position: 'relative', zIndex: 3,
        marginTop: mob ? 0 : -(HERO_STRIP_H / 2 + HOME_GAP), marginBottom: mob ? 0 : 4,
        // Slider'dan %25 dar ve ortalanmış: şerit kahramanın altını tam kaplayınca
        // ikinci bir kahraman gibi okunuyordu, oysa bir özet.
        width: mob ? '100%' : '75%', marginLeft: 'auto', marginRight: 'auto',
      }}>
        <div style={{
          background: '#0F2C46', border: `1px solid ${D.rowBd}`, borderRadius: 14,
          boxShadow: '0 18px 44px rgba(11,30,48,.28)', overflow: 'hidden',
          display: 'grid', gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
        }}>
          {cells.map((c, i) => (
            <div key={c.label} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: mob ? '12px 13px' : '0 16px',
              minHeight: mob ? 0 : HERO_STRIP_H,
              borderRight: !mob && i < cells.length - 1 ? `1px solid ${D.rowBd}` : 0,
              borderTop: mob && i > 1 ? `1px solid ${D.rowBd}` : 0,
              borderLeft: mob && i % 2 === 1 ? `1px solid ${D.rowBd}` : 0,
            }}>
              <span style={{
                width: 34, height: 34, borderRadius: 10, flex: '0 0 34px',
                background: D.rowBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Ico n={c.icon} size={17} color={c.tone} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, color: D.fg2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                <span className="tnum" style={{ display: 'block', fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: '#fff' }}>
                  {c.value}
                  <small style={{ fontSize: 11.5, fontWeight: 500, color: D.fg2, marginLeft: 4 }}>{c.unit}</small>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Aktif afetler + ihtiyaç haritası ------------------------------- */}
      <div style={{ display: 'grid', gap: 14, alignItems: 'stretch', gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)' }}>
        <section style={{ ...panel, padding: '16px 17px 17px', display: 'flex', flexDirection: 'column' }}>
          <SectionHead title={tr.home.activeTitle} link={tr.home.seeAll} onLink={() => setShowAll(true)} />
          {topDisasters.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{tr.dash.noMatchBody}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
              {topDisasters.map((c, i, arr) => {
                const pr = worstPriority(c);
                const tone = (PRI[pr] ?? PRI.Normal);
                return (
                  <li key={c.disaster.id} style={{ borderBottom: i === arr.length - 1 ? 0 : `1px solid ${C.borderFaint}` }}>
                    <button onClick={() => a.openDisaster(c.disaster.slug)} className="hv-navy" style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                      background: 'none', border: 0, padding: '11px 2px', cursor: 'pointer',
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', flex: '0 0 10px', background: tone.bar }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.navy }}>{c.disaster.name}</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>{c.disaster.region}</span>
                      </span>
                      {/* Öncelik renkle DEĞİL kelimeyle; renk yalnızca tekrar ediyor. */}
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
                        color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`,
                      }}>{priorityLabel[pr].toLocaleUpperCase('tr')}</span>
                      <span style={{ textAlign: 'right', flex: '0 0 58px' }}>
                        <span className="tnum" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: C.navy }}>{c.activeNeeds}</span>
                        <span style={{ display: 'block', fontSize: 11, color: C.muted2 }}>{tr.home.needWord}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button onClick={() => setShowAll((v) => !v)} className="hv-navy" style={{
            marginTop: 12, width: '100%', background: C.surface, border: `1px solid ${C.borderSoft}`,
            color: C.navy, borderRadius: 10, height: 42, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{showAll ? tr.home.hideAllDisasters : tr.home.allDisasters}</button>
        </section>

        <HomeOperationsMap />
      </div>

      {/* ---- Acil ihtiyaçlar + nasıl yardımcı olabilirim -------------------- */}
      <div style={{ display: 'grid', gap: 14, alignItems: 'stretch', gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)' }}>
        <section style={{ ...panel, padding: '16px 17px 17px', display: 'flex', flexDirection: 'column' }}>
          <SectionHead title={tr.home.urgentTitle} />
          {urgentByName.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{tr.home.urgentEmpty}</p>
          ) : (
            <div style={{
              display: 'grid', gap: 10, flex: 1, alignContent: 'start',
              gridTemplateColumns: mob ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
            }}>
              {urgentByName.map((n) => (
                <button key={n.name} onClick={() => a.openDisaster(n.slug, 'needs')} className="hv-navy" style={{
                  border: `1px solid ${C.border}`, borderRadius: 11, padding: '12px 8px',
                  background: C.surface, cursor: 'pointer', textAlign: 'center', minWidth: 0,
                }}>
                  <span style={{
                    width: 42, height: 42, borderRadius: 12, background: C.chipNavyBg, margin: '0 auto 8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Ico n={categoryIcon(n.cat)} size={20} color={(PRI[n.priority] ?? PRI.Normal).bar} /></span>
                  <span style={{
                    display: 'block', fontSize: 12.5, fontWeight: 600, color: C.navy,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{n.name}</span>
                  <span className="tnum" style={{ display: 'block', fontSize: 11, color: C.muted2, marginTop: 2 }}>
                    {tr.home.urgentBox(n.ops.size, n.remaining, n.unit)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p style={{ margin: '11px 0 0', fontSize: 11.5, color: C.muted2 }}>{tr.common.remainingUnchanged}</p>
        </section>

        <section style={{ ...panel, padding: '16px 17px 17px', display: 'flex', flexDirection: 'column' }}>
          <SectionHead title={tr.home.helpTitle} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {HELP_ACTIONS.map((h) => (
              <button key={h.key} onClick={() => h.run(a)} className="hv-navy" style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px',
                background: C.surface, cursor: 'pointer', minHeight: 60,
              }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flex: '0 0 36px', background: C.chipNavyBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Ico n={h.icon} size={18} color={C.text} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{tr.home.help[h.key].title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted2 }}>{tr.home.help[h.key].body}</span>
                </span>
                <Ico n="chev" size={16} color={C.muted3} />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Son hareketler + koordinasyon ---------------------------------- */}
      <div style={{ display: 'grid', gap: 14, alignItems: 'stretch', gridTemplateColumns: mob ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)' }}>
        <section style={{ ...panel, padding: '16px 17px 17px', display: 'flex', flexDirection: 'column' }}>
          <SectionHead title={tr.home.recentTitle} />
          {ov.log.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{tr.home.recentEmpty}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
              {ov.log.slice(0, 4).map((e, i, arr) => (
                <li key={e.id} style={{
                  display: 'flex', gap: 11, padding: '10px 0',
                  borderBottom: i === arr.length - 1 ? 0 : `1px solid ${C.borderFaint}`,
                }}>
                  {/* Göreli zaman ("22 dakika önce") dar bir sütuna sığmıyor ve üç
                      satıra bölünüyordu; alt satırın sonuna alındı. */}
                  <span style={{ width: 9, height: 9, borderRadius: '50%', flex: '0 0 9px', background: e.color, marginTop: 5 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                    <span className="tnum" style={{ display: 'block', fontSize: 12, color: C.muted2 }}>
                      {[e.user, e.detail, e.disasterName, e.time].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{
          ...panel, padding: '16px 17px 17px', display: 'flex', flexDirection: 'column',
          background: G.surfaceSoft, border: `1px solid ${C.borderSoft}`,
        }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-.02em', color: C.navy }}>{tr.home.togetherTitle}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.text, maxWidth: '38ch' }}>{tr.home.togetherBody}</p>
          {/* Üç sayı kendi kutularında. Serbest metin gibi dizildiklerinde altlarında
              kartın yarısı kadar boşluk kalıyordu; kutular hem o boşluğu yapıya
              çeviriyor hem de üç ayrı ölçü olduklarını söylüyor. */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, margin: '16px 0 0',
          }}>
            {[
              [a.orgs.filter((o) => o.status === 'Verified').length, tr.home.togetherOrgs],
              [ov.totals.volunteers, tr.home.togetherVolunteers],
              [ov.totals.deliveryPoints, tr.home.togetherPoints],
            ].map(([v, l]) => (
              <span key={String(l)} style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11,
                padding: '11px 12px', minWidth: 0,
              }}>
                <span className="tnum" style={{ display: 'block', fontSize: 23, fontWeight: 700, letterSpacing: '-.02em', color: C.navy }}>{v}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1 }}>{l}</span>
              </span>
            ))}
          </div>
          <button onClick={() => a.go('orgs')} style={{
            marginTop: 14, background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff',
            borderRadius: 10, height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', width: '100%',
          }}>{tr.home.togetherCta}</button>
        </section>
      </div>

      {/* ---- Katlanan bölüm: operasyonların tamamı --------------------------
          Kaldırılmadı, KATLANDI. Ana sayfa artık yönlendirme ekranı ama "tüm
          operasyonlar"a gidilecek başka bir yer yok; arama ve süzgeçlerle birlikte
          burada, kapalı duruyor. */}
      {showAll && (
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: mob ? '1fr' : 'minmax(0,1.9fr) minmax(290px,1fr)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 240px', minWidth: 180, background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: '0 13px', height: 40 }}>
              <Ico n="search" size={15} color={C.muted2} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.dash.searchPh} aria-label={tr.dash.searchPh}
                type="search" autoComplete="off"
                style={{ border: 0, background: 'none', outline: 'none', fontSize: 13.5, color: C.navy, width: '100%', minWidth: 0 }} />
            </label>
            <span className="tnum" style={{ fontSize: 12.5, color: C.muted2, fontWeight: 500 }}>{tr.dash.countLabel(visible.length, ov.disasters.length)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setType('')} style={chipStyle(type === '')}>{tr.dash.allTypes}</button>
            {presentTypes.map((t) => (
              <button key={t} onClick={() => setType(t)} style={chipStyle(type === t)}>{disasterTypeLabel[t]}</button>
            ))}
            {/* A checkbox, not a chip. The type chips above are a single choice — one of
                them is always on — while this is an independent on/off, and a filled chip
                said "selected" in exactly the same visual language as the chip next to it.
                A checkbox states its own state without relying on colour (rules/04
                §Accessibility: never communicate status with colour alone). */}
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40,
              padding: '0 13px 0 11px', borderRadius: 20, cursor: 'pointer',
              background: C.surface, border: `1px solid ${onlyActive ? C.navy : C.borderSoft}`,
              fontSize: 13, fontWeight: 600, color: C.heading2, whiteSpace: 'nowrap',
            }}>
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)}
                style={{ width: 17, height: 17, accentColor: C.navy, cursor: 'pointer' }} />
              {tr.dash.onlyActive}
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveDot /><h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.navy }}>{tr.dash.opsTitle}</h2>
          </div>

          {visible.length === 0 ? (
            <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading2 }}>{tr.dash.noMatch}</div>
              <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>{tr.dash.noMatchBody}</div>
            </div>
          ) : mob ? (
            // Mobile: compact rows. Remaining-needs count is the largest element.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((c) => {
                const d = c.disaster;
                const active = d.status === 'Active';
                const p = worstPriority(c);
                return (
                  <article key={d.id} style={{
                    ...panel, borderTop: `3px solid ${active ? (PRI[p] ?? PRI.Normal).bar : C.success}`,
                    padding: 13, display: 'flex', flexDirection: 'column', gap: 10, opacity: active ? 1 : .85,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                        <span style={{ paddingTop: 2 }}><Ico n={DISASTER_ICON[d.type]} size={17} color={active ? C.emergency : C.muted2} /></span>
                        <div style={{ minWidth: 0 }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} style={{
                            background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                            fontSize: 15.5, fontWeight: 700, color: C.navy,
                          }}>{d.name}</button>
                          <div style={{ fontSize: 12, color: C.muted2, marginTop: 1 }}>{d.region} · {tr.common.updated(d.updatedLabel)}</div>
                        </div>
                      </div>
                      {active ? <PriorityBadge p={p} /> : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '3px 9px',
                          fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: C.successText,
                          background: '#EAF7EF', border: '1px solid #C9E9D6',
                        }}><Ico n="completed" size={12} />{d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived}</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                      <MetricCell accent={C.navy} value={c.activeNeeds} label={tr.dash.cardNeeds} onClick={() => a.openDisaster(d.slug, 'needs')} />
                      <MetricCell accent={C.warning} value={c.pendingSubs} label={tr.dash.cardPending} onClick={() => a.openDisaster(d.slug, 'activity')} />
                      <MetricCell accent={C.success} value={c.verifiedSubs} label={tr.dash.totals.verified} onClick={() => a.openDisaster(d.slug, 'activity')} />
                      <MetricCell accent={C.info} value={c.deliveryPoints} label={tr.dash.cardPoints} onClick={() => a.openDisaster(d.slug, 'locations')} />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={panel}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr>
                    <th style={th}>{tr.dash.thOperation}</th>
                    <th style={th}>{tr.dash.thPriority}</th>
                    <th style={th}>{tr.dash.thRemaining}</th>
                    <th style={th}>{tr.dash.thVerified}</th>
                    <th style={th}>{tr.dash.thPending}</th>
                    <th style={th} scope="col"><span style={srOnly}>{tr.dash.openShort}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c, i, arr) => {
                    const d = c.disaster;
                    const active = d.status === 'Active';
                    const p = worstPriority(c);
                    const bar = (PRI[p] ?? PRI.Normal).bar;
                    const totalNeeds = c.activeNeeds + c.completedNeeds;
                    const pct = totalNeeds > 0 ? Math.round((c.completedNeeds / totalNeeds) * 100) : 0;
                    const last = i === arr.length - 1;
                    return (
                      <tr key={d.id} style={{ opacity: active ? 1 : .85 }}>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ paddingTop: 2 }}><Ico n={DISASTER_ICON[d.type]} size={16} color={active ? C.emergency : C.muted2} /></span>
                            <div style={{ minWidth: 0 }}>
                              {/* The name is the primary link to the operation. */}
                              <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                                background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer',
                                fontSize: 14.5, fontWeight: 700, color: C.navy,
                              }}>{d.name}</button>
                              <div className="tnum" style={{ fontSize: 12, color: C.muted2, marginTop: 1 }}>
                                {d.region} · {tr.common.updated(d.updatedLabel)} · {tr.dash.openedAt(formatDate(d.openedAt))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          {active ? <PriorityBadge p={p} /> : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 20, padding: '3px 9px',
                              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: C.successText,
                              background: '#EAF7EF', border: '1px solid #C9E9D6',
                            }}><Ico n="completed" size={12} />{d.status === 'Resolved' ? tr.dash.resolved : tr.dash.archived}</span>
                          )}
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, minWidth: 150 }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                            background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%',
                          }}>
                            <span className="tnum" style={{ fontSize: 19, fontWeight: 700, color: bar, letterSpacing: '-.02em' }}>{c.activeNeeds}</span>
                            <span style={{ fontSize: 12, color: C.muted, marginLeft: 5 }}>{tr.dash.needsWord}</span>
                            {/* A bar never stands alone — the closed/total count is written out.
                                With nothing closed yet the bar carries no information, so only
                                the sentence is shown; an always-empty track is just noise. */}
                            {c.completedNeeds > 0 && (
                              <span style={{ display: 'block', maxWidth: 130, marginTop: 5 }}>
                                <ProgressBar pct={pct} color={active ? C.success : C.muted3} height={6} />
                              </span>
                            )}
                            <span className="tnum" style={{ display: 'block', fontSize: 11, color: C.muted2, marginTop: 3 }}>
                              {tr.dash.needsClosed(c.completedNeeds, totalNeeds)}
                            </span>
                          </button>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: C.success }}>{c.verifiedSubs}</span>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                          <button onClick={() => a.openDisaster(d.slug, 'activity')} className="hv-navy" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                            <span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: C.warning }}>{c.pendingSubs}</span>
                          </button>
                        </td>
                        <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, textAlign: 'right' }}>
                          <button onClick={() => a.openDisaster(d.slug, 'needs')} className="hv-navy" style={{
                            background: active ? G.navyBtn : C.surface, border: `1px solid ${active ? C.navy : C.borderSoft}`,
                            color: active ? '#fff' : C.navy, borderRadius: 9, padding: '0 14px', height: 38,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>{tr.dash.openShort}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* The feed sits under the operations table — the table still owns the first
              screen — but it is open when the page loads. */}
          <div style={panel}>
            <button onClick={() => setFeedOpen((v) => !v)} aria-expanded={feedOpen} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: 'none', border: 0, padding: '13px 14px', cursor: 'pointer', minHeight: 48,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LiveDot color={C.success} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading2 }}>{tr.dash.feedToggle(ov.log.length)}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: C.info }}>
                {feedOpen ? tr.dash.feedClose : tr.dash.feedOpen}
                <span style={{ display: 'block', transform: feedOpen ? 'rotate(180deg)' : undefined }}><Ico n="down" size={14} color={C.info} /></span>
              </span>
            </button>
            {feedOpen && (
              <div style={{ padding: '0 14px 12px' }}>
                <div style={{ fontSize: 11.5, color: C.muted2, paddingBottom: 6 }}>{tr.dash.feedNote}</div>
                {ov.log.slice(0, 10).map((e, i, arr) => (
                  <div key={e.id} style={{
                    display: 'grid', gridTemplateColumns: '42px 12px 1fr', gap: 9, padding: '9px 0',
                    borderTop: i === 0 ? 0 : `1px solid ${C.borderFaint}`,
                  }}>
                    <span className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, paddingTop: 1 }}>{clockLabel(agoMinutes(e.time)) || '·'}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color, marginTop: 5, flex: '0 0 9px' }} />
                      {i < arr.length - 1 && <span style={{ flex: 1, width: 2, background: C.borderFaint, marginTop: 3 }} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{e.action}</span>
                      {/* The actor arrives already masked from the database ("Köksal F.");
                          there is no full name in this response to shorten here. */}
                      <span style={{ display: 'block', fontSize: 12.5, color: C.muted2 }}>
                        {e.user && <span style={{ color: C.heading2, fontWeight: 600 }}>{e.user}</span>}
                        {e.user && ' · '}{e.detail} · {e.time}
                      </span>
                      {e.disasterName && (
                        e.disasterSlug ? (
                          <button onClick={() => a.openDisaster(e.disasterSlug, 'activity')}
                            aria-label={`${e.disasterName} operasyonunu aç`} className="hv-navy" style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.heading2,
                              background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '3px 9px',
                              marginTop: 4, cursor: 'pointer', minHeight: 24,
                            }}><Ico n="pin" size={11} color={C.muted} />{e.disasterName}</button>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: C.heading2,
                            background: G.chip, border: `1px solid ${C.borderFaint}`, borderRadius: 20, padding: '2px 8px', marginTop: 4,
                          }}><Ico n="pin" size={11} color={C.muted} />{e.disasterName}</span>
                        )
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: the two things that are cross-operation by nature. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <section style={{ ...panel, background: G.criticalPanel, border: '1px solid #F3DADA' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px', borderBottom: '1px solid #F3DADA' }}>
              <LiveDot /><span style={eyebrow}>{tr.dash.urgentTitle}</span>
            </div>
            {ov.urgent.map((n, i, arr) => (
              <button key={`${n.disasterId}-${n.id}`} onClick={() => a.openDisaster(n.disasterSlug, 'needs')} className="hv-navy" style={{
                textAlign: 'left', width: '100%', background: 'none', border: 0,
                borderBottom: i === arr.length - 1 ? 0 : '1px solid #F6E7E7',
                borderLeft: `3px solid ${(PRI[n.priority] ?? PRI.Normal).bar}`,
                padding: '10px 12px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
              }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: C.navy }}>
                    <Ico n={categoryIcon(n.cat)} size={14} color={(PRI[n.priority] ?? PRI.Normal).bar} />{n.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.muted2, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <Ico n="pin" size={11} color={C.muted3} />{n.disasterName}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="tnum" style={{ display: 'block', fontSize: 18, fontWeight: 700, color: (PRI[n.priority] ?? PRI.Normal).bar, letterSpacing: '-.02em' }}>{n.remaining}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{n.unit} {tr.disaster.remainingWord}</span>
                </span>
              </button>
            ))}
            <div style={{ fontSize: 11.5, color: C.muted2, padding: '10px 14px', borderTop: '1px solid #F6E7E7' }}>{tr.common.remainingUnchanged}</div>
          </section>

          {/* Community reports: a claim count, not a verified fact. Duplicates about
              the same event are merged, so this is "n kişi bildirdi", not n rows.
              At COMMUNITY_THRESHOLD confirmations the report opens an operation by
              itself — which is exactly why confirming asks who you are. */}
          <section style={{ ...panel, border: '1px solid #F2DFA8' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid #F2DFA8', background: '#FFFDF4' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ico n="critical" size={15} color={C.warningText} />
                <span style={eyebrow}>{tr.dashReports.title}</span>
              </span>
              <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{ov.reports.length}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted2, padding: '8px 14px 0' }}>{tr.dashReports.note}</div>
            {ov.reports.length > 0 ? ov.reports.slice(0, 3).map((r) => {
              const left = Math.max(0, COMMUNITY_THRESHOLD - r.reportCount);
              return (
                <div key={r.id} style={{ padding: '10px 14px', borderTop: `1px solid ${C.borderFaint}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.navy }}>
                        {[r.province, r.district].filter(Boolean).join(' / ')}
                      </span>
                      <span className="tnum" style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1 }}>
                        {disasterTypeLabel[r.type]} · {formatDate(r.occurredOn)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="tnum" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: C.warning }}>{r.reportCount}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{tr.dashReports.reportedWord}</span>
                    </span>
                  </div>
                  {/* How far the report is from opening an operation by itself. Stated in
                      reports, not as a progress bar without a figure (rules/04). */}
                  {left > 0 && (
                    <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{tr.dashReports.toThreshold(left)}</span>
                  )}
                  <button onClick={() => setConfirming(r)} className="hv-navy" style={{
                    alignSelf: 'flex-start', background: C.surface, border: `1px solid ${C.borderSoft}`,
                    color: C.navy, borderRadius: 8, padding: '0 12px', height: 38, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}>{tr.dashReports.confirm}</button>
                </div>
              );
            }) : <div style={{ fontSize: 13, color: C.muted, padding: '10px 14px' }}>{tr.dashReports.empty}</div>}
            <div style={{ fontSize: 11.5, color: C.muted2, padding: '9px 14px 0', borderTop: `1px solid ${C.borderFaint}` }}>
              {tr.dashReports.thresholdNote(COMMUNITY_THRESHOLD)}
            </div>
            <div style={{ padding: '11px 14px', borderTop: `1px solid ${C.borderFaint}` }}>
              <button onClick={a.openDisasterForm} style={{
                background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
                height: 44, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', width: '100%',
              }}>{tr.dashReports.all}</button>
            </div>
          </section>

          <button onClick={() => a.go('howItWorks')} className="hv-navy" style={{
            ...panel, background: G.surfaceSoft, textAlign: 'left', cursor: 'pointer',
            padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <span>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.navy }}>{tr.home.howItWorks}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 1 }}>{tr.home.howItWorksBody}</span>
            </span>
            <Ico n="chev" size={16} color={C.muted2} />
          </button>
        </div>
      </div>
      )}

      {/* ---- Topluluk bildirimleri: tam genişlik, dört sütun -----------------
          Bir iddia sayısıdır, doğrulanmış bir olgu DEĞİL. Aynı olaya dair bildirimler
          birleştirilir, yani bu "n satır" değil "n kişi bildirdi". Eşiği geçtiğinde
          bildirim operasyonu kendiliğinden açar — teyit ederken kim olduğunuzun
          sorulmasının sebebi tam olarak budur. */}
      <section style={{ ...panel, padding: '16px 17px 17px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: '-.01em', color: C.navy }}>{tr.dashReports.title}</h2>
          <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, background: C.chipNavyBg, color: C.text, borderRadius: 20, padding: '1px 8px' }}>{ov.reports.length}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted2 }}>{tr.dashReports.note}</span>
        </div>
        {ov.reports.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{tr.dashReports.empty}</p>
        ) : (
          <div style={{
            display: 'grid', gap: 11,
            // Sütun sayısı bildirim sayısı kadar, en fazla dört: iki bildirim varken
            // dört sütunluk bir ızgara, ikisi de yarım kalmış gibi görünüyordu.
            gridTemplateColumns: mob ? '1fr' : `repeat(${Math.min(ov.reports.length, 4)}, minmax(0,1fr))`,
          }}>
            {ov.reports.slice(0, 4).map((r) => {
              const left = Math.max(0, COMMUNITY_THRESHOLD - r.reportCount);
              return (
                <article key={r.id} style={{
                  border: '1px solid #F2DFA8', background: '#FFFDF4', borderRadius: 12,
                  padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
                }}>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: C.navy }}>
                        {[r.province, r.district].filter(Boolean).join(' / ')}
                      </span>
                      <span className="tnum" style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1 }}>
                        {disasterTypeLabel[r.type]} · {formatDate(r.occurredOn)}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="tnum" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: C.warning }}>{r.reportCount}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.muted }}>{tr.dashReports.reportedWord}</span>
                    </span>
                  </span>
                  {/* Eşiğe ne kadar kaldığı SAYIYLA yazılır; rakamsız bir ilerleme
                      çubuğu "ne kadar" sorusunu yanıtsız bırakır (rules/04). */}
                  {left > 0 && (
                    <span className="tnum" style={{ fontSize: 11.5, color: C.muted2 }}>{tr.dashReports.toThreshold(left)}</span>
                  )}
                  <button onClick={() => setConfirming(r)} className="hv-navy" style={{
                    marginTop: 'auto', background: C.surface, border: `1px solid ${C.borderSoft}`,
                    color: C.navy, borderRadius: 9, height: 38, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}>{tr.dashReports.confirm}</button>
                </article>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 11.5, color: C.muted2, flex: '1 1 260px' }}>{tr.dashReports.thresholdNote(COMMUNITY_THRESHOLD)}</span>
          <button onClick={a.openDisasterForm} style={{
            background: G.emergencyBtn, border: '1px solid #BE2A31', color: '#fff', borderRadius: 10,
            height: 44, padding: '0 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>{tr.dashReports.all}</button>
        </div>
      </section>

      {/* ---- Güven bilgilendirmesi ------------------------------------------ */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', background: '#F2F7FC',
        border: '1px solid #D6E6F5', borderRadius: 12, padding: '14px 16px',
      }}>
        <span style={{ paddingTop: 1, flex: '0 0 auto' }}><Ico n="verified" size={19} color={C.info} /></span>
        <span>
          <b style={{ display: 'block', fontSize: 13.5, color: C.heading2 }}>{tr.home.trustTitle}</b>
          <span style={{ display: 'block', fontSize: 13, color: C.text, marginTop: 3 }}>{tr.home.trustBody}</span>
        </span>
      </div>

      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: C.muted2, margin: 0, paddingTop: 10, borderTop: `1px solid ${C.borderFaint}` }}>
        {tr.home.disclaimer}
      </p>

      {confirming && <ReportConfirmModal report={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}
