import fs from "node:fs/promises";

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error("Missing OPENAI_API_KEY");

const file = new URL("../dashboard.json", import.meta.url);
const current = JSON.parse(await fs.readFile(file, "utf8"));

const factorRubric = current.factors.map(f => ({
  key: f.key, name: f.name, weight: f.weight, previous_score: f.score
}));

const prompt = `
You are updating a geopolitical systemic-escalation early-warning dashboard for ${new Date().toISOString().slice(0,10)}.

Research CURRENT public reporting using web search. Prioritize Reuters, AP, official NATO/government sources, and similarly high-quality outlets. Focus on changes in the past 24-72 hours, while preserving strategic context.

Score exactly these ten factors from 0 to 10:
${JSON.stringify(factorRubric, null, 2)}

Scoring principles:
0-2 normal/contained; 3-5 elevated tension; 6-7 serious systemic stress; 8 high; 9 very high; 10 extreme.
Do not change a factor merely because there are more headlines. A score change should require a material change in capability, commitment, direct combat, mobilization, alliance structure, economic disruption, or diplomatic conditions.
Diplomatic breakdown is scored HIGHER when diplomacy is failing/abandoned and LOWER when meaningful channels are active.

Return ONLY valid JSON with this exact shape:
{
  "risk_level": "LOW|ELEVATED|HIGH|SEVERE",
  "tactical_tempo": "ACCELERATING|STABLE|DECELERATING",
  "strategic_tempo": "ACCELERATING|STABLE|DECELERATING",
  "primary_driver": "short text",
  "primary_stabilizer": "short text",
  "factors": [{"key":"...","score":0,"trend":"rising|stable|easing"}],
  "headlines": [{"title":"...","summary":"1-2 sentence impact explanation","url":"https://...","impact":"up|down|neutral"}],
  "areas_to_watch": [{"name":"...","severity":"critical|high|medium","why":"..."}]
}

Requirements:
- exactly 10 factor objects, one for every supplied key
- 3 to 6 headlines with direct source URLs
- 4 to 6 areas to watch
- no markdown
- do not output an overall index; it is calculated mechanically
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

if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
const raw = await response.json();
let text = raw.output_text || "";
if (!text) {
  for (const item of raw.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) if (c.type === "output_text") text += c.text;
    }
  }
}
text = text.trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim();
const update = JSON.parse(text);

const byKey = new Map(current.factors.map(f => [f.key, f]));
if (!Array.isArray(update.factors) || update.factors.length !== 10) throw new Error("Invalid factor count");
for (const f of update.factors) {
  if (!byKey.has(f.key)) throw new Error(`Unknown factor ${f.key}`);
  if (!Number.isFinite(f.score) || f.score < 0 || f.score > 10) throw new Error(`Invalid score ${f.key}`);
}

const mergedFactors = current.factors.map(old => {
  const fresh = update.factors.find(f => f.key === old.key);
  return {...old, score: Math.round(fresh.score), trend: fresh.trend};
});

const weighted = mergedFactors.reduce((s,f)=>s + f.score * f.weight, 0);
const weightTotal = mergedFactors.reduce((s,f)=>s + f.weight, 0);
const index = Math.round((weighted / weightTotal) * 10);

const today = new Date().toISOString().slice(0,10);
const history = [...(current.history || [])].filter(h => h.date !== today);
history.push({date: today, score: index});
history.sort((a,b)=>a.date.localeCompare(b.date));

const previous = history.length > 1 ? history[history.length - 2].score : index;
const sevenDaysAgo = new Date(today + "T00:00:00Z");
sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
const cutoff = sevenDaysAgo.toISOString().slice(0,10);
const baseline7 = history.filter(h => h.date >= cutoff)[0]?.score ?? previous;

const next = {
  ...current,
  as_of: today,
  updated_at: new Date().toISOString(),
  index,
  previous_index: previous,
  change_24h: index - previous,
  change_7d: index - baseline7,
  risk_level: update.risk_level,
  tactical_tempo: update.tactical_tempo,
  strategic_tempo: update.strategic_tempo,
  primary_driver: update.primary_driver,
  primary_stabilizer: update.primary_stabilizer,
  factors: mergedFactors,
  headlines: update.headlines,
  areas_to_watch: update.areas_to_watch,
  history
};

await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(`Updated ${today}: ${previous} -> ${index}`);
