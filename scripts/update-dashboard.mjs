import fs from 'node:fs/promises';
import {
  DOMAIN_DEFS, LEGACY_BASELINE, clamp, finiteScore, weightedMean, regionalStage,
  normalizeEvidence, evidenceQuality, validateAssessmentDomains, validateHardTriggers,
  previousDailyAnchor, previousDomains, applyDomainGuardrails, buildScore, normalizeHostname
} from './dashboard-core.mjs';

const SCRIPT_VERSION = '5.1';
const TIME_ZONE = 'America/Indiana/Indianapolis';
const API_KEY = process.env.OPENAI_API_KEY;
const dashboardFile = new URL('../dashboard.json', import.meta.url);
const budgetFile = new URL('../api-budget.json', import.meta.url);
const statusFile = new URL('../update-status.json', import.meta.url);
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;

if (!API_KEY) throw new Error('Missing OPENAI_API_KEY');

console.log(`Dashboard updater v${SCRIPT_VERSION} starting...`);

function localDate(timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function readJson(url, fallback = null) {
  try { return JSON.parse(await fs.readFile(url, 'utf8')); }
  catch (err) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(url, value) {
  await fs.writeFile(url, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const today = localDate();
const startedAt = new Date().toISOString();
const current = await readJson(dashboardFile);
if (!current) throw new Error('dashboard.json not found');

function newBudget() {
  return {
    schema_version: 1,
    period_start: today,
    period_end: addDays(today, 89),
    allocated_usd: 10,
    operational_stop_usd: 9,
    estimated_spent_usd: 0,
    entries: []
  };
}

let budget = await readJson(budgetFile, newBudget());
if (!budget.period_start || today > budget.period_end) budget = newBudget();
if (!Array.isArray(budget.entries)) budget.entries = [];

function searchAllowance(spent) {
  if (spent >= 9.0) return 0;
  if (spent >= 8.75) return 3;
  if (spent >= 8.25) return 4;
  return 5;
}

function modelRates(model) {
  if (model === 'gpt-5.6-luna') return { input: 0.20, cached: 0.02, output: 1.20 };
  if (model === 'gpt-5.6-terra') return { input: 2.00, cached: 0.20, output: 12.00 };
  throw new Error(`Unknown pricing model: ${model}`);
}

function estimateApiCost(model, usage, webSearchCalls = 0) {
  const rates = modelRates(model);
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0);
  const cached = Number(usage?.input_tokens_details?.cached_tokens || 0);
  const cacheWrites = Number(usage?.input_tokens_details?.cache_write_tokens || 0);
  const standardInput = Math.max(0, input - cached - cacheWrites);
  return (
    standardInput / 1_000_000 * rates.input +
    cached / 1_000_000 * rates.cached +
    cacheWrites / 1_000_000 * rates.input * 1.25 +
    output / 1_000_000 * rates.output +
    webSearchCalls * 0.01
  );
}

async function recordCost(stage, model, rawResponse, webSearchCalls = 0) {
  const cost = estimateApiCost(model, rawResponse.usage, webSearchCalls);
  budget.estimated_spent_usd = Number((Number(budget.estimated_spent_usd || 0) + cost).toFixed(6));
  budget.entries.push({
    run_id: runId,
    date: today,
    timestamp: new Date().toISOString(),
    stage,
    model,
    input_tokens: Number(rawResponse.usage?.input_tokens || 0),
    cached_input_tokens: Number(rawResponse.usage?.input_tokens_details?.cached_tokens || 0),
    output_tokens: Number(rawResponse.usage?.output_tokens || 0),
    web_search_calls: webSearchCalls,
    estimated_cost_usd: Number(cost.toFixed(6))
  });
  budget.entries = budget.entries.slice(-250);
  await writeJson(budgetFile, budget);
  return cost;
}

function extractOutputText(raw) {
  if (typeof raw?.output_text === 'string' && raw.output_text.trim()) return raw.output_text.trim();
  let text = '';
  for (const item of raw?.output || []) {
    if (item?.type !== 'message') continue;
    for (const c of item.content || []) if (c?.type === 'output_text' && c.text) text += c.text;
  }
  return text.trim();
}

function webSearchCallCount(raw) {
  return (raw?.output || []).filter(item => item?.type === 'web_search_call').length;
}

function parseRetrySeconds(response, raw) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter) {
    const numeric = Number(retryAfter);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(0, (retryDate - Date.now()) / 1000);
  }

  const msg = String(raw?.error?.message || '');
  const match = msg.match(/try again in\s+((?:[0-9.]+h)?(?:[0-9.]+m)?(?:[0-9.]+s)?)/i);
  if (!match?.[1]) return null;
  const token = match[1];
  let seconds = 0;
  const h = token.match(/([0-9.]+)h/i);
  const m = token.match(/([0-9.]+)m/i);
  const sec = token.match(/([0-9.]+)s/i);
  if (h) seconds += Number(h[1]) * 3600;
  if (m) seconds += Number(m[1]) * 60;
  if (sec) seconds += Number(sec[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function isTemporaryRateLimit(response, raw) {
  if (response?.status !== 429) return false;
  const code = String(raw?.error?.code || '');
  const type = String(raw?.error?.type || '');
  const msg = String(raw?.error?.message || '').toLowerCase();
  if (['credit_balance_exhausted', 'organization_usage_limit_exceeded', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded'].includes(code)) return false;
  if (type === 'insufficient_quota' && code !== 'rate_limit_exceeded') return false;
  return code === 'rate_limit_exceeded' || msg.includes('rate limit reached') || msg.includes('tokens per min');
}

async function callResponses(body, label) {
  const maxAttempts = 3;
  const maxTotalWaitSeconds = 150;
  let totalWaitSeconds = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error(`${label}: OpenAI request timed out after 240 seconds`);
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();
    let raw;
    try { raw = JSON.parse(rawText); }
    catch { throw new Error(`${label}: non-JSON API response (${response.status})`); }

    if (response.ok) {
      if (raw.status && raw.status !== 'completed') {
        throw new Error(`${label}: response status ${raw.status}; ${raw.incomplete_details?.reason || 'not completed'}`);
      }
      if (attempt > 1) console.log(`${label}: temporary rate limit cleared on attempt ${attempt}.`);
      return raw;
    }

    const msg = raw?.error?.message || rawText.slice(0, 1000);
    if (!isTemporaryRateLimit(response, raw) || attempt === maxAttempts) {
      throw new Error(`${label}: OpenAI API ${response.status}: ${msg}`);
    }

    const serverWait = parseRetrySeconds(response, raw);
    const fallbackWait = 15 * (2 ** (attempt - 1));
    const waitSeconds = Math.ceil(Math.max(serverWait ?? 0, fallbackWait) + 1);

    if (waitSeconds > 90 || totalWaitSeconds + waitSeconds > maxTotalWaitSeconds) {
      throw new Error(`${label}: temporary API rate limit requires ${waitSeconds}s wait; refusing a long-running retry. ${msg}`);
    }

    totalWaitSeconds += waitSeconds;
    console.warn(`${label}: temporary OpenAI rate limit. Waiting ${waitSeconds}s before retry ${attempt + 1}/${maxAttempts}.`);
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
  }

  throw new Error(`${label}: OpenAI request failed after bounded retries`);
}

const domainKeys = DOMAIN_DEFS.map(d => d.key);
const clusters = ['military_energy_shipping', 'trade_supply_technology', 'cyber_infrastructure_finance', 'food_health_natural', 'americas_civil'];

const evidenceItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    source: { type: 'string' },
    url: { type: 'string' },
    published_at: { type: ['string', 'null'] },
    cluster: { type: 'string', enum: clusters },
    domains: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: domainKeys } },
    geography: { type: 'string' },
    evidence_type: { type: 'string', enum: ['observed', 'forward', 'stabilizer'] },
    materiality: { type: 'string', enum: ['high', 'medium', 'low'] },
    fact: { type: 'string' },
    americas_relevant: { type: 'boolean' }
  },
  required: ['id', 'title', 'source', 'url', 'published_at', 'cluster', 'domains', 'geography', 'evidence_type', 'materiality', 'fact', 'americas_relevant']
};

const researchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    research_summary: { type: 'string' },
    coverage_clusters: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string', enum: clusters } },
    evidence: { type: 'array', minItems: 10, maxItems: 24, items: evidenceItemSchema }
  },
  required: ['research_summary', 'coverage_clusters', 'evidence']
};

const assessmentDomainSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', enum: domainKeys },
    threat: { type: 'integer', minimum: 0, maximum: 100 },
    impact: { type: 'integer', minimum: 0, maximum: 100 },
    americas_exposure: { type: 'integer', minimum: 0, maximum: 100 },
    trend: { type: 'string', enum: ['rising', 'stable', 'easing'] },
    rationale: { type: 'string' }
  },
  required: ['key', 'threat', 'impact', 'americas_exposure', 'trend', 'rationale']
};

const hardTriggerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      type: 'string',
      enum: ['fuel_shortage', 'fuel_rationing', 'shipping_chokepoint_closure', 'major_port_closure', 'transport_shutdown', 'grid_outage', 'telecom_outage', 'payment_outage', 'capital_controls', 'bank_access_restrictions', 'food_shortage', 'medicine_shortage', 'emergency_civil_order', 'multiple_system_failures']
    },
    scope: { type: 'string', enum: ['local', 'regional', 'national', 'multinational', 'global'] },
    status: { type: 'string', enum: ['developing', 'active', 'resolved'] },
    summary: { type: 'string' },
    evidence_ids: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } }
  },
  required: ['type', 'scope', 'status', 'summary', 'evidence_ids']
};

const watchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium'] },
    why: { type: 'string' }
  },
  required: ['name', 'severity', 'why']
};

const assessmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    primary_driver: { type: 'string' },
    americas_summary: { type: 'string' },
    coupling_score: { type: 'integer', minimum: 0, maximum: 100 },
    confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
    confidence_rationale: { type: 'string' },
    preparedness_window: { type: 'string', enum: ['Months', 'Weeks to months', 'Weeks', 'Days to weeks', 'Days', 'Immediate / ongoing'] },
    domains: { type: 'array', minItems: 12, maxItems: 12, items: assessmentDomainSchema },
    hard_triggers: { type: 'array', maxItems: 5, items: hardTriggerSchema },
    stabilizer_evidence_ids: { type: 'array', minItems: 0, maxItems: 5, items: { type: 'string' } },
    signal_evidence_ids: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string' } },
    areas_to_watch: { type: 'array', minItems: 5, maxItems: 7, items: watchSchema }
  },
  required: ['summary', 'primary_driver', 'americas_summary', 'coupling_score', 'confidence_score', 'confidence_rationale', 'preparedness_window', 'domains', 'hard_triggers', 'stabilizer_evidence_ids', 'signal_evidence_ids', 'areas_to_watch']
};

const stableResearchInstructions = `
You are the evidence-collection layer for a civilian-facing all-hazards preparedness dashboard.
Use web search. Gather current, decision-useful evidence, not commentary volume.
Prioritize Reuters, AP, BBC, official government sources, central banks, IMF/World Bank, WHO/CDC, UN, NATO, IEA/EIA, CISA, NOAA/NWS/USGS and comparable primary or high-quality sources.
Prefer direct article/source URLs rather than aggregators. Deduplicate repeated coverage of the same event.
Separate observed civilian disruption from forward-looking risk and from stabilizers.
Peaceful protest, partisan disagreement, elections, controversial speech, or ideology alone are not civil disruption.
Civil-unrest evidence should involve violence, sustained disorder, curfews/emergency measures, or material disruption to transport, commerce, public safety, infrastructure, or essential services.
Do not infer a shortage, outage, closure, rationing, capital control, or emergency order unless the source actually reports it.
Keep facts concise and evidence based. Never fabricate a URL, publisher, date, or event.
`;

