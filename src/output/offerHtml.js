// Builds the client-facing offer as print-ready HTML (A4). pdf.js renders it.
import { COVERAGES, TIERS } from '../engine/compare.js';
import { FIELDS } from '../lead/schema.js';
import { BROKER } from '../config.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = n => n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const big = n => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n);
const dmy = iso => iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const opt = (path, v) => ({
  publico: 'Servicio público', privado: 'Servicio privado', nacional: 'Nacional', fronterizo: 'España, Francia y Portugal',
  internacional: 'Internacional', local: 'Local', regional: 'Regional', general: 'Mercancía general', adr: 'Mercancías peligrosas (ADR)',
  obras: 'Obras', frigorifica: 'Frigorífica', rigido: 'Camión rígido', tractora: 'Cabeza tractora',
}[v] ?? v);

function cell(c, q) {
  const v = q.coverages?.[c.key];
  if (c.key === 'franquicia' && v === 0) return 'Sin franquicia';
  if (v == null || v === false || v === 0) return '<span class="no">—</span>';
  if (v === true) return '<span class="yes">✓</span>';
  if (c.key === 'rcVoluntaria') return v >= 1e6 ? `${big(v / 1e6)} M€` : eur(v);
  if (typeof v === 'number') return eur(v);
  return esc(v);
}

function reasons(rec, offers, lead) {
  const out = [];
  const cheapest = offers[0];
  if (rec === cheapest) out.push('Es la opción más económica entre todas las compañías consultadas.');
  else out.push(`Solo ${eur(rec.annualPremium - cheapest.annualPremium)} más que la más barata, pero con coberturas claramente superiores.`);
  const c = rec.coverages;
  if (c.danosPropios) out.push(c.franquicia ? `Daños propios con franquicia de ${eur(c.franquicia)}.` : 'Daños propios sin franquicia.');
  if (c.asistencia) out.push(`Asistencia en carretera ${String(c.asistencia).toLowerCase()}, imprescindible para un vehículo de trabajo.`);
  if (c.retiradaCarnet) out.push(`Incluye subsidio por retirada de carnet (${eur(c.retiradaCarnet)}/mes).`);
  if (c.paralizacion) out.push(`Incluye indemnización por paralización (${eur(c.paralizacion)}/día).`);
  if (c.mercancia) out.push(`Cubre la mercancía transportada hasta ${eur(c.mercancia)}.`);
  return out.slice(0, 4);
}

/**
 * @param {object} lead
 * @param {object} quoteRun   output of orchestrator.quoteLead
 * @param {object} [o]        agent choices
 * @param {string} [o.tier]          tier to headline
 * @param {string} [o.recommendedId] insurerId to recommend (override)
 * @param {string[]} [o.exclude]     insurerIds to hide from the client
 * @param {string} [o.agentName]
 * @param {string} [o.note]          personal note from the agent
 * @param {string} [o.logoDataUri]
 */
