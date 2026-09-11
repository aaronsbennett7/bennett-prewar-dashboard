import fs from "node:fs/promises";

const SCRIPT_VERSION = "4.0-zero-credit";
const TIME_ZONE = "America/Indiana/Indianapolis";
const file = new URL("../dashboard.json", import.meta.url);
const current = JSON.parse(await fs.readFile(file, "utf8"));

console.log(`Dashboard updater ${SCRIPT_VERSION} starting (no paid AI API required)...`);

function localDate(timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const today = localDate();
const nowIso = new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n);

const TRUSTED_DOMAINS = [
  "reuters.com", "apnews.com", "bbc.com", "ft.com", "bloomberg.com", "wsj.com",
  "nytimes.com", "washingtonpost.com", "cnbc.com", "cnn.com", "abcnews.go.com",
  "npr.org", "theguardian.com", "aljazeera.com", "who.int", "imf.org", "worldbank.org",
  "un.org", "nato.int", "europa.eu", "canada.ca", "gov.uk", "ustr.gov", "state.gov",
  "treasury.gov", "federalreserve.gov", "cisa.gov", "weather.gov", "noaa.gov", "usgs.gov"
];

const SOURCE_NAMES = new Map([
  ["reuters.com", "Reuters"], ["apnews.com", "Associated Press"], ["bbc.com", "BBC"],
  ["ft.com", "Financial Times"], ["bloomberg.com", "Bloomberg"], ["wsj.com", "Wall Street Journal"],
  ["cnbc.com", "CNBC"], ["cnn.com", "CNN"], ["npr.org", "NPR"], ["who.int", "WHO"],
  ["imf.org", "IMF"], ["worldbank.org", "World Bank"], ["nato.int", "NATO"],
  ["canada.ca", "Government of Canada"], ["ustr.gov", "USTR"], ["state.gov", "U.S. State Department"],
  ["treasury.gov", "U.S. Treasury"], ["federalreserve.gov", "Federal Reserve"],
  ["cisa.gov", "CISA"], ["weather.gov", "National Weather Service"], ["noaa.gov", "NOAA"],
  ["usgs.gov", "USGS"]
]);

const AMERICAS_TERMS = [
  "united states", "u.s.", " us ", "america", "canada", "mexico", "brazil", "argentina",
  "colombia", "venezuela", "chile", "peru", "ecuador", "bolivia", "paraguay", "uruguay",
  "guyana", "suriname", "panama", "costa rica", "guatemala", "honduras", "el salvador",
  "nicaragua", "belize", "caribbean", "cuba", "haiti", "jamaica", "dominican", "puerto rico"
];

const AMERICAS_SOURCE_COUNTRIES = new Set([
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Colombia", "Venezuela", "Chile",
  "Peru", "Ecuador", "Bolivia", "Paraguay", "Uruguay", "Guyana", "Suriname", "Panama",
  "Costa Rica", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Belize", "Cuba", "Haiti",
  "Jamaica", "Dominican Republic", "Puerto Rico"
]);

