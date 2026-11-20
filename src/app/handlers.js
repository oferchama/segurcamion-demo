// Application logic shared by the Express server (src/server.js) and the
// in-browser backend used on the static demo site (public/localApi.js).
// `store` must implement: list(), get(id), upsert(lead), find(fn), reset().
//
// Process: lead arrives → Allianz is quoted automatically (lead.allianzRun) →
// agent sends that offer by WhatsApp and asks for the missing data → data is
// completed → "Cotizar todas" (lead.lastRun) → full offer (PDF + WhatsApp).
import { completeness, set, FIELDS } from '../lead/schema.js';
import { fromWebForm, applyStep3, isStep3 } from '../lead/fromWebForm.js';
import { adapters, adapterById } from '../insurers/index.js';
import { quoteLead } from '../engine/orchestrator.js';
import { rank, TIERS, COVERAGES } from '../engine/compare.js';
import { offerHtml } from '../output/offerHtml.js';
import { whatsappMessage, missingDataMessage, allianzOfferMessage } from '../output/whatsapp.js';
import { fakeWebVisit, fakeClientReply } from '../demo/fakeLeads.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const NUMERIC = new Set(['vehicle.year', 'vehicle.mmaKg', 'vehicle.value', 'vehicle.valueNew', 'driver.age',
  'driver.licenseYears', 'history.yearsInsured', 'history.claims3y', 'history.currentPremium', 'fleet.size',
  'use.kmYear', 'cover.cargoLimit']);

export const allianzQuotes = lead => lead.allianzRun?.results?.find(r => r.insurerId === 'allianz')?.quotes ?? [];

/** Price to show in the lead list: full recommendation if quoted, else Allianz for the chosen modality. */
function listPrice(l) {
  const full = l.lastRun?.ranking?.byTier?.[l.lastRun.ranking.headlineTier]?.recommended;
  if (full) return { best: full.annualPremium, bestFrom: 'comparativa' };
  const q = allianzQuotes(l);
  const pick = q.find(x => x.tier === l.cover?.tier) ?? q.find(x => x.tier === 'rc_lunas') ?? q[0];
  return pick ? { best: pick.annualPremium, bestFrom: 'Allianz' } : { best: null };
}

const summary = l => ({
  id: l.id, receivedAt: l.receivedAt, status: l.status, formStep: l.formStep, demo: l.demo,
  name: [l.contact?.name, l.contact?.surname].filter(Boolean).join(' '), email: l.contact?.email,
  vehicle: [l.vehicle?.make, l.vehicle?.model].filter(Boolean).join(' ') || l.vehicle?.kind, mmaKg: l.vehicle?.mmaKg,
  // extra fields for the list search
  plate: l.vehicle?.plate, phone: l.contact?.phone, quoteRef: l.quoteRef, taxId: l.contact?.taxId,
  province: l.contact?.province, postalCode: l.contact?.postalCode,
  completeness: (({ have, total }) => ({ have, total }))(completeness(l, adapters)),
  ...listPrice(l),
});

function refreshStatus(lead) {
  const c = completeness(lead, adapters);
  if (!c.missing.length && ['nuevo', 'allianz_enviada'].includes(lead.status)) lead.status = 'datos_completos';
  return c;
}

