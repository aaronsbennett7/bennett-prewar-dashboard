export const DOMAIN_DEFS = [
  { key: 'energy', name: 'Energy security', weight: 11, category: 'ENERGY' },
  { key: 'military', name: 'Military / geopolitical', weight: 10, category: 'MILITARY' },
  { key: 'supply_chain', name: 'Supply chain & transportation', weight: 10, category: 'SUPPLY' },
  { key: 'trade', name: 'Global trade fragmentation', weight: 10, category: 'TRADE' },
  { key: 'technology', name: 'Technology chokepoints', weight: 7, category: 'TECH' },
  { key: 'critical_infrastructure', name: 'Critical infrastructure / cyber', weight: 11, category: 'CYBER' },
  { key: 'financial', name: 'Financial-system stress', weight: 10, category: 'FINANCE' },
  { key: 'food', name: 'Food & agriculture', weight: 8, category: 'FOOD' },
  { key: 'domestic', name: 'Domestic institutional stress', weight: 6, category: 'CIVIL' },
  { key: 'civil_unrest', name: 'Civil unrest / public order', weight: 7, category: 'CIVIL' },
  { key: 'public_health', name: 'Public health / biological', weight: 5, category: 'HEALTH' },
  { key: 'natural', name: 'Natural / environmental', weight: 5, category: 'NATURAL' }
];

export const LEGACY_BASELINE = {
  date: '2026-09-10',
  preparedness: 69,
  domains: {
    energy: { threat: 97, impact: 86, americas_exposure: 90, trend: 'rising' },
    military: { threat: 95, impact: 72, americas_exposure: 70, trend: 'rising' },
    supply_chain: { threat: 92, impact: 70, americas_exposure: 80, trend: 'rising' },
    trade: { threat: 87, impact: 55, americas_exposure: 92, trend: 'rising' },
    technology: { threat: 79, impact: 42, americas_exposure: 60, trend: 'stable' },
    critical_infrastructure: { threat: 84, impact: 34, americas_exposure: 82, trend: 'rising' },
    financial: { threat: 75, impact: 48, americas_exposure: 78, trend: 'rising' },
    food: { threat: 63, impact: 34, americas_exposure: 65, trend: 'rising' },
    domestic: { threat: 55, impact: 35, americas_exposure: 68, trend: 'stable' },
    civil_unrest: { threat: 45, impact: 25, americas_exposure: 55, trend: 'stable' },
    public_health: { threat: 35, impact: 18, americas_exposure: 30, trend: 'stable' },
    natural: { threat: 44, impact: 38, americas_exposure: 45, trend: 'rising' }
  }
};

export const ALLOWED_TRIGGER_TYPES = new Set([
  'fuel_shortage', 'fuel_rationing', 'shipping_chokepoint_closure', 'major_port_closure',
  'transport_shutdown', 'grid_outage', 'telecom_outage', 'payment_outage', 'capital_controls',
  'bank_access_restrictions', 'food_shortage', 'medicine_shortage', 'emergency_civil_order',
  'multiple_system_failures'
]);

export const FAST_ONSET_TRIGGER_TYPES = new Set([
  'fuel_shortage', 'fuel_rationing', 'shipping_chokepoint_closure', 'major_port_closure',
  'transport_shutdown', 'grid_outage', 'telecom_outage', 'payment_outage', 'capital_controls',
  'bank_access_restrictions', 'food_shortage', 'medicine_shortage', 'emergency_civil_order',
  'multiple_system_failures'
]);

const TRIGGER_DOMAIN_MAP = {
  fuel_shortage: ['energy'],
  fuel_rationing: ['energy'],
  shipping_chokepoint_closure: ['energy', 'supply_chain'],
  major_port_closure: ['supply_chain'],
  transport_shutdown: ['supply_chain', 'domestic', 'civil_unrest'],
  grid_outage: ['critical_infrastructure', 'energy'],
  telecom_outage: ['critical_infrastructure'],
  payment_outage: ['critical_infrastructure', 'financial'],
  capital_controls: ['financial'],
  bank_access_restrictions: ['financial'],
  food_shortage: ['food'],
  medicine_shortage: ['public_health', 'supply_chain'],
  emergency_civil_order: ['domestic', 'civil_unrest'],
  multiple_system_failures: ['critical_infrastructure', 'financial', 'energy', 'supply_chain']
};

