// Dummy data for demos. Produces the SAME raw POST payloads the website sends,
// so simulated leads exercise the real mapping code. All people, documents and
// phones are fictitious; emails use the reserved example.com domain.

const pick = a => a[Math.floor(Math.random() * a.length)];
const weighted = pairs => { // [[value, weight], ...]
  let r = Math.random() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs.at(-1)[0];
};
const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pad = (n, l) => String(n).padStart(l, '0');

const NAMES = ['Javier', 'Antonio', 'Manuel', 'José', 'David', 'Francisco', 'Daniel', 'Carlos', 'Miguel', 'Alberto', 'Rubén', 'Iker', 'Laura', 'Marta', 'Cristina', 'Raquel'];
const SURNAMES = ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Herrera', 'Ortiz', 'Castro', 'Iglesias', 'Sainz', 'Echevarría', 'Cuesta'];
const COMPANY = ['Transportes', 'Logística', 'Áridos', 'Excavaciones', 'Distribuciones', 'Mudanzas', 'Frigoríficos'];
const COMPANY_2 = ['del Norte', 'Cantábrico', 'Hermanos Ruiz', 'Montaña', 'Ebro', 'Costa', 'Meseta', 'Peña', 'Levante', 'Sur'];
const PLACES = [ // [cp, provincia]
  ['39610', 'Cantabria'], ['39011', 'Cantabria'], ['48950', 'Bizkaia'], ['28830', 'Madrid'], ['08940', 'Barcelona'],
  ['46470', 'Valencia'], ['41703', 'Sevilla'], ['50197', 'Zaragoza'], ['33211', 'Asturias'], ['47012', 'Valladolid'],
  ['15142', 'A Coruña'], ['30820', 'Murcia'], ['03114', 'Alicante'], ['09001', 'Burgos'], ['31192', 'Navarra'],
];
const LIGHT = ['Iveco Eurocargo 120E25', 'MAN TGL 12.250', 'Mercedes-Benz Atego 1224', 'Renault D 12', 'DAF LF 230', 'Volvo FL 250', 'Isuzu F-Series N75'];
const HEAVY = ['Scania R 450', 'Volvo FH 500', 'MAN TGX 18.510', 'DAF XF 480', 'Mercedes-Benz Actros 1845', 'Iveco S-Way 490', 'Renault T 480'];
const INSURERS = [['Mapfre', 18], ['Allianz', 12], ['Axa', 12], ['Generali', 8], ['Reale', 7], ['Zurich', 6], ['Helvetia', 5],
  ['Mutua Madrileña', 5], ['Occident - Plus Ultra - Seguros Bilbao', 6], ['Línea Directa', 4], ['Otra aseguradora', 5],
  ['No sé', 4], ['Tiene seguro, pero no sé con qué aseguradora', 3], ['No tiene seguro', 3], ['', 10]];

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const fakeDni = () => { const n = int(10000000, 99999999); return `${n}${DNI_LETTERS[n % 23]}`; };
const fakeCif = () => `B${int(10000000, 99999999)}`;
const fakePlate = () => `${pad(int(0, 9999), 4)} ${Array.from({ length: 3 }, () => pick('BCDFGHJKLMNPRSTVWXYZ')).join('')}`;
const fmtEuros = n => `${new Intl.NumberFormat('es-ES').format(n)},00`;

function quoteRef(d = new Date()) {
  return `CA${pad(d.getFullYear() % 100, 2)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${int(1000, 9999)}`;
}
function startDate() {
  const d = new Date(); d.setDate(d.getDate() + int(5, 60));
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
}

/**
 * One visitor going through the website.
 * @returns {{ step1: object, step3: object|null }} raw POST bodies (step 3 also carries t from step 2)
 */
