import fs from "node:fs/promises";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

const file = new URL("../dashboard.json", import.meta.url);
const current = JSON.parse(await fs.readFile(file, "utf8"));

const TIME_ZONE = "America/Indiana/Indianapolis";

function localDate(timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function finiteScore(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.round(value);
}

function weightedMean(items, field) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(items.reduce((sum, item) => sum + item[field] * item.weight, 0) / totalWeight);
}

function stageLabelForRegionalExposure(score) {
  if (score >= 85) return "SEVERE";
  if (score >= 70) return "HIGH";
  if (score >= 55) return "ELEVATED";
  if (score >= 40) return "WATCH";
  return "STABLE";
}

const today = localDate();

const domainRubric = current.domains.map(d => ({
  key: d.key,
  name: d.name,
  weight: d.weight,
  previous_threat: d.threat,
  previous_impact: d.impact,
  previous_americas_exposure: d.americas_exposure ?? 0
}));

const prompt = `
You are the research engine for an ALL-HAZARDS Global Disruption & Preparedness Dashboard dated ${today}.

MISSION
Estimate whether current conditions are deteriorating toward civilian-facing disruption severe enough that a prudent household in the Americas should advance normal preparedness BEFORE critical resources become difficult, expensive, unsafe, or unavailable.

This is NOT a World War III probability score and must not be sensationalized. War is one hazard pathway among many. Give substantial attention to non-war pathways including:
- global trade fragmentation, tariffs, retaliatory tariffs, embargoes, sanctions and export controls
- energy supply, fuel availability, refining, pipelines, electricity markets and maritime chokepoints
- supply-chain, freight, shipping, ports, rail, trucking and transportation disruption
- strategic technology, semiconductors, rare earths and critical-material chokepoints
- cyber threats to grid, water, telecom, satellites, GPS, finance, ports and subsea infrastructure
- financial-system, sovereign-debt, liquidity, credit, banking and payment-system stress
- food, fertilizer, agriculture and commodity supply risks
- public-health / biological hazards
- major natural / environmental shocks
- domestic institutional instability and emergency measures
- CIVIL UNREST / PUBLIC ORDER: riots, sustained violent unrest, politically motivated violence, major strikes, emergency deployments, curfews, road/rail/port/border closures, or disorder that materially affects commerce, transportation, infrastructure, public safety, or essential services

AMERICAS FOCUS
Explicitly research the United States, Canada, Mexico, Central America, South America and the Caribbean for conditions that could affect civilians. Include civil unrest/public order, critical infrastructure, energy/fuel exposure, trade restrictions, financial stress, transportation, food supply and public-health conditions.

For civil unrest/public order, remain politically neutral. Peaceful protest, controversial speech, partisan disagreement, elections, ideology, or demonstrations alone are NOT disruption. Raise scores only for observable factors such as violence, duration, geographic spread, emergency measures, disruption to transportation/commerce/essential services, infrastructure damage, supply access problems, or credible near-term escalation.

RESEARCH
Use web search for current reporting. Focus primarily on the past 24-72 hours, while preserving strategic context from the past several weeks when necessary.
Prioritize Reuters, AP, official government sources, NATO, central banks, IMF/World Bank, WHO, UN agencies, IEA/EIA and similarly authoritative sources.
Prefer direct source URLs over syndication mirrors.
Do not inflate scores because many headlines cover the same event.
Separate forward-looking threat from disruption already observed.

DOMAIN DEFINITIONS
For each supplied domain return:
- threat: 0-100 = credible forward-looking potential for material civilian/global disruption.
- impact: 0-100 = disruption ALREADY observable in prices, availability, outages, rationing, access restrictions, logistics, financial functioning, transportation, public safety, or essential services.
- americas_exposure: 0-100 = how directly the current condition could affect people, infrastructure, prices, access, mobility, safety, or essential services in the Americas under the current baseline.
- trend: rising | stable | easing
- rationale: one concise evidence-based sentence.

Score exactly these domains:
${JSON.stringify(domainRubric, null, 2)}

SCORING RUBRIC
Threat:
0-19 normal/background
20-39 elevated but contained
40-54 meaningful watch condition
55-69 credible disruption pathway
70-84 high / multiple leading indicators
85-94 very high / material near-term pathway
95-100 extreme / disruption pathway actively unfolding and difficult to contain

Observed impact:
0-19 little/no broad civilian impact
20-39 measurable but limited impact
40-54 material sector/regional effects
55-69 broad price/logistics/access effects
70-84 major disruption affecting multiple systems or regions
85-94 severe widespread civilian/system impact
95-100 broad systemic failure or active disaster

Americas exposure:
0-19 weak or indirect Americas transmission
20-39 plausible but limited transmission
40-54 meaningful regional relevance
55-69 material household/economic/infrastructure exposure
70-84 high direct exposure or multiple transmission channels
85-94 severe direct exposure with constrained alternatives
95-100 widespread Americas system impairment already occurring or immediately unavoidable

CROSS-SYSTEM COUPLING
Return coupling_score 0-100. Score higher only when multiple domains are causally reinforcing one another (example: conflict -> shipping disruption -> energy shock -> inflation -> credit stress -> shortages). Do not score high merely because several unrelated risks coexist.

EVIDENCE CONFIDENCE
Return confidence_score 0-100 and a short confidence_rationale. Confidence measures quality, recency, independence, and directness of evidence, NOT severity. High confidence requires multiple authoritative or direct sources and clear observed facts. Speculative or contradictory reporting should lower confidence.

PREPAREDNESS WINDOW
Choose exactly one phrase describing the fastest credible civilian-facing impact horizon under the current baseline, not a prediction date:
"Months", "Weeks to months", "Weeks", "Days to weeks", "Days", or "Immediate / ongoing".

HARD TRIGGERS
Return an array of 0-6 hard triggers. Include a trigger only when there is concrete evidence of a condition that can materially constrain civilian access or essential systems. Allowed types:
- fuel_shortage
- fuel_rationing
- shipping_chokepoint_closure
- major_port_closure
- transport_shutdown
- grid_outage
- telecom_outage
- payment_outage
- capital_controls
- bank_access_restrictions
- food_shortage
- medicine_shortage
- emergency_civil_order
- multiple_system_failures
Each trigger must include verified true/false, scope local|regional|national|multinational|global, status developing|active|resolved, summary, and a direct source_url. Mark verified=true only when supported by authoritative or high-quality reporting. Do NOT use military tension by itself as a hard trigger.

SIGNALS
Return 6-10 of the most decision-useful current signals. Each must include:
- title
- 1-2 sentence summary
- direct URL
- source/publisher
- published_at as ISO-8601 timestamp when available; YYYY-MM-DD when only date is available; null only when truly unavailable
- category: ENERGY | TRADE | SUPPLY | MILITARY | CYBER | FINANCE | FOOD | HEALTH | NATURAL | TECH | CIVIL | STABILIZER
- impact: up | down | neutral
Include Americas civil-unrest/public-order reporting when materially relevant.

STABILIZERS
Return 3-5 current conditions genuinely limiting immediate disruption. Examples: functioning alternative supply routes, resilient financial plumbing, reserve capacity, effective emergency response, active diplomacy, restored transport, or declining unrest. Do not invent reassurance.

AREAS TO WATCH
Return 5-8 concrete forward indicators. Each should have name, severity (critical|high|medium), and why.

AMERICAS SUMMARY
Return 2 concise sentences summarizing current civilian-facing stability/exposure in the Americas. Mention civil unrest/public order when it is materially relevant; otherwise explicitly note that broad disorder is not currently a leading driver.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2 concise sentences",
  "primary_driver": "1 concise sentence",
  "americas_summary": "2 concise sentences",
  "coupling_score": 0,
  "confidence_score": 0,
  "confidence_rationale": "short text",
  "preparedness_window": "Weeks",
  "domains": [
    {"key":"...", "threat":0, "impact":0, "americas_exposure":0, "trend":"rising|stable|easing", "rationale":"..."}
  ],
  "hard_triggers": [
    {"type":"fuel_shortage", "verified":true, "scope":"national", "status":"active", "summary":"...", "source_url":"https://..."}
  ],
  "primary_stabilizers": ["...", "...", "..."],
  "areas_to_watch": [
    {"name":"...", "severity":"critical|high|medium", "why":"..."}
  ],
  "signals": [
    {"title":"...", "summary":"...", "url":"https://...", "source":"Reuters", "published_at":"2026-09-10T12:34:56Z", "category":"ENERGY", "impact":"up|down|neutral"}
  ]
}

IMPORTANT
- Do NOT output the final Preparedness Urgency, Global Threat Pressure, Observed Civilian Disruption, Americas Exposure, Momentum, Conflict Escalation, or preparedness stage. They are calculated mechanically.
- Do NOT use markdown.
- Exactly one domain object for every supplied key.
- A tariff dispute can raise trade threat without implying military escalation.
- A cyber threat can be high while observed impact remains low if no outages have occurred.
- Peaceful protest alone should not elevate Civil Unrest / Public Order.
- Actual riots, prolonged violent disorder, curfews, emergency deployments, or strikes that disrupt ports/rail/fuel/essential services should raise civil-unrest impact and Americas exposure.
- Active shortages, rationing, capital controls, payment failures, fuel shortages, broad outages, port closures or persistent transport shutdowns should raise observed impact.
- Markets adapting, alternative routes functioning, reserve capacity, active trade flows and effective crisis-management channels are legitimate stabilizers.
`;

