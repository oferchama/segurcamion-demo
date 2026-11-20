// Normalised coverage model + ranking. Every adapter must map the insurer's
// own product wording onto these keys so offers are comparable like-for-like.

// Same 5 modalities the segurcamion.com form offers (step 2, t=5..9).
export const TIERS = {
  rc:             { label: 'Terceros',                                  short: 'Terceros',     web: 5 },
  rc_lunas:       { label: 'Terceros + lunas + asistencia',             short: '+ Lunas',      web: 6 },
  ampliado:       { label: 'Terceros + lunas + asistencia + robo + incendio', short: '+ Robo/inc.', web: 7 },
  todo_riesgo:    { label: 'Todo riesgo con franquicia',                short: 'TR c/franq.',  web: 8 },
  todo_riesgo_sf: { label: 'Todo riesgo sin franquicia',                short: 'TR s/franq.',  web: 9 },
};
export const TIER_BY_WEB = Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [v.web, k]));

// key -> label, weight used for the "coverage score", and how to print the value
export const COVERAGES = [
  { key: 'rcObligatoria',     label: 'RC obligatoria',                 weight: 0,  fmt: 'bool' },
  { key: 'rcVoluntaria',      label: 'RC voluntaria',                  weight: 6,  fmt: 'money' },
  { key: 'defensaJuridica',   label: 'Defensa jurídica y reclamación', weight: 4,  fmt: 'bool' },
  { key: 'asistencia',        label: 'Asistencia en carretera',        weight: 6,  fmt: 'km' },
  { key: 'lunas',             label: 'Lunas',                          weight: 4,  fmt: 'bool' },
  { key: 'robo',              label: 'Robo',                           weight: 5,  fmt: 'bool' },
  { key: 'incendio',          label: 'Incendio',                       weight: 5,  fmt: 'bool' },
  { key: 'danosPropios',      label: 'Daños propios',                  weight: 12, fmt: 'bool' },
  { key: 'franquicia',        label: 'Franquicia daños propios',       weight: 0,  fmt: 'money' },
  { key: 'equipos',           label: 'Mecanismos acoplados (grúa, volquete…)', weight: 3, fmt: 'bool' },
  { key: 'accidentesConductor', label: 'Accidentes del conductor',     weight: 3,  fmt: 'money' },
  { key: 'retiradaCarnet',    label: 'Retirada de carnet (€/mes)',     weight: 3,  fmt: 'money' },
  { key: 'paralizacion',      label: 'Paralización (€/día)',           weight: 3,  fmt: 'money' },
  { key: 'mercancia',         label: 'Mercancía transportada',         weight: 5,  fmt: 'money' },
];

export function coverageScore(c = {}) {
  let s = 0;
  for (const { key, weight } of COVERAGES) {
    const v = c[key];
    if (!weight || !v) continue;
    s += weight;
  }
  // Lower deductible is better when there is own-damage cover.
  if (c.danosPropios && c.franquicia != null) s += Math.max(0, 4 - c.franquicia / 500);
  return Math.round(s * 10) / 10;
}

/**
 * Builds, per tier, a sorted list of offers and picks a recommendation.
 * Recommendation = cheapest offer whose coverage is within 90% of the best
 * coverage in that tier (so we never recommend a "cheap but hollow" product).
 */
export function rank(results, lead) {
  const offers = results.flatMap(r => r.quotes.map(q => ({
    ...q, insurerId: r.insurerId, insurer: r.insurer, mode: r.mode,
    score: coverageScore(q.coverages),
  })));

  const byTier = {};
  for (const tier of Object.keys(TIERS)) {
    const list = offers.filter(o => o.tier === tier).sort((a, b) => a.annualPremium - b.annualPremium);
    if (!list.length) continue;
    const bestScore = Math.max(...list.map(o => o.score));
    const recommended = list.find(o => o.score >= bestScore * 0.9) ?? list[0];
    const prices = list.map(o => o.annualPremium);
    byTier[tier] = {
      offers: list,
      recommended,
      min: Math.min(...prices),
      max: Math.max(...prices),
      savingVsMax: Math.max(...prices) - recommended.annualPremium,
    };
  }

  const wanted = lead?.cover?.tier;
  const headlineTier = byTier[wanted] ? wanted : Object.keys(byTier).at(-1) ?? null;
  return { byTier, headlineTier };
}
