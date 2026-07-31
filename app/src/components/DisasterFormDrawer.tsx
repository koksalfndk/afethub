import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tr, disasterTypeLabel } from '../i18n/strings';
import { C, G } from '../theme';
import { Ico, inputStyle, labelText, Field } from '../ui';
import { Picker, toOptions } from './Picker';
import { PROVINCES, districtsOf } from '../data/trLocations';
import { splitDistricts } from '../data';
import { SettlementPicker } from './SettlementPicker';
import type { Disaster, DisasterInput, DisasterType } from '../types';

// Afet kaydı formu — sağdan açılan çekmece.
//
// Neden çekmece: form daha önce listenin ÜSTÜNE açılıyordu; açıldığı anda tablo aşağı
// kayıyor ve koordinatör düzenlediği satırı gözden kaybediyordu. Çekmece arkadaki
// listeyi yerinde bırakır.
//
// Neden ortak bileşen: aynı form iki yerden açılıyor (liste ve afet detay sayfası).
// İki kopya, birinde eklenen alanın (yerleşim seçici) ötekinde eksik kalması demekti.
//
// Taslak state BURADA duruyor, çağıran ekranda değil: çekmece kapandığında yarım
// kalmış bir düzenleme geride kalmaz.

const TYPES: DisasterType[] = ['Wildfire', 'Flood', 'Earthquake', 'Storm', 'Evacuation', 'Other'];
const STATUSES: Disaster['status'][] = ['Active', 'Resolved', 'Archived'];

const blank = (): DisasterInput => ({
  name: '', type: 'Wildfire', province: '', district: '', settlements: [],
  status: 'Active', situation: '', openedByOrgId: null,
});

const fromDisaster = (d: Disaster): DisasterInput => {
  // `region` il + ilçeden türetiliyor, bu yüzden ilçe iki kez saklanmak yerine
  // oradan geri okunuyor.
  const district = d.region.split('·')[0].split(',')[0].trim();
  return {
    name: d.name, type: d.type, province: d.province,
    district: district === d.province ? '' : district,
    // Yerleşimler kendi alanında (0029); `region`'dan türetilmiyor.
    settlements: d.settlements.slice(),
    status: d.status, situation: d.situation, openedByOrgId: d.openedByOrgId,
  };
};

// Sayılamayan değil, yazılamayan bir sayı: arkasındaki kayıtlara giden bir düğme.
// Koordinatörün elle "168" yazması, arkasında kimse olmayan bir rakam yayınlamaktı.
function CountField({ label, value, hint, cta, onOpen }: {
  label: string; value: number; hint: string; cta: string; onOpen: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelText}>{label}</span>
      <button onClick={onOpen} className="hv-navy" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        background: C.canvas, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
        minHeight: 46, padding: '0 13px', cursor: 'pointer', textAlign: 'left', width: '100%',
      }}>
        <span className="tnum" style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{value}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.info }}>{cta}</span>
      </button>
      <span style={{ fontSize: 11.5, color: C.muted2 }}>{hint}</span>
    </div>
  );
}

