import fs from "node:fs/promises";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

const file = new URL("../dashboard.json", import.meta.url);
const current = JSON.parse(await fs.readFile(file, "utf8"));

function localDate(timeZone = "America/Indiana/Indianapolis") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const today = localDate();

const domainRubric = current.domains.map(d => ({
  key: d.key,
  name: d.name,
  weight: d.weight,
  previous_threat: d.threat,
  previous_impact: d.impact
}));

const prompt = `
You are the research engine for an ALL-HAZARDS Global Disruption & Preparedness Dashboard dated ${today}.

MISSION
Estimate whether global conditions are deteriorating toward widespread civilian-facing disruption severe enough that a prudent household should accelerate normal preparedness BEFORE critical resources become difficult, expensive, or unavailable.

This is NOT a "World War III probability" score. Research war and geopolitical conflict, but give equal analytical attention to non-war pathways such as:
- global trade fragmentation, tariffs, retaliatory tariffs, embargoes and export controls
- energy supply and electricity-market stress
- supply-chain, freight, shipping, port and transportation disruption
- strategic technology and critical-material chokepoints
- cyberattacks and threats to grid, telecom, satellite, GPS, financial and subsea infrastructure
- financial-system, sovereign-debt, liquidity, credit and payment-system stress
- food, fertilizer, agriculture and commodity supply risks
- public-health / biological hazards
- major natural / environmental shocks
- domestic institutional instability or emergency measures that could materially affect civilian access or safety

RESEARCH
Use web search for CURRENT reporting. Focus primarily on the past 24-72 hours, while preserving strategic context from the past several weeks when necessary.
Prioritize Reuters, AP, official government sources, NATO, central banks, IMF/World Bank, WHO, UN agencies, IEA/EIA and similarly authoritative sources.
Prefer direct source URLs over syndication mirrors.
Do not inflate scores because many headlines cover the same event.
Distinguish threat from observed impact.

DOMAIN DEFINITIONS
For each supplied domain return:
- threat: 0-100 = credible forward-looking potential for material civilian/global disruption.
- impact: 0-100 = disruption ALREADY observable in prices, availability, outages, rationing, access restrictions, logistics, financial functioning, or public safety.
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
95-100 extreme / disruption pathway is actively unfolding and difficult to contain

Observed impact:
0-19 little/no broad civilian impact
20-39 measurable but limited impact
40-54 material sector/regional effects
55-69 broad price/logistics/access effects
70-84 major disruption affecting multiple systems or regions
85-94 severe widespread civilian/system impact
95-100 broad systemic failure or active disaster

CROSS-SYSTEM COUPLING
Return coupling_score 0-100. Score higher only when multiple domains are causally reinforcing one another (example: conflict -> shipping disruption -> energy shock -> inflation -> credit stress -> shortages). Do not score high merely because several unrelated risks exist at once.

PREPAREDNESS WINDOW
Choose one concise phrase describing the fastest credible civilian-facing impact horizon under the current baseline, not a prediction date:
"Months", "Weeks to months", "Weeks", "Days to weeks", "Days", or "Immediate / ongoing".

SIGNALS
Return 5-8 of the most decision-useful current signals. Each must include:
- title
- 1-2 sentence summary
- direct URL
- source/publisher
- published_at as ISO-8601 timestamp when available; YYYY-MM-DD when only date is available; null only when truly unavailable
- category: ENERGY | TRADE | SUPPLY | MILITARY | CYBER | FINANCE | FOOD | HEALTH | NATURAL | TECH | STABILIZER
- impact: up | down | neutral

STABILIZERS
Return 3-5 current conditions that are genuinely limiting immediate disruption. Examples can include functioning alternative supply routes, resilient financial plumbing, active diplomacy, reserve capacity, or successful adaptation. Do not invent reassurance.

AREAS TO WATCH
Return 4-7 concrete forward indicators. Each should have name, severity (critical|high|medium), and why.

Return ONLY valid JSON with this exact shape:
{
  "summary": "2 concise sentences",
  "primary_driver": "1 concise sentence",
  "coupling_score": 0,
  "preparedness_window": "Weeks",
  "domains": [
    {"key":"...", "threat":0, "impact":0, "trend":"rising|stable|easing", "rationale":"..."}
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
- Do NOT output the final Preparedness Urgency, Leading Threat Pressure, Observed Civilian Disruption, Conflict Escalation, or stage. They are calculated mechanically.
- Do NOT use markdown.
- Exactly one domain object for every supplied key.
- A tariff dispute can raise trade threat without implying military escalation.
- A cyber threat can be high while observed impact remains low if no outages have occurred.
- Active shortages, rationing, capital controls, payment failures, fuel shortages, broad outages, port closures or persistent transport shutdowns should raise observed impact.
- Markets adapting, alternative routes functioning, reserve capacity, active trade flows and effective crisis-management channels are legitimate stabilizers.
`;

