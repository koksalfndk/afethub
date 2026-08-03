import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G, D } from '../theme';
import { LiveDot, Ico } from '../ui';
import { agoMinutes, clockLabel } from '../util';

// Live update strip directly under the header, on every screen and both breakpoints.
//
// It rotates through the newest audit entries every 7 s. Nothing here is invented:
// the clock comes from each entry's own relative offset (agoMinutes → clockLabel), so
// an entry whose offset is unknown shows no time rather than a plausible-looking one
// (rules/01 §Freshness, and the standing rule against faking live data).
//
// Accessibility: this is a rotating view of records that are already published on the
// pages below, not an alert. It is therefore deliberately NOT an aria-live region —
// announcing a new line every 7 s would talk over whatever the visitor is reading.
// The region is labelled and the full, static list stays available in the collapsible
// feed on the dashboard, which is the screen-reader path (rules/04 §Accessibility).
const ROTATE_MS = 7000;
const MAX_ITEMS = 8;

export function LiveTicker() {
  const a = useApp();
  const mob = a.device === 'mobile';
  const entries = (a.overview?.log ?? []).slice(0, MAX_ITEMS);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || entries.length < 2) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((v) => (v + 1) % entries.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [i, paused, entries.length]);

  if (entries.length === 0) return null;
  const e = entries[i % entries.length];
  const clock = clockLabel(agoMinutes(e.time));

  return (
    <div
      aria-label={tr.ticker.label}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      style={{
        background: G.opsBar, color: D.fg2, borderBottom: `1px solid ${C.navy}`,
        display: 'flex', alignItems: 'center', gap: mob ? 8 : 12,
        padding: mob ? '7px 13px' : '7px 22px', fontSize: mob ? 11.5 : 12.5,
        overflow: 'hidden', minHeight: mob ? 32 : 34,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
        <LiveDot color="#4ADE80" size={6} />
        {!mob && (
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: D.muted }}>
            {tr.ticker.label}
          </span>
        )}
      </span>

      {/* key={e.id} restarts the fade on every rotation. */}
      <span key={e.id} className="anim-in" style={{
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1,
      }}>
        {clock && <span className="tnum" style={{ color: '#fff', fontWeight: 700, flex: '0 0 auto' }}>{clock}</span>}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.color, flex: '0 0 7px' }} />
        <span style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.action}</span>
        <span style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{e.detail}</span>
        {e.disasterName && !mob && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
            background: D.rowBg, border: `1px solid ${D.rowBd}`, borderRadius: 20, padding: '1px 8px',
            fontSize: 11, fontWeight: 600, color: D.fg,
          }}><Ico n="pin" size={10} color={D.muted} />{e.disasterName}</span>
        )}
      </span>

      {/* Position indicator doubles as the manual control: the strip is skippable. */}
      <span style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
        {entries.map((x, idx) => (
          <button key={x.id} onClick={() => setI(idx)} aria-label={`${idx + 1} / ${entries.length}`}
            aria-current={idx === i ? 'true' : undefined} style={{
              width: idx === i ? 14 : 5, height: 5, borderRadius: 20, border: 0, padding: 0, cursor: 'pointer',
              background: idx === i ? '#fff' : D.rowBd, transition: 'width .18s ease-out',
            }} />
        ))}
      </span>
    </div>
  );
}