const body = {
  model: "gpt-5.6-luna",
  tools: [{ type: "web_search" }],
  input: prompt,
  max_output_tokens: 6000
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callOpenAIWithRetry(requestBody) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") {
        if (attempt === maxAttempts) {
          throw new Error("OpenAI request timed out after 180 seconds");
        }
        console.warn(`OpenAI request timed out, attempt ${attempt}/${maxAttempts}. Retrying...`);
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return response;

    const errorText = await response.text();

    if (response.status !== 429 || attempt === maxAttempts) {
      throw new Error(`OpenAI API ${response.status}: ${errorText}`);
    }

    // Bounded backoff: never let a bad Retry-After value sleep for hours.
    let delayMs = 15000 * (2 ** (attempt - 1));

    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) {
        delayMs = Math.max(delayMs, Math.ceil(seconds * 1000));
      }
    }

    const bodyDelay = errorText.match(/try again in\s+([0-9.]+)s/i);
    if (bodyDelay) {
      const seconds = Number(bodyDelay[1]);
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= 120) {
        delayMs = Math.max(delayMs, Math.ceil(seconds * 1000) + 1000);
      }
    }

    delayMs = Math.min(delayMs, 90000) + Math.floor(Math.random() * 1500);

    console.warn(
      `OpenAI rate limit (429), attempt ${attempt}/${maxAttempts}. ` +
      `Retrying in ${Math.ceil(delayMs / 1000)}s...`
    );
    console.warn(`429 details: ${errorText.slice(0, 1200)}`);
    await sleep(delayMs);
  }

  throw new Error("OpenAI request failed after retries");
}

