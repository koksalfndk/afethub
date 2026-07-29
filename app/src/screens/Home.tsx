import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C } from '../theme';
import { enrichSorted, cols } from '../select';
import { Btn, PriorityBadge, ProgressBar } from '../ui';

export function Home() {
  const a = useApp();
  if (!a.snap) return null;
  const mob = a.device === 'mobile';
  const L = cols(mob);
  const needs = enrichSorted(a.snap.needs);
  const topNeeds = needs.slice(0, 3);
  const activeNeeds = needs.filter((n) => n.remaining > 0).length;
  const pending = a.snap.subs.filter((s) => s.status === 'Pending verification').length;

  const heroStats = [
    { value: activeNeeds, label: tr.home.heroStats.activeNeeds },
    { value: a.snap.verifiedTotal, label: tr.home.heroStats.verifiedDeliveries },
    { value: pending, label: tr.home.heroStats.awaiting },
  ];
  const disasterStats = [
    { value: `${activeNeeds} aktif`, label: 'İhtiyaç', color: C.navy },
    { value: a.snap.verifiedTotal, label: 'Doğrulanan teslimat', color: C.success },
    { value: pending, label: 'Bekleyen', color: C.warning },
    { value: 2, label: 'Teslim noktası', color: C.navy },
  ];
  const steps = [
    { n: '1', title: 'Koordinatörler bir ihtiyaç yayınlar', body: 'Ürün, gerekli miktar, öncelik ve teslim noktası.' },
    { n: '2', title: 'Herkes bir teslimat bildirir', body: 'Hesap yok. Ad, e-posta, telefon ve şehir yeterli.' },
    { n: '3', title: 'Koordinatör girişte doğrular', body: 'Tam, kısmi veya reddedilmiş — kayda geçen bir gerekçeyle.' },
    { n: '4', title: 'Kalan anında güncellenir', body: 'Kalan = gerekli − doğrulanan. Bekleyen asla sayılmaz.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: L.heroPad, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 260 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '5px 11px', fontSize: 12.5, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.emergency, animation: 'afetPulse 1.8s infinite' }} />{tr.home.activeBadge}
          </span>
          <h1 style={{ fontSize: L.h1, lineHeight: 1.08, letterSpacing: '-.025em', fontWeight: 700, margin: '16px 0 0', color: C.navy }}>{tr.home.heroTitle1}<br />{tr.home.heroTitle2}</h1>
          <p style={{ fontSize: 16, color: C.text, margin: '14px 0 0', maxWidth: '46ch' }}>{tr.home.heroBody}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Btn variant="emergency" className="hv-emergency" onClick={() => a.go('disaster', { tab: 'needs' })}>{tr.home.viewNeeds}</Btn>
            <Btn variant="secondary" className="hv-navy" onClick={() => a.go('report')}>{tr.home.reportAid}</Btn>
          </div>
          <div style={{ display: 'flex', gap: 22, marginTop: 24, flexWrap: 'wrap' }}>
            {heroStats.map((h) => (
              <div key={h.label}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{h.value}</div>
                <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{h.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 260, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted }}>{tr.home.mostUrgent}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {topNeeds.map((n) => (
              <button key={n.id} onClick={() => a.prefillReport(n.id, n.unit, n.loc)} className="hv-navy" style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 13px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: C.navy }}>{n.name}</span>
                  <PriorityBadge p={n.priority} />
                </span>
                <ProgressBar pct={n.pctVal} color={n.barColor} height={6} />
                <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>{tr.home.stillNeeded(n.remaining, n.unit)} · {tr.home.verifiedOf(n.verified, n.required)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: C.navy }}>{tr.home.activeDisasters}</h2>
          <span style={{ fontSize: 13, color: C.muted }}>{tr.common.updated(a.snap.disaster.updatedLabel)}</span>
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: L.card }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>{a.snap.disaster.name}</div>
                <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3 }}>{a.snap.disaster.region}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEF3F2', color: C.emergency, border: '1px solid #F6C9C9', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.emergency }} />{tr.home.active}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
              {disasterStats.map((s) => (
                <div key={s.label} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: C.muted2 }}>{tr.common.updated(a.snap.disaster.updatedLabel)}</span>
              <button onClick={() => a.go('disaster', { tab: 'overview' })} style={{ background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>{tr.home.openCoordination}</button>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px dashed ${C.borderSoft}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.heading2 }}>{tr.home.noOtherTitle}</div>
            <div style={{ fontSize: 13.5, color: C.muted }}>{tr.home.noOtherBody}</div>
            <button onClick={() => a.go('system')} style={{ alignSelf: 'flex-start', marginTop: 6, background: 'none', border: 0, padding: 0, fontSize: 13.5, fontWeight: 600, color: C.navy, cursor: 'pointer', textDecoration: 'underline' }}>{tr.home.howVerification}</button>
          </div>
        </div>
      </section>

      <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: C.navy }}>{tr.home.howItWorks}</h2>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '0 0 16px' }}>{tr.home.howItWorksBody}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: L.card }}>
          {steps.map((s) => (
            <div key={s.n} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: C.canvas }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.navy, color: '#fff', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 10, color: C.navy }}>{s.title}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