export function DisasterFormDrawer({ disaster, onClose }: {
  /** Düzenlenecek kayıt; null ise yeni operasyon açılıyor. */
  disaster: Disaster | null;
  onClose: () => void;
}) {
  const a = useApp();
  const mob = a.device === 'mobile';
  const isNew = disaster === null;

  const [draft, setDraft] = useState<DisasterInput>(() => (disaster ? fromDisaster(disaster) : blank()));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof DisasterInput>(k: K, v: DisasterInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.name.trim()) { setErr(tr.coordDisasters.errName); return; }
    if (!draft.province) { setErr(tr.coordDisasters.errProvince); return; }
    if (!draft.situation.trim()) { setErr(tr.coordDisasters.errSituation); return; }
    setErr(''); setBusy(true);
    const ok = await a.saveDisaster(disaster?.id ?? null, draft);
    setBusy(false);
    if (ok) onClose();
  };

  // Gönüllü listesi başka bir ekran: çekmece açık kalırsa kullanıcı geri döndüğünde
  // üstünde yarım bir form bulur.
  const openVolunteers = (mode: 'approved' | 'onShift') => {
    onClose();
    a.openVolunteers(disaster?.id ?? null, mode);
  };

  const orgOptions = a.orgs.filter((o) => o.status === 'Verified');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,30,48,.46)' }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? tr.coordDisasters.formNew : tr.coordDisasters.formEdit}
        style={{
          position: 'relative', width: mob ? '100%' : 520, maxWidth: '100%', height: '100%',
          background: C.surface, borderLeft: `1px solid ${C.border}`,
          boxShadow: '-18px 0 48px rgba(11,30,48,.22)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <i style={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: G.heroRibbon }} />

        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
          padding: '16px 18px 12px', borderBottom: `1px solid ${C.borderFaint}`, flex: '0 0 auto',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 700, color: C.navy }}>
              {isNew ? tr.coordDisasters.formNew : tr.coordDisasters.formEdit}
            </h2>
            {disaster && (
              <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>{disaster.name}</div>
            )}
          </div>
          {/* Etiketi "Kapat": altta zaten bir "Vazgeç" düğmesi var, ikisi aynı adı
              taşıyınca klavyeyle gezerken hangisinin ne olduğu belirsizleşiyordu. */}
          <button ref={closeRef} onClick={onClose} aria-label={tr.shareDisaster.close} style={{
            width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 34px',
          }}><Ico n="close" size={16} /></button>
        </header>

        {/* Gövde kendi içinde kayar; kaydet düğmesi aşağıda sabit kalır. Uzun formda
            "kaydet nerede" diye aramak zorunda kalmamak için. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
          {isNew && (
            <p style={{
              margin: '0 0 13px', fontSize: 12.5, fontWeight: 600, color: C.successText,
              background: '#EAF7EF', border: '1px solid #C9E9D6', borderRadius: 9, padding: '8px 11px',
            }}>{tr.coordDisasters.directNotice}</p>
          )}

          {/* Çekmece dar: alanlar tek sütun. İki sütuna sıkıştırmak, Picker'ların
              açılır listesini okunmaz hâle getiriyordu. */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', alignItems: 'start' }}>
            <Field label={tr.coordDisasters.fName} full>
              <input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={90}
                placeholder={tr.coordDisasters.fNamePh} autoComplete="off" style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <Field label={tr.coordDisasters.fType}>
                <Picker value={draft.type} onChange={(x) => set('type', x as DisasterType)}
                  ariaLabel={tr.coordDisasters.fType}
                  options={TYPES.map((t) => ({ value: t, label: disasterTypeLabel[t] }))} />
              </Field>
              <Field label={tr.coordDisasters.fStatus}>
                <Picker value={draft.status} onChange={(x) => set('status', x as Disaster['status'])}
                  ariaLabel={tr.coordDisasters.fStatus}
                  options={STATUSES.map((v) => ({ value: v, label: tr.coordDisasters.statusLabels[v] }))} />
              </Field>
              <Field label={tr.coordDisasters.fProvince}>
                <Picker value={draft.province} ariaLabel={tr.coordDisasters.fProvince}
                  onChange={(x) => { set('province', x); set('district', ''); set('settlements', []); }}
                  placeholder={tr.orgs.pickProvince} options={toOptions(PROVINCES)} />
              </Field>
              <Field label={tr.coordDisasters.fDistrict}>
                <Picker value={draft.district} ariaLabel={tr.coordDisasters.fDistrict}
                  onChange={(x) => { set('district', x); set('settlements', []); }} disabled={!draft.province}
                  placeholder={draft.province ? tr.orgs.allDistricts : tr.orgs.pickProvinceFirst}
                  options={toOptions(districtsOf(draft.province))} />
              </Field>
            </div>
            <Field label={tr.coordDisasters.fSettlements} hint={tr.coordDisasters.fSettlementsHint} full>
              <SettlementPicker
                province={draft.province}
                districts={splitDistricts(draft.district)}
                value={draft.settlements}
                onChange={(next) => set('settlements', next)}
              />
            </Field>
            <Field label={tr.coordDisasters.fSituation} full>
              <textarea value={draft.situation} onChange={(e) => set('situation', e.target.value)} rows={3}
                placeholder={tr.coordDisasters.fSituationPh} style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <CountField label={tr.coordDisasters.fVolunteers} value={disaster?.volunteers ?? 0}
                hint={tr.coordDisasters.volunteersDerived}
                cta={tr.coordDisasters.openVolunteers}
                onOpen={() => openVolunteers('approved')} />
              <CountField label={tr.coordDisasters.fOnShift} value={disaster?.onShift ?? 0}
                hint={tr.coordDisasters.onShiftDerived}
                cta={tr.coordDisasters.openOnShift}
                onOpen={() => openVolunteers('onShift')} />
            </div>
            <Field label={tr.coordDisasters.fOpenedBy} hint={`· ${tr.coordDisasters.openedByHint}`} full>
              <Picker value={draft.openedByOrgId ?? ''} ariaLabel={tr.coordDisasters.fOpenedBy}
                onChange={(x) => set('openedByOrgId', x || null)}
                options={[
                  { value: '', label: disaster?.openedByCommunity ? tr.coordDisasters.fOpenedByCommunity : tr.coordDisasters.fOpenedBySelf },
                  ...orgOptions.map((o) => ({ value: o.id, label: o.name })),
                ]} />
            </Field>
          </div>

          <div style={{ ...labelText, color: C.muted2, fontWeight: 500, marginTop: 10, fontSize: 12 }}>
            {isNew ? tr.coordDisasters.slugNewNote : tr.coordDisasters.slugNote(disaster?.slug ?? '')}
          </div>

          {err && (
            <div role="alert" style={{
              marginTop: 12, background: C.errorSurface, border: `1px solid ${C.errorBorder}`,
              borderRadius: 9, padding: '9px 12px', fontSize: 13, color: C.errorText, fontWeight: 600,
            }}>{err}</div>
          )}
        </div>

        <footer style={{
          flex: '0 0 auto', display: 'flex', gap: 9, flexWrap: 'wrap',
          padding: '13px 18px', borderTop: `1px solid ${C.borderFaint}`, background: C.canvas,
        }}>
          <button onClick={() => void submit()} disabled={busy} style={{
            background: G.navyBtn, border: `1px solid ${C.navy}`, color: '#fff', borderRadius: 10,
            height: 46, padding: '0 18px', fontSize: 14, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1,
          }}>{busy ? tr.auth.working : isNew ? tr.coordDisasters.save : tr.coordDisasters.saveEdit}</button>
          <button onClick={onClose} className="hv-navy" style={{
            background: C.surface, border: `1px solid ${C.borderSoft}`, color: C.navy, borderRadius: 10,
            height: 46, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>{tr.coordDisasters.cancel}</button>
        </footer>
      </aside>
    </div>
  );
}