const response = await callOpenAIWithRetry(body);
const raw = await response.json();
let text = raw.output_text || "";
if (!text) {
  for (const item of raw.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        if (c.type === "output_text") text += c.text;
      }
    }
  }
}
text = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
const update = JSON.parse(text);

const allowedTrends = new Set(["rising", "stable", "easing"]);
const allowedSeverity = new Set(["critical", "high", "medium"]);
const allowedSignalImpact = new Set(["up", "down", "neutral"]);
const allowedCategories = new Set(["ENERGY","TRADE","SUPPLY","MILITARY","CYBER","FINANCE","FOOD","HEALTH","NATURAL","TECH","CIVIL","STABILIZER"]);
const allowedWindows = new Set(["Months","Weeks to months","Weeks","Days to weeks","Days","Immediate / ongoing"]);
const allowedTriggerTypes = new Set([
  "fuel_shortage","fuel_rationing","shipping_chokepoint_closure","major_port_closure","transport_shutdown",
  "grid_outage","telecom_outage","payment_outage","capital_controls","bank_access_restrictions",
  "food_shortage","medicine_shortage","emergency_civil_order","multiple_system_failures"
]);
const allowedScopes = new Set(["local","regional","national","multinational","global"]);
const allowedTriggerStatus = new Set(["developing","active","resolved"]);

