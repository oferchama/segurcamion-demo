// Maps the current segurcamion.com quote flow onto the canonical lead.
// Field names and option codes were taken from the live form HTML (Nov 2026):
//
//   Step 1 "Datos básicos"  /drupal/seguros-camiones-{rigidos|cabeza-tractora}-step1.php
//   Step 2 "Coberturas"     step2.php -> link to step3.php?t=5..9&c=<price shown>
//   Step 3 "Descuento"      step3.php (marca/modelo, matrícula, documento, teléfono…)
//
// The three steps share the "Nº de tarificación" (e.g. CA2611209172), which
// we use as quoteRef to merge step 3 into the lead created by step 1.
import { TIER_BY_WEB } from '../engine/compare.js';

const MMA_BAND_KG = { // midpoint of each band, in kg
  4: 5000, 5: 8000, 6: 12000, 7: 17000, 8: 22000, 9: 30000, 10: 40000,
};
const AMBITO = { 11: 'nacional', 110: 'fronterizo', 12: 'internacional' };
const USO = { 16: 'publico', 17: 'privado' };
const MERCANCIA = { 14: 'general', 15: 'adr', 13: 'obras' };
const DOCUMENTO = { 1: 'NIF', 2: 'CIF', 3: 'Otro', 4: 'NIE' };
const MECANISMOS = { 1: 'si', 2: 'no' };
const KNOWN_MAKES = ['Mercedes-Benz', 'Mercedes', 'MAN', 'Iveco', 'Renault', 'DAF', 'Volvo', 'Scania', 'Nissan', 'Isuzu', 'Mitsubishi', 'Fuso'];

// "35.000,00" or "35000" -> 35000
const euros = s => s == null || s === '' ? undefined : Number(String(s).replace(/[^\d,]/g, '').replace(',', '.')) || undefined;