const DOMAIN_CONFIG = {
  energy: {
    category: "ENERGY",
    query: '(oil OR gas OR LNG OR refinery OR pipeline OR electricity OR "power grid") (shortage OR disruption OR attack OR closure OR outage OR rationing OR spike)',
    threat: ["attack", "threat", "warning", "risk", "escalat", "strike", "sanction", "disrupt", "closure", "spike"],
    impact: ["shortage", "ration", "outage", "closed", "closure", "halted", "shutdown", "blackout", "record high", "surge"]
  },
  military: {
    category: "MILITARY",
    query: '(war OR missile OR invasion OR blockade OR mobilization OR "military strike" OR attack) (NATO OR Russia OR Ukraine OR China OR Taiwan OR Iran OR Israel OR "United States")',
    threat: ["war", "missile", "invasion", "blockade", "mobiliz", "strike", "attack", "escalat", "threat"],
    impact: ["killed", "casualties", "struck", "attacked", "invaded", "blockade", "mobilization", "evacuation"]
  },
  supply_chain: {
    category: "SUPPLY",
    query: '("supply chain" OR shipping OR freight OR port OR rail OR trucking OR container) (disruption OR closure OR strike OR delay OR shortage OR reroute OR insurance)',
    threat: ["risk", "strike", "delay", "rerout", "insurance", "disrupt", "closure", "threat"],
    impact: ["closed", "closure", "shutdown", "halted", "shortage", "backlog", "suspended", "cancelled", "delays"]
  },
  trade: {
    category: "TRADE",
    query: '(tariff OR tariffs OR "trade war" OR embargo OR sanctions OR "export control" OR "import ban" OR retaliation)',
    threat: ["tariff", "retaliat", "sanction", "embargo", "export control", "import ban", "trade war", "restriction"],
    impact: ["effective", "takes effect", "ban", "blocked", "halted", "suspended", "shortage", "price increase"]
  },
  technology: {
    category: "TECH",
    query: '(semiconductor OR semiconductors OR "rare earth" OR chips OR "critical minerals" OR telecom) (shortage OR export OR restriction OR sanction OR disruption)',
    threat: ["restriction", "sanction", "export", "ban", "risk", "shortage", "disrupt", "control"],
    impact: ["shortage", "halted", "suspended", "stopped", "ban", "unavailable", "ration"]
  },
  critical_infrastructure: {
    category: "CYBER",
    query: '("power grid" OR utility OR telecom OR satellite OR GPS OR "subsea cable" OR water OR payments) (cyber OR attack OR outage OR sabotage OR disruption)',
    threat: ["cyber", "attack", "sabotage", "threat", "risk", "target", "disrupt"],
    impact: ["outage", "blackout", "offline", "down", "disrupted", "cut", "disabled", "failure"]
  },
  financial: {
    category: "FINANCE",
    query: '(bank OR banking OR bond OR credit OR liquidity OR debt OR payments OR market) (stress OR crisis OR default OR outage OR "capital controls" OR "bank run" OR "withdrawal limit")',
    threat: ["stress", "crisis", "default", "liquidity", "bank run", "capital controls", "risk", "selloff"],
    impact: ["default", "outage", "withdrawal limit", "capital controls", "bank run", "frozen", "suspended", "failed"]
  },
  food: {
    category: "FOOD",
    query: '(food OR grain OR wheat OR corn OR fertilizer OR agriculture OR livestock) (shortage OR "export ban" OR disruption OR rationing OR disease OR drought OR price)',
    threat: ["drought", "disease", "export ban", "risk", "price", "disrupt", "shortage", "crop failure"],
    impact: ["shortage", "ration", "export ban", "failed crop", "cull", "unavailable", "record price"]
  },
  domestic: {
    category: "CIVIL",
    query: '("state of emergency" OR "emergency powers" OR "government shutdown" OR "border closure" OR curfew OR "institutional crisis")',
    threat: ["emergency", "shutdown", "closure", "curfew", "crisis", "breakdown", "instability"],
    impact: ["closed", "shutdown", "curfew", "suspended", "emergency declared", "services halted"]
  },
  civil_unrest: {
    category: "CIVIL",
    query: '(riot OR riots OR "civil unrest" OR "violent protest" OR "general strike" OR curfew OR looting OR clashes) (transport OR port OR rail OR fuel OR infrastructure OR police OR government)',
    threat: ["riot", "civil unrest", "violent", "strike", "curfew", "looting", "clashes", "tension"],
    impact: ["closed", "shutdown", "curfew", "looting", "burned", "blocked", "halted", "disrupted", "deployed"]
  },
  public_health: {
    category: "HEALTH",
    query: '(outbreak OR epidemic OR pandemic OR Ebola OR "avian flu" OR H5N1 OR cholera OR measles OR polio) (WHO OR health OR cases OR deaths OR emergency)',
    threat: ["outbreak", "epidemic", "pandemic", "spread", "emergency", "cases", "deaths", "warning"],
    impact: ["emergency declared", "lockdown", "quarantine", "travel restriction", "deaths", "hospital surge", "shortage"]
  },
  natural: {
    category: "NATURAL",
    query: '(earthquake OR hurricane OR typhoon OR cyclone OR flood OR wildfire OR drought OR tsunami) (evacuation OR outage OR damage OR deaths OR port OR infrastructure)',
    threat: ["hurricane", "typhoon", "cyclone", "wildfire", "flood", "earthquake", "tsunami", "drought", "warning"],
    impact: ["evacuation", "outage", "damage", "deaths", "closed", "destroyed", "flooded", "landfall"]
  }
};

function normalizeDomain(host) {
  if (!host) return "";
  return host.toLowerCase().replace(/^www\./, "");
}

