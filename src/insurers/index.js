// Turns catalog entries into runnable adapters. Runs in Node and the browser.
// Modes:
//   live      -> call the real connector (API / RPA / email bot) in connectors/
//   simulated -> demo pricing (insurers/pricing.js), clearly flagged everywhere
//   manual    -> no call; create a pre-filled task for the human agent
import { CATALOG } from './catalog.js';
import { simulatePremium } from './pricing.js';
import { FIELDS, get, vehicleAge } from '../lead/schema.js';
import { TIERS } from '../engine/compare.js';
import { connectors } from './connectors/index.js';

const env = globalThis.process?.env ?? {};
const TIER_ORDER = Object.keys(TIERS);
const MAX_AGE = { todo_riesgo: 12, todo_riesgo_sf: 8 };

function tiersFor(lead, entry) {
  const age = vehicleAge(lead);
  const hasValue = lead.vehicle?.value || lead.vehicle?.valueNew;
  return TIER_ORDER
    .filter(t => !entry.tiers || entry.tiers.includes(t))
    .filter(t => !MAX_AGE[t] || (hasValue && (age == null || age <= MAX_AGE[t])));
}

function validUntil(days = 15) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A copy-paste-ready data sheet for the human agent / underwriter email. */
function dataSheet(lead, entry) {
  const paths = [...new Set([...entry.requiredFields.flatMap(p => p.split('|')),
    'vehicle.model', 'vehicle.valueNew', 'vehicle.attachedEquipment', 'history.currentInsurer', 'history.yearsInsured'])];
  return paths.map(p => {
    const v = get(lead, p);
    return v == null || v === '' ? null : `${FIELDS[p]?.label ?? p}: ${v}`;
  }).filter(Boolean).join('\n');
}

function buildAdapter(entry) {
  const defaultMode = env[`MODE_${entry.id.toUpperCase()}`] ?? entry.defaultMode ??
    (entry.id === 'allianz' && env.ALLIANZ_API_URL ? 'live' : 'simulated');

  return {
    ...entry,
    defaultMode,
    async quote(lead, { mode }) {
      if (mode === 'live') {
        const connector = connectors[entry.id];
        if (!connector) throw new Error(`Conector real de ${entry.name} aún no implementado`);
        return connector.quote(lead, entry);
      }
      // simulated: tiny artificial latency so the UI behaves like the real thing
      await new Promise(r => setTimeout(r, 150 + Math.random() * 500));
      return tiersFor(lead, entry).map(tier => ({
        tier,
        product: entry.productName,
        annualPremium: simulatePremium(lead, entry, tier),
        coverages: entry.products[tier],
        validUntil: validUntil(),
        ref: `SIM-${entry.id.toUpperCase()}-${lead.id}-${tier}`,
        source: 'simulated',
      }));
    },
    manualTask(lead) {
      const subject = `Solicitud de cotización camión – ${lead.vehicle?.plate ?? lead.vehicle?.make ?? ''} – ref ${lead.quoteRef ?? lead.id}`;
      const wanted = TIERS[lead.cover?.tier]?.label;
      const body = `Hola,\n\nOs pedimos cotización para el siguiente riesgo:\n\n${dataSheet(lead, entry)}\n\n` +
        `Modalidad solicitada por el cliente: ${wanted ?? 'a valorar'} (y, si es posible, el resto de modalidades).\n` +
        `Fecha de efecto: ${lead.policy?.startDate ?? 'a convenir'}\n\nGracias,\nSegurCamión – Sadema Asesores Correduría de Seguros`;
      return { channel: entry.channel, integration: entry.integration, subject, body };
    },
  };
}

export const adapters = CATALOG.map(buildAdapter);
export const adapterById = Object.fromEntries(adapters.map(a => [a.id, a]));