// datepicker gives dd/mm/yyyy -> yyyy-mm-dd
const isoDate = s => {
  const m = String(s ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s || undefined;
};
const clean = s => (s == null ? undefined : String(s).trim() || undefined);

export function splitMakeModel(s) {
  const txt = clean(s);
  if (!txt) return {};
  const make = KNOWN_MAKES.find(m => txt.toLowerCase().startsWith(m.toLowerCase()));
  if (make) return { make: make === 'Mercedes' ? 'Mercedes-Benz' : make, model: clean(txt.slice(make.length).replace(/^[-\s]+/, '')) };
  const [first, ...rest] = txt.split(/\s+/);
  return { make: first, model: clean(rest.join(' ')) };
}

/** True when the POST comes from step 3 ("Descuento"). */
export const isStep3 = post => ['matricula', 'telefono', 'numero_documento', 'marca_modelo_vehiculo'].some(k => k in post);

/** Step 1 -> new lead. */
export function fromWebForm(post, { id, receivedAt = new Date().toISOString() } = {}) {
  const tractora = String(post.tipo_vehiculo) === '1';
  const lead = {
    id: id ?? `L${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(),
    quoteRef: clean(post.presupuesto),
    receivedAt,
    source: 'web-form',
    formStep: 1,
    status: 'nuevo',
    contact: {
      email: clean(post.email),
      postalCode: clean(post.cp),
      province: clean(post.provincia),
      marketingConsent: post['acepta-recibir-emails'] === 'on' || post['acepta-recibir-emails'] === true,
    },
    vehicle: {
      kind: tractora ? 'tractora' : 'rigido',
      // Tractoras are always heavy; the form doesn't ask, assume 40 t combination.
      mmaKg: tractora ? 40000 : MMA_BAND_KG[post.tipo_vehiculo],
      mmaBandFromForm: !tractora,
      valueNew: euros(post.valor_nuevo),
    },
    use: {
      scope: AMBITO[post.ambito],
      service: USO[post.uso_vehiculo],
      cargo: MERCANCIA[post.tipo_mercancia],
    },
    policy: { startDate: isoDate(post.fecha_comienzo) },
    driver: {}, history: {}, cover: {}, fleet: { size: 1 },
  };
  applyCoverChoice(lead, post);
  return lead;
}

/** Step 2: which modality the client clicked (t=5..9). No price is ever shown on the site. */
export function applyCoverChoice(lead, post) {
  const t = Number(post.t ?? post.cobertura);
  if (TIER_BY_WEB[t]) {
    lead.cover = { ...lead.cover, tier: TIER_BY_WEB[t] };
    lead.formStep = Math.max(lead.formStep ?? 1, 2);
  }
  return lead;
}

/** Step 3 ("Descuento") -> merged into an existing lead. */
export function applyStep3(lead, post) {
  const docType = DOCUMENTO[post.tipo_documento] ?? clean(post.tipo_documento);
  const mm = splitMakeModel(post.marca_modelo_vehiculo);
  const set = (obj, k, v) => { if (v !== undefined) obj[k] = v; };

  set(lead, 'quoteRef', clean(post.presupuesto) ?? lead.quoteRef);
  lead.contact ??= {}; lead.vehicle ??= {}; lead.history ??= {}; lead.policy ??= {};
  set(lead.contact, 'email', clean(post.email));
  set(lead.contact, 'name', clean(post.nombre_tomador));
  set(lead.contact, 'surname', clean(post.apellidos_tomador));
  set(lead.contact, 'phone', clean(post.telefono));
  set(lead.contact, 'taxIdType', docType);
  set(lead.contact, 'taxId', clean(post.numero_documento)?.toUpperCase());
  if (docType) lead.contact.holderType = docType === 'CIF' ? 'empresa' : 'autonomo';
  set(lead.vehicle, 'makeModel', clean(post.marca_modelo_vehiculo));
  set(lead.vehicle, 'make', mm.make);
  set(lead.vehicle, 'model', mm.model);
  set(lead.vehicle, 'plate', clean(post.matricula)?.toUpperCase());
  set(lead.vehicle, 'attachedEquipment', MECANISMOS[post.mecanismos]);
  set(lead.policy, 'startDate', isoDate(post.fecha_comienzo));
  set(lead.history, 'currentInsurer', clean(post.compania_actual));
  set(lead.history, 'policyNumber', clean(post.numero_poliza));
  // PROPOSED optional fields ("Opcional: ayúdanos a afinar tu precio"). None are
  // required, so the form's drop-off is unchanged; whatever is skipped, the agent
  // asks on WhatsApp. Field names are a proposal for the PHP form.
  const num = v => (clean(v) == null || Number.isNaN(Number(v)) ? undefined : Number(v));
  set(lead.vehicle, 'year', num(post.anio_matriculacion));
  lead.driver ??= {};
  set(lead.driver, 'age', num(post.edad_conductor));
  set(lead.driver, 'licenseYears', num(post.anos_carnet_c));
  set(lead.history, 'claims3y', num(post.siniestros_3_anos));
  set(lead.history, 'yearsInsured', num(post.anos_asegurado));
  set(lead.history, 'currentPremium', euros(post.prima_actual));
  if (clean(post.matricula_otro_camion) || clean(post.aseguradora_otro_camion)) {
    lead.history.otherVehicle = {
      plate: clean(post.matricula_otro_camion)?.toUpperCase(),
      insurer: clean(post.aseguradora_otro_camion),
      policyNumber: clean(post.numero_poliza_otro),
    };
  }
  applyCoverChoice(lead, post);
  lead.formStep = 3;
  return lead;
}

/** Seed entries may be raw form posts ({ form, step3? }) or canonical leads. */
export function normaliseSeed(raw) {
  if (!raw.form) return raw;
  const lead = fromWebForm(raw.form, { id: raw.id, receivedAt: raw.receivedAt ?? '2026-11-20T10:05:00Z' });
  if (raw.step3) applyStep3(lead, raw.step3);
  if (raw._note) lead._note = raw._note;
  lead.demo = true; // seed data is always sample data
  return lead;
}
