# Slack Agentic Input Demo (Runs + Autopilot)

This repo is a Slack-style realtime prototype upgraded to demonstrate:
- Agent Mode in composer (`@Agent`, `/agent`, or agent icon)
- Run Cards as top-level units of work with thread-based execution
- Approval gates and follow-up continuations
- Autopilot preview/create/manage/run-now with scheduler-based executions
- Server-side LLM planning with deterministic fallback when no API key exists

In-memory only, no DB/auth.

## Architecture

- `server/`: Express + WebSocket + Zod + OpenAI SDK (optional)
- `web/`: Next.js App Router + Zustand + Slack-like UI
- WS events: `init`, `new_message`, `typing`, `run_upsert`, `autopilot_upsert`, `runs_index`

## Environment Variables

### Server (`server/.env` optional)

- `OPENAI_API_KEY` (optional): enables real LLM responses
- `OPENAI_MODEL` (optional): defaults to `gpt-4.1-mini`
- `DEMO_TIME_ACCEL` (optional): set `1` to accelerate autopilot cadence for demos

If `OPENAI_API_KEY` is missing, server uses deterministic mock planning/parsing.
You can copy `server/.env.example` to `server/.env` and set your key there.

### GPT Prompt Template for Run Simulation

- Template lives in `server/src/agent/llm.ts` as `RUN_SIMULATION_PROMPT_TEMPLATE`.
- This template controls how GPT generates:
  - progressive run steps (used for moving run updates)
  - final simulated output summary
  - approval gating hints for risky actions

### Web (`web/.env.local` optional)

- `NEXT_PUBLIC_WS_URL` (optional): websocket URL, e.g. `ws://localhost:4000`
- `NEXT_PUBLIC_API_URL` (optional): API URL, e.g. `http://localhost:4000`

If not set, web derives host from browser location and defaults to port `4000`.

## Run Locally

### Terminal 1 (server)

```bash
cd server
npm install
npm run dev
```

### Terminal 2 (web)

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5001`.

## Next.js Dev Stability (Important)

If you run this repo from a synced folder (like Dropbox/iCloud), Next.js dev can intermittently fail with missing chunk errors such as:

- `Cannot find module './852.js'`
- `Cannot find module './682.js'`
- `ENOENT ... .next/cache/webpack ... rename ...`

### What is already configured

- `web/package.json` uses:
  - `rm -rf .next && NEXT_DISABLE_WEBPACK_CACHE=1 next dev --port 5001`
- This starts from a clean build cache every run and avoids stale chunk/module artifacts.

### Recommended setup (best fix)

- Keep active development in a non-synced local path (for example `~/dev/slackdemo`).
- Use Dropbox only for backup/sync, not live hot-reload writes.

### Quick recovery when it happens

```bash
cd web
pkill -f "next dev --port 5001" || true
rm -rf .next
npm run dev
```

Then hard refresh the browser (`Cmd+Shift+R`).

## Demo Script (2 minutes)

Use these exact prompts.

1) **New run from channel**
- In `#general`, type:  
  `@Agent Summarize what happened in this channel and give me a brief update.`
- Send.
- Show: run card appears in channel, thread fills with step updates, then completion.

2) **Continue run from its thread**
- Open run thread from card.
- Type in thread composer:  
  `/agent Follow up with a checklist of action items and owners.`
- Send.
- Show: no new root run card; same run thread continues.

3) **Approval gate**
- In channel or run thread, turn on **Require approval for actions** in Agent Mode.
- Type:  
  `/agent Draft and send a weekly summary to leadership.`
- Send.
- Show: run pauses at approval gate in thread with Approve/Deny.
- Click **Approve** and show run resumes.

4) **Autopilot preview + create**
- In Agent Mode, type:  
  `Every weekday at 9am send me a brief in #general`
- Send.
- Show Autopilot Preview sheet, edit if needed, click **Create Autopilot**.

5) **Autopilot management + run now**
- Open **Agent** view (App Home) in sidebar.
- Show autopilot row, toggle pause/resume, click **Run now**.
- Show: new run card appears in destination with thread execution.

6) **Runs index**
- Open **Runs** view in sidebar.
- Filter/search and open one run from the list.

## Notes

- Run details/progress are intentionally kept in thread; root card stays skimmable.
- Scheduler checks autopilots periodically; with `DEMO_TIME_ACCEL=1`, due runs trigger quickly.
- Styling uses existing tokens in `web/app/styles/tokens.css`.

## Run Delivery UI Contract (Do Not Change)

For summarize/simple agent requests, this is the required interaction model:

- While running: show a Run Card with an active progress bar.
- On completion: hide the progress bar and render the deliverable in the same Run Card container.
- Do not render a duplicate top-level deliverable row for runs whose card already exists.
- Thread should contain follow-ups/step logs only (no deliverable output blocks).

If this behavior regresses, treat it as a product bug and restore this contract.

## Non-Negotiable UX Primitives

- Deliverables are the output surface and must render markdown cleanly.
- Avoid duplicate/stacked headings in deliverables; keep one clear title pattern.
- For to-do style requests:
  - Run title should be `To-do list`.
  - Deliverable title should be `To-Do's from <channel-or-dm>`.
- Deliverables must include a canvas artifact link (`Open Canvas`) so output can be opened in canvas view.
