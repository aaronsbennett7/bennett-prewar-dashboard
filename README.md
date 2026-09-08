# Bennett Global Escalation Dashboard

This project is designed for Netlify + GitHub.

## How the automation works

Every day at **7:15 AM America/Indiana/Indianapolis**, GitHub Actions:

1. Runs `scripts/update-dashboard.mjs`.
2. Calls the OpenAI Responses API with web search.
3. Scores the same 10 geopolitical escalation factors.
4. Calculates the overall index mechanically from fixed weights.
5. Updates `dashboard.json` and appends the daily score history.
6. Commits the new `dashboard.json`.
7. Netlify automatically deploys the commit.

The webpage itself is static and reads `dashboard.json` on load.

## One-time setup

### 1. Create a GitHub repository
Upload all files in this folder to a repository.

### 2. Add the API key
In GitHub:
**Repository → Settings → Secrets and variables → Actions → New repository secret**

Name:
`OPENAI_API_KEY`

Value:
your OpenAI API key.

### 3. Connect Netlify to the repository
In the existing `bennettprewardashboard` Netlify project, connect the GitHub repository as the production source.

There is no build command required. Publish directory is the repository root.

### 4. Test it
In GitHub:
**Actions → Daily dashboard update → Run workflow**

Confirm that:
- the workflow succeeds,
- `dashboard.json` receives a new commit,
- Netlify deploys the commit,
- the public dashboard shows the latest date.

## Scoring model

The overall 0–100 index is the weighted average of ten 0–10 factor scores:

- Multiple simultaneous wars: 10%
- Direct major-power/state combat: 15%
- Alliance hardening: 10%
- Rearmament / arms production: 10%
- Military mobilization / readiness: 15%
- Territorial revisionism: 10%
- Economic / energy warfare: 8%
- Hostile rhetoric / threats: 5%
- Conflict coupling: 12%
- Diplomatic breakdown: 5%

The score is an analytical early-warning index, **not a probability of world war**.

## Cost

The daily job uses the OpenAI API and web search. It therefore requires API billing; it is not included in a normal ChatGPT subscription.
