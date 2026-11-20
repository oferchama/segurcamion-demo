// Allianz connector — SKELETON. SegurCamión already calls a private Allianz
// rating API from the website backend (/drupal/seguros-camiones-rigidos-step1.php).
// Replace toRequest/fromResponse with the field names that backend uses; the
// rest of the system does not change.
//
// Env: ALLIANZ_API_URL, ALLIANZ_API_KEY (never commit these).

const MMA_BAND = kg => kg <= 6000 ? 4 : kg <= 9000 ? 5 : kg <= 14000 ? 6 : kg <= 19000 ? 7 : kg <= 24000 ? 8 : kg <= 34000 ? 9 : 10;

function toRequest(lead) {
  // Mirrors the web form's own codes so it can reuse the existing PHP mapping.
  return {
    tipo_vehiculo: lead.vehicle?.kind === 'tractora' ? 1 : MMA_BAND(Number(lead.vehicle.mmaKg)),
    ambito: { nacional: 11, fronterizo: 110, internacional: 12 }[lead.use.scope] ?? 11,
    uso_vehiculo: lead.use.service === 'publico' ? 16 : 17,
    tipo_mercancia: { adr: 15, obras: 13 }[lead.use.cargo] ?? 14,
    valor_nuevo: lead.vehicle?.valueNew ?? lead.vehicle?.value,
    cp: lead.contact.postalCode,
    fecha_comienzo: lead.policy.startDate,
  };
}

function fromResponse(json, entry) {
  // ASSUMED response shape: { ofertas: [{ modalidad, prima_anual, franquicia, referencia, validez }] }
  const tierOf = m => /todo/i.test(m) ? 'todo_riesgo' : /ampli/i.test(m) ? 'ampliado' : 'rc';
  return (json.ofertas ?? []).map(o => {
    const tier = tierOf(o.modalidad);
    return {
      tier,
      product: entry.productName,
      annualPremium: Number(o.prima_anual),
      coverages: { ...entry.products[tier], ...(o.franquicia != null && { franquicia: Number(o.franquicia) }) },
      validUntil: o.validez,
      ref: o.referencia,
      source: 'live',
    };
  });
}

export async function quote(lead, entry) {
  const res = await fetch(process.env.ALLIANZ_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ALLIANZ_API_KEY}` },
    body: JSON.stringify(toRequest(lead)),
  });
  if (!res.ok) throw new Error(`Allianz HTTP ${res.status}`);
  return fromResponse(await res.json(), entry);
}
