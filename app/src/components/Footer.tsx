import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico } from '../ui';

// Site footer. Carries the civil-coordination disclaimer on every page, not only on
// the pages that happen to mention it (rules/03 §Legal and Safety Disclaimer).
export function Footer() {
  const a = useApp();
  const mob = a.device === 'mobile';

  const link = (label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      background: 'none', border: 0, padding: '5px 0', textAlign: 'left',
      fontSize: 13.5, color: C.text, cursor: 'pointer',
    }}>{label}</button>
  );

  const col = (title: string, items: { label: string; onClick: () => void }[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted2, marginBottom: 6 }}>{title}</div>
      {items.map((i) => link(i.label, i.onClick))}
    </div>
  );

  return (
    <footer style={{ background: G.surfaceSoft, borderTop: `1px solid ${C.border}`, padding: mob ? '22px 14px 26px' : '28px 28px 32px' }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 380 }}>
          <img src="/logo_horizontal.png" alt={tr.brand} style={{ height: 30, width: 'auto', display: 'block' }} />
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: C.muted, margin: '10px 0 0' }}>{tr.footer.blurb}</p>
          <div style={{
            marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`,
            borderLeft: `3px solid ${C.emergency}`, borderRadius: 9, padding: '9px 11px',
            fontSize: 12, fontWeight: 600, color: C.errorText, display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span style={{ paddingTop: 1 }}><Ico n="critical" size={14} /></span>
            {tr.footer.emergency}
          </div>
        </div>

        {col(tr.footer.platform, [
          { label: tr.nav.activeDisasters, onClick: () => a.go('home') },
          { label: tr.nav.orgs, onClick: () => a.go('orgs') },
          { label: tr.nav.howItWorks, onClick: () => a.go('system') },
          { label: tr.footer.about, onClick: () => a.go('about') },
        ])}

        {col(tr.footer.contribute, [
          { label: tr.reportDisaster.title, onClick: a.openDisasterForm },
          { label: tr.header.track, onClick: () => a.go('track') },
          { label: tr.nav.orgs, onClick: () => a.go('orgs') },
        ])}
      </div>

      <div style={{
        marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.borderFaint}`,
        display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between',
        fontSize: 11.5, color: C.muted2,
      }}>
        <span>{tr.footer.copyright}</span>
        <span>{tr.footer.dataNote}</span>
      </div>
    </footer>
  );
}