export function createHandlers(store) {
  const need = id => {
    const lead = store.get(id);
    if (!lead) throw new HttpError(404, 'Lead no encontrado');
    return lead;
  };

  /** Allianz already prices every lead from the web form data: do it on arrival and whenever data changes. */
  async function quoteAllianz(lead) {
    lead.allianzRun = await quoteLead(lead, { only: ['allianz'] });
    store.upsert(lead);
    return lead;
  }
  const ensureAllianz = lead => (lead.allianzRun ? lead : quoteAllianz(lead));

  /** Website webhook: step 1 creates the lead, step 3 is merged by Nº de tarificación (or email). */
  async function ingestWebForm(post, { demo = false } = {}) {
    let lead, merged = false;
    if (isStep3(post)) {
      lead = (post.presupuesto && store.find(l => l.quoteRef === post.presupuesto))
        ?? (post.email && store.find(l => l.contact?.email === post.email && (l.formStep ?? 1) < 3));
      if (lead) { applyStep3(lead, post); merged = true; }
      else lead = applyStep3(fromWebForm({}, {}), post); // step 3 without a known step 1
    } else {
      lead = fromWebForm(post);
    }
    if (demo) lead.demo = true;
    refreshStatus(lead);
    store.upsert(lead);
    await quoteAllianz(lead);
    return { lead, merged };
  }

  return {
    meta: () => ({
      fields: FIELDS, tiers: TIERS, coverages: COVERAGES,
      insurers: adapters.map(a => ({ id: a.id, name: a.name, color: a.color, channel: a.channel, mode: a.defaultMode, integration: a.integration })),
    }),

    async listLeads() {
      await Promise.all(store.list().map(ensureAllianz));
      return store.list().map(summary);
    },

    async getLead(id) {
      const lead = await ensureAllianz(need(id));
      return { lead, completeness: completeness(lead, adapters) };
    },

    ingestWebForm,

    /** Agent edits: { "driver.age": 44, "vehicle.plate": "1234 KLM", ... } */
    async patchLead(id, body) {
      const lead = need(id);
      let changed = false;
      for (const [path, raw] of Object.entries(body ?? {})) {
        if (!(path in FIELDS)) continue;
        const v = raw === '' || raw == null ? undefined : NUMERIC.has(path) ? Number(raw) : raw;
        const before = JSON.stringify(path.split('.').reduce((o, k) => o?.[k], lead));
        set(lead, path, v);
        if (JSON.stringify(v) !== before) changed = true;
      }
      const c = refreshStatus(lead);
      store.upsert(lead);
      if (changed) await quoteAllianz(lead);
      return { lead, completeness: c };
    },

    missingMessage: (id, agent) => missingDataMessage(need(id), { agentName: agent }),

    /** Step 2 of the process: Allianz offer + request for the data the other insurers need. */
    async allianzMessage(id, agent) {
      const lead = await ensureAllianz(need(id));
      return allianzOfferMessage(lead, { agentName: agent });
    },

    markAllianzSent(id) {
      const lead = need(id);
      lead.allianzSentAt = new Date().toISOString();
      if (lead.status === 'nuevo') lead.status = 'allianz_enviada';
      store.upsert(lead);
      return { lead };
    },

    async quote(id, only) {
      const lead = need(id);
      const run = await quoteLead(lead, { only });
      lead.lastRun = run;
      lead.status = 'cotizado';
      store.upsert(lead);
      return run;
    },

    /** Human agent types in a price obtained by phone / portal / email. */
    manualQuote(id, { insurerId, tier, annualPremium, franquicia, ref } = {}) {
      const lead = need(id);
      const run = lead.lastRun;
      if (!run) throw new HttpError(400, 'Cotiza primero');
      const entry = adapterById[insurerId];
      if (!entry || !TIERS[tier] || !(Number(annualPremium) > 0)) throw new HttpError(400, 'Datos no válidos');
      const result = run.results.find(r => r.insurerId === insurerId);
      result.quotes = result.quotes.filter(q => q.tier !== tier);
      result.quotes.push({
        tier, product: entry.productName, annualPremium: Number(annualPremium),
        coverages: { ...entry.products[tier], ...(franquicia !== undefined && franquicia !== '' && { franquicia: Number(franquicia) }) },
        validUntil: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
        ref: ref || `MAN-${insurerId}-${lead.id}`, source: 'manual',
      });
      result.status = 'quoted';
      run.ranking = rank(run.results, lead);
      store.upsert(lead);
      return run;
    },

    /** Builds the full offer. Returns the print-ready HTML (the server also renders it to PDF). */
    offer(id, opts = {}) {
      const lead = need(id);
      if (!lead.lastRun) throw new HttpError(400, 'Cotiza primero');
      const html = offerHtml(lead, lead.lastRun, { ...opts, demo: lead.demo });
      lead.status = 'propuesta_lista';
      lead.offer = { ...opts, at: new Date().toISOString() };
      store.upsert(lead);
      return { lead, html, whatsapp: whatsappMessage(lead, lead.lastRun, opts) };
    },

    /** Demo: a visitor goes through the website form (step 1, and usually step 3). */
    async simulateLead() {
      const { step1, step3 } = fakeWebVisit();
      let { lead } = await ingestWebForm(step1, { demo: true });
      if (step3) ({ lead } = await ingestWebForm(step3, { demo: true }));
      return { lead, completeness: completeness(lead, adapters) };
    },

    /** Demo: the client answers the WhatsApp follow-up with the missing data. */
    async simulateReply(id) {
      const lead = need(id);
      const answers = fakeClientReply(lead);
      for (const [path, v] of Object.entries(answers)) if (v !== undefined) set(lead, path, v);
      const c = refreshStatus(lead);
      store.upsert(lead);
      await quoteAllianz(lead);
      return { lead, completeness: c };
    },

    reset() { store.reset(); return { ok: true }; },
  };
}
