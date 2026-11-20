// Canonical lead model. The web form, WhatsApp follow-ups, plate lookups and
// the human agent all write into this one shape; adapters read only from it.

export const FIELDS = {
  // Tomador / contacto
  'contact.name':        { label: 'Nombre o razón social', ask: '¿A nombre de quién o de qué empresa irá el seguro?' },
  'contact.surname':     { label: 'Apellidos' },
  'contact.phone':       { label: 'Teléfono (WhatsApp)' },
  'contact.email':       { label: 'Email' },
  'contact.taxIdType':   { label: 'Tipo de documento', options: ['NIF', 'CIF', 'NIE', 'Otro'] },
  'contact.taxId':       { label: 'Nº de documento', ask: '¿Nos indicas el NIF o CIF del titular?' },
  'contact.holderType':  { label: 'Tipo de titular', options: ['autonomo', 'empresa'] },
  'contact.postalCode':  { label: 'Código postal de circulación', ask: '¿En qué código postal duerme habitualmente el camión?' },

  // Vehículo
  'vehicle.kind':        { label: 'Tipo de vehículo', options: ['rigido', 'tractora'] },
  'vehicle.plate':       { label: 'Matrícula', ask: '¿Cuál es la matrícula del camión? (si aún no la tiene, dinos marca y modelo)' },
  'vehicle.make':        { label: 'Marca' },
  'vehicle.model':       { label: 'Modelo' },
  'vehicle.year':        { label: 'Año de 1ª matriculación', ask: '¿De qué año es el camión?' },
  'vehicle.mmaKg':       { label: 'MMA (kg)', ask: '¿Cuál es la MMA del camión (en kg o toneladas)? Viene en la ficha técnica, apartado F.2.' },
  'vehicle.body':        { label: 'Carrocería', options: ['caja', 'lona', 'frigorifico', 'volquete', 'cisterna', 'portavehiculos', 'grua', 'hormigonera', 'otro'] },
  'vehicle.valueNew':    { label: 'Valor de nuevo (€, sin IVA)' },
  'vehicle.value':       { label: 'Valor actual (€)', ask: '¿Qué valor aproximado tiene el camión hoy, con carrocería incluida?' },
  'vehicle.attachedEquipment': { label: 'Mecanismos acoplados', options: ['si', 'no'], ask: '¿Lleva mecanismos acoplados (grúa, volquete, plataforma…)?' },

  // Uso
  'use.service':         { label: 'Servicio', options: ['publico', 'privado'], ask: '¿Es transporte para terceros (servicio público, con tarjeta MDP) o para tu propia actividad (servicio privado)?' },
  'use.scope':           { label: 'Ámbito', options: ['local', 'regional', 'nacional', 'fronterizo', 'internacional'], ask: '¿Por dónde circula normalmente: local, provincia, toda España, España+Francia+Portugal o internacional?' },
  'use.cargo':           { label: 'Tipo de mercancía', options: ['general', 'obras', 'frigorifica', 'adr', 'aridos', 'animales', 'vehiculos', 'mudanzas', 'paqueteria', 'otro'], ask: '¿Qué tipo de mercancía transporta?' },
  'use.kmYear':          { label: 'Km/año aprox.' },

  // Conductor
  'driver.age':          { label: 'Edad del conductor habitual', ask: '¿Qué edad tiene el conductor habitual?' },
  'driver.licenseYears': { label: 'Años con carnet C', ask: '¿Cuántos años lleva con el carnet C?' },

  // Historial
  'history.currentInsurer':  { label: 'Aseguradora actual', options: ['Allianz', 'Axa', 'Caser', 'Divina Seguros - Asegrup', 'Generali', 'Helvetia', 'Línea Directa', 'Mapfre', 'Mutua Madrileña', 'Occident - Plus Ultra - Seguros Bilbao', 'Reale', 'Zurich', 'Otra aseguradora', 'No sé', 'No tiene seguro', 'No tiene seguro, pero tomador tiene asegurado otro camión', 'Tiene seguro, pero no sé con qué aseguradora'] },
  'history.policyNumber':    { label: 'Nº de póliza actual' },
  'history.renewalDate':     { label: 'Fecha de vencimiento', ask: '¿Cuándo vence tu seguro actual?' },
  'history.yearsInsured':    { label: 'Años asegurado sin interrupción', ask: '¿Cuántos años lleva asegurado sin interrupción?' },
  'history.claims3y':        { label: 'Siniestros con culpa (3 años)', ask: '¿Cuántos partes con culpa has tenido en los últimos 3 años?' },
  'history.currentPremium':  { label: 'Prima actual (€/año)', ask: '¿Cuánto pagas ahora al año? Así te decimos cuánto ahorras.' },

  // Lo que quiere
  'cover.tier':          { label: 'Cobertura elegida en la web', options: ['rc', 'rc_lunas', 'ampliado', 'todo_riesgo', 'todo_riesgo_sf'] },
  'cover.cargoLimit':    { label: 'Límite mercancía (€)' },
  'cover.extras':        { label: 'Extras', multi: ['retirada_carnet', 'paralizacion', 'accidentes_conductor', 'mercancia'] },
  'fleet.size':          { label: 'Nº de vehículos' },
  'policy.startDate':    { label: 'Fecha de efecto' },
};

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function set(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
  return obj;
}

const isEmpty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Required paths that are still empty. `a|b` means "either a or b". */
export function missingFields(lead, required = []) {
  return required.filter(p => p.split('|').every(alt => isEmpty(get(lead, alt))));
}

/** Union of everything the enabled insurers need, with labels and questions. */
export function completeness(lead, adapters) {
  const all = [...new Set(adapters.flatMap(a => a.requiredFields))];
  const missing = missingFields(lead, all);
  return {
    total: all.length,
    have: all.length - missing.length,
    missing: missing.map(p => {
      const first = p.split('|')[0];
      return {
        path: p,
        label: p.split('|').map(x => FIELDS[x]?.label ?? x).join(' o '),
        ask: FIELDS[first]?.ask,
        neededBy: adapters.filter(a => a.requiredFields.includes(p)).map(a => a.name),
      };
    }),
  };
}

export const vehicleAge = lead => lead?.vehicle?.year ? new Date().getFullYear() - Number(lead.vehicle.year) : null;
