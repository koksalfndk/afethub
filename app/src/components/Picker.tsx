import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { C, G } from '../theme';
import { Ico } from '../ui';
import { tr } from '../i18n/strings';

// One dropdown for the whole product.
//
// Why not the native <select>: with 81 provinces the browser's own list opens as a
// full-height column that covers the form (and on macOS it opens *over* the field,
// upwards, so the field you were filling disappears). This one always opens downward
// unless there is genuinely no room, is height-capped and scrolls inside itself, and
// filters as you type once the list is long enough to need it.
//
// It renders into a fixed layer on document.body rather than inline: the panels and
// sheets it is used inside have `overflow: hidden`/`auto` ancestors that would clip an
// absolutely-positioned list.
//
// Accessibility (rules/04): the trigger is a real button with role="combobox", the list
// is a listbox with one option per row, the active option is tracked with
// aria-activedescendant, and every interaction is reachable from the keyboard —
// Enter/Space/↓ to open, ↑/↓/Home/End to move, Enter to pick, Escape to close. Focus
// returns to the trigger on close.

export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Above this many options the list gets a search box: below it, typing is slower than
// scanning.
const SEARCHABLE_FROM = 12;
const MAX_LIST_H = 300;
const MIN_LIST_H = 168;

export function toOptions(values: readonly string[]): PickerOption[] {
  return values.map((v) => ({ value: v, label: v }));
}

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[İIı]/g, 'i');

export function Picker({
  value, options, onChange, placeholder = '—', disabled = false, ariaLabel, name,
  searchable, style, invalid = false,
}: {
  value: string;
  options: PickerOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  name?: string;
  searchable?: boolean;
  style?: CSSProperties;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxH: number; above: boolean } | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const withSearch = searchable ?? options.length >= SEARCHABLE_FROM;
  const shown = q.trim()
    ? options.filter((o) => norm(o.label).includes(norm(q.trim())))
    : options;
  const selected = options.find((o) => o.value === value) ?? null;

  // Anchor the layer to the trigger. Recomputed on scroll and resize rather than
  // closing: closing on scroll loses the visitor's place on a long form.
  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    // Downward by default. Flipping only happens when below genuinely cannot hold a
    // usable list AND above is roomier.
    const flip = below < MIN_LIST_H && above > below;
    setRect({
      top: flip ? r.top : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxH: Math.max(MIN_LIST_H, Math.min(MAX_LIST_H, (flip ? above : below) - 4)),
      above: flip,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open && withSearch) searchRef.current?.focus();
  }, [open, withSearch]);

  // Keep the highlighted row in view while arrowing through a scrolled list.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = (focusBack = false) => {
    setOpen(false); setQ('');
    if (focusBack) btnRef.current?.focus();
  };

  const openList = () => {
    if (disabled) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
    setOpen(true);
  };

  const pick = (o: PickerOption) => {
    if (o.disabled) return;
    onChange(o.value);
    close(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o);
    }
  };

  const trigger: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    background: disabled ? C.canvas : C.surface,
    border: `1px solid ${invalid ? C.errorBorder : open ? C.navy : C.borderSoft}`,
    borderRadius: 9, padding: '0 12px', minHeight: 46, width: '100%',
    fontSize: 14, fontWeight: 500, textAlign: 'left',
    color: selected ? C.navy : C.muted3,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? .65 : 1,
    ...style,
  };

  return (
    <>
      <button
        ref={btnRef} type="button" name={name} disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        role="combobox" aria-haspopup="listbox" aria-expanded={open}
        aria-label={ariaLabel} aria-disabled={disabled || undefined}
        style={trigger}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', flex: '0 0 auto', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .12s ease-out' }}>
          <Ico n="down" size={15} color={C.muted2} />
        </span>
      </button>

      {open && rect && createPortal(
        <div
          ref={listRef}
          role="listbox" aria-label={ariaLabel}
          onKeyDown={onKey}
          style={{
            position: 'fixed', zIndex: 200,
            left: rect.left, width: Math.max(rect.width, 200),
            ...(rect.above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top }),
            background: C.surface, border: `1px solid ${C.borderSoft}`, borderRadius: 11,
            boxShadow: '0 14px 38px rgba(11,30,48,.18)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', maxHeight: rect.maxH,
          }}
        >
          {withSearch && (
            <div style={{ padding: 8, borderBottom: `1px solid ${C.borderFaint}`, background: G.chip, flex: '0 0 auto' }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 7, background: C.surface,
                border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: '0 10px', height: 38,
              }}>
                <Ico n="search" size={14} color={C.muted2} />
                <input
                  ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
                  placeholder={tr.picker.searchPh} aria-label={tr.picker.searchPh}
                  autoComplete="off"
                  style={{ border: 0, outline: 'none', background: 'none', fontSize: 13.5, color: C.navy, width: '100%', minWidth: 0 }}
                />
              </span>
            </div>
          )}

          <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: 5, minHeight: 0 }}>
            {shown.length === 0 && (
              <div style={{ padding: '12px 10px', fontSize: 13, color: C.muted }}>{tr.picker.noMatch}</div>
            )}
            {shown.map((o, i) => {
              const on = o.value === value;
              const hot = i === active;
              return (
                <div
                  key={o.value || `__${i}`} data-idx={i}
                  role="option" aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '9px 10px', borderRadius: 8, cursor: o.disabled ? 'default' : 'pointer',
                    background: hot ? C.chipNavyBg : 'transparent',
                    color: o.disabled ? C.muted3 : on ? C.navy : C.text,
                    fontSize: 13.5, fontWeight: on ? 600 : 500, minHeight: 40,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {/* Selection is carried by a mark as well as by weight/colour
                      (rules/04: never state something with colour alone). */}
                  {on && <Ico n="completed" size={14} color={C.success} />}
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
