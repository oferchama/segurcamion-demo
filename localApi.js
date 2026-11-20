// In-browser backend for the static demo (GitHub Pages). Implements the same
// routes as src/server.js on top of the same shared handlers, with leads kept
// in this browser's localStorage. Nothing leaves the browser.
import { createHandlers, HttpError } from './src/app/handlers.js';
import { normaliseSeed } from './src/lead/fromWebForm.js';

const KEY = 'segurcamion-demo-leads-v3';
let seed = [];
let leads = [];

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(leads)); } catch { /* private mode: keep in memory */ } };
const fresh = () => seed.map(normaliseSeed).map(l => ({ ...l, demo: true }));

const store = {
  list: () => leads,
  get: id => leads.find(l => l.id === id),
  find: fn => leads.find(fn),
  upsert(lead) {
    const i = leads.findIndex(l => l.id === lead.id);
    if (i >= 0) leads[i] = lead; else leads.unshift(lead);
    save();
    return lead;
  },
  reset() { leads = fresh(); save(); },
};

const h = createHandlers(store);

export async function init() {
  seed = await (await fetch(new URL('./data/leads.json', document.baseURI))).json();
  leads = load() ?? fresh();
  save();
}

const routes = [
  ['GET', /^\/api\/meta$/, () => ({ ...h.meta(), mode: 'local' })],
  ['GET', /^\/api\/leads$/, () => h.listLeads()],
  ['GET', /^\/api\/leads\/([^/]+)$/, ([id]) => h.getLead(id)],
  ['PATCH', /^\/api\/leads\/([^/]+)$/, ([id], body) => h.patchLead(id, body)],
  ['GET', /^\/api\/leads\/([^/]+)\/missing-message$/, ([id], _b, q) => h.missingMessage(id, q.get('agent'))],
  ['GET', /^\/api\/leads\/([^/]+)\/allianz-message$/, ([id], _b, q) => h.allianzMessage(id, q.get('agent'))],
  ['POST', /^\/api\/leads\/([^/]+)\/allianz-sent$/, ([id]) => h.markAllianzSent(id)],
  ['POST', /^\/api\/leads\/([^/]+)\/quote$/, ([id], body) => h.quote(id, body?.only)],
  ['POST', /^\/api\/leads\/([^/]+)\/manual-quote$/, ([id], body) => h.manualQuote(id, body)],
  ['POST', /^\/api\/leads\/([^/]+)\/simulate-reply$/, ([id]) => h.simulateReply(id)],
  ['POST', /^\/api\/leads\/([^/]+)\/offer$/, ([id], body) => { const { html, whatsapp } = h.offer(id, body); return { html, whatsapp }; }],
  ['POST', /^\/api\/simulate$/, () => h.simulateLead()],
  ['POST', /^\/api\/reset$/, () => h.reset()],
];

export async function localApi(path, { method = 'GET', body } = {}) {
  const url = new URL(path, 'http://local');
  for (const [m, re, fn] of routes) {
    const match = m === method && url.pathname.match(re);
    if (!match) continue;
    try {
      return structuredClone(await fn(match.slice(1).map(decodeURIComponent), body, url.searchParams));
    } catch (e) {
      throw new Error(e instanceof HttpError ? e.message : `Error: ${e.message}`);
    }
  }
  throw new Error(`Ruta no encontrada: ${method} ${url.pathname}`);
}
