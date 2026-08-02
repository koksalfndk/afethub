import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr } from '../i18n/strings';
import { C, PRI } from '../theme';
import { Ico } from '../ui';
import { OPERATION_STAGES, MAX_FEATURED_NEEDS, looksLikeContactDetails, pickFeaturedNeeds } from '../data';
import { enrichSorted } from '../select';
import type { Disaster, DisasterInput, OperationStage } from '../types';

// ---------------------------------------------------------------------------
// Faz 3-A — koordinatörün operasyon yönetim araçları.
//
// Üçü de mevcut sunucu yollarını kullanıyor: `set_operation_stage()`,
// `set_featured_needs()` ve durum özeti için mevcut `saveDisaster` yolu. Yeni
// migration YOK. Yetki ve denetim kaydı sunucuda; buradaki düğmeler yalnızca
// reddedilecek bir çağrıyı önceden engelliyor (rules/03 §Server-Side Authorization).
//
// Fotoğraf yönetimi, teslim sözü listesi ve public teslim akışları bu dosyada
// BİLEREK yok — Faz 3-B.
// ---------------------------------------------------------------------------

const PANEL = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
};
const LABEL = { display: 'block', fontSize: 12.5, fontWeight: 600, color: C.heading2, marginBottom: 5 };
const HELP = { fontSize: 12, color: C.muted2, margin: '4px 0 0', lineHeight: 1.45 };
const FIELD = {
  width: '100%', border: `1px solid ${C.borderSoft}`, borderRadius: 9, padding: '10px 12px',
  fontSize: 14, color: C.navy, background: C.surface, minHeight: 44, font: 'inherit' as const,
};
const BTN_PRIMARY = {
  background: C.navy, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 9,
  padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44,
};
const BTN_QUIET = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 9,
  padding: '12px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44,
};
const BTN_TINY = {
  background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 8,
  width: 44, height: 44, cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1,
};

// Hata metni renkle değil, metinle ve bir simgeyle taşınıyor (rules/04).
function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} role="alert" style={{
      display: 'flex', gap: 6, alignItems: 'flex-start', margin: '6px 0 0',
      fontSize: 12.5, color: C.errorText,
    }}>
      <span style={{ paddingTop: 1 }}><Ico n="critical" size={13} color={C.errorText} /></span>{text}
    </p>
  );
}

// Çift gönderim kilidi — `useState` DEĞİL, `useRef`.
//
// ÖLÇÜLDÜ (02-08-2026, canlı doğrulama): aynı tick içinde iki kez tıklandığında
// `if (busy) return` koruması geçildi ve sunucuya İKİ RPC çağrısı gitti; denetim
// kaydında aynı milisaniyede iki satır oluştu (intensive→cooling ve cooling→cooling).
// Sebebi React state'inin asenkron olması: ikinci tıklamada `busy` hâlâ `false`.
// `ref.current` ise anında değişir, dolayısıyla ikinci çağrı gerçekten durur.
function useSubmitLock() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await fn(); } finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}

function DemoNote() {
  const a = useApp();
  if (a.backend !== 'local') return null;
  return (
    <p style={{
      margin: '10px 0 0', fontSize: 12, color: C.warningText, background: '#FFFDF4',
      border: '1px solid #F2DFA8', borderRadius: 8, padding: '8px 10px',
    }}>{tr.coordOps2.demoNote}</p>
  );
}

// ---------------------------------------------------------------------------
// 1) Operasyon Durumu — ana kayıt durumu + halka açık aşama
// ---------------------------------------------------------------------------
const STAGE_NOTE_MAX = 300;
const STAGE_REASON_MAX = 500;