function sourceName(domain, fallback = "News source") {
  const d = normalizeDomain(domain);
  for (const [key, val] of SOURCE_NAMES.entries()) {
    if (d === key || d.endsWith(`.${key}`)) return val;
  }
  if (fallback && fallback !== d) return fallback;
  return d || "News source";
}

function isTrusted(domain) {
  const d = normalizeDomain(domain);
  return TRUSTED_DOMAINS.some(x => d === x || d.endsWith(`.${x}`)) || d.endsWith(".gov") || d.endsWith(".mil");
}

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function gdeltDateToIso(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  if (!m) return s;
  const [, y, mo, d, h = "00", mi = "00", sec = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}Z`;
}

function containsAny(text, terms) {
  const t = ` ${String(text || "").toLowerCase()} `;
  return terms.filter(term => t.includes(term.toLowerCase()));
}

function isAmericas(article) {
  if (AMERICAS_SOURCE_COUNTRIES.has(article.sourcecountry)) return true;
  const t = ` ${String(article.title || "").toLowerCase()} `;
  return AMERICAS_TERMS.some(x => t.includes(x));
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BennettPreparednessDashboard/4.0" }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGdelt(query) {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    maxrecords: "35",
    timespan: "1d",
    sort: "datedesc",
    format: "json"
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
  const data = await fetchJson(url);
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.map(a => ({
    title: decodeEntities(a.title || ""),
    url: a.url || a.url_mobile || "",
    domain: normalizeDomain(a.domain || ""),
    source: sourceName(a.domain || ""),
    sourcecountry: a.sourcecountry || "",
    published_at: gdeltDateToIso(a.seendate || a.date || null),
    provider: "GDELT"
  })).filter(a => a.title && /^https?:\/\//i.test(a.url));
}

function xmlText(s = "") {
  return decodeEntities(s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim());
}

async function fetchGoogleNews(query) {
  const q = `${query} when:1d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "BennettPreparednessDashboard/4.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25).map(m => m[1]);
    return items.map(item => {
      const title = xmlText(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
      const link = xmlText(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "");
      const pubDate = xmlText(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
      const sourceMatch = item.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i);
      const sourceUrl = sourceMatch?.[1] || "";
      let domain = "news.google.com";
      try { if (sourceUrl) domain = new URL(sourceUrl).hostname; } catch {}
      return {
        title,
        url: link,
        domain: normalizeDomain(domain),
        source: xmlText(sourceMatch?.[2] || domain),
        sourcecountry: "",
        published_at: pubDate ? new Date(pubDate).toISOString() : null,
        provider: "Google News RSS"
      };
    }).filter(a => a.title && /^https?:\/\//i.test(a.url));
  } finally {
    clearTimeout(timer);
  }
}

function dedupeArticles(items) {
  const seen = new Set();
  const out = [];
  for (const a of items) {
    const key = `${a.url}|${a.title.toLowerCase().replace(/\W+/g, " ").slice(0, 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function articleSeverity(article, cfg) {
  const threatHits = containsAny(article.title, cfg.threat);
  const impactHits = containsAny(article.title, cfg.impact);
  let score = 0.5 + Math.min(2.0, threatHits.length * 0.65) + Math.min(2.6, impactHits.length * 1.05);
  if (isTrusted(article.domain)) score += 0.45;
  return {
    score: Math.min(5, score),
    threatHits,
    impactHits,
    trusted: isTrusted(article.domain),
    americas: isAmericas(article)
  };
}

function boundedMove(previous, target, normalLimit = 8) {
  const blended = 0.65 * previous + 0.35 * target;
  const delta = clamp(blended - previous, -normalLimit, normalLimit);
  return round(clamp(previous + delta));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function weightedMean(items, field) {
  const tw = items.reduce((s, x) => s + (x.weight || 1), 0);
  return tw ? round(items.reduce((s, x) => s + x[field] * (x.weight || 1), 0) / tw) : 0;
}

function stageForRegional(score) {
  if (score >= 85) return "SEVERE";
  if (score >= 70) return "HIGH";
  if (score >= 55) return "ELEVATED";
  if (score >= 40) return "WATCH";
  return "STABLE";
}

const domainResults = [];
const allScoredArticles = [];
const fetchFailures = [];

for (const old of current.domains) {
  const cfg = DOMAIN_CONFIG[old.key];
  if (!cfg) throw new Error(`Missing domain config for ${old.key}`);

  let articles = [];
  let provider = "GDELT";
  try {
    articles = await fetchGdelt(cfg.query);
    if (!articles.length) throw new Error("No GDELT results");
  } catch (err) {
    console.warn(`${old.key}: GDELT unavailable (${err.message}); trying Google News RSS.`);
    provider = "Google News RSS";
    try {
      articles = await fetchGoogleNews(cfg.query);
    } catch (fallbackErr) {
      console.warn(`${old.key}: fallback unavailable (${fallbackErr.message}).`);
      fetchFailures.push(old.key);
      articles = [];
    }
  }

  articles = dedupeArticles(articles).slice(0, 30);
  const scored = articles.map(a => ({ ...a, ...articleSeverity(a, cfg), domainKey: old.key, category: cfg.category }));
  allScoredArticles.push(...scored);

  const uniqueSources = new Set(scored.map(a => a.domain || a.source)).size;
  const trustedSources = new Set(scored.filter(a => a.trusted).map(a => a.domain || a.source)).size;
  const topSeverity = [...scored].sort((a, b) => b.score - a.score).slice(0, 6).map(a => a.score);
  const impactArticles = scored.filter(a => a.impactHits.length > 0);
  const impactSources = new Set(impactArticles.map(a => a.domain || a.source)).size;
  const impactSeverity = [...impactArticles].sort((a, b) => b.score - a.score).slice(0, 5).map(a => a.score);
  const americasArticles = scored.filter(a => a.americas);
  const americasSources = new Set(americasArticles.map(a => a.domain || a.source)).size;
  const americasSeverity = [...americasArticles].sort((a, b) => b.score - a.score).slice(0, 5).map(a => a.score);

  let targetThreat;
  let targetImpact;
  let targetAmericas;

  if (!scored.length) {
    targetThreat = Math.max(20, (old.threat ?? 40) - 8);
    targetImpact = Math.max(10, (old.impact ?? 25) - 7);
    targetAmericas = Math.max(15, (old.americas_exposure ?? 30) - 7);
  } else {
    targetThreat = clamp(
      12 + Math.min(36, uniqueSources * 4.5) + (mean(topSeverity) / 5) * 42 + Math.min(10, trustedSources * 2),
      18, 95
    );
    if (scored.length < 4) targetThreat *= 0.82;

    targetImpact = impactArticles.length
      ? clamp(6 + Math.min(38, impactSources * 6) + (mean(impactSeverity) / 5) * 42, 8, 90)
      : 12;

    targetAmericas = americasArticles.length
      ? clamp(10 + Math.min(42, americasSources * 6) + (mean(americasSeverity) / 5) * 40, 12, 92)
      : 18;
  }

  const threat = boundedMove(old.threat ?? 40, targetThreat, 8);
  const impact = boundedMove(old.impact ?? 25, targetImpact, 7);
  const americas_exposure = boundedMove(old.americas_exposure ?? 30, targetAmericas, 8);
  const delta = threat - (old.threat ?? threat);
  const trend = delta >= 3 ? "rising" : delta <= -3 ? "easing" : "stable";

  const top = [...scored].sort((a, b) => b.score - a.score)[0];
  const rationale = top
    ? `Fresh ${provider} monitoring found ${scored.length} relevant reports across ${uniqueSources} outlets; top signal: ${top.title.slice(0, 150)}.`
    : `No usable fresh reporting was returned for this domain; the score was allowed to decay gradually rather than being guessed.`;

  domainResults.push({
    ...old,
    threat,
    impact,
    americas_exposure,
    trend,
    rationale
  });

  await sleep(250);
}

// Supplement natural-hazard coverage with authoritative USGS earthquake data.
try {
  const usgs = await fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");
  const strong = (usgs?.features || []).filter(f => Number(f?.properties?.mag) >= 6.0).slice(0, 5);
  for (const f of strong) {
    allScoredArticles.push({
      title: `M${f.properties.mag} earthquake: ${f.properties.place || "location unavailable"}`,
      url: f.properties.url,
      domain: "usgs.gov",
      source: "USGS",
      sourcecountry: "",
      published_at: new Date(f.properties.time).toISOString(),
      provider: "USGS",
      domainKey: "natural",
      category: "NATURAL",
      score: Number(f.properties.mag) >= 7 ? 4.6 : 3.6,
      threatHits: ["earthquake"],
      impactHits: Number(f.properties.mag) >= 7 ? ["major earthquake"] : [],
      trusted: true,
      americas: /Alaska|California|Mexico|Chile|Peru|Ecuador|Canada|Caribbean|Puerto Rico|United States/i.test(f.properties.place || "")
    });
  }
} catch (err) {
  console.warn(`USGS supplement unavailable: ${err.message}`);
}

const TRIGGERS = [
  ["fuel_shortage", /\b(fuel|gasoline|diesel) shortage\b/i],
  ["fuel_rationing", /\b(fuel|gasoline|diesel).*ration|ration.*\b(fuel|gasoline|diesel)\b/i],
  ["shipping_chokepoint_closure", /\b(strait|canal|shipping lane|chokepoint).*(closed|closure|halted|blocked)|\b(closed|closure|halted|blocked).*(strait|canal|shipping lane|chokepoint)\b/i],
  ["major_port_closure", /\b(port|harbor).*(closed|closure|shutdown|halted)|\b(closed|closure|shutdown|halted).*(port|harbor)\b/i],
  ["transport_shutdown", /\b(rail|trucking|transport|airport|airspace).*(shutdown|halted|closed|suspended)\b/i],
  ["grid_outage", /\b(blackout|power outage|grid failure|grid outage)\b/i],
  ["telecom_outage", /\b(telecom|internet|communications).*(outage|down|failure|offline)\b/i],
  ["payment_outage", /\b(payment|card payments|banking network).*(outage|down|offline|failure)\b/i],
  ["capital_controls", /\bcapital controls\b/i],
  ["bank_access_restrictions", /\b(withdrawal limits?|bank access restrictions?|bank holiday)\b/i],
  ["food_shortage", /\b(food|grain|wheat|rice|corn).*(shortage|rationing)\b/i],
  ["medicine_shortage", /\b(medicine|drug|medication).*(shortage|unavailable)\b/i],
  ["emergency_civil_order", /\b(curfew|state of emergency|national guard|emergency deployment)\b/i]
];

const hard_triggers = [];
for (const [type, pattern] of TRIGGERS) {
  const matches = dedupeArticles(allScoredArticles.filter(a => pattern.test(a.title)));
  const uniqueSources = new Set(matches.map(a => a.domain || a.source));
  const trusted = matches.some(a => a.trusted);
  const verified = uniqueSources.size >= 3 || (uniqueSources.size >= 2 && trusted);
  if (!verified) continue;
  const top = [...matches].sort((a, b) => b.score - a.score)[0];
  const titleText = matches.map(a => a.title).join(" ").toLowerCase();
  let scope = "regional";
  if (/global|worldwide|multiple countries|international/i.test(titleText)) scope = "global";
  else if (/nationwide|nationally|across the country|countrywide/i.test(titleText)) scope = "national";
  else if (matches.filter(a => a.americas).length && matches.filter(a => !a.americas).length) scope = "multinational";

  hard_triggers.push({
    type,
    verified: true,
    scope,
    status: "active",
    summary: `${matches.length} fresh reports from ${uniqueSources.size} independent outlets met the dashboard's verification rule for ${type.replaceAll("_", " ")}.`,
    source_url: top.url
  });
}