export function fakeWebVisit({ completeStep3 = Math.random() < 0.75 } = {}) {
  const tractora = Math.random() < 0.2;
  const band = tractora ? 1 : weighted([[4, 10], [5, 12], [6, 22], [7, 18], [8, 12], [9, 12], [10, 6]]);
  const heavy = tractora || band >= 8;
  const [cp, provincia] = pick(PLACES);
  const ref = quoteRef();
  const id = int(1000, 9999);
  const step1 = {
    tipo_vehiculo: String(band),
    ambito: weighted([['11', 70], ['110', 18], ['12', heavy ? 15 : 4]]),
    uso_vehiculo: weighted([['16', 85], ['17', 15]]),
    tipo_mercancia: weighted([['14', 78], ['13', 14], ['15', heavy ? 10 : 3]]),
    valor_nuevo: fmtEuros(Math.round((heavy ? int(95, 160) : int(45, 100)) * 1000 / 500) * 500),
    cp, provincia,
    fecha_comienzo: startDate(),
    email: `demo${id}@example.com`,
    'acepta-recibir-emails': 'on',
    presupuesto: ref,
  };
  if (!completeStep3) return { step1, step3: null };

  const empresa = Math.random() < 0.35;
  const docType = empresa ? '2' : weighted([['1', 85], ['4', 15]]);
  const ins = weighted(INSURERS);
  const step3 = {
    presupuesto: ref,
    t: String(weighted([[5, 22], [6, 30], [7, 18], [8, 22], [9, 8]])),
    fecha_comienzo: step1.fecha_comienzo,
    email: step1.email,
    marca_modelo_vehiculo: pick(heavy ? HEAVY : LIGHT),
    matricula: fakePlate(),
    mecanismos: weighted([['2', 75], ['1', 25]]),
    tipo_documento: docType,
    numero_documento: docType === '2' ? fakeCif() : fakeDni(),
    nombre_tomador: empresa ? `${pick(COMPANY)} ${pick(COMPANY_2)} SL (DEMO)` : `${pick(NAMES)} (DEMO)`,
    apellidos_tomador: empresa ? '' : `${pick(SURNAMES)} ${pick(SURNAMES)}`,
    telefono: `6${int(10, 99)} ${pad(int(0, 999), 3)} ${pad(int(0, 999), 3)}`,
    compania_actual: ins,
    numero_poliza: ins && !/^No|^Tiene/.test(ins) && Math.random() < 0.5 ? String(int(10000000, 99999999)) : '',
  };
  // Proposed OPTIONAL block: about 40% of visitors answer some of it, the rest skip it.
  if (Math.random() < 0.4) {
    const age = int(24, 62);
    const opt = {
      anio_matriculacion: String(int(new Date().getFullYear() - 14, new Date().getFullYear() - 1)),
      edad_conductor: String(age),
      anos_carnet_c: String(Math.max(1, Math.min(age - 21, int(2, 30)))),
      siniestros_3_anos: String(weighted([[0, 70], [1, 22], [2, 8]])),
      anos_asegurado: String(int(0, 15)),
      prima_actual: Math.random() < 0.5 ? fmtEuros(int(9, 30) * 100) : '',
    };
    for (const [k, v] of Object.entries(opt)) if (Math.random() < 0.7) step3[k] = v;
  }
  return { step1, step3 };
}

/** What a client typically answers to the WhatsApp follow-up. */
export function fakeClientReply(lead) {
  const age = int(24, 62);
  const yearNow = new Date().getFullYear();
  const known = lead.history?.currentInsurer && !/^No|^Tiene/.test(lead.history.currentInsurer);
  return {
    'vehicle.year': lead.vehicle?.year ?? int(yearNow - 14, yearNow - 1),
    'driver.age': lead.driver?.age ?? age,
    'driver.licenseYears': lead.driver?.licenseYears ?? Math.max(1, Math.min(age - 21, int(2, 30))),
    'history.claims3y': lead.history?.claims3y ?? weighted([[0, 70], [1, 22], [2, 8]]),
    'history.yearsInsured': lead.history?.yearsInsured ?? (known ? int(1, 15) : 0),
    'history.currentPremium': lead.history?.currentPremium ?? (known ? int(9, 30) * 100 : undefined),
    'vehicle.attachedEquipment': lead.vehicle?.attachedEquipment ?? 'no',
    'contact.phone': lead.contact?.phone ?? `6${int(10, 99)} ${pad(int(0, 999), 3)} ${pad(int(0, 999), 3)}`,
    'contact.name': lead.contact?.name ?? `${pick(NAMES)} (DEMO)`,
    'contact.taxId': lead.contact?.taxId ?? fakeDni(),
    'vehicle.plate': lead.vehicle?.plate ?? fakePlate(),
  };
}
