// Runs every enabled insurer adapter against a lead in parallel and collects
// normalised results. One slow/broken insurer never blocks the others.
import { adapters } from '../insurers/index.js';
import { missingFields } from '../lead/schema.js';
import { rank } from './compare.js';

const DEFAULT_TIMEOUT_MS = 45_000;

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${label}: sin respuesta en ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/**
 * @param {object} lead normalised lead (see lead/schema.js)
 * @param {object} [opts]
 * @param {string[]} [opts.only] restrict to these insurer ids
 * @param {object}  [opts.config] per-insurer config: { [id]: { mode, enabled } }
 * @returns {Promise<{runAt:string, results:object[], ranking:object}>}
 */
export async function quoteLead(lead, opts = {}) {
  const config = opts.config ?? {};
  const selected = adapters.filter(a =>
    (config[a.id]?.enabled ?? true) && (!opts.only || opts.only.includes(a.id)));

  const results = await Promise.all(selected.map(async adapter => {
    const mode = config[adapter.id]?.mode ?? adapter.defaultMode;
    const base = { insurerId: adapter.id, insurer: adapter.name, channel: adapter.channel, mode };

    // 1. Appetite: does this insurer even write this risk?
    const appetite = adapter.appetite(lead);
    if (!appetite.ok) return { ...base, status: 'declined', reason: appetite.reason, quotes: [] };

    // 2. Data completeness for this specific insurer.
    const missing = missingFields(lead, adapter.requiredFields);
    if (missing.length) return { ...base, status: 'needs_data', missing, quotes: [] };

    // 3. Manual insurers become a pre-filled task for the human agent.
    if (mode === 'manual') return { ...base, status: 'manual_task', quotes: [], task: adapter.manualTask?.(lead) };

    const started = Date.now();
    try {
      const quotes = await withTimeout(adapter.quote(lead, { mode }), adapter.timeoutMs ?? DEFAULT_TIMEOUT_MS, adapter.name);
      return { ...base, status: quotes.length ? 'quoted' : 'no_offer', quotes, ms: Date.now() - started };
    } catch (err) {
      return { ...base, status: 'error', error: err.message, quotes: [], ms: Date.now() - started };
    }
  }));

  return { runAt: new Date().toISOString(), results, ranking: rank(results, lead) };
}