const verifiedHardTriggerCount = hard_triggers.length;
const severeHardTriggerCount = hard_triggers.filter(t => ["national", "multinational", "global"].includes(t.scope)).length;

const globalThreat = weightedMean(domainResults, "threat");
const observedImpact = weightedMean(domainResults, "impact");
const americasExposure = weightedMean(domainResults, "americas_exposure");
const conflictEscalation = domainResults.find(d => d.key === "military")?.threat ?? 0;

function d(key) { return domainResults.find(x => x.key === key); }
let coupling = 25;
if ((d("energy")?.threat ?? 0) >= 65 && (d("supply_chain")?.threat ?? 0) >= 60) coupling += 15;
if ((d("energy")?.threat ?? 0) >= 65 && (d("financial")?.threat ?? 0) >= 55) coupling += 10;
if ((d("trade")?.threat ?? 0) >= 65 && (d("supply_chain")?.threat ?? 0) >= 60) coupling += 10;
if ((d("military")?.threat ?? 0) >= 70 && Math.max(d("energy")?.threat ?? 0, d("supply_chain")?.threat ?? 0) >= 60) coupling += 10;
if ((d("critical_infrastructure")?.threat ?? 0) >= 70 && Math.max(d("financial")?.threat ?? 0, d("supply_chain")?.threat ?? 0) >= 55) coupling += 10;
if ((d("civil_unrest")?.threat ?? 0) >= 65 && (d("supply_chain")?.threat ?? 0) >= 55) coupling += 10;
coupling = clamp(coupling, 20, 90);

