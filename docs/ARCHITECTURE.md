# Careerly — Architecture

*Discover. Connect. Grow.*

Careerly is a multi-tenant SaaS app. It turns a person's career objective, and optionally a CV or a
spreadsheet, into a sourced, continuously refreshed research database, a networking CRM and an
application pipeline.

---

## 1. Product architecture

```
Browser (Next.js App Router, React Server Components + client islands)
   │  Server Actions / Route Handlers (typed, zod-validated, session-authenticated)
   ▼
Domain services (src/server/*)  ── authorization guard on every call (workspace membership)
   │        │            │
   │        │            └── Storage adapter (local disk now, S3-compatible interface)
   │        └── PostgreSQL via Prisma (relational core + typed custom-field values)
   ▼
Job queue (pg-boss on the same Postgres: persistent, retries, cron schedules)
   ▼
Worker process (src/worker) ── Research orchestrator
                                 ├─ SearchProvider   (Tavily | Brave)
                                 ├─ ExtractProvider  (Firecrawl | built-in robots-aware fetcher)
                                 └─ LlmProvider      (Anthropic Claude, structured outputs)
```

* **Web and worker are separate processes**, so research keeps running after the browser closes
  and can scale on its own.
* **Providers sit behind interfaces** (`src/server/providers/*`). Each one reads its key from
  environment variables, on the server only. If a provider is missing, the matching feature shows
  as "not configured" and the manual workflow stays available. Mock results are never shown as
  live research.
* **Credits** are the internal unit for both cost control and future billing:
  1 search query = 1 credit, 1 page extraction = 1 credit, 1 LLM call = 2 credits.

## 2. Database schema (summary — see `prisma/schema.prisma`)

| Area | Tables |
|---|---|
| Identity | `User`, `Session`, `AuditLog`, `UsageRecord` |
| Tenancy | `Workspace`, `WorkspaceMember` (role OWNER/EDITOR/VIEWER — ready for teams and universities) |
| Profile | `UserProfile`, `ProfileEducation`, `ProfileExperience` (only user-confirmed data is used) |
| Files | `UploadedFile`, `Document` |
| Flexible data | `Dataset`, `FieldDefinition` (typed metadata), `DatasetRow`, `FieldValue` (typed columns: text / number / date / bool / text[]), `FieldValueHistory`, `SavedView` |
| Core entities | `Company`, `Opportunity`, `Contact`, `NetworkingInteraction`, `MessageDraft`, `Application`, `PipelineStage`, `Interview`, `CompensationRecord` |
| Research | `ResearchPlan`, `ResearchPlanItem`, `ResearchJob`, `ResearchTask`, `ResearchLog`, `ResearchSource`, `ResearchEvidence`, `SearchCache`, `PageCache` |
| Intelligence | `ScoringModel`, `ScoringCriterion`, `MonitoringRule`, `Notification` |

Custom values are **not** stored in a JSON blob. Each `FieldValue` row is keyed by
`(rowId, fieldId)`, has typed columns that can be indexed, and links to evidence, history and the
research job that produced it.

## 3. Core user journeys

1. **Sign up, then create a workspace** with an objective in natural language.
2. **Mode A, import:** upload XLSX/XLS/CSV, choose a sheet, review headers and inferred types, map
   columns (name column, website, custom columns kept), check validation errors and duplicates, then
   import.
3. **Mode B, from scratch:** describe the objective. Careerly proposes discovery queries and fields,
   the user approves, and discovered employers land in a dataset, each with a "why it matches"
   explanation and a source.
4. **Research:** add research fields with plain-language instructions, then choose the scope (cell,
   row, selected rows, column or whole dataset). Careerly shows the plan and its credit estimate, the
   user approves a budget, and the job runs in the background. Every cell shows its confidence and
   evidence.
5. **Networking:** discover public professionals for an employer, shortlist them in the CRM,
   generate a message (two tones), edit it, copy it, log the interaction and set a follow-up.
6. **Applications:** Kanban pipeline with custom stages, plus interviews.
7. **Monitoring:** weekly rule, then change detection, then a notification. Values the user has
   confirmed by hand are never overwritten.
8. **Export:** XLSX with formula-injection protection, plus companion sheets for evidence and sources.

## 4. Research orchestration