export function CoordOperationStatus({ d }: { d: Disaster }) {
  const a = useApp();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<OperationStage | ''>(d.operationStage ?? '');
  const [note, setNote] = useState(d.operationStageNote ?? '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const { busy, run } = useSubmitLock();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);

  // Form açıldığında ilk alana odaklan; kapandığında odak TETİKLEYEN düğmeye döner,
  // yoksa klavye kullanıcısı sayfanın başına savrulur (rules/04 §Accessibility).
  useEffect(() => { if (open) firstFieldRef.current?.focus(); else triggerRef.current?.focus(); }, [open]);

  const dirty = (stage || null) !== (d.operationStage ?? null)
    || note.trim() !== (d.operationStageNote ?? '').trim();

  const submit = async () => {
    setErr('');
    if (!reason.trim()) { setErr(tr.coordOps2.reasonRequired); return; }
    // Aynı aşama + aynı açıklama: sunucuya gitmeye değmez. Denetim kaydı bir olay
    // kaydıdır; hiçbir şeyin değişmediği bir satır onu gürültüye çevirir.
    if (!dirty) { setErr(tr.coordOps2.noChange); return; }
    await run(async () => {
      const ok = await a.setOperationStage(d.id, (stage || null) as OperationStage | null, note.trim(), reason.trim());
      // Hata durumunda form KAPANMAZ ve değerler durur (rules/04 §Forms).
      if (ok) { setReason(''); setOpen(false); }
    });
  };

  return (
    <section style={PANEL} aria-labelledby={`${uid}-t`}>
      <div style={{ marginBottom: 12 }}>
        <h2 id={`${uid}-t`} style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>
          {tr.coordOps2.statusTitle}
        </h2>
      </div>

      <dl style={{ display: 'grid', gap: '10px 16px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', margin: 0 }}>
        <div>
          <dt style={{ fontSize: 11.5, color: C.muted2, fontWeight: 600 }}>{tr.coordOps2.recordStatus}</dt>
          <dd style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 600, color: C.navy }}>{d.status}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 11.5, color: C.muted2, fontWeight: 600 }}>{tr.disaster.stage.label}</dt>
          <dd style={{ margin: '2px 0 0', fontSize: 13.5, fontWeight: 600, color: d.operationStage ? C.navy : C.muted }}>
            {d.operationStage ? tr.disaster.stage.names[d.operationStage] : tr.disaster.stage.none}
          </dd>
        </div>
        {d.operationStageSetAt ? (
          <div>
            <dt style={{ fontSize: 11.5, color: C.muted2, fontWeight: 600 }}>{tr.coordOps2.lastChange('')}</dt>
            <dd style={{ margin: '2px 0 0', fontSize: 13.5, color: C.heading2 }}>
              {d.operationStageSetAt} · {tr.coordOps2.changedBy}
            </dd>
          </div>
        ) : null}
      </dl>

      {d.operationStageNote ? (
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: C.heading2, lineHeight: 1.5, maxWidth: '72ch' }}>
          {d.operationStageNote}
        </p>
      ) : null}

      {!d.operationStage && (
        <div style={{
          marginTop: 12, background: '#FFFDF4', border: '1px solid #F2DFA8',
          borderLeft: `3px solid ${C.warning}`, borderRadius: 10, padding: '10px 12px', maxWidth: '72ch',
        }}>
          <strong style={{ fontSize: 13, color: C.warningText }}>{tr.coordOps2.stageNone}</strong>
          <p style={{ ...HELP, color: C.heading2 }}>{tr.coordOps2.stageNoneHint}</p>
        </div>
      )}

      {!open ? (
        <button ref={triggerRef} onClick={() => setOpen(true)} style={{ ...BTN_PRIMARY, marginTop: 14 }}>
          {d.operationStage ? tr.coordOps2.updateStage : tr.coordOps2.setStage}
        </button>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: '14px 0 0', minWidth: 0 }} disabled={busy}>
          <legend style={{ ...LABEL, marginBottom: 10 }}>{tr.coordOps2.updateStage}</legend>

          <label style={LABEL} htmlFor={`${uid}-stage`}>{tr.coordOps2.newStage}</label>
          <select
            id={`${uid}-stage`} ref={firstFieldRef} value={stage}
            onChange={(e) => setStage(e.target.value as OperationStage | '')}
            style={{ ...FIELD, maxWidth: 420 }}
          >
            <option value="">{tr.coordOps2.clearStage}</option>
            {OPERATION_STAGES.map((s) => (
              <option key={s} value={s}>{tr.disaster.stage.names[s]}</option>
            ))}
          </select>

          <div style={{ marginTop: 14 }}>
            <label style={LABEL} htmlFor={`${uid}-note`}>{tr.coordOps2.publicNote}</label>
            <textarea
              id={`${uid}-note`} value={note} rows={3} maxLength={STAGE_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${uid}-note-h`}
              style={{ ...FIELD, resize: 'vertical' }}
            />
            <p id={`${uid}-note-h`} style={HELP}>
              {tr.coordOps2.publicNoteHelp} · <span className="tnum">{tr.coordOps2.remaining(STAGE_NOTE_MAX - note.length)}</span>
            </p>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={LABEL} htmlFor={`${uid}-reason`}>{tr.coordOps2.reason}</label>
            <textarea
              id={`${uid}-reason`} value={reason} rows={2} maxLength={STAGE_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={`${uid}-reason-h`} aria-invalid={err ? true : undefined}
              style={{ ...FIELD, resize: 'vertical' }}
            />
            {/* Gerekçe ile halka açık açıklamanın farkı burada yazılı: ikisi karışırsa
                koordinatör iç notunu herkese açık sayfaya yazar. */}
            <p id={`${uid}-reason-h`} style={HELP}>{tr.coordOps2.reasonHelp}</p>
          </div>

          {err ? <FieldError id={`${uid}-err`} text={err} /> : null}
          <DemoNote />

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={submit} style={BTN_PRIMARY}>
              {busy ? tr.coordOps2.saving : tr.coordOps2.updateStage}
            </button>
            <button onClick={() => { setOpen(false); setErr(''); }} style={BTN_QUIET}>{tr.coordOps2.cancel}</button>
          </div>
        </fieldset>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2) Durum Özeti — mevcut `disasters.situation`, yeni migration yok
// ---------------------------------------------------------------------------
const SUMMARY_MAX = 600;

export function CoordSituationSummary({ d }: { d: Disaster }) {
  const a = useApp();
  const uid = useId();
  const [text, setText] = useState(d.situation ?? '');
  const { busy, run } = useSubmitLock();
  const [err, setErr] = useState('');

  const pii = looksLikeContactDetails(text);
  const dirty = text.trim() !== (d.situation ?? '').trim();

  const save = async () => {
    setErr('');
    if (!dirty) { setErr(tr.coordOps2.summaryUnchanged); return; }
    await run(async () => {
    // Mevcut güvenli yol: doğrudan tablo update'i DEĞİL, `saveDisaster`. Denetim
    // kaydını migration 0016'daki `disasters_audit` tetikleyicisi yazıyor; arayüz
    // ikinci bir kayıt üretmiyor.
    const input: DisasterInput = {
      name: d.name, type: d.type, province: d.province,
      district: d.districts.join(', '), settlements: d.settlements.slice(),
      status: d.status, situation: text.trim(), openedByOrgId: d.openedByOrgId,
    };
      const ok = await a.saveDisaster(d.id, input);
      if (!ok) setErr(tr.coordOps2.summaryFailed);
    });
  };

  return (
    <section style={PANEL} aria-labelledby={`${uid}-t`}>
      <div style={{ marginBottom: 12 }}>
        <h2 id={`${uid}-t`} style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>
          {tr.coordOps2.summaryTitle}
        </h2>
        <p style={HELP}>{tr.coordOps2.summaryHelp}</p>
      </div>

      <label style={LABEL} htmlFor={`${uid}-s`}>{tr.disaster.situation}</label>
      <textarea
        id={`${uid}-s`} value={text} rows={5} maxLength={SUMMARY_MAX}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={`${uid}-h`}
        style={{ ...FIELD, resize: 'vertical' }}
      />
      <p id={`${uid}-h`} style={HELP}>
        <span className="tnum">{tr.coordOps2.remaining(SUMMARY_MAX - text.length)}</span>
        {d.updatedLabel ? ` · ${tr.common.updated(d.updatedLabel)}` : ''}
      </p>

      {/* Uyarı ENGELLEYİCİ değil: koordinatörün resmî bir hat numarası yazması meşru
          olabilir. Ama görmeden yazmasın (rules/03 §Data Minimization). */}
      {pii && (
        <p role="status" style={{
          display: 'flex', gap: 7, alignItems: 'flex-start', margin: '10px 0 0',
          fontSize: 12.5, color: C.heading2, background: '#FFFDF4',
          border: '1px solid #F2DFA8', borderRadius: 8, padding: '9px 11px',
        }}>
          <span style={{ paddingTop: 1 }}><Ico n="critical" size={13} color={C.warningText} /></span>
          {tr.coordOps2.summaryPii}
        </p>
      )}

      {err ? <FieldError id={`${uid}-e`} text={err} /> : null}
      <DemoNote />

      <button onClick={save} disabled={busy} style={{ ...BTN_PRIMARY, marginTop: 14 }}>
        {busy ? tr.coordOps2.saving : tr.coordOps2.summarySave}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3) Öne Çıkan İhtiyaçlar
// ---------------------------------------------------------------------------
export function CoordFeaturedNeeds({ d }: { d: Disaster }) {
  const a = useApp();
  const uid = useId();
  const all = useMemo(() => enrichSorted(a.snap?.needs ?? []), [a.snap?.needs]);
  const saved = useMemo(
    () => all.filter((n) => n.featuredRank != null)
      .sort((x, y) => (x.featuredRank as number) - (y.featuredRank as number))
      .map((n) => n.id),
    [all],
  );
  const [picked, setPicked] = useState<string[]>(saved);
  const { busy, run } = useSubmitLock();
  const [err, setErr] = useState('');
  // Kayıtlı seçim sunucudan yenilendiğinde formu ona eşitle.
  useEffect(() => { setPicked(saved); }, [saved.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(all.map((n) => [n.id, n] as const)), [all]);
  // Seçim listesinde YALNIZCA açık kalemler: karşılanmış bir ihtiyacı öne çıkarmak
  // ziyaretçiyi boşuna yola çıkarır. Zaten seçili olan kapalı kalem listede kalır ki
  // koordinatör onu görüp çıkarabilsin.
  const options = all.filter((n) => n.remaining > 0 && !picked.includes(n.id));
  const hasClosed = picked.some((id) => (byId.get(id)?.remaining ?? 0) === 0);
  const dirty = picked.join(',') !== saved.join(',');

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= picked.length) return;
    const next = picked.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setPicked(next);
  };

  const save = async (ids: string[]) => {
    setErr('');
    await run(async () => {
      const ok = await a.setFeaturedNeeds(d.id, ids);
      if (!ok) setErr(tr.coordOps2.featuredFailed);
    });
  };

  const previewNames = picked.map((id) => byId.get(id)?.name).filter(Boolean);

  return (
    <section style={PANEL} aria-labelledby={`${uid}-t`}>
      <div style={{ marginBottom: 12 }}>
        <h2 id={`${uid}-t`} style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.navy }}>
          {tr.coordOps2.featuredTitle}
        </h2>
        <p style={HELP}>{tr.coordOps2.featuredHelp}</p>
      </div>

      {picked.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: C.muted }}>{tr.coordOps2.featuredEmpty}</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {picked.map((id, i) => {
            const n = byId.get(id);
            return (
              <li key={id} style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                border: `1px solid ${C.borderFaint}`, borderRadius: 9, padding: '8px 10px', background: C.canvas,
              }}>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: C.muted, minWidth: 18 }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 14, fontWeight: 600, color: C.navy }}>
                  {n?.name ?? id}
                  {n ? (
                    <span className="tnum" style={{
                      marginLeft: 8, fontSize: 12, fontWeight: 600,
                      color: n.remaining > 0 ? (PRI[n.priority] ?? PRI.Normal).fg : C.successText,
                    }}>
                      {n.remaining > 0 ? tr.disaster.remainingWithUnit(n.remaining, n.unit) : tr.disaster.coveredWord}
                    </span>
                  ) : null}
                </span>
                {/* Sürükle-bırak yok: yukarı/aşağı düğmeleri klavye ve ekran okuyucuyla
                    çalışır ve tek elle kullanılabilir (rules/01 §Emergency First). */}
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${tr.coordOps2.featuredUp}: ${n?.name ?? ''}`} style={BTN_TINY}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label={`${tr.coordOps2.featuredDown}: ${n?.name ?? ''}`} style={BTN_TINY}>↓</button>
                <button onClick={() => setPicked(picked.filter((x) => x !== id))} aria-label={`${tr.coordOps2.featuredRemove}: ${n?.name ?? ''}`} style={BTN_TINY}>×</button>
              </li>
            );
          })}
        </ol>
      )}

      {hasClosed && (
        <p role="status" style={{
          margin: '10px 0 0', fontSize: 12.5, color: C.heading2, background: '#FFFDF4',
          border: '1px solid #F2DFA8', borderRadius: 8, padding: '9px 11px',
        }}>{tr.coordOps2.featuredClosedWarn}</p>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={LABEL} htmlFor={`${uid}-add`}>{tr.coordOps2.featuredAdd}</label>
        <select
          id={`${uid}-add`} value=""
          disabled={picked.length >= MAX_FEATURED_NEEDS || options.length === 0}
          onChange={(e) => { if (e.target.value) setPicked([...picked, e.target.value]); }}
          style={{ ...FIELD, maxWidth: 420 }}
        >
          <option value="">
            {picked.length >= MAX_FEATURED_NEEDS ? tr.coordOps2.featuredFull : tr.coordOps2.featuredAdd}
          </option>
          {options.map((n) => (
            <option key={n.id} value={n.id}>{n.name} — {tr.disaster.remainingWithUnit(n.remaining, n.unit)}</option>
          ))}
        </select>
      </div>

      {/* Önizleme: gerçek sayfanın tasarımını kopyalamıyor, YALNIZCA cümleyi gösteriyor.
          Amaç koordinatörün ziyaretçinin ne okuyacağını görmesi. */}
      <div style={{ marginTop: 14, border: `1px dashed ${C.borderSoft}`, borderRadius: 9, padding: '10px 12px', background: C.canvas }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted3 }}>
          {tr.coordOps2.featuredPreview}
        </div>
        {previewNames.length > 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.navy }}>
            {tr.coordOps2.featuredPreviewLead}<br /><strong>{previewNames.join(' · ')}</strong>
          </p>
        ) : (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: C.muted }}>
            {tr.coordOps2.featuredPreviewAuto}
            {(() => {
              const auto = pickFeaturedNeeds(all);
              return auto.items.length > 0
                ? <><br /><strong style={{ color: C.heading2 }}>{auto.items.map((n) => n.name).join(' · ')}</strong></>
                : null;
            })()}
          </p>
        )}
      </div>

      <p style={HELP}>{tr.coordOps2.featuredAutoNote}</p>
      {err ? <FieldError id={`${uid}-e`} text={err} /> : null}
      <DemoNote />

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={() => save(picked)} disabled={busy || !dirty} style={BTN_PRIMARY}>
          {busy ? tr.coordOps2.saving : tr.coordOps2.featuredSave}
        </button>
        {saved.length > 0 && (
          <button onClick={() => { setPicked([]); void save([]); }} disabled={busy} style={BTN_QUIET}>
            {tr.coordOps2.featuredClear}
          </button>
        )}
      </div>
    </section>
  );
}

// Üçü bir arada — koordinatör operasyon detayına tek satırla girsin diye.
export function CoordOperationTools({ d }: { d: Disaster }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CoordOperationStatus d={d} />
      <CoordSituationSummary d={d} />
      <CoordFeaturedNeeds d={d} />
    </div>
  );
}