if (!Array.isArray(update.domains) || update.domains.length !== current.domains.length) {
  throw new Error("Invalid domain count");
}

const currentKeys = new Set(current.domains.map(d => d.key));
const seen = new Set();
for (const d of update.domains) {
  if (!currentKeys.has(d.key) || seen.has(d.key)) throw new Error(`Invalid/duplicate domain key ${d.key}`);
  seen.add(d.key);
  finiteScore(d.threat, `${d.key} threat`);
  finiteScore(d.impact, `${d.key} impact`);
  finiteScore(d.americas_exposure, `${d.key} americas_exposure`);
  if (!allowedTrends.has(d.trend)) throw new Error(`Invalid trend ${d.key}`);
  if (typeof d.rationale !== "string" || d.rationale.length < 5) throw new Error(`Missing rationale ${d.key}`);
}

finiteScore(update.coupling_score, "coupling_score");
finiteScore(update.confidence_score, "confidence_score");
if (typeof update.confidence_rationale !== "string" || update.confidence_rationale.length < 5) throw new Error("Missing confidence rationale");
if (!allowedWindows.has(update.preparedness_window)) throw new Error("Invalid preparedness_window");
if (typeof update.americas_summary !== "string" || update.americas_summary.length < 10) throw new Error("Missing Americas summary");
if (!Array.isArray(update.primary_stabilizers) || update.primary_stabilizers.length < 3) throw new Error("Need at least 3 stabilizers");
if (!Array.isArray(update.areas_to_watch) || update.areas_to_watch.length < 5) throw new Error("Need at least 5 watch areas");
if (!Array.isArray(update.signals) || update.signals.length < 6) throw new Error("Need at least 6 signals");
if (!Array.isArray(update.hard_triggers)) throw new Error("hard_triggers must be an array");

