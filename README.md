# Careerly

*Discover. Connect. Grow.*

Careerly is a multi-user AI career intelligence platform. Users describe a career objective, import a
spreadsheet or start from scratch, and Careerly does the rest: it researches employers on the live
web with cited evidence, finds public professionals worth contacting, drafts grounded networking
messages, tracks applications, and keeps everything current through scheduled monitoring.

Architecture, schema, research orchestration, networking design, security approach and milestones:
see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind + shadcn-style components (Radix) ·
PostgreSQL + Prisma 6 · pg-boss (persistent jobs and cron on Postgres) · Anthropic Claude
(structured outputs) · Tavily or Brave Search · Firecrawl, or the built-in robots.txt-aware fetcher ·
ExcelJS + SheetJS · Recharts · Vitest + Playwright.

## Run locally

```bash
npm install
cp .env.example .env            # set DATABASE_URL and, optionally, provider keys
npx prisma migrate deploy
npm run build && npm run start  # web on :3000
npm run worker                  # background research + monitoring (separate process)
```

For development, use `npm run dev` together with `npm run worker`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (also used by the job queue) |
| `STORAGE_DIR` | yes | Private file storage directory (the local adapter; swap for S3 in `src/server/storage.ts`) |
| `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY` | for live research | Web search provider |
| `ANTHROPIC_API_KEY` | for AI extraction, plans, messages, assistant | Claude API |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5` |
| `FIRECRAWL_API_KEY` | no | Page extraction; otherwise the built-in fetcher is used |
| `WORKER_CONCURRENCY` | no | Research jobs processed in parallel per worker (default 2) |

Keys are read only on the server and never reach the browser. **Without keys**, the app shows a
configuration notice, blocks the launch of live research, and offers manual research (value +
source URL + excerpt). It never displays simulated results.

## Tests

```bash
npm run test:db:prepare   # once: migrate the careerpilot_test database
npm test                  # 41 unit + integration tests
npm run test:e2e          # Playwright acceptance run (server + worker must be running)
```

* **Unit tests:** type inference and parsing, formulas, the anti-fabrication gate (verbatim
  excerpts, value-in-excerpt, VERIFIED only from official sources, CONFLICTING), source tiers,
  scoring with hard constraints and missing data, contact scoring, message templates, CV parsing,
  import detection, formula-injection-safe export, SSRF, robots.txt and upload validation.
* **Integration tests (real Postgres):** tenant isolation and roles; the research pipeline end to
  end with deterministic test providers, checking that values are sourced, invented values are
  rejected, manually confirmed values are kept, budgets stop jobs, cancellation works, and usage is
  accounted; monitoring change detection with history and one deduplicated notification.
* **E2E (19 steps, real browser):** sign-up → workspace → import 5 companies with corrections and
  duplicates → custom research field → plan + budget review (live launch correctly blocked) →
  manual sourced value + evidence → inline edit/undo → CV upload and profile confirmation → ranking
  → contact → message draft/edit/copy/save → conversation + follow-up → application → weekly
  monitoring → dashboard → Excel export with Evidence/Sources sheets → mobile layout → a second
  user with tech columns → cross-tenant access returns 404/401.

## Deployment

Three processes share one PostgreSQL database:

1. **Web:** `npm run build && npm run start` (any Node host; Vercel works for the web tier).
2. **Worker:** `npm run worker`, as a long-running process (Railway, Render, Fly.io, ECS…). It must not
   run on serverless functions.
3. **PostgreSQL 14+** (managed: Neon, RDS, Supabase…). Run `npx prisma migrate deploy` on release.

Replace local `STORAGE_DIR` with an S3-compatible bucket for multi-instance deployments. The in-memory
rate limiter should move to Redis or Postgres once more than one web instance runs.