const body = {
  model: "gpt-5.6-luna",
  tools: [{ type: "web_search" }],
  input: prompt
};

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

if (!response.ok) {
  throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
}

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
const allowedImpact = new Set(["up", "down", "neutral"]);
const allowedCategories = new Set(["ENERGY","TRADE","SUPPLY","MILITARY","CYBER","FINANCE","FOOD","HEALTH","NATURAL","TECH","STABILIZER"]);
const allowedWindows = new Set(["Months","Weeks to months","Weeks","Days to weeks","Days","Immediate / ongoing"]);

function finiteScore(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.round(value);
}

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
  if (!allowedTrends.has(d.trend)) throw new Error(`Invalid trend ${d.key}`);
  if (typeof d.rationale !== "string" || d.rationale.length < 5) throw new Error(`Missing rationale ${d.key}`);
}

if (!Number.isFinite(update.coupling_score) || update.coupling_score < 0 || update.coupling_score > 100) {
  throw new Error("Invalid coupling_score");
}
if (!allowedWindows.has(update.preparedness_window)) throw new Error("Invalid preparedness_window");
if (!Array.isArray(update.primary_stabilizers) || update.primary_stabilizers.length < 3) throw new Error("Need at least 3 stabilizers");
if (!Array.isArray(update.areas_to_watch) || update.areas_to_watch.length < 4) throw new Error("Need at least 4 watch areas");
if (!Array.isArray(update.signals) || update.signals.length < 5) throw new Error("Need at least 5 signals");