const rising = domainResults.filter(x => x.trend === "rising").length;
const easing = domainResults.filter(x => x.trend === "easing").length;
const recentHistory = (current.history || []).slice(-3);
const historySlope = recentHistory.length >= 2
  ? recentHistory[recentHistory.length - 1].preparedness - recentHistory[0].preparedness
  : 0;
const momentum = round(clamp(45 + rising * 4 - easing * 3 + historySlope * 2, 20, 85));

const rawPreparedness = round(clamp(
  0.40 * globalThreat +
  0.25 * observedImpact +
  0.10 * coupling +
  0.10 * momentum +
  0.15 * americasExposure
));

const previousPublished = Number(current.preparedness_urgency ?? rawPreparedness);
let dailyLimit = 3;
if (verifiedHardTriggerCount > 0) dailyLimit = 6;
if (severeHardTriggerCount > 0) dailyLimit = 100;
const publishedPreparedness = severeHardTriggerCount > 0
  ? rawPreparedness
  : round(clamp(rawPreparedness, previousPublished - dailyLimit, previousPublished + dailyLimit));

const highImpactDomains = domainResults.filter(x => x.impact >= 70).length;
const sustained90 = [...(current.history || []), { date: today, preparedness: publishedPreparedness }]
  .slice(-3)
  .filter(x => x.preparedness >= 90).length >= 2;