const spent = Number(budget.estimated_spent_usd || 0);
const maxSearches = searchAllowance(spent);
if (maxSearches === 0) {
  const status = {
    schema_version: 1,
    engine_version: SCRIPT_VERSION,
    date: today,
    status: 'BUDGET_HOLD',
    message: `Paid research paused because estimated 90-day spend reached $${spent.toFixed(2)} of the $9.00 operational ceiling.`,
    last_verified_update: current.updated_at || null,
    budget
  };
  await writeJson(statusFile, status);
  console.log(status.message);
  process.exit(0);
}

let researchCost = 0;
let assessmentCost = 0;
let searchCalls = 0;

try {
  console.log(`Research phase: Luna with a maximum of ${maxSearches} web searches.`);
  const researchInput = `
Date: ${today}. Focus on the last 24-72 hours; use up to 96 hours when needed for continuity.
Cover these five clusters as efficiently as the ${maxSearches}-search ceiling permits:
1) military/geopolitical + energy + maritime shipping/chokepoints
2) trade + supply chain/transport + strategic technology/critical materials
3) cyber + critical infrastructure + banking/payments/financial stress
4) food/agriculture + public health + major natural/environmental hazards
5) Americas civilian exposure + civil unrest/public order, with explicit attention to the U.S., Canada, Mexico, Central/South America and the Caribbean
Return 12-18 strong evidence items if available. Evidence IDs must be E1, E2, E3... and unique.
`;

  const researchRaw = await callResponses({
    model: 'gpt-5.6-luna',
    instructions: stableResearchInstructions,
    input: researchInput,
    tools: [{ type: 'web_search' }],
    tool_choice: 'auto',
    max_tool_calls: maxSearches,
    max_output_tokens: 2200,
    reasoning: { effort: 'none' },
    prompt_cache_key: 'bennett-dashboard-v5-research',
    store: false,
    text: {
      verbosity: 'low',
      format: { type: 'json_schema', name: 'dashboard_research', strict: true, schema: researchSchema }
    }
  }, 'Research');

  searchCalls = webSearchCallCount(researchRaw);
  researchCost = await recordCost('research', 'gpt-5.6-luna', researchRaw, searchCalls);
  const researchText = extractOutputText(researchRaw);
  if (!researchText) throw new Error('Research produced no structured output');
  const research = JSON.parse(researchText);
  const evidence = normalizeEvidence(research.evidence, today);
  const quality = evidenceQuality(evidence, searchCalls);

  console.log(`Research quality: ${quality.evidence_count} evidence items, ${quality.unique_sources} sources, ${quality.tier_a_sources} Tier-A sources, ${quality.clusters}/5 clusters, ${searchCalls} web searches.`);
  if (!quality.publishable) {
    throw new Error(`Research quality gate failed: ${JSON.stringify(quality)}`);
  }

  const prevMap = previousDomains(current);
  const previousForPrompt = DOMAIN_DEFS.map(def => {
    const p = prevMap.get(def.key) || LEGACY_BASELINE.domains[def.key];
    return { key: def.key, threat: p.threat, impact: p.impact, americas_exposure: p.americas_exposure, trend: p.trend };
  });

  const assessmentInstructions = `
You are the assessment layer for an all-hazards preparedness dashboard. You have NO web tools.
Use only the evidence provided. Score exactly the 12 supplied domains.
Threat = credible forward-looking potential for material civilian disruption.
Impact = disruption already observed in prices, availability, outages, rationing, access restrictions, logistics, finance, transportation, public safety, or essential services.
Americas exposure = direct potential effect on people, infrastructure, prices, access, mobility, safety, or essential services in the Americas.
Do not turn geopolitical tension alone into observed civilian disruption.
Do not use peaceful protest alone to raise civil-unrest impact.
A hard trigger requires concrete evidence of an actual access/system constraint and must cite at least two evidence IDs. Do not invent evidence IDs.
Prior scores are continuity context, not a reason to ignore fresh evidence. Avoid large changes unless the evidence materially justifies them.
Cross-system coupling is high only when multiple domains are causally reinforcing one another.
Confidence measures evidence quality/directness, not severity.
Keep rationales concise.
`;

  const assessmentInput = JSON.stringify({
    date: today,
    previous_verified_baseline: {
      preparedness: previousDailyAnchor(current, today),
      domains: previousForPrompt
    },
    evidence_quality: quality,
    evidence
  });

  console.log('Assessment phase: Terra, no web access.');
  const assessmentRaw = await callResponses({
    model: 'gpt-5.6-terra',
    instructions: assessmentInstructions,
    input: assessmentInput,
    max_output_tokens: 1700,
    reasoning: { effort: 'none' },
    prompt_cache_key: 'bennett-dashboard-v5-assessment',
    store: false,
    text: {
      verbosity: 'low',
      format: { type: 'json_schema', name: 'dashboard_assessment', strict: true, schema: assessmentSchema }
    }
  }, 'Assessment');

  assessmentCost = await recordCost('assessment', 'gpt-5.6-terra', assessmentRaw, 0);
  const assessmentText = extractOutputText(assessmentRaw);
  if (!assessmentText) throw new Error('Assessment produced no structured output');
  const assessment = JSON.parse(assessmentText);

  let domains = validateAssessmentDomains(assessment.domains);
  const hardTriggers = validateHardTriggers(assessment.hard_triggers, evidence);
  domains = applyDomainGuardrails(domains, prevMap, hardTriggers.filter(t => ['national', 'multinational', 'global'].includes(t.scope)).length);

  const anchor = previousDailyAnchor(current, today);
  const coupling = finiteScore(assessment.coupling_score, 'coupling_score');
  const score = buildScore({ domains, coupling, history: current.history || [], today, hardTriggers, anchor });
  const confidence = Math.min(finiteScore(assessment.confidence_score, 'confidence_score'), quality.confidence_cap);
  const confidenceLevel = confidence >= 80 ? 'HIGH' : confidence >= 60 ? 'MODERATE' : 'LOW';

  const evidenceById = new Map(evidence.map(e => [e.id, e]));
  const signalIds = [...new Set(assessment.signal_evidence_ids)].filter(id => evidenceById.has(id)).slice(0, 8);
  if (signalIds.length < 4) throw new Error('Assessment did not select enough valid signal evidence IDs');

  const categoryForDomain = new Map(DOMAIN_DEFS.map(d => [d.key, d.category]));
  const signals = signalIds.map(id => {
    const e = evidenceById.get(id);
    const firstDomain = e.domains[0];
    return {
      title: e.title,
      summary: e.fact,
      url: e.url,
      source: e.source,
      published_at: e.published_at,
      category: e.evidence_type === 'stabilizer' ? 'STABILIZER' : (categoryForDomain.get(firstDomain) || 'SUPPLY'),
      impact: e.evidence_type === 'stabilizer' ? 'down' : (e.materiality === 'low' ? 'neutral' : 'up')
    };
  });

  const stabilizerIds = [...new Set(assessment.stabilizer_evidence_ids)].filter(id => evidenceById.has(id)).slice(0, 5);
  const stabilizers = stabilizerIds.map(id => evidenceById.get(id).fact);
  while (stabilizers.length < 3) {
    const fallback = evidence.find(e => e.evidence_type === 'stabilizer' && !stabilizers.includes(e.fact));
    if (!fallback) break;
    stabilizers.push(fallback.fact);
  }
  if (stabilizers.length < 3) {
    stabilizers.push('Core financial and payment systems remain under continuous monitoring; no unverified reassurance is treated as evidence.');
  }

  const scoredDomains = domains.map(d => {
    const def = DOMAIN_DEFS.find(x => x.key === d.key);
    return { ...d, name: def.name, weight: def.weight };
  });

  const driverRank = [...scoredDomains].sort((a, b) => {
    const av = 0.5 * a.threat + 0.3 * a.impact + 0.2 * a.americas_exposure;
    const bv = 0.5 * b.threat + 0.3 * b.impact + 0.2 * b.americas_exposure;
    return bv - av;
  });

  const americasComponents = driverRank.slice(0, 6).map(d => ({ name: d.name, score: d.americas_exposure, trend: d.trend }));
  const drivers = driverRank.slice(0, 6).map((d, i) => ({
    name: d.name,
    severity: d.threat >= 85 ? 'critical' : d.threat >= 70 ? 'high' : 'medium',
    note: i === 0 ? 'Primary driver' : ''
  }));

  const priorHistory = (Array.isArray(current.history) ? current.history : []).filter(h => h?.date && h.date < today);
  const history = [...priorHistory, {
    date: today,
    preparedness: score.published,
    raw_preparedness: score.raw,
    threat: score.threat,
    impact: score.impact,
    americas: score.americas,
    conflict: scoredDomains.find(d => d.key === 'military')?.threat ?? 0,
    momentum: score.momentum
  }].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);

  const runCost = researchCost + assessmentCost;
  const updated = {
    schema_version: 5,
    engine_version: SCRIPT_VERSION,
    data_status: 'VERIFIED',
    as_of: today,
    updated_at: new Date().toISOString(),
    last_successful_update: new Date().toISOString(),
    preparedness_urgency: score.published,
    raw_preparedness_urgency: score.raw,
    preparedness_stage: score.stage,
    global_threat_pressure: score.threat,
    leading_threat_pressure: score.threat,
    observed_civilian_disruption: score.impact,
    americas_exposure: score.americas,
    americas_stage: regionalStage(score.americas),
    americas_summary: String(assessment.americas_summary).trim(),
    americas_components: americasComponents,
    conflict_escalation: scoredDomains.find(d => d.key === 'military')?.threat ?? 0,
    coupling_score: coupling,
    momentum_score: score.momentum,
    confidence_score: confidence,
    confidence_level: confidenceLevel,
    confidence_rationale: `${String(assessment.confidence_rationale).trim()} Evidence gate: ${quality.evidence_count} items, ${quality.unique_sources} sources, ${quality.tier_a_sources} Tier-A sources, ${quality.clusters}/5 clusters.`,
    preparedness_window: assessment.preparedness_window,
    summary: String(assessment.summary).trim(),
    primary_driver: String(assessment.primary_driver).trim(),
    primary_stabilizers: stabilizers.slice(0, 5),
    domains: scoredDomains,
    hard_triggers: hardTriggers,
    verified_hard_trigger_count: score.verified,
    severe_hard_trigger_count: score.severe,
    score_calibration: {
      raw_score: score.raw,
      published_score: score.published,
      previous_daily_anchor: anchor,
      rate_limit_applied: score.rate.applied,
      daily_rate_limit: score.rate.limit,
      sustained_90_for_48h: score.sustained,
      high_impact_domain_count: score.highImpacts
    },
    score_components: {
      global_threat_pressure: score.threat,
      observed_civilian_disruption: score.impact,
      coupling,
      momentum: score.momentum,
      americas_exposure: score.americas
    },
    drivers,
    areas_to_watch: assessment.areas_to_watch,
    signals,
    preparedness_actions: [
      'Complete sensible, previously planned preparedness purchases while normal supply channels are functioning.',
      'Maintain several weeks of food, household consumables, water capacity, and essential medical supplies.',
      'Keep vehicles reasonably fueled and verify generator, battery, solar, or other backup-power capability.',
      'Maintain diversified payment options and a reasonable amount of emergency cash.',
      'Confirm family communications, transportation, and meeting plans.',
      'Avoid panic buying; focus on resilience gaps that would be difficult to correct after disruption begins.'
    ],
    historical_analogs: current.historical_analogs || [
      { name: '1973 Oil Shock', score: 85 }, { name: '2008 Financial Crisis', score: 83 },
      { name: '2020 Pandemic', score: 82 }, { name: '1939 Europe', score: 80 }
    ],
    historical_note: current.historical_note || 'Illustrative reference markers only. They are not used in the live score until formal back-testing is completed.',
    history,
    evidence_quality: quality,
    evidence_log: evidence.slice(0, 24),
    api_usage: {
      research_model: 'gpt-5.6-luna',
      assessment_model: 'gpt-5.6-terra',
      web_search_calls: searchCalls,
      estimated_run_cost_usd: Number(runCost.toFixed(6)),
      estimated_period_spend_usd: budget.estimated_spent_usd,
      allocated_90_day_budget_usd: budget.allocated_usd,
      operational_stop_usd: budget.operational_stop_usd
    },
    methodology: {
      note: 'All-hazards early-warning assessment. The score is a preparedness-urgency index, not the probability that a disaster, collapse, or war will occur.',
      formula: 'Preparedness Urgency = 40% Global Threat Pressure + 25% Observed Civilian Disruption + 10% Cross-System Coupling + 10% Momentum/Persistence + 15% Americas Exposure. Global threat, observed impact, and Americas exposure are weighted averages across all 12 domains.',
      rate_limits: 'Absent a verified hard trigger, normal daily movement is limited to ±3 points. A verified but non-severe hard trigger allows up to ±6. A verified national, multinational, or global hard trigger can bypass the rate limit.',
      stage_guardrails: 'HIGH ALERT begins at 80. IMMINENT DISRUPTION requires a score of at least 90, observed disruption of at least 75, and a verified severe hard trigger plus either 48-hour persistence or an active fast-onset trigger. ACTIVE DISRUPTION requires at least 97, observed disruption at least 85, three high-impact domains, and two verified severe triggers.',
      civil_unrest: 'Civil Unrest / Public Order is scored from observable violence, duration, geographic spread, emergency measures, infrastructure damage, and disruption to transport, commerce, public safety, or essential services. Peaceful protest and political ideology do not raise the score by themselves.',
      confidence: 'Evidence confidence is capped mechanically by source quality, recency, independence, cluster coverage, and actual web-search completion. It does not increase preparedness urgency.',
      pipeline: 'GPT-5.6 Luna collects current evidence with a hard web-search-call ceiling. GPT-5.6 Terra evaluates only that evidence with no web access. JavaScript validates hard triggers and calculates the final score mechanically.'
    }
  };

  await writeJson(dashboardFile, updated);
  await writeJson(statusFile, {
    schema_version: 1,
    engine_version: SCRIPT_VERSION,
    date: today,
    status: 'VERIFIED',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    message: `Published verified v5 assessment: ${score.published} ${score.stage}.`,
    research_quality: quality,
    web_search_calls: searchCalls,
    estimated_run_cost_usd: Number(runCost.toFixed(6)),
    estimated_period_spend_usd: budget.estimated_spent_usd,
    operational_stop_usd: budget.operational_stop_usd
  });

  console.log(`Published ${today}: ${score.published} ${score.stage}; searches=${searchCalls}; estimated run cost=$${runCost.toFixed(4)}; period spend=$${budget.estimated_spent_usd.toFixed(4)}.`);
} catch (err) {
  await writeJson(statusFile, {
    schema_version: 1,
    engine_version: SCRIPT_VERSION,
    date: today,
    status: 'STALE',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    message: String(err?.message || err),
    dashboard_preserved: true,
    last_verified_update: current.last_successful_update || current.updated_at || null,
    web_search_calls: searchCalls,
    estimated_partial_run_cost_usd: Number((researchCost + assessmentCost).toFixed(6)),
    estimated_period_spend_usd: budget.estimated_spent_usd,
    operational_stop_usd: budget.operational_stop_usd
  });
  console.error(`Update failed safely; dashboard.json was preserved. ${err?.stack || err}`);
  process.exitCode = 2;
}