export function offerHtml(lead, quoteRun, o = {}) {
  const exclude = new Set(o.exclude ?? []);
  const allOffers = quoteRun.ranking.byTier;
  const tier = o.tier && allOffers[o.tier] ? o.tier : quoteRun.ranking.headlineTier;
  const offers = (allOffers[tier]?.offers ?? []).filter(x => !exclude.has(x.insurerId));
  if (!offers.length) throw new Error('No hay ofertas para generar la propuesta');

  const rec = offers.find(x => x.insurerId === o.recommendedId) ?? allOffers[tier].recommended;
  const recOk = offers.includes(rec) ? rec : offers[0];
  const others = offers.filter(x => x !== recOk);
  const matrix = [recOk, ...others].slice(0, 5);
  const simulated = o.demo || offers.some(x => x.source === 'simulated');
  const insurersAsked = quoteRun.results.filter(r => r.status === 'quoted' && !exclude.has(r.insurerId)).length;
  const current = Number(lead.history?.currentPremium);
  const saving = current ? current - recOk.annualPremium : null;
  const ref = `SC-${lead.id}-${new Date(quoteRun.runAt).toISOString().slice(2, 10).replace(/-/g, '')}`;
  const validUntil = recOk.validUntil;

  // Price grid: insurer x tier, so the client sees the full picture.
  const insurers = [...new Map(Object.values(allOffers).flatMap(t => t.offers)
    .filter(x => !exclude.has(x.insurerId)).map(x => [x.insurerId, x.insurer])).entries()];
  const priceOf = (id, t) => allOffers[t]?.offers.find(x => x.insurerId === id)?.annualPremium;
  const tiers = Object.keys(TIERS).filter(t => allOffers[t]);
  const sortedInsurers = insurers.sort((a, b) => (priceOf(a[0], tier) ?? 1e9) - (priceOf(b[0], tier) ?? 1e9));

  const v = lead.vehicle ?? {}, u = lead.use ?? {}, c = lead.contact ?? {};
  const vehicleLine = [v.make, v.model].filter(Boolean).join(' ') || opt('', v.kind);

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Propuesta ${esc(ref)}</title>
<style>
  @page { size: A4; margin: 0; }
  :root { --navy:#142381; --navy-2:#0c1660; --orange:#fd9800; --orange-d:#ca7900; --ink:#1d2333; --mute:#6b7280;
          --line:#e3e6ef; --soft:#f4f5fa; --ok:#0f8a4b; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.45; }
  .page { width:210mm; min-height:297mm; padding: 0 16mm 18mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  header.top { margin: 0 -16mm 8mm; padding: 9mm 16mm 7mm; background: var(--navy); color:#fff; display:flex; justify-content:space-between; align-items:center; border-bottom: 2.2mm solid var(--orange); }
  .brand img { height: 13mm; filter: brightness(0) invert(1); }
  .brand .word { font-size: 20pt; font-weight: 800; letter-spacing: -.5px; }
  .brand .word b { color: var(--orange); }
  .meta { text-align:right; font-size: 9pt; opacity:.92; }
  .meta strong { display:block; font-size: 13pt; letter-spacing:.3px; }
  h1 { font-size: 19pt; margin: 4mm 0 1mm; color: var(--navy); letter-spacing: -.3px; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: .8px; color: var(--navy); margin: 8mm 0 3mm; }
  .lead-intro { color: var(--mute); margin: 0 0 5mm; }
  .facts { display:grid; grid-template-columns: repeat(3, 1fr); gap: 0; border:1px solid var(--line); border-radius: 3mm; overflow:hidden; }
  .facts div { padding: 3mm 4mm; border-right:1px solid var(--line); }
  .facts div:last-child { border-right: 0; }
  .facts small { display:block; color: var(--mute); font-size: 8pt; text-transform: uppercase; letter-spacing: .6px; }
  .facts span { font-weight: 600; }
  .hero { margin-top: 7mm; display:grid; grid-template-columns: 1.25fr 1fr; border-radius: 4mm; overflow:hidden; border: 1.5px solid var(--navy); }
  .hero .l { padding: 6mm 7mm; }
  .hero .r { background: var(--navy); color:#fff; padding: 6mm 7mm; display:flex; flex-direction:column; justify-content:center; }
  .tag { display:inline-block; background: var(--orange); color:#fff; font-weight:700; font-size: 8pt; padding: 1mm 2.5mm; border-radius: 1.5mm; text-transform: uppercase; letter-spacing: .8px; }
  .insurer { font-size: 17pt; font-weight: 800; margin: 2.5mm 0 0; color: var(--navy); }
  .product { color: var(--mute); margin-bottom: 3mm; }
  .hero ul { margin: 0; padding-left: 4.5mm; }
  .hero li { margin: 1mm 0; }
  .price { font-size: 30pt; font-weight: 800; line-height: 1; }
  .price small { font-size: 11pt; font-weight: 600; opacity:.8; }
  .tier { margin-top: 2mm; font-size: 10pt; opacity:.85; }
  .saving { margin-top: 5mm; background: var(--orange); color:#fff; border-radius: 2mm; padding: 2.5mm 3.5mm; font-weight: 700; }
  .saving small { display:block; font-weight: 500; opacity:.9; }
  table { width:100%; border-collapse: collapse; }
  .grid th, .grid td { padding: 2.4mm 3mm; border-bottom: 1px solid var(--line); text-align: right; }
  .grid th:first-child, .grid td:first-child { text-align:left; }
  .grid thead th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .6px; color: var(--mute); font-weight: 600; border-bottom: 1.5px solid var(--navy); }
  .grid thead th.sel { color: var(--navy); }
  .grid td.sel { font-weight: 700; background: var(--soft); }
  .grid tr.rec td { background: #fff4e0; }
  .grid tr.rec td:first-child { box-shadow: inset 1.2mm 0 0 var(--orange); font-weight:700; }
  .grid .no { color: #b8bcc8; }
  .grid .yes { color: var(--ok); font-weight: 800; }
  .note { font-size: 8.5pt; color: var(--mute); margin-top: 2mm; }
  .matrix th { font-size: 9pt; }
  .matrix td { font-size: 9.5pt; text-align:center !important; }
  .matrix td:first-child { text-align:left !important; }
  .matrix thead th { text-align:center; }
  .matrix thead th:first-child { text-align:left; }
  .matrix th.rec { background: var(--orange); color:#fff; border-radius: 2mm 2mm 0 0; }
  .matrix td.rec { background: #fff4e0; }
  .matrix tr.total td { font-weight: 800; font-size: 10.5pt; border-top: 1.5px solid var(--navy); border-bottom:0; }
  .steps { display:grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .step { background: var(--soft); border-radius: 3mm; padding: 4mm; }
  .step b { display:flex; align-items:center; gap: 2mm; color: var(--navy); }
  .step b i { font-style: normal; background: var(--orange); color:#fff; width: 6mm; height: 6mm; border-radius: 50%; display:inline-flex; align-items:center; justify-content:center; font-size: 9pt; }
  .step p { margin: 1.5mm 0 0; font-size: 9pt; }
  .agent { margin-top: 6mm; border-left: 1.2mm solid var(--orange); padding: 2mm 4mm; background: #fffaf2; }
  .cta { margin-top: 6mm; display:flex; align-items:center; justify-content:space-between; background: var(--navy); color:#fff; border-radius: 3mm; padding: 5mm 6mm; }
  .cta .big { font-size: 14pt; font-weight: 800; }
  .cta .wa { background:#25D366; color:#fff; padding: 2.5mm 5mm; border-radius: 10mm; font-weight: 700; }
  footer { position:absolute; left: 16mm; right: 16mm; bottom: 7mm; font-size: 7pt; color: var(--mute); border-top: 1px solid var(--line); padding-top: 2mm; }
  .wm { position:absolute; inset: 0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
  .wm span { transform: rotate(-30deg); font-size: 44pt; font-weight: 900; color: rgba(220, 38, 38, .08); white-space: nowrap; }
  .demo-banner { margin: -4mm 0 4mm; background: #fde8e8; color: #9b1c1c; font-size: 8.5pt; padding: 2mm 3mm; border-radius: 2mm; }
</style></head>
<body>

<section class="page">
  ${simulated ? '<div class="wm"><span>DEMO · PRECIOS SIMULADOS</span></div>' : ''}
  <header class="top">
    <div class="brand">${o.logoDataUri ? `<img src="${o.logoDataUri}" alt="SegurCamión">` : '<div class="word">Segur<b>Camión</b></div>'}</div>
    <div class="meta"><strong>Propuesta de seguro</strong>Ref. ${esc(lead.quoteRef ?? ref)} · ${dmy(quoteRun.runAt)}<br>Válida hasta ${dmy(validUntil)}</div>
  </header>
  ${simulated ? '<div class="demo-banner">Documento de demostración: datos de cliente ficticios y precios generados con un modelo simulado. No es una oferta real de ninguna aseguradora.</div>' : ''}

  <h1>${esc(c.name && c.holderType !== 'empresa' ? `Hola, ${c.name.split(' ')[0]}` : c.name ? `Propuesta para ${c.name.replace(/\s*\(.*\)/, '')}` : 'Tu propuesta personalizada')}</h1>
  <p class="lead-intro">Hemos comparado precio y coberturas de <b>${insurersAsked} aseguradora${insurersAsked === 1 ? '' : 's'}</b> para tu ${esc(opt('', v.kind).toLowerCase())}. Esta es nuestra recomendación.</p>

  <div class="facts">
    <div><small>Vehículo</small><span>${esc(vehicleLine)}${v.plate ? ` · ${esc(v.plate)}` : ''}</span><br>${v.mmaKg ? `${big(v.mmaKg / 1000)} t MMA` : ''}${v.year ? ` · ${v.year}` : ''}</div>
    <div><small>Uso</small><span>${esc(opt('', u.service))}</span><br>${esc(opt('', u.scope))} · ${esc(opt('', u.cargo))}</div>
    <div><small>Efecto</small><span>${dmy(lead.policy?.startDate)}</span><br>CP ${esc(c.postalCode)}${c.province ? ` (${esc(c.province)})` : ''}</div>
  </div>

  <div class="hero">
    <div class="l">
      <span class="tag">Nuestra recomendación</span>
      <div class="insurer">${esc(recOk.insurer)}</div>
      <div class="product">${esc(recOk.product)}</div>
      <ul>${reasons(recOk, offers, lead).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>
    <div class="r">
      <div class="price">${big(recOk.annualPremium)} €<small> /año</small></div>
      <div class="tier">${esc(TIERS[tier].label)} · impuestos incluidos</div>
      ${saving > 0 ? `<div class="saving">Ahorras ${eur(saving)} al año<small>frente a los ${eur(current)} que pagas ahora${lead.history?.currentInsurer ? ` en ${esc(lead.history.currentInsurer)}` : ''}</small></div>` : ''}
    </div>
  </div>

  <h2>Comparativa de precios</h2>
  <table class="grid">
    <thead><tr><th>Aseguradora</th>${tiers.map(t => `<th class="${t === tier ? 'sel' : ''}">${esc(TIERS[t].short)}</th>`).join('')}</tr></thead>
    <tbody>
      ${sortedInsurers.map(([id, name]) => `<tr class="${id === recOk.insurerId ? 'rec' : ''}"><td>${esc(name)}${id === recOk.insurerId ? ' ★' : ''}</td>${tiers.map(t => `<td class="${t === tier ? 'sel' : ''}">${eur(priceOf(id, t))}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p class="note">Primas anuales con impuestos y recargo del Consorcio. "—": la compañía no ofrece esa modalidad para tu vehículo.</p>

  <footer>${esc(BROKER.legal)}</footer>
</section>

<section class="page">
  ${simulated ? '<div class="wm"><span>DEMO · PRECIOS SIMULADOS</span></div>' : ''}
  <header class="top">
    <div class="brand">${o.logoDataUri ? `<img src="${o.logoDataUri}" alt="SegurCamión">` : '<div class="word">Segur<b>Camión</b></div>'}</div>
    <div class="meta"><strong>${esc(TIERS[tier].label)}</strong>Comparativa de coberturas</div>
  </header>

  <h2 style="margin-top:2mm">Qué incluye cada opción</h2>
  <table class="grid matrix">
    <thead><tr><th>Cobertura</th>${matrix.map((q, i) => `<th class="${i === 0 ? 'rec' : ''}">${esc(q.insurer)}</th>`).join('')}</tr></thead>
    <tbody>
      ${COVERAGES.filter(cv => matrix.some(q => q.coverages?.[cv.key] || (cv.key === 'franquicia' && q.coverages?.danosPropios))).map(cv =>
        `<tr><td>${esc(cv.label)}</td>${matrix.map((q, i) => `<td class="${i === 0 ? 'rec' : ''}">${cell(cv, q)}</td>`).join('')}</tr>`).join('')}
      <tr class="total"><td>Prima anual</td>${matrix.map((q, i) => `<td class="${i === 0 ? 'rec' : ''}">${eur(q.annualPremium)}</td>`).join('')}</tr>
    </tbody>
  </table>

  ${o.note ? `<div class="agent"><b>${esc(o.agentName ?? 'Tu asesor')}:</b> ${esc(o.note)}</div>` : ''}

  <h2>Cómo contratar</h2>
  <div class="steps">
    <div class="step"><b><i>1</i> Confírmanos</b><p>Responde a nuestro WhatsApp con “Sí, ${esc(recOk.insurer)}” o elige otra opción de la tabla.</p></div>
    <div class="step"><b><i>2</i> Documentación</b><p>Permiso de circulación, ficha técnica, ${c.holderType === 'empresa' ? 'CIF y escrituras' : 'DNI/NIE'} y certificado de siniestralidad de tu aseguradora actual.</p></div>
    <div class="step"><b><i>3</i> Firma y circula</b><p>Te enviamos la póliza para firma digital. Nos encargamos de la baja en tu compañía actual.</p></div>
  </div>

  <div class="cta">
    <div><div class="big">¿Dudas? Habla con ${esc(o.agentName ?? 'tu asesor')}</div>${esc(BROKER.phoneDisplay)} · ${esc(BROKER.email)}</div>
    <div class="wa">WhatsApp ${esc(BROKER.phoneDisplay)}</div>
  </div>

  <h2>Información importante</h2>
  <p class="note" style="font-size:8pt">
    Esta propuesta se basa en los datos que nos has facilitado${lead.history?.claims3y != null ? ` (${Number(lead.history.claims3y) === 0 ? 'sin siniestros con culpa en los últimos 3 años' : `con ${lead.history.claims3y} siniestro${lead.history.claims3y == 1 ? '' : 's'} con culpa en los últimos 3 años`})` : ''}.
    El precio definitivo queda sujeto a la verificación de tu historial en el fichero SINCO y a la aceptación del riesgo por la aseguradora.
    Como corredor independiente, hemos realizado un análisis objetivo entre las ofertas de ${insurersAsked} entidades, conforme al RDL 3/2020 de distribución de seguros.
    El documento de información del producto (IPID) de cada seguro y la información previa del corredor están a tu disposición y se adjuntan con la póliza.
    Precios válidos hasta el ${dmy(validUntil)}.
  </p>

  <footer>${esc(BROKER.legal)}</footer>
</section>
</body></html>`;
}

export { FIELDS };