function preparednessStage(score) {
  if (score >= 97 && observedImpact >= 85 && highImpactDomains >= 3 && severeHardTriggerCount >= 2) return "ACTIVE DISRUPTION";
  if (score >= 90 && observedImpact >= 75 && severeHardTriggerCount >= 1 && (sustained90 || hard_triggers.some(t => t.status === "active"))) return "IMMINENT DISRUPTION";
  if (score >= 80) return "HIGH ALERT";
  if (score >= 65) return "ACCELERATE";
  if (score >= 50) return "PREPARE";
  if (score >= 35) return "WATCH";
  return "NORMAL";
}

const stage = preparednessStage(publishedPreparedness);
const americasStage = stageForRegional(americasExposure);

// Confidence reflects feed coverage and source diversity, not severity.
const uniqueAllSources = new Set(allScoredArticles.map(a => a.domain || a.source)).size;
const trustedAllSources = new Set(allScoredArticles.filter(a => a.trusted).map(a => a.domain || a.source)).size;
const domainsWithEvidence = domainResults.filter((x, i) => !fetchFailures.includes(current.domains[i]?.key)).length;
const confidenceScore = round(clamp(
  38 + domainsWithEvidence * 2 + Math.min(24, uniqueAllSources * 0.8) + Math.min(14, trustedAllSources * 1.8) - fetchFailures.length * 6,
  30, 92
));
const confidenceLevel = confidenceScore >= 80 ? "HIGH" : confidenceScore >= 55 ? "MODERATE" : "LOW";
const confidenceRationale = `${domainsWithEvidence}/${domainResults.length} domains returned fresh news coverage, spanning ${uniqueAllSources} unique outlets including ${trustedAllSources} high-authority sources; ${fetchFailures.length} domain feeds failed.`;

const rankedDomains = [...domainResults].sort((a, b) =>
  (0.45 * b.threat + 0.25 * b.impact + 0.30 * b.americas_exposure) -
  (0.45 * a.threat + 0.25 * a.impact + 0.30 * a.americas_exposure)
);
const primary = rankedDomains[0];

const signals = dedupeArticles([...allScoredArticles]
  .sort((a, b) => (b.score + (b.trusted ? 0.7 : 0) + (b.americas ? 0.3 : 0)) - (a.score + (a.trusted ? 0.7 : 0) + (a.americas ? 0.3 : 0))))
  .filter((a, idx, arr) => arr.findIndex(x => x.url === a.url) === idx)
  .slice(0, 8)
  .map(a => ({
    title: a.title.slice(0, 190),
    summary: `Rule-based monitoring classified this as ${a.impactHits?.length ? "an observed-disruption" : "a forward-risk"} signal in ${domainResults.find(x => x.key === a.domainKey)?.name || a.domainKey}. It is one input among multiple sources, not a standalone alarm.`,
    url: a.url,
    source: a.source || sourceName(a.domain),
    published_at: a.published_at,
    category: a.category || DOMAIN_CONFIG[a.domainKey]?.category || "STABILIZER",
    impact: a.impactHits?.length ? "up" : "neutral"
  }));

