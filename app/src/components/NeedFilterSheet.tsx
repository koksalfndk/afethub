import { useEffect } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, G } from '../theme';
import { Chip, Ico, filterPickerStyle, srOnly } from '../ui';
import { Picker, toOptions } from './Picker';
import type { Filter } from '../store';

// Mobile filter sheet for the needs list.
//
// On a phone the desktop filter block wrapped into two ragged rows of chips and selects
// that pushed the first need card below the fold, and nothing said what any of them was
// for. Here the same controls are grouped by the question they answer — how urgent,
// which category and drop-off point, how fresh — with the group heading carrying that
// question in words. Same store actions, so a filter set on mobile is the same filter on
// desktop; this is presentation only.
//
// The sheet is a real dialog: Escape closes it, the backdrop closes it, and it is
// labelled. Body scroll is locked while it is open so the list behind cannot drift.

const FILTERS: Filter[] = ['All', 'Critical', 'Urgent', 'Normal', 'Completed'];

// Which of the sheet's own controls are engaged. The free-text search is deliberately
// excluded — it stays visible in the bar outside the sheet, so counting it here would
// mean a badge the user cannot clear from inside.
export function activeFilterCount(a: ReturnType<typeof useApp>): number {
  return (a.filter !== 'All' ? 1 : 0)
    + (a.catFilter ? 1 : 0)
    + (a.locFilter ? 1 : 0)
    + (a.onlyCritical ? 1 : 0)
    + (a.updatedToday ? 1 : 0);
}

function Group({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: C.surface, border: `1px solid ${C.borderFaint}`, borderRadius: 11, padding: '12px 13px 13px',
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.muted3, marginTop: 2, marginBottom: 10 }}>{hint}</div>
      {children}
    </section>
  );
}

export function NeedFilterSheet({ open, onClose, categories, dropOffs, shown, total }: {
  open: boolean;
  onClose: () => void;
  categories: string[];
  dropOffs: string[];
  shown: number;
  total: number;
}) {
  const a = useApp();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  const count = activeFilterCount(a);

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(11,30,48,.42)', zIndex: 60,
      }} />
      <div role="dialog" aria-modal="true" aria-label={tr.disaster.filtersMore.sheetTitle} style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
        background: C.canvas, borderTop: `1px solid ${C.border}`,
        borderRadius: '16px 16px 0 0', boxShadow: '0 -14px 40px rgba(16,42,67,.22)',
        maxHeight: '86vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '13px 14px', borderBottom: `1px solid ${C.borderFaint}`, background: C.surface,
          borderRadius: '16px 16px 0 0',
        }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: C.navy }}>{tr.disaster.filtersMore.sheetTitle}</span>
          <button onClick={onClose} aria-label={tr.disaster.filtersMore.close} style={{
            width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, cursor: 'pointer',
          }}><Ico n="close" size={17} /></button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <Group label={tr.disaster.filtersMore.groupPriority} hint={tr.disaster.filtersMore.groupPriorityHint}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <Chip key={f} label={tr.disaster.filters[f]} active={a.filter === f} onClick={() => a.setFilter(f)} />
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <Chip label={tr.disaster.filtersMore.onlyCritical} active={a.onlyCritical}
                onClick={a.toggleOnlyCritical} accent={C.emergency} />
            </div>
          </Group>

          <Group label={tr.disaster.filtersMore.groupScope} hint={tr.disaster.filtersMore.groupScopeHint}>
            <div style={{ display: 'grid', gap: 8 }}>
              <Picker value={a.catFilter} onChange={a.setCatFilter} style={filterPickerStyle}
                ariaLabel={tr.disaster.filtersMore.allCategories} placeholder={tr.disaster.filtersMore.allCategories}
                options={[{ value: '', label: tr.disaster.filtersMore.allCategories }, ...toOptions(categories)]} />
              <Picker value={a.locFilter} onChange={a.setLocFilter} style={filterPickerStyle}
                ariaLabel={tr.disaster.filtersMore.allLocations} placeholder={tr.disaster.filtersMore.allLocations}
                options={[{ value: '', label: tr.disaster.filtersMore.allLocations }, ...toOptions(dropOffs)]} />
              <div><Chip label={tr.disaster.filtersMore.myArea} active={false} onClick={() => {}} disabled /></div>
            </div>
          </Group>

          <Group label={tr.disaster.filtersMore.groupTime} hint={tr.disaster.filtersMore.groupTimeHint}>
            <Chip label={tr.disaster.filtersMore.updatedToday} active={a.updatedToday} onClick={a.toggleUpdatedToday} />
          </Group>
        </div>

        {/* The result count sits on the confirm button: on a phone the list is hidden
            behind the sheet, so the effect of a filter has to be readable here. */}
        <div style={{
          padding: '11px 14px calc(11px + env(safe-area-inset-bottom, 0px))',
          borderTop: `1px solid ${C.borderFaint}`, background: C.surface,
          display: 'flex', gap: 9, alignItems: 'center',
        }}>
          {count > 0 && (
            <button onClick={a.clearFilters} style={{
              background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
              height: 48, padding: '0 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{tr.disaster.filtersMore.clear}</button>
          )}
          <button onClick={onClose} style={{
            flex: 1, background: shown > 0 ? G.navyBtn : C.borderSoft, border: 0,
            color: shown > 0 ? '#fff' : C.muted, borderRadius: 10, height: 48,
            fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
          }}>
            {shown > 0 ? tr.disaster.filtersMore.apply(shown) : tr.disaster.filtersMore.applyEmpty}
          </button>
        </div>
        <span style={srOnly}>{tr.disaster.filtersMore.count(shown, total)}</span>
      </div>
    </>
  );
}