const TIER_A_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'ft.com', 'bloomberg.com', 'wsj.com', 'cnbc.com',
  'who.int', 'imf.org', 'worldbank.org', 'un.org', 'nato.int', 'iea.org', 'eia.gov', 'cisa.gov',
  'federalreserve.gov', 'treasury.gov', 'state.gov', 'ustr.gov', 'whitehouse.gov', 'canada.ca',
  'bankofcanada.ca', 'ecb.europa.eu', 'europa.eu', 'gov.uk', 'noaa.gov', 'weather.gov', 'usgs.gov',
  'cdc.gov', 'fda.gov', 'dhs.gov', 'transportation.gov', 'maritime.dot.gov'
];

const TIER_B_DOMAINS = [
  'nytimes.com', 'washingtonpost.com', 'cnn.com', 'abcnews.go.com', 'npr.org', 'theguardian.com',
  'aljazeera.com', 'politico.com', 'axios.com', 'economist.com', 'forbes.com', 'marketwatch.com'
];

export function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export function finiteScore(n, label = 'score') {
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Invalid ${label}: ${n}`);
  return Math.round(n);
}

export function weightedMean(domains, field) {
  const weights = new Map(DOMAIN_DEFS.map(d => [d.key, d.weight]));
  let numerator = 0;
  let denominator = 0;
  for (const d of domains) {
    const w = weights.get(d.key);
    if (!w) continue;
    numerator += finiteScore(d[field], `${d.key}.${field}`) * w;
    denominator += w;
  }
  return denominator ? Math.round(numerator / denominator) : 0;
}

export function stageFor(score, observed, highImpacts, severeCount, sustained90, immediateTrigger) {
  if (score >= 97 && observed >= 85 && highImpacts >= 3 && severeCount >= 2) return 'ACTIVE DISRUPTION';
  if (score >= 90 && observed >= 75 && severeCount >= 1 && (sustained90 || immediateTrigger)) return 'IMMINENT DISRUPTION';
  if (score >= 80) return 'HIGH ALERT';
  if (score >= 65) return 'ACCELERATE';
  if (score >= 50) return 'PREPARE';
  if (score >= 35) return 'WATCH';
  return 'NORMAL';
}

export function regionalStage(score) {
  if (score >= 85) return 'SEVERE';
  if (score >= 70) return 'HIGH';
  if (score >= 55) return 'ELEVATED';
  if (score >= 40) return 'WATCH';
  return 'STABLE';
}

export function rawPreparedness({ threat, impact, coupling, momentum, americas }) {
  return Math.round(
    0.40 * threat +
    0.25 * impact +
    0.10 * coupling +
    0.10 * momentum +
    0.15 * americas
  );
}

export function normalizeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function domainMatches(host, candidate) {
  return host === candidate || host.endsWith(`.${candidate}`);
}

export function sourceTier(url) {
  const host = normalizeHostname(url);
  if (!host) return 'C';
  if (host.endsWith('.gov') || host.endsWith('.mil')) return 'A';
  if (TIER_A_DOMAINS.some(d => domainMatches(host, d))) return 'A';
  if (TIER_B_DOMAINS.some(d => domainMatches(host, d))) return 'B';
  return 'C';
}

export function daysBetweenIso(a, b) {
  const aa = new Date(`${a}T12:00:00Z`);
  const bb = new Date(`${b}T12:00:00Z`);
  return Math.round((bb - aa) / 86400000);
}

export function normalizeEvidence(rawEvidence, today) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const validDomainKeys = new Set(DOMAIN_DEFS.map(d => d.key));
  const validClusters = new Set(['military_energy_shipping', 'trade_supply_technology', 'cyber_infrastructure_finance', 'food_health_natural', 'americas_civil']);
  const out = [];

  for (const e of Array.isArray(rawEvidence) ? rawEvidence : []) {
    if (!e || typeof e !== 'object') continue;
    const url = String(e.url || '').trim();
    if (!/^https:\/\//i.test(url)) continue;
    const host = normalizeHostname(url);
    if (!host || host === 'news.google.com') continue;
    const title = String(e.title || '').trim();
    const fact = String(e.fact || '').trim();
    if (title.length < 8 || fact.length < 15) continue;
    const titleKey = title.toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
    if (seenUrls.has(url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(url);
    seenTitles.add(titleKey);

    const domains = [...new Set((Array.isArray(e.domains) ? e.domains : []).filter(k => validDomainKeys.has(k)))];
    if (!domains.length) continue;
    const cluster = validClusters.has(e.cluster) ? e.cluster : null;
    if (!cluster) continue;

    let publishedAt = null;
    if (e.published_at) {
      const dt = new Date(e.published_at);
      if (!Number.isNaN(dt.valueOf())) publishedAt = dt.toISOString();
    }
    const publishedDate = publishedAt?.slice(0, 10) || null;
    const ageDays = publishedDate ? Math.max(0, daysBetweenIso(publishedDate, today)) : 999;

    out.push({
      id: String(e.id || `E${out.length + 1}`).slice(0, 20),
      title,
      source: String(e.source || host).trim().slice(0, 100),
      url,
      source_domain: host,
      source_tier: sourceTier(url),
      published_at: publishedAt,
      age_days: ageDays,
      cluster,
      domains,
      geography: String(e.geography || 'Global').trim().slice(0, 120),
      evidence_type: ['observed', 'forward', 'stabilizer'].includes(e.evidence_type) ? e.evidence_type : 'forward',
      materiality: ['high', 'medium', 'low'].includes(e.materiality) ? e.materiality : 'medium',
      fact,
      americas_relevant: Boolean(e.americas_relevant)
    });
  }
  return out;
}

export function evidenceQuality(evidence, searchCalls = 0) {
  const fresh = evidence.filter(e => e.age_days <= 4);
  const domains = new Set(evidence.flatMap(e => e.domains));
  const clusters = new Set(evidence.map(e => e.cluster));
  const sources = new Set(evidence.map(e => e.source_domain));
  const tierA = new Set(evidence.filter(e => e.source_tier === 'A').map(e => e.source_domain));

  let cap = 45;
  if (evidence.length >= 10 && sources.size >= 6 && clusters.size >= 3 && tierA.size >= 2 && fresh.length >= 8 && searchCalls >= 3) cap = 75;
  if (evidence.length >= 14 && sources.size >= 8 && clusters.size >= 4 && tierA.size >= 3 && fresh.length >= 10 && searchCalls >= 4) cap = 88;
  if (evidence.length >= 18 && sources.size >= 10 && clusters.size >= 5 && tierA.size >= 4 && fresh.length >= 14 && searchCalls >= 5) cap = 95;

  return {
    evidence_count: evidence.length,
    fresh_count: fresh.length,
    unique_sources: sources.size,
    tier_a_sources: tierA.size,
    clusters: clusters.size,
    domains_covered: domains.size,
    confidence_cap: cap,
    publishable: evidence.length >= 10 && sources.size >= 6 && clusters.size >= 3 && tierA.size >= 2 && fresh.length >= 8 && searchCalls >= 3
  };
}

export function validateAssessmentDomains(domains) {
  if (!Array.isArray(domains) || domains.length !== DOMAIN_DEFS.length) throw new Error('Assessment must contain exactly 12 domains');
  const required = new Set(DOMAIN_DEFS.map(d => d.key));
  const seen = new Set();
  return domains.map(d => {
    if (!required.has(d.key) || seen.has(d.key)) throw new Error(`Invalid or duplicate domain key: ${d.key}`);
    seen.add(d.key);
    if (!['rising', 'stable', 'easing'].includes(d.trend)) throw new Error(`Invalid trend for ${d.key}`);
    if (String(d.rationale || '').trim().length < 12) throw new Error(`Missing rationale for ${d.key}`);
    return {
      key: d.key,
      threat: finiteScore(d.threat, `${d.key}.threat`),
      impact: finiteScore(d.impact, `${d.key}.impact`),
      americas_exposure: finiteScore(d.americas_exposure, `${d.key}.americas_exposure`),
      trend: d.trend,
      rationale: String(d.rationale).trim()
    };
  });
}

export function validateHardTriggers(rawTriggers, evidence) {
  const byId = new Map(evidence.map(e => [e.id, e]));
  const scopes = new Set(['local', 'regional', 'national', 'multinational', 'global']);
  const statuses = new Set(['developing', 'active', 'resolved']);
  const valid = [];

  for (const t of Array.isArray(rawTriggers) ? rawTriggers : []) {
    if (!ALLOWED_TRIGGER_TYPES.has(t.type) || !scopes.has(t.scope) || !statuses.has(t.status) || t.status === 'resolved') continue;
    const refs = [...new Set((Array.isArray(t.evidence_ids) ? t.evidence_ids : []).map(String))].map(id => byId.get(id)).filter(Boolean);
    const sources = new Set(refs.map(e => e.source_domain));
    const hasTierA = refs.some(e => e.source_tier === 'A');
    const hasObserved = refs.some(e => e.evidence_type === 'observed');
    const expectedDomains = new Set(TRIGGER_DOMAIN_MAP[t.type] || []);
    const domainMatched = refs.some(e => e.domains.some(d => expectedDomains.has(d)));
    if (refs.length < 2 || sources.size < 2 || !hasTierA || !hasObserved || !domainMatched) continue;

    valid.push({
      type: t.type,
      verified: true,
      scope: t.scope,
      status: t.status,
      summary: String(t.summary || '').trim().slice(0, 300),
      source_url: refs.find(e => e.source_tier === 'A')?.url || refs[0].url,
      evidence_ids: refs.map(e => e.id)
    });
  }
  return valid;
}

export function trendMomentum(domains) {
  const weights = new Map(DOMAIN_DEFS.map(d => [d.key, d.weight]));
  let rising = 0, easing = 0, total = 0;
  for (const d of domains) {
    const w = weights.get(d.key) || 0;
    total += w;
    if (d.trend === 'rising') rising += w;
    if (d.trend === 'easing') easing += w;
  }
  if (!total) return 50;
  return Math.round(clamp(50 + 50 * ((rising - easing) / total)));
}

export function historyMomentum(history, today) {
  const prior = (Array.isArray(history) ? history : [])
    .filter(h => h?.date && h.date < today && Number.isFinite(h.preparedness))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-3);
  if (prior.length < 2) return null;
  const first = prior[0];
  const last = prior[prior.length - 1];
  const days = Math.max(1, daysBetweenIso(first.date, last.date));
  const avgDaily = (last.preparedness - first.preparedness) / days;
  return Math.round(clamp(50 + avgDaily * 7));
}

export function calculateMomentum(domains, history, today) {
  const t = trendMomentum(domains);
  const h = historyMomentum(history, today);
  return h == null ? t : Math.round(0.65 * t + 0.35 * h);
}

export function previousDailyAnchor(current, today) {
  const priorHistory = (Array.isArray(current?.history) ? current.history : [])
    .filter(h => h?.date && h.date < today && Number.isFinite(h.preparedness))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (priorHistory.length) return priorHistory[0].preparedness;
  if (current?.as_of && current.as_of < today && Number.isFinite(current.preparedness_urgency)) return current.preparedness_urgency;
  return LEGACY_BASELINE.preparedness;
}

export function previousDomains(current) {
  if (current?.schema_version >= 5 && Array.isArray(current.domains) && current.domains.length === DOMAIN_DEFS.length) {
    return new Map(current.domains.map(d => [d.key, d]));
  }
  return new Map(Object.entries(LEGACY_BASELINE.domains).map(([key, value]) => [key, { key, ...value }]));
}

export function applyDomainGuardrails(domains, previousMap, verifiedSevereTriggerCount) {
  const maxDelta = verifiedSevereTriggerCount > 0 ? 18 : 12;
  return domains.map(d => {
    const p = previousMap.get(d.key);
    if (!p) return d;
    const limit = (value, prev) => Math.round(clamp(value, prev - maxDelta, prev + maxDelta));
    return {
      ...d,
      threat: limit(d.threat, p.threat),
      impact: limit(d.impact, p.impact),
      americas_exposure: limit(d.americas_exposure, p.americas_exposure)
    };
  });
}

export function applyPreparednessRateLimit(raw, anchor, verifiedTriggers, severeTriggers) {
  let maxMove = 3;
  if (severeTriggers > 0) return { published: raw, applied: false, limit: null };
  if (verifiedTriggers > 0) maxMove = 6;
  const published = Math.round(clamp(raw, anchor - maxMove, anchor + maxMove));
  return { published, applied: published !== raw, limit: maxMove };
}

export function sustained90For48h(history, today, candidateRaw) {
  const prior = (Array.isArray(history) ? history : [])
    .filter(h => h?.date && h.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidateRaw >= 90 && prior.length >= 2 && prior[0].preparedness >= 90 && prior[1].preparedness >= 90;
}

export function buildScore({ domains, coupling, history, today, hardTriggers, anchor }) {
  const threat = weightedMean(domains, 'threat');
  const impact = weightedMean(domains, 'impact');
  const americas = weightedMean(domains, 'americas_exposure');
  const momentum = calculateMomentum(domains, history, today);
  const raw = rawPreparedness({ threat, impact, coupling, momentum, americas });
  const verified = hardTriggers.length;
  const severe = hardTriggers.filter(t => ['national', 'multinational', 'global'].includes(t.scope)).length;
  const rate = applyPreparednessRateLimit(raw, anchor, verified, severe);
  const highImpacts = domains.filter(d => d.impact >= 70).length;
  const immediateTrigger = hardTriggers.some(t => t.status === 'active' && FAST_ONSET_TRIGGER_TYPES.has(t.type));
  const sustained = sustained90For48h(history, today, rate.published);
  const stage = stageFor(rate.published, impact, highImpacts, severe, sustained, immediateTrigger);
  return {
    threat, impact, americas, momentum, raw, published: rate.published, rate,
    highImpacts, verified, severe, immediateTrigger, sustained, stage
  };
}

export function assertScoreCalibration() {
  const quiet = { threat: 25, impact: 15, coupling: 20, momentum: 40, americas: 20 };
  if (rawPreparedness(quiet) >= 35) throw new Error('Quiet fixture should remain NORMAL');
  if (stageFor(92, 55, 1, 0, false, false) !== 'HIGH ALERT') throw new Error('High threat without gates must not become IMMINENT');
  if (stageFor(92, 80, 3, 1, false, true) !== 'IMMINENT DISRUPTION') throw new Error('Imminent gate fixture failed');
  if (stageFor(98, 90, 4, 2, true, true) !== 'ACTIVE DISRUPTION') throw new Error('Active gate fixture failed');
  const limited = applyPreparednessRateLimit(80, 70, 0, 0);
  if (limited.published !== 73) throw new Error('Normal daily rate limit fixture failed');
  const triggerLimited = applyPreparednessRateLimit(80, 70, 1, 0);
  if (triggerLimited.published !== 76) throw new Error('Non-severe trigger rate limit fixture failed');
  const severe = applyPreparednessRateLimit(80, 70, 1, 1);
  if (severe.published !== 80) throw new Error('Severe trigger bypass fixture failed');
  return true;
}
