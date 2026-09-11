import {
  DOMAIN_DEFS, assertScoreCalibration, evidenceQuality, normalizeEvidence,
  validateHardTriggers, previousDailyAnchor, LEGACY_BASELINE
} from './dashboard-core.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assertScoreCalibration();

const today = '2026-09-11';
const evidence = normalizeEvidence([
  { id:'E1', title:'Official fuel rationing order takes effect', source:'Government', url:'https://www.canada.ca/test1', published_at:'2026-09-11T10:00:00Z', cluster:'military_energy_shipping', domains:['energy'], geography:'Canada', evidence_type:'observed', materiality:'high', fact:'Authorities implemented fuel rationing after a material supply disruption.', americas_relevant:true },
  { id:'E2', title:'Reuters reports fuel rationing and supply constraints', source:'Reuters', url:'https://www.reuters.com/test2', published_at:'2026-09-11T09:00:00Z', cluster:'military_energy_shipping', domains:['energy','supply_chain'], geography:'Canada', evidence_type:'observed', materiality:'high', fact:'Independent reporting confirms rationing and constrained fuel availability.', americas_relevant:true },
  { id:'E3', title:'Central bank notes payment systems remain normal', source:'Federal Reserve', url:'https://www.federalreserve.gov/test3', published_at:'2026-09-11T08:00:00Z', cluster:'cyber_infrastructure_finance', domains:['financial'], geography:'United States', evidence_type:'stabilizer', materiality:'medium', fact:'Payment and settlement systems continue normal operations.', americas_relevant:true },
  { id:'E4', title:'AP reports shipping delays', source:'AP', url:'https://apnews.com/test4', published_at:'2026-09-11T07:00:00Z', cluster:'trade_supply_technology', domains:['supply_chain','trade'], geography:'Global', evidence_type:'observed', materiality:'medium', fact:'Shipping delays are increasing on a major route.', americas_relevant:true },
  { id:'E5', title:'WHO reports contained health outbreak', source:'WHO', url:'https://www.who.int/test5', published_at:'2026-09-10T16:00:00Z', cluster:'food_health_natural', domains:['public_health'], geography:'Global', evidence_type:'forward', materiality:'low', fact:'The outbreak remains geographically contained with monitoring in place.', americas_relevant:false },
  { id:'E6', title:'USGS reports moderate earthquake', source:'USGS', url:'https://www.usgs.gov/test6', published_at:'2026-09-10T12:00:00Z', cluster:'food_health_natural', domains:['natural'], geography:'United States', evidence_type:'observed', materiality:'low', fact:'A moderate earthquake caused localized disruption without broad infrastructure failure.', americas_relevant:true },
  { id:'E7', title:'BBC reports tariff negotiations continue', source:'BBC', url:'https://www.bbc.com/test7', published_at:'2026-09-11T06:00:00Z', cluster:'trade_supply_technology', domains:['trade'], geography:'Global', evidence_type:'forward', materiality:'medium', fact:'Tariff negotiations continue while existing measures remain in force.', americas_relevant:true },
  { id:'E8', title:'CISA issues infrastructure advisory', source:'CISA', url:'https://www.cisa.gov/test8', published_at:'2026-09-11T05:00:00Z', cluster:'cyber_infrastructure_finance', domains:['critical_infrastructure'], geography:'United States', evidence_type:'forward', materiality:'medium', fact:'A new advisory warns operators of credible cyber exploitation activity.', americas_relevant:true },
  { id:'E9', title:'NATO issues security statement', source:'NATO', url:'https://www.nato.int/test9', published_at:'2026-09-11T04:00:00Z', cluster:'military_energy_shipping', domains:['military'], geography:'Europe', evidence_type:'forward', materiality:'medium', fact:'Alliance officials report elevated military tension but no broader mobilization order.', americas_relevant:false },
  { id:'E10', title:'Reuters reports peaceful protests without disruption', source:'Reuters', url:'https://www.reuters.com/test10', published_at:'2026-09-11T03:00:00Z', cluster:'americas_civil', domains:['civil_unrest'], geography:'United States', evidence_type:'stabilizer', materiality:'low', fact:'Large demonstrations remained peaceful and essential services continued normally.', americas_relevant:true },
  { id:'E11', title:'Treasury reports financial markets functioning', source:'Treasury', url:'https://www.treasury.gov/test11', published_at:'2026-09-10T20:00:00Z', cluster:'cyber_infrastructure_finance', domains:['financial'], geography:'United States', evidence_type:'stabilizer', materiality:'medium', fact:'Funding and payment markets remain operational despite volatility.', americas_relevant:true },
  { id:'E12', title:'Government trade notice updates restrictions', source:'USTR', url:'https://ustr.gov/test12', published_at:'2026-09-10T19:00:00Z', cluster:'trade_supply_technology', domains:['trade','technology'], geography:'United States', evidence_type:'forward', materiality:'medium', fact:'New export-control guidance affects selected strategic technology products.', americas_relevant:true },
  { id:'E13', title:'NOAA reports no major Atlantic cyclone threat', source:'NOAA', url:'https://www.noaa.gov/test13', published_at:'2026-09-11T02:00:00Z', cluster:'food_health_natural', domains:['natural'], geography:'Americas', evidence_type:'stabilizer', materiality:'low', fact:'No major Atlantic cyclone currently threatens broad regional systems.', americas_relevant:true },
  { id:'E14', title:'AP reports border traffic remains open', source:'AP', url:'https://apnews.com/test14', published_at:'2026-09-11T01:00:00Z', cluster:'americas_civil', domains:['domestic','supply_chain'], geography:'Americas', evidence_type:'stabilizer', materiality:'low', fact:'Major border crossings remain open and commercial traffic continues.', americas_relevant:true }
], today);

const quality = evidenceQuality(evidence, 5);
assert(quality.publishable, `Evidence quality fixture should publish: ${JSON.stringify(quality)}`);

const validTrigger = validateHardTriggers([{ type:'fuel_rationing', scope:'national', status:'active', summary:'Fuel rationing is active.', evidence_ids:['E1','E2'] }], evidence);
assert(validTrigger.length === 1, 'Multi-source Tier-A observed hard trigger should validate');

const invalidTrigger = validateHardTriggers([{ type:'grid_outage', scope:'national', status:'active', summary:'Grid outage', evidence_ids:['E4','E7'] }], evidence);
assert(invalidTrigger.length === 0, 'Unsupported hard trigger should be rejected');

const v4Current = { schema_version:4, as_of:'2026-09-11', preparedness_urgency:63, history:[{date:'2026-09-10', preparedness:69},{date:'2026-09-11', preparedness:63}] };
assert(previousDailyAnchor(v4Current, today) === 69, 'Same-day v4 run must anchor to prior verified day, not the v4 score');
assert(LEGACY_BASELINE.preparedness === 69, 'Legacy baseline should remain 69');
assert(DOMAIN_DEFS.length === 12, 'Exactly 12 domains required');

console.log('All v5 regression tests passed.');
