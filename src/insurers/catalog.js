// Insurer panel. Each entry is data: how we reach the insurer (channel), what
// it needs (requiredFields), what it writes (appetite) and how its products map
// onto the normalised coverages in engine/compare.js.
//
// ⚠ Appetite rules, products and price factors below are PLACEHOLDERS built
// from public info (insurer product pages, comparators). Confirm each one with
// the insurer's broker-channel underwriter before relying on it.

// What today's web form already collects (see lead/fromWebForm.js).
export const FORM_FIELDS = ['contact.postalCode', 'vehicle.mmaKg', 'use.service', 'use.scope', 'use.cargo', 'policy.startDate'];

// What a typical insurer tarificador asks for on top of that.
export const STANDARD_FIELDS = [...FORM_FIELDS,
  'vehicle.plate|vehicle.make', 'vehicle.year', 'driver.age', 'driver.licenseYears', 'history.claims3y', 'contact.taxId'];

const RC = (o = {}) => ({ rcObligatoria: true, rcVoluntaria: 50_000_000, defensaJuridica: true, ...o });
const AMP = (o = {}) => RC({ asistencia: 'Desde km 0', lunas: true, robo: true, incendio: true, ...o });
const TR = (o = {}) => AMP({ danosPropios: true, franquicia: 900, ...o });

// Expands rc / ampliado / todo_riesgo into the web's 5 modalities:
// rc_lunas = ampliado without robo+incendio; todo_riesgo_sf = TR with franquicia 0.
const ladder = ({ rc, ampliado, todo_riesgo }) => ({
  rc,
  rc_lunas: { ...ampliado, robo: false, incendio: false },
  ampliado,
  todo_riesgo,
  todo_riesgo_sf: { ...todo_riesgo, franquicia: 0 },
});

const isADR = l => l.use?.cargo === 'adr';
const heavy = l => Number(l.vehicle?.mmaKg) > 26000;
const oldVehicle = (l, years) => l.vehicle?.year && new Date().getFullYear() - l.vehicle.year > years;