```
Plan (DRAFT) ──user approves budget──▶ Job (QUEUED) ──▶ Tasks: one per (row, field) or discovery query
Task: build context → queries (plan templates, entity substituted, multilingual)
      → search (cached 7d by query hash) → rank sources by tier
      → fetch top pages (cached 24h; robots.txt respected) → LLM structured extraction
      → VALIDATE (anti-fabrication):
           • every evidence excerpt must appear verbatim in the fetched source text
           • VERIFIED needs a tier-1/2 source (official domain); otherwise downgrade to REPORTED
           • ESTIMATED stays ESTIMATED; no valid evidence → UNKNOWN (no value written)
           • two sources that disagree → CONFLICTING
      → persist evidence + source; FieldValue is updated with history (previous value kept)
        unless the user has confirmed the value by hand (then it is stored as a suggestion + notification)
      → usage records; job progress counters
```

* Tasks are **idempotent**: there is one row per `(jobId, rowId, fieldId)`, and a task that has
  already succeeded is skipped on retry.
* **Retries** use pg-boss exponential backoff. Calls to each provider are **rate limited**.
  **Cancellation** is a job flag that tasks check before each step.
* **Budget guard:** credits are reserved at launch and checked against the user's monthly allowance.
  A task stops once the job's approved budget is used up, and the job finishes as `PARTIAL`.
* **Prompt-injection defence:** page content is passed as quoted `<source>` data, the system prompt
  forbids following instructions found in it, the output is schema-constrained, and excerpt
  verification rejects anything the page does not actually say.

Source tiers: 1 official company domain · 2 official programme/ATS pages (Greenhouse, Lever,
Workday, SmartRecruiters…) · 3 reputable publications · 4 salary-reporting platforms · 5 other.

## 5. Networking discovery

* Contacts come only from **public search-engine results** and **public company pages** (team or
  leadership pages), fetched with robots.txt respected. Careerly never logs in, scrapes behind
  authentication, or bypasses CAPTCHAs or paywalls. LinkedIn pages are never fetched; only the
  public search result (title and snippet) is used, linking to the URL the search engine returned.
* Extracted candidates are validated: the name must appear in that result's title or snippet, and
  the profile URL must be exactly the result URL. Anything else is rejected.
* Stored fields are kept to a minimum (name, title, company, location, URL, source, date, reason).
  Sensitive attributes are never inferred. Private notes are kept apart from public data.
* Ranking is a transparent rule score (role and team match, office, seniority fit, alumni connection
  verified by the user, existing relationship, recruiter role), shown with its reasons. Response
  probabilities are never produced.
* Messages are generated from **confirmed** profile data and the contact's verified fields only.
  Nothing is ever sent automatically.

## 6. Multi-tenant security

* Sessions are random 256-bit tokens. Only their SHA-256 hash is stored. Cookies are HttpOnly,
  SameSite=Lax and Secure in production, last 30 days and are rotated at login. Passwords are
  hashed with bcrypt (cost 12).
* **Every** server entry point calls `requireUser()`, then `requireWorkspace(id, role)`. Child
  records (rows, fields, contacts…) are always loaded with a `workspaceId` predicate, so an ID from
  another tenant resolves to "not found". Background jobs carry `workspaceId` and `userId` and check
  them again in the worker.
* Server Actions check the request origin (built into Next.js), and Route Handlers check `Origin` on
  mutations. Endpoints for login, signup, upload and research launch are rate limited.
* Uploads are capped by size, checked by extension and magic bytes, stored under random keys outside
  the web root, and parsed with formulas and HTML ignored.
* Exports escape values that start with `= + - @ \t \r`.
* Audit log records sign-in, export, deletion, research launch and consent changes.
* GDPR: AI-processing consent (the CV is never sent to an LLM without it), full JSON data export,
  account deletion that cascades through all data, monitoring and notification controls, and a
  public/private split (private CRM notes and private salary insights are never used in research
  queries).

## 7. Milestones

| Phase | Scope | Status in this build |
|---|---|---|
| 1 Core | auth, workspaces, profile + CV, import, dynamic tables, export | implemented |
| 2 Research | NL field instructions, plans, budget, queue, providers, evidence | implemented (live providers untested — no credentials) |
| 3 Intelligence | employer + opportunity discovery, scoring, compensation | implemented (discovery needs providers) |
| 4 Networking | contact discovery, ranking, messages, CRM, follow-ups | implemented |
| 5 Continuous | monitoring rules, change detection, notifications, next best actions | implemented |
| 6 Advanced | applications, interviews, assistant, documents, usage | implemented (assistant needs LLM) |
| 7 Production | isolation tests, e2e, docs | tests + docs; deployment config documented |
