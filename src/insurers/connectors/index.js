// Real connectors, one per insurer, added as access is obtained.
// Each exports quote(lead, catalogEntry) -> Promise<Quote[]> with the same
// shape the simulated adapter returns (tier, product, annualPremium,
// coverages, validUntil, ref, source: 'live').
import * as allianz from './allianz.js';

export const connectors = {
  allianz,
  // mapfre: await import('./mapfre-portal.js')   // RPA, only with written permission
  // mgs:    await import('./mgs-email.js')       // send request + parse reply
};