const areasToWatch = rankedDomains.slice(0, 6).map(x => ({
  name: x.name,
  severity: x.threat >= 80 ? "critical" : x.threat >= 65 ? "high" : "medium",
  why: `Threat ${x.threat}, observed impact ${x.impact}, Americas exposure ${x.americas_exposure}. Watch for multi-source evidence that raises observed impact or satisfies a hard-trigger rule.`
}));

const primaryStabilizers = [];
if (!verifiedHardTriggerCount) primaryStabilizers.push("No event met the dashboard's multi-source hard-trigger verification rule in the current monitored feed.");
if (observedImpact < globalThreat) primaryStabilizers.push("Observed civilian disruption remains below forward-looking threat pressure, indicating that several risks have not fully transmitted into day-to-day systems.");
const lowImpactDomains = domainResults.filter(x => x.impact < 50).length;
if (lowImpactDomains >= 6) primaryStabilizers.push(`${lowImpactDomains} of ${domainResults.length} domains remain below 50 on observed civilian impact.`);
if (americasExposure < 75) primaryStabilizers.push("Aggregate Americas exposure remains below the dashboard's severe regional threshold.");
if (fetchFailures.length === 0) primaryStabilizers.push("All monitored domain feeds returned usable fresh data on this run.");
while (primaryStabilizers.length < 3) primaryStabilizers.push("The dashboard requires corroboration across independent sources before promoting single headlines into hard-trigger status.");

const americasComponents = [...domainResults]
  .sort((a, b) => b.americas_exposure - a.americas_exposure)
  .slice(0, 6)
  .map(x => ({ name: x.name, score: x.americas_exposure, trend: x.trend }));

const preparednessWindow = severeHardTriggerCount >= 1 ? "Days" : verifiedHardTriggerCount >= 1 ? "Days to weeks" : observedImpact >= 65 ? "Days to weeks" : globalThreat >= 70 ? "Weeks" : "Weeks to months";

const summary = `Preparedness urgency is ${publishedPreparedness} (${stage}). Fresh rule-based monitoring across ${uniqueAllSources} outlets places the highest combined pressure in ${rankedDomains.slice(0, 3).map(x => x.name).join(", ")}; ${verifiedHardTriggerCount ? `${verifiedHardTriggerCount} hard trigger(s) met multi-source verification.` : "no hard trigger met multi-source verification."}`;
const americasSummary = `Americas exposure is ${americasExposure} (${americasStage}). The strongest regional transmission channels are ${americasComponents.slice(0, 3).map(x => x.name).join(", ")}; civil unrest is scored only when reporting shows violence, emergency measures, or material disruption to transport, commerce, safety, or essential services.`;
const primaryDriver = `${primary.name} is the current leading driver with threat ${primary.threat}, observed impact ${primary.impact}, and Americas exposure ${primary.americas_exposure}.`;

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
    "Complete sensible, previously planned preparedness purchases while normal supply channels are functioning.",
    "Maintain several weeks of food, household consumables, water capacity, and essential medical supplies.",
    "Keep vehicles reasonably fueled and verify generator, battery, solar, or other backup-power capability.",
    "Maintain diversified payment options and a reasonable amount of emergency cash.",
    "Confirm family communications, transportation, and meeting plans.",
    "Avoid panic buying; focus on resilience gaps that would be difficult to correct after disruption begins."
  ],
  "HIGH ALERT": [
    "Finish previously planned resilience purchases without hoarding.",
    "Verify essential medications, water, fuel, backup power, communications, and transportation plans.",
    "Maintain flexible payment options and emergency cash.",
    "Monitor authoritative local guidance for any verified disruption affecting your area."
  ],
  "IMMINENT DISRUPTION": [
    "Complete essential preparedness actions immediately without panic buying.",
    "Prioritize medications, water, fuel, backup power, communications, and transportation continuity.",
    "Follow official emergency guidance for any affected system or region."
  ],
  "ACTIVE DISRUPTION": [
    "Follow official emergency instructions and prioritize immediate safety.",
    "Conserve constrained fuel, power, water, and essential resources.",
    "Use established backup communications, power, and transportation plans as needed."
  ]
};

const history = [...(current.history || [])].filter(h => h.date !== today);
history.push({
  date: today,
  preparedness: publishedPreparedness,
  raw_preparedness: rawPreparedness,
  threat: globalThreat,
  impact: observedImpact,
  americas: americasExposure,
  conflict: conflictEscalation,
  momentum
});
history.sort((a, b) => a.date.localeCompare(b.date));
while (history.length > 370) history.shift();