export const CATALOG = [
  {
    id: 'allianz', name: 'Allianz', color: '#003781', channel: 'api',
    // Prices are only for the agent: the website never shows a price to the client.
    integration: 'API privada ya integrada en el backend de la web. El precio lo ve solo el asesor.',
    requiredFields: FORM_FIELDS,
    priceFactor: 1.0,
    appetite: () => ({ ok: true }),
    products: ladder({
      rc: RC({ asistencia: 'Desde 25 km' }),
      ampliado: AMP(),
      todo_riesgo: TR({ franquicia: 600 }),
    }),
    productName: 'Allianz Vehículos Industriales',
  },
  {
    id: 'mapfre', name: 'Mapfre', color: '#d81e05', channel: 'portal',
    integration: 'Portal de corredores (canaldecorredores.mapfre.es). Pedir acceso a web service; si no, RPA con permiso escrito.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 1.04,
    adjust: [[isADR, 1.1]],
    appetite: () => ({ ok: true }),
    products: ladder({
      rc: RC({ rcVoluntaria: 70_000_000, asistencia: 'Desde km 0' }),
      ampliado: AMP({ rcVoluntaria: 70_000_000, retiradaCarnet: 600 }),
      todo_riesgo: TR({ rcVoluntaria: 70_000_000, retiradaCarnet: 600, franquicia: 1000, equipos: true }),
    }),
    productName: 'Mapfre Camiones Prima Fija',
  },
  {
    id: 'axa', name: 'AXA', color: '#00008f', channel: 'portal',
    integration: 'Acceso para agentes/corredores en axa.es. Negociar API o RPA.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 1.0,
    appetite: () => ({ ok: true }),
    products: ladder({
      rc: RC(),
      ampliado: AMP({ accidentesConductor: 30_000 }),
      todo_riesgo: TR({ accidentesConductor: 30_000, franquicia: 750, equipos: true }),
    }),
    productName: 'AXA Camiones y Vehículos Industriales',
  },
  {
    id: 'zurich', name: 'Zurich', color: '#2167ae', channel: 'portal',
    integration: 'Producto Flotas lanzado a mediadores. Fuerte en flotas; individual vía autos.',
    requiredFields: [...STANDARD_FIELDS, 'history.yearsInsured'],
    priceFactor: 1.03,
    adjust: [[l => (Number(l.fleet?.size) || 1) >= 3, 0.88]],
    appetite: l => isADR(l) ? { ok: false, reason: 'No acepta mercancías peligrosas (ADR) en este producto' } : { ok: true },
    products: ladder({
      rc: RC(),
      ampliado: AMP({ paralizacion: 60 }),
      todo_riesgo: TR({ paralizacion: 60, franquicia: 1200 }),
    }),
    productName: 'Zurich Flotas / Vehículos Industriales',
  },
  {
    id: 'generali', name: 'Generali', color: '#c21b17', channel: 'portal',
    integration: 'Pólizas separadas vehículo y mercancía. Flota desde ~20 camiones.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 0.97,
    appetite: l => isADR(l) ? { ok: false, reason: 'ADR requiere póliza RC específica aparte' } : { ok: true },
    products: ladder({
      rc: RC({ asistencia: 'Desde 25 km' }),
      ampliado: AMP({ asistencia: 'Desde 25 km' }),
      todo_riesgo: TR({ asistencia: 'Desde 25 km', franquicia: 1200 }),
    }),
    productName: 'Generali Vehículos Industriales',
  },
  {
    id: 'reale', name: 'Reale', color: '#0a3b74', channel: 'portal',
    integration: 'Producto Autos Reale admite camiones >3.500 kg PMA. Portal de mediadores.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 0.95,
    appetite: l => l.use?.scope === 'internacional'
      ? { ok: false, reason: 'Ámbito internacional fuera de apetito' }
      : heavy(l) ? { ok: false, reason: 'MMA > 26 t fuera de apetito' } : { ok: true },
    products: ladder({
      rc: RC(),
      ampliado: AMP(),
      todo_riesgo: TR({ franquicia: 900 }),
    }),
    productName: 'Reale Autos – Camiones',
  },
  {
    id: 'helvetia', name: 'Helvetia', color: '#00a19a', channel: 'portal',
    integration: 'Seguro Camiones y Vehículos Pesados (>3.500 kg). Red de mediadores.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 1.01,
    appetite: l => oldVehicle(l, 20) ? { ok: false, reason: 'Vehículo con más de 20 años' } : { ok: true },
    products: ladder({
      rc: RC(),
      ampliado: AMP({ retiradaCarnet: 500 }),
      todo_riesgo: TR({ retiradaCarnet: 500, franquicia: 600 }),
    }),
    productName: 'Helvetia Camiones y Vehículos Pesados',
  },
  {
    id: 'mgs', name: 'MGS Seguros', color: '#e30613', channel: 'email',
    integration: 'Solo mediadores. Producto MGS Camiones (IPID 2025). Solicitud por email al suscriptor.',
    requiredFields: [...STANDARD_FIELDS, 'history.yearsInsured'],
    priceFactor: 0.93,
    appetite: l => isADR(l) || l.use?.cargo === 'animales'
      ? { ok: false, reason: 'No suscribe ADR ni animales vivos' } : { ok: true },
    products: ladder({
      rc: RC({ asistencia: 'Desde km 0' }),
      ampliado: AMP({ retiradaCarnet: 600 }),
      todo_riesgo: TR({ retiradaCarnet: 600, franquicia: 1000 }),
    }),
    productName: 'MGS Camiones',
  },
  {
    id: 'occident', name: 'Occident', color: '#00594f', channel: 'email',
    integration: 'Fuerte en transporte de mercancías (RC transportista / mercancía). Confirmar producto motor camión.',
    requiredFields: STANDARD_FIELDS,
    priceFactor: 1.06,
    defaultMode: 'manual',
    appetite: () => ({ ok: true }),
    products: ladder({
      rc: RC(),
      ampliado: AMP({ mercancia: 30_000 }),
      todo_riesgo: TR({ mercancia: 30_000, franquicia: 900 }),
    }),
    productName: 'Occident Vehículos Industriales',
  },
];