for (const w of update.areas_to_watch) {
  if (!allowedSeverity.has(w.severity)) throw new Error(`Invalid watch severity ${w.severity}`);
}
for (const s of update.signals) {
  if (!s.title || !s.summary || !s.url || !s.source) throw new Error("Signal missing required fields");
  if (!/^https:\/\//i.test(s.url)) throw new Error(`Signal URL must be https: ${s.url}`);
  if (!allowedSignalImpact.has(s.impact)) throw new Error(`Invalid signal impact ${s.impact}`);
  if (!allowedCategories.has(s.category)) throw new Error(`Invalid category ${s.category}`);
}
for (const h of update.hard_triggers) {
  if (!allowedTriggerTypes.has(h.type)) throw new Error(`Invalid hard trigger type ${h.type}`);
  if (typeof h.verified !== "boolean") throw new Error("Hard trigger verified must be boolean");
  if (!allowedScopes.has(h.scope)) throw new Error(`Invalid trigger scope ${h.scope}`);
  if (!allowedTriggerStatus.has(h.status)) throw new Error(`Invalid trigger status ${h.status}`);
  if (!h.summary || !/^https:\/\//i.test(h.source_url || "")) throw new Error("Hard trigger missing summary/source_url");
}

const mergedDomains = current.domains.map(old => {
  const fresh = update.domains.find(d => d.key === old.key);
  return {
    ...old,
    threat: finiteScore(fresh.threat, `${old.key} threat`),
    impact: finiteScore(fresh.impact, `${old.key} impact`),
    americas_exposure: finiteScore(fresh.americas_exposure, `${old.key} americas_exposure`),
    trend: fresh.trend,
    rationale: fresh.rationale
  };
});

const globalThreatPressure = weightedMean(mergedDomains, "threat");
const observedCivilianDisruption = weightedMean(mergedDomains, "impact");
const americasExposure = weightedMean(mergedDomains, "americas_exposure");
const couplingScore = finiteScore(update.coupling_score, "coupling_score");
const confidenceScore = finiteScore(update.confidence_score, "confidence_score");
const military = mergedDomains.find(d => d.key === "military");
if (!military) throw new Error("Missing military domain");
const conflictEscalation = military.threat;

const risingWeight = mergedDomains.filter(d => d.trend === "rising").reduce((s,d)=>s+d.weight,0);
const easingWeight = mergedDomains.filter(d => d.trend === "easing").reduce((s,d)=>s+d.weight,0);
const totalWeight = mergedDomains.reduce((s,d)=>s+d.weight,0);
const trendMomentum = clamp(Math.round(50 + 50 * ((risingWeight - easingWeight) / totalWeight)));

const priorHistory = [...(current.history || [])]
  .filter(h => h.date !== today && Number.isFinite(h.preparedness))
  .sort((a,b)=>a.date.localeCompare(b.date));

let historyMomentum = 50;
if (priorHistory.length >= 2) {
  const recent = priorHistory.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = Math.max(1, Math.round((new Date(last.date+"T12:00:00Z") - new Date(first.date+"T12:00:00Z")) / 86400000));
  const avgDailyChange = (last.preparedness - first.preparedness) / days;
  historyMomentum = clamp(Math.round(50 + avgDailyChange * 7));
}
const momentumScore = priorHistory.length >= 2
  ? Math.round(0.65 * trendMomentum + 0.35 * historyMomentum)
  : trendMomentum;

let rawPreparednessUrgency = Math.round(
  0.40 * globalThreatPressure +
  0.25 * observedCivilianDisruption +
  0.10 * couplingScore +
  0.10 * momentumScore +
  0.15 * americasExposure
);
rawPreparednessUrgency = clamp(rawPreparednessUrgency);

const verifiedTriggers = update.hard_triggers.filter(h => h.verified && h.status !== "resolved");
const severeScopes = new Set(["national","multinational","global"]);
const severeTriggers = verifiedTriggers.filter(h => severeScopes.has(h.scope));
const fastOnsetTypes = new Set([
  "fuel_shortage","fuel_rationing","shipping_chokepoint_closure","major_port_closure","transport_shutdown",
  "grid_outage","telecom_outage","payment_outage","capital_controls","bank_access_restrictions",
  "food_shortage","medicine_shortage","emergency_civil_order","multiple_system_failures"
]);
const immediateSevereTrigger = severeTriggers.some(h => fastOnsetTypes.has(h.type) && h.status === "active");

let preparednessUrgency = rawPreparednessUrgency;
let rateLimitApplied = false;
let rateLimit = null;
const previousDayScore = priorHistory.length ? priorHistory[priorHistory.length - 1].preparedness : null;

if (current.schema_version >= 3 && Number.isFinite(previousDayScore) && severeTriggers.length === 0) {
  rateLimit = verifiedTriggers.length ? 6 : 3;
  const limited = clamp(rawPreparednessUrgency, previousDayScore - rateLimit, previousDayScore + rateLimit);
  preparednessUrgency = Math.round(limited);
  rateLimitApplied = preparednessUrgency !== rawPreparednessUrgency;
}

const tentativeHistory = [...priorHistory, {
  date: today,
  preparedness: preparednessUrgency,
  raw_preparedness: rawPreparednessUrgency,
  threat: globalThreatPressure,
  impact: observedCivilianDisruption,
  americas: americasExposure,
  conflict: conflictEscalation,
  momentum: momentumScore
}].sort((a,b)=>a.date.localeCompare(b.date));

const lastThree = tentativeHistory.slice(-3);
const sustained90For48h = lastThree.length >= 3 && lastThree.every(h => h.preparedness >= 90);
const highImpactDomains = mergedDomains.filter(d => d.impact >= 70).length;

function stageFor(score, observed, highImpacts, severeCount, sustained90, immediateTrigger) {
  if (score >= 97 && observed >= 85 && highImpacts >= 3 && severeCount >= 2) return "ACTIVE DISRUPTION";
  if (score >= 90 && observed >= 75 && severeCount >= 1 && (sustained90 || immediateTrigger)) return "IMMINENT DISRUPTION";
  if (score >= 80) return "HIGH ALERT";
  if (score >= 65) return "ACCELERATE";
  if (score >= 50) return "PREPARE";
  if (score >= 35) return "WATCH";
  return "NORMAL";
}

const preparednessStage = stageFor(
  preparednessUrgency,
  observedCivilianDisruption,
  highImpactDomains,
  severeTriggers.length,
  sustained90For48h,
  immediateSevereTrigger
);

const confidenceLevel = confidenceScore >= 80 ? "HIGH" : confidenceScore >= 60 ? "MODERATE" : "LOW";
const americasStage = stageLabelForRegionalExposure(americasExposure);

const actionSets = {
  "NORMAL": [
    "Maintain a basic household emergency plan and routine emergency supplies.",
    "Keep important documents, contacts, and insurance information current.",
    "Periodically test flashlights, radios, backup batteries, and smoke/CO alarms."
  ],
  "WATCH": [
    "Review household food, water, medication, fuel, communications, and backup-power readiness.",
    "Replace expiring supplies and identify difficult-to-source essentials.",
    "Confirm family communications and meeting plans."
  ],
  "PREPARE": [
    "Build or maintain several weeks of normal food and household consumables.",
    "Keep prescriptions and essential medical supplies current.",
    "Maintain reasonable emergency cash alongside normal banking access.",
    "Keep vehicles reasonably fueled and verify backup power.",
    "Confirm family communications and meeting plans."
  ],
  "ACCELERATE": [
    "Complete sensible, previously planned preparedness purchases while normal supply channels are functioning.",
    "Maintain several weeks of food, household consumables, water capacity, and essential medical supplies.",
    "Keep vehicles reasonably fueled and verify generator, battery, solar, or other backup-power capability.",
    "Maintain diversified payment options and a reasonable amount of emergency cash.",
    "Confirm family communications, transportation, and meeting plans.",
    "Avoid panic buying; focus on resilience gaps that would be difficult to correct after disruption begins."
  ],
  "HIGH ALERT": [
    "Finish high-priority preparedness gaps now while supplies and services remain broadly available.",
    "Top off normal prescriptions, fuel, water storage, food, and backup-power readiness without hoarding.",
    "Keep multiple payment methods and emergency cash accessible.",
    "Review family communications, transportation, shelter, and contingency plans.",
    "Monitor authoritative local and national emergency information more frequently.",
    "Avoid speculative or fear-driven purchases; prioritize items with clear household utility."
  ],
  "IMMINENT DISRUPTION": [
    "Complete previously planned essential purchases immediately where practical and lawful, without hoarding.",
    "Secure normal prescriptions, fuel, water, food, backup power, and communications capability.",
    "Keep additional payment options and emergency cash accessible.",
    "Confirm transportation, family communications, shelter, and contingency plans.",
    "Follow official emergency guidance for any affected region or infrastructure system."
  ],
  "ACTIVE DISRUPTION": [
    "Follow official emergency instructions and prioritize immediate safety.",
    "Conserve constrained fuel, power, water, food, and other essential resources.",
    "Use established backup communications and power plans as needed.",
    "Avoid unnecessary travel into affected areas and verify information through authoritative sources.",
    "Assist nearby vulnerable people when safe to do so."
  ]
};

const americasComponents = [
  "civil_unrest","trade","energy","critical_infrastructure","financial","supply_chain"
].map(key => mergedDomains.find(d => d.key === key)).filter(Boolean)
 .sort((a,b)=>b.americas_exposure-a.americas_exposure)
 .map(d=>({name:d.name, score:d.americas_exposure, trend:d.trend}));

const history = tentativeHistory.slice(-370);

const next = {
  ...current,
  schema_version: 3,
  as_of: today,
  updated_at: new Date().toISOString(),
  preparedness_urgency: preparednessUrgency,
  raw_preparedness_urgency: rawPreparednessUrgency,
  preparedness_stage: preparednessStage,
  global_threat_pressure: globalThreatPressure,
  leading_threat_pressure: globalThreatPressure,
  observed_civilian_disruption: observedCivilianDisruption,
  americas_exposure: americasExposure,
  americas_stage: americasStage,
  americas_summary: update.americas_summary,
  americas_components: americasComponents,
  conflict_escalation: conflictEscalation,
  coupling_score: couplingScore,
  momentum_score: momentumScore,
  confidence_score: confidenceScore,
  confidence_level: confidenceLevel,
  confidence_rationale: update.confidence_rationale,
  preparedness_window: update.preparedness_window,
  summary: update.summary,
  primary_driver: update.primary_driver,
  primary_stabilizers: update.primary_stabilizers.slice(0, 5),
  domains: mergedDomains,
  hard_triggers: update.hard_triggers.slice(0, 6),
  verified_hard_trigger_count: verifiedTriggers.length,
  severe_hard_trigger_count: severeTriggers.length,
  score_calibration: {
    raw_score: rawPreparednessUrgency,
    published_score: preparednessUrgency,
    rate_limit_applied: rateLimitApplied,
    daily_rate_limit: rateLimit,
    sustained_90_for_48h: sustained90For48h,
    high_impact_domain_count: highImpactDomains
  },
  score_components: {
    global_threat_pressure: globalThreatPressure,
    observed_civilian_disruption: observedCivilianDisruption,
    coupling: couplingScore,
    momentum: momentumScore,
    americas_exposure: americasExposure
  },
  drivers: [...mergedDomains]
    .sort((a, b) => (b.threat + b.impact * 0.35) - (a.threat + a.impact * 0.35))
    .slice(0, 6)
    .map((d, i) => ({
      name: d.name,
      severity: d.threat >= 85 ? "critical" : d.threat >= 70 ? "high" : "medium",
      note: i === 0 ? "Primary driver" : ""
    })),
  areas_to_watch: update.areas_to_watch.slice(0, 8),
  signals: update.signals.slice(0, 10).map(s => ({
    title: s.title,
    summary: s.summary,
    url: s.url,
    source: s.source,
    published_at: s.published_at || null,
    category: s.category,
    impact: s.impact
  })),
  preparedness_actions: actionSets[preparednessStage] || actionSets.WATCH,
  history,
  methodology: {
    note: "All-hazards early-warning assessment. The score is a preparedness-urgency index, not the probability that a disaster, collapse, or war will occur.",
    formula: "Preparedness Urgency = 40% Global Threat Pressure + 25% Observed Civilian Disruption + 10% Cross-System Coupling + 10% Momentum/Persistence + 15% Americas Exposure. Global threat, observed impact, and Americas exposure are weighted averages across all 12 domains.",
    rate_limits: "Absent a verified hard trigger, normal daily movement is limited to ±3 points. A verified but non-severe hard trigger allows up to ±6. A verified national, multinational, or global hard trigger can bypass the rate limit.",
    stage_guardrails: "HIGH ALERT begins at 80. IMMINENT DISRUPTION requires a score of at least 90, observed disruption of at least 75, and a verified severe hard trigger plus either 48-hour persistence or an active fast-onset trigger. ACTIVE DISRUPTION requires at least 97, observed disruption at least 85, three high-impact domains, and two verified severe triggers.",
    civil_unrest: "Civil Unrest / Public Order is scored from observable violence, duration, geographic spread, emergency measures, infrastructure damage, and disruption to transport, commerce, public safety, or essential services. Peaceful protest and political ideology do not raise the score by themselves.",
    confidence: "Evidence confidence is displayed separately and does not increase preparedness urgency.",
    domains: "Military/geopolitical, energy, trade, supply chain/transportation, technology chokepoints, critical infrastructure/cyber, financial-system stress, food/agriculture, domestic institutional stress, civil unrest/public order, public health/biological, and natural/environmental."
  }
};

await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(`Updated ${today}: raw=${rawPreparednessUrgency}, published=${preparednessUrgency}, stage=${preparednessStage}, threat=${globalThreatPressure}, impact=${observedCivilianDisruption}, Americas=${americasExposure}`);