const next = {
  ...current,
  schema_version: 4,
  as_of: today,
  updated_at: nowIso,
  updater_version: SCRIPT_VERSION,
  data_engine: "GDELT DOC 2.0 + Google News RSS fallback + USGS; deterministic rule-based scoring",
  preparedness_urgency: publishedPreparedness,
  raw_preparedness_urgency: rawPreparedness,
  preparedness_stage: stage,
  global_threat_pressure: globalThreat,
  leading_threat_pressure: globalThreat,
  observed_civilian_disruption: observedImpact,
  americas_exposure: americasExposure,
  americas_stage: americasStage,
  americas_summary: americasSummary,
  americas_components: americasComponents,
  conflict_escalation: conflictEscalation,
  coupling_score: coupling,
  momentum_score: momentum,
  confidence_score: confidenceScore,
  confidence_level: confidenceLevel,
  confidence_rationale: confidenceRationale,
  preparedness_window: preparednessWindow,
  summary,
  primary_driver: primaryDriver,
  primary_stabilizers: primaryStabilizers.slice(0, 5),
  domains: domainResults,
  hard_triggers,
  verified_hard_trigger_count: verifiedHardTriggerCount,
  severe_hard_trigger_count: severeHardTriggerCount,
  score_calibration: {
    raw_score: rawPreparedness,
    published_score: publishedPreparedness,
    rate_limit_applied: publishedPreparedness !== rawPreparedness,
    daily_rate_limit: severeHardTriggerCount > 0 ? null : dailyLimit,
    sustained_90_for_48h: sustained90,
    high_impact_domain_count: highImpactDomains
  },
  score_components: {
    global_threat_pressure: globalThreat,
    observed_civilian_disruption: observedImpact,
    coupling,
    momentum,
    americas_exposure: americasExposure
  },
  drivers: rankedDomains.slice(0, 6).map((x, i) => ({
    name: x.name,
    severity: x.threat >= 80 ? "critical" : x.threat >= 65 ? "high" : "medium",
    note: i === 0 ? "Primary driver" : ""
  })),
  areas_to_watch: areasToWatch,
  signals,
  preparedness_actions: actionSets[stage] || actionSets.WATCH,
  history,
  methodology: {
    ...(current.methodology || {}),
    note: "All-hazards early-warning assessment. The score is a preparedness-urgency index, not the probability that a disaster, collapse, or war will occur.",
    formula: "Preparedness Urgency = 40% Global Threat Pressure + 25% Observed Civilian Disruption + 10% Cross-System Coupling + 10% Momentum/Persistence + 15% Americas Exposure. Domain scores are calculated deterministically from fresh multi-source news signals and smoothed against the prior day.",
    data_engine: "Daily collection uses GDELT DOC 2.0 article metadata with Google News RSS fallback, plus USGS earthquake data. No paid AI API is required for routine updates.",
    rate_limits: "Absent a verified hard trigger, published Preparedness Urgency moves by at most ±3 points per day. A verified hard trigger allows ±6; a verified national/multinational/global trigger can bypass the limit.",
    stage_guardrails: "HIGH ALERT begins at 80. IMMINENT DISRUPTION requires at least 90, observed disruption at least 75, and a verified severe hard trigger. ACTIVE DISRUPTION requires at least 97, observed disruption at least 85, at least three high-impact domains, and two verified severe hard triggers.",
    civil_unrest: "Civil Unrest / Public Order is scored from observable violence, duration, geographic spread, emergency measures, infrastructure damage, and disruption to transport, commerce, public safety, or essential services. Peaceful protest and political ideology do not raise the score by themselves.",
    confidence: "Evidence confidence measures feed coverage and independent-source diversity; it does not increase preparedness urgency.",
    domains: "Military/geopolitical, energy, trade, supply chain/transportation, technology chokepoints, critical infrastructure/cyber, financial-system stress, food/agriculture, domestic institutional stress, civil unrest/public order, public health/biological, and natural/environmental."
  }
};

await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(`Updated ${today}: preparedness ${previousPublished} -> ${publishedPreparedness} (raw ${rawPreparedness}); ${uniqueAllSources} sources; ${verifiedHardTriggerCount} hard trigger(s); failures: ${fetchFailures.length}.`);