for (const w of update.areas_to_watch) {
  if (!allowedSeverity.has(w.severity)) throw new Error(`Invalid watch severity ${w.severity}`);
}
for (const s of update.signals) {
  if (!s.title || !s.summary || !s.url || !s.source) throw new Error("Signal missing required fields");
  if (!/^https:\/\//i.test(s.url)) throw new Error(`Signal URL must be https: ${s.url}`);
  if (!allowedImpact.has(s.impact)) throw new Error(`Invalid signal impact ${s.impact}`);
  if (!allowedCategories.has(s.category)) throw new Error(`Invalid category ${s.category}`);
}

const mergedDomains = current.domains.map(old => {
  const fresh = update.domains.find(d => d.key === old.key);
  return {
    ...old,
    threat: finiteScore(fresh.threat, `${old.key} threat`),
    impact: finiteScore(fresh.impact, `${old.key} impact`),
    trend: fresh.trend,
    rationale: fresh.rationale
  };
});

function topMean(values, n = 4) {
  const sorted = [...values].sort((a, b) => b - a).slice(0, n);
  return Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
}

const leadingThreatPressure = topMean(mergedDomains.map(d => d.threat), 4);
const observedCivilianDisruption = topMean(mergedDomains.map(d => d.impact), 4);
const military = mergedDomains.find(d => d.key === "military");
if (!military) throw new Error("Missing military domain");
const conflictEscalation = military.threat;
const couplingScore = finiteScore(update.coupling_score, "coupling_score");

let preparednessUrgency = Math.round(
  0.55 * leadingThreatPressure +
  0.30 * observedCivilianDisruption +
  0.15 * couplingScore
);
preparednessUrgency = Math.max(0, Math.min(100, preparednessUrgency));

const highImpactDomains = mergedDomains.filter(d => d.impact >= 70).length;

function stageFor(score, observed, highImpacts) {
  if (score >= 95 && observed >= 80 && highImpacts >= 2) return "ACTIVE DISRUPTION";
  if (score >= 85 && (observed >= 65 || highImpacts >= 2)) return "IMMINENT DISRUPTION";
  if (score >= 70) return "ACCELERATE";
  if (score >= 55) return "PREPARE";
  if (score >= 40) return "WATCH";
  return "NORMAL";
}

const preparednessStage = stageFor(preparednessUrgency, observedCivilianDisruption, highImpactDomains);

const actionSets = {
  "NORMAL": [
    "Maintain a basic household emergency plan and routine emergency supplies.",
    "Keep important documents, contacts, and insurance information current.",
    "Periodically test flashlights, radios, backup batteries, and smoke/CO alarms."
  ],
  "WATCH": [
    "Review household food, water, medication, fuel, and backup-power readiness.",
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
    "Maintain several weeks of normal food and household consumables.",
    "Keep prescriptions and essential medical supplies current.",
    "Maintain a reasonable amount of emergency cash alongside normal banking access.",
    "Keep vehicles reasonably fueled.",
    "Verify generator, battery, solar, or other backup-power capability.",
    "Confirm family communications and meeting plans."
  ],
  "IMMINENT DISRUPTION": [
    "Complete previously planned purchases of essential household supplies without hoarding.",
    "Top off normal prescriptions, fuel, water storage, and backup-power readiness where practical and lawful.",
    "Keep additional payment options and emergency cash accessible.",
    "Confirm family communications, transportation, and contingency plans.",
    "Follow official emergency guidance for any affected region or infrastructure system."
  ],
  "ACTIVE DISRUPTION": [
    "Follow official emergency instructions and prioritize immediate safety.",
    "Conserve constrained fuel, power, water, and other essential resources.",
    "Use established backup communications and power plans as needed.",
    "Avoid unnecessary travel into affected areas and verify information through authoritative sources.",
    "Assist household and nearby vulnerable people when safe to do so."
  ]
};

const history = [...(current.history || [])].filter(h => h.date !== today);
history.push({
  date: today,
  preparedness: preparednessUrgency,
  threat: leadingThreatPressure,
  impact: observedCivilianDisruption,
  conflict: conflictEscalation
});
history.sort((a, b) => a.date.localeCompare(b.date));
while (history.length > 370) history.shift();

const next = {
  ...current,
  schema_version: 2,
  as_of: today,
  updated_at: new Date().toISOString(),
  preparedness_urgency: preparednessUrgency,
  preparedness_stage: preparednessStage,
  leading_threat_pressure: leadingThreatPressure,
  observed_civilian_disruption: observedCivilianDisruption,
  conflict_escalation: conflictEscalation,
  coupling_score: couplingScore,
  preparedness_window: update.preparedness_window,
  summary: update.summary,
  primary_driver: update.primary_driver,
  primary_stabilizers: update.primary_stabilizers.slice(0, 5),
  domains: mergedDomains,
  drivers: [...mergedDomains]
    .sort((a, b) => b.threat - a.threat)
    .slice(0, 5)
    .map((d, i) => ({
      name: d.name,
      severity: d.threat >= 85 ? "critical" : d.threat >= 70 ? "high" : "medium",
      note: i === 0 ? "Primary driver" : ""
    })),
  areas_to_watch: update.areas_to_watch.slice(0, 7),
  signals: update.signals.slice(0, 8).map(s => ({
    title: s.title,
    summary: s.summary,
    url: s.url,
    source: s.source,
    published_at: s.published_at || null,
    category: s.category,
    impact: s.impact
  })),
  preparedness_actions: actionSets[preparednessStage],
  history
};

await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");

console.log(
  `Updated ${today}: preparedness=${preparednessUrgency}, stage=${preparednessStage}, ` +
  `threat=${leadingThreatPressure}, impact=${observedCivilianDisruption}, coupling=${couplingScore}`
);
