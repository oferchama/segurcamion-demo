// WhatsApp texts. Two moments: (1) ask for the data the form doesn't collect,
// (2) send the offer. Returns text + a wa.me link the agent clicks (works with
// the existing WhatsApp Business number today). The WhatsApp Cloud API needs
// approved templates for business-initiated messages; see PLAN.md.
import { completeness } from '../lead/schema.js';
import { TIERS } from '../engine/compare.js';
import { adapters } from '../insurers/index.js';

const eur = n => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
// Demo leads have fictitious phones: link without a number so WhatsApp asks who to send it to.
const waLink = (lead, text) => lead.demo || !lead.contact?.phone
  ? `https://wa.me/?text=${encodeURIComponent(text)}`
  : `https://wa.me/${String(lead.contact.phone).replace(/\D/g, '').replace(/^(?=[6789]\d{8}$)/, '34')}?text=${encodeURIComponent(text)}`;
const firstName = l => l.contact?.holderType === 'empresa' ? '' : (l.contact?.name?.split(' ')[0] ?? '');

export function missingDataMessage(lead, { agentName = 'Marta' } = {}) {
  const { missing } = completeness(lead, adapters);
  const qs = missing.map(m => m.ask).filter(Boolean);
  const text = `Hola${firstName(lead) ? ' ' + firstName(lead) : ''}, soy ${agentName} de SegurCamión 🚚\n\n` +
    `Hemos recibido tu solicitud y ya estamos comparando precios para tu camión. Para darte el mejor precio, nos faltan ${qs.length} dato${qs.length === 1 ? '' : 's'}:\n\n` +
    qs.map((q, i) => `${i + 1}. ${q}`).join('\n') +
    `\n\nSi te es más fácil, mándanos una foto del permiso de circulación y de la ficha técnica y lo rellenamos nosotros.`;
  return { text, link: waLink(lead, text), missing };
}

/**
 * First contact: the Allianz price (quoted automatically when the lead arrived)
 * plus the questions the other insurers need. Leads that stopped at step 1
 * have no phone, so an email link is returned as well.
 */
export function allianzOfferMessage(lead, { agentName = 'Marta' } = {}) {
  const quotes = lead.allianzRun?.results?.find(r => r.insurerId === 'allianz')?.quotes ?? [];
  if (!quotes.length) return { text: '', link: null, error: 'Allianz no ha devuelto precio para este lead' };
  const chosen = quotes.find(q => q.tier === lead.cover?.tier);
  const shown = chosen ? [chosen] : quotes.filter(q => ['rc', 'rc_lunas', 'todo_riesgo'].includes(q.tier));
  const { missing } = completeness(lead, adapters);
  const qs = missing.map(m => m.ask).filter(Boolean);
  const v = lead.vehicle ?? {};
  const truck = [v.make, v.model].filter(Boolean).join(' ') || (v.kind === 'tractora' ? 'tu cabeza tractora' : 'tu camión');

  const text = `Hola${firstName(lead) ? ' ' + firstName(lead) : ''}, soy ${agentName} de SegurCamión 👋\n\n` +
    `Gracias por tu solicitud. Ya tenemos una primera oferta de *Allianz* para ${truck}${v.mmaKg ? ` (${v.mmaKg / 1000} t)` : ''}:\n` +
    shown.map(q => `✅ ${TIERS[q.tier].label}: *${eur(q.annualPremium)}/año*`).join('\n') +
    `\n_(impuestos incluidos; sujeto a verificación de siniestralidad)_\n\n` +
    (qs.length
      ? `Queremos compararla con otras aseguradoras para intentar mejorarla. ¿Nos ayudas con ${qs.length === 1 ? 'este dato' : `estos ${qs.length} datos`}?\n\n` +
        qs.map((q, i) => `${i + 1}. ${q}`).join('\n') +
        `\n\nSi te es más fácil, mándanos una foto del permiso de circulación y de la ficha técnica.`
      : `Ya tenemos todos tus datos: en unas horas te enviamos la comparativa con otras aseguradoras.`);

  const email = lead.contact?.email;
  const emailLink = email && !lead.contact?.phone
    ? `mailto:${email}?subject=${encodeURIComponent('Tu oferta de seguro de camión – SegurCamión')}&body=${encodeURIComponent(text.replace(/\*/g, '').replace(/_/g, ''))}`
    : null;
  return { text, link: waLink(lead, text), emailLink, hasPhone: !!lead.contact?.phone, missing: qs.length };
}

export function whatsappMessage(lead, run, { tier, recommendedId, agentName = 'Marta' } = {}) {
  const t = tier ?? run.ranking.headlineTier;
  const block = run.ranking.byTier[t];
  const rec = block.offers.find(o => o.insurerId === recommendedId) ?? block.recommended;
  const asked = run.results.filter(r => r.status === 'quoted').length;
  const current = Number(lead.history?.currentPremium);
  const text = `Hola${firstName(lead) ? ' ' + firstName(lead) : ''}, soy ${agentName} de SegurCamión 👋\n\n` +
    `Hemos comparado ${asked} aseguradora${asked === 1 ? '' : 's'} para tu camión${lead.vehicle?.plate ? ' ' + lead.vehicle.plate : ''}.\n` +
    `✅ Mejor opción: *${rec.insurer}* – ${TIERS[t].label}\n` +
    `💶 *${eur(rec.annualPremium)}/año*` + (current > rec.annualPremium ? ` (ahorras ${eur(current - rec.annualPremium)} al año)` : '') +
    `\n\nTe adjunto la propuesta en PDF con la comparativa completa. ¿Quieres que lo dejemos contratado? Solo tienes que responder "Sí".`;
  return { text, link: waLink(lead, text) };
}
