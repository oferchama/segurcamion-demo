// DEMO pricing model. It produces realistic-looking premiums so the whole flow
// (compare -> PDF -> WhatsApp) can be shown before real integrations exist.
// Base levels calibrated against public comparator figures for rigid trucks
// in Spain (roams.es, 2025): terceros ~580-850 €, + lunas/asistencia ~990-1.300 €,
// todo riesgo c/franquicia ~1.700-2.400 €, s/franquicia ~2.100-2.850 €.
// NEVER present these as real offers. Runs in Node and in the browser.
import { vehicleAge } from '../lead/schema.js';

const BASE = { // per MMA band: [maxKg, rc, rc_lunas, ampliado, todo_riesgo, todo_riesgo_sf]
  bands: [
    [3500,     420,  640,  700,  950, 1150],
    [12000,    600,  990, 1090, 1720, 2080],
    [26000,    700, 1080, 1190, 1900, 2300],
    [Infinity, 850, 1250, 1380, 2150, 2600],
  ],
  tiers: ['rc', 'rc_lunas', 'ampliado', 'todo_riesgo', 'todo_riesgo_sf'],
};

const SCOPE = { local: 0.92, regional: 0.97, nacional: 1.0, fronterizo: 1.08, internacional: 1.18 };
const CARGO = { general: 1, obras: 1.1, paqueteria: 1, mudanzas: 1.03, frigorifica: 1.08, aridos: 1.12,
                vehiculos: 1.1, animales: 1.15, adr: 1.45, otro: 1.05 };
const PROVINCE = { '28': 1.08, '08': 1.08, '46': 1.05, '41': 1.04, '29': 1.04, '03': 1.03, '48': 1.02 };

// FNV-1a: deterministic ±spread so re-runs give the same price.
function noise(key, spread) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return 1 + ((h / 0xffffffff) * 2 - 1) * spread;
}

export function riskFactor(lead) {
  const { use = {}, driver = {}, history = {}, contact = {}, vehicle = {} } = lead;
  let f = SCOPE[use.scope] ?? 1;
  f *= CARGO[use.cargo] ?? 1;
  if (use.service === 'privado') f *= 0.9;
  if (vehicle.attachedEquipment === 'si') f *= 1.06;
  const age = Number(driver.age);
  if (age && age < 25) f *= 1.35; else if (age < 30) f *= 1.15; else if (age > 65) f *= 1.1;
  const lic = Number(driver.licenseYears);
  if (!Number.isNaN(lic)) f *= lic < 2 ? 1.25 : lic < 5 ? 1.1 : 1;
  const claims = Number(history.claims3y ?? 0);
  f *= [0.95, 1.12, 1.3][claims] ?? 1.6;
  if (Number(history.yearsInsured) >= 5) f *= 0.95;
  f *= PROVINCE[String(contact.postalCode ?? '').slice(0, 2)] ?? 1;
  return f;
}

export function vehicleValue(lead) {
  const age = vehicleAge(lead) ?? 5;
  return Number(lead.vehicle?.value)
    || Number(lead.vehicle?.valueNew) * Math.max(0.3, 1 - 0.08 * age)
    || 60000;
}

/**
 * @param {object} lead
 * @param {object} profile insurer entry from catalog.js
 * @param {string} tier one of TIERS in engine/compare.js
 */
export function simulatePremium(lead, profile, tier) {
  const kg = Number(lead.vehicle?.mmaKg) || 12000;
  const band = BASE.bands.find(([max]) => kg <= max);
  let p = band[1 + BASE.tiers.indexOf(tier)];

  if (tier.startsWith('todo_riesgo')) {
    const age = vehicleAge(lead) ?? 5;
    p *= Math.sqrt(vehicleValue(lead) / 60000);
    if (age > 6) p *= 1 + (age - 6) * 0.03;
  }

  p *= riskFactor(lead);
  p *= profile.priceFactor;
  for (const [cond, factor] of profile.adjust ?? []) if (cond(lead, tier)) p *= factor;
  p *= noise(`${profile.id}|${lead.id}|${tier}`, 0.06);

  // Optional extras the client asked for
  const extras = lead.cover?.extras ?? [];
  if (extras.includes('retirada_carnet')) p += 45;
  if (extras.includes('paralizacion')) p += 90;
  if (extras.includes('accidentes_conductor')) p += 35;
  if (extras.includes('mercancia')) p += Math.max(120, 0.006 * (Number(lead.cover?.cargoLimit) || 30000));

  return Math.round(p);
}
