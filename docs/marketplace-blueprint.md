# HireSmart → AI-Powered Job Marketplace (India) — Migration Blueprint

> **Prompt 1 deliverable — audit + blueprint only, no implementation code.**
> Branch: `arena/01a03290-hiresmart-ai` @ `fb2bed5`. Everything below is traced to actual
> files in this repository as of this commit. Target: an India-focused job marketplace in the
> spirit of Indeed India's IA (search-first, public jobs/companies, candidate + employer sides),
> with a substantially stronger, explainable AI layer. Indeed is used as a functional reference
> only — no branding, logos, or proprietary assets.

---

## 1. Current architecture

| Layer | Reality in repo |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind, TanStack Query, react-router v7, react-hook-form, recharts. Lazy-loaded pages (single big file per side: `PublicPages.jsx`, `AuthPages.jsx`, `CandidatePages.jsx`, `RecruiterPages.jsx`, `SystemPages.jsx`). |
| Backend | Node + Express 4, Mongoose 8, `server/app.js`. Two mounted API generations: **v1** `/api/v1/*` (current, complete) and **v0 legacy** `/api/{auth,user,jobs,candidate,matching}` gated by `ENABLE_LEGACY_API` (default on outside production). |
| Auth | Short-lived JWT access + rotating refresh cookie (`AuthSession`), email verification, password reset, CSRF-protected refresh, per-route rate limits, `v1Auth.js` middleware with org membership role checks. Platform role (`candidate` / `recruiter` / `admin`) is separate from org membership roles (`owner/admin/recruiter/hiring_manager/interviewer/viewer`). |
| Multi-tenancy | `Organization` (the company: name, slug, industry, size, website, settings) + `Membership` (per-user org role + status) + `Invite` (email invitations, 7-day token). Tenant isolation enforced in every v1 controller via `req.auth.organizationId`. |
| Data | MongoDB (Atlas SRV in prod env). 24 models in 19 files (`server/models/`). |
| AI | `services/ai/orchestrator.js` + `provider.js` (OpenAI-compatible HTTP: Groq/OpenAI/OpenRouter), zod schemas with `z.toJSONSchema` injected into prompts, deterministic fallback for every feature, `AIAnalysis` audit (provider, model, tokens, cost, fallbackUsed) per run. 10 features: resume_extraction, resume_rewrite, resume_improvement, jd_generation, jd_parse, jd_improvement, interview_questions, interview_preparation, recruiter_copilot, career_copilot. |
| Matching | `hybridMatchingService.js` — deterministic weighted score (requiredSkills 0.35, preferred 0.10, experience 0.20, education 0.10, semantic 0.20, preferences 0.05) + optional external embeddings gated by user `Consent(purpose:"ai_processing")`. Results persisted to `CandidateMatch` with full component breakdown. |
| Resumes | Versioned upload (PDF/DOCX → `pdf-parse`/`mammoth`), malware-scan hook, text + `ParsedResume` (skills, experience, education, contact), storage local/S3 (`storageService`), processing via `JobRun` queue (`worker.js`) or `PROCESS_JOBS_INLINE`. |
| Jobs pipeline | Job statuses `draft → published → closed`, versioned description, hiring team (Membership refs), application lifecycle with allowed transitions + `statusHistory`, notes (`Note`), compare, ranking, tags, messages (org→candidate per application). |
| Notifications | `Notification` model + `notificationService` (in-app + email via nodemailer; stream-transport "simulated" when no SMTP). |
| Governance | `AuditLog`, `SecurityEvent`, `IdempotencyRecord`, consent records, org retention settings, optimistic concurrency on Organization. |
| Tests | node:test — 87 server tests (66 pass in sandbox; 21 are DB-connection-hook tests that need Mongo), 4 client test files (8 tests). GitHub Actions CI. |

## 2. Current feature inventory (mapped to files)

**Public**
| Feature | Where |
|---|---|
| Marketing landing (`/`) | `client/src/pages/PublicPages.jsx → LandingPage` |
| Public job search (`/jobs`, keyword + location only) | `v1RecruitmentController.publicJobs` (filters: `query` $text, `location` regex, `workplaceMode`, single `skill`, cursor `after`) + `PublicJobsPage` |
| Public job detail (`/jobs/:id`) | `publicJob` + `PublicJobDetailPage` (title/company/location/description only) |
| Public resume check (`/resume-check`) | `ResumeCheckPage` + matching service |

**Candidate** (`/app/candidate/*`)
Dashboard · Onboarding/profile (`CandidateProfile`: education, experience, projects, certifications, city/state/country, languages, socials) · Resume manager (upload/versions/download/retry/analysis/tailor) · Browse jobs + recommendations (latest ready resume scored vs latest 100 published jobs, on-demand) · Saved jobs (`User.savedJobs` + endpoints) · Applications (apply with resume version + job snapshot, withdraw, status history) · Interviews (confirm/reschedule/prepare) · Career copilot (AI).

**Employer** (`/app/o/:orgId/*`)
Dashboard · Jobs (create/edit/publish/close/hiring-team) · Applicants (transition/shortlist/tags/notes/compare/match/ranking) · Candidate search · Interviews (schedule/complete/feedback/AI questions) · Analytics (funnel, sources, AI usage) · Recruiter copilot (AI over pipeline aggregates) · Team (members, email invitations, revoke, remove).

**Platform admin** (`/app/admin/*`): user/org listings, AI usage, audit logs, security events, suspend.

**Auth flows**: register (candidate/recruiter intent), verify email, login, refresh/logout, forgot/reset, accept-invite (new account or existing login).

## 3. KEEP / MODIFY / REMOVE / REPLACE / NEW matrix

### KEEP (technically sound, marketplace-relevant)
- Entire v1 auth stack (sessions, CSRF, rate limits, email verification).
- Organization + Membership + Invite (multi-tenant employer core; invitations).
- Resume versioning, parsing, storage, malware hook, consent gating.
- Hybrid matching engine + `CandidateMatch` persistence (explainable scores).
- AI orchestrator + provider + schemas + deterministic fallback + AIAnalysis audit.
- Application lifecycle (snapshots, statusHistory, transitions, idempotency).
- Interviews workflow (both sides, AI question generation, prep).
- Notifications, audit logs, security events, admin panel.
- Worker queue (`worker.js` + `JobRun`) — required at marketplace scale.
- Public resume check (`/resume-check`) — strong growth feature (Indeed has an analogue).

### MODIFY (restructure/extend in place)
| Item | Change |
|---|---|
| `Job` model | Add `minExpYears`, `maxExpYears` (Number), `educationRequired` (String), `benefits` ([String]), `organizationSlug` denormalized or populate path for public company links. Deprecate free-text `salary`/`experience` in favour of `compensation`/structured years (keep fields for data compat). |
| `publicJobs` controller | Extend filters: `minSalary/maxSalary`, `minExp/maxExp`, `jobType`, `skill` (multi), `industry` (via org), `postedWithin` (createdAt range), `sort` (relevance/date/salary). Keep cursor pagination. |
| Public search UI (`PublicJobsPage`) | Full filter sidebar, job cards with salary/work-mode/posted-date, URL-shareable params (already uses searchParams), sorting, pagination controls. |
| Public job detail UI | Salary range (₹), experience, skills chips, work mode, company card (links to company page), apply CTA, save button, related jobs, meta tags. |
| Landing page | From marketing pitch → search-first marketplace hero (keyword + location + remote toggle, trending searches, top companies). |
| Registration | Employer path → guided onboarding (company profile → first job). Candidate path stays. |
| Recommendations | Add implicit signals (saved jobs, search history, applied jobs) + precomputed nightly/queue runs instead of on-demand scoring of 100 jobs per request. |
| Org setting `requireJobApproval` | **Currently defined but never enforced** (grep: only the model). Implement moderation workflow or remove the setting. Decision: implement (marketplaces need job moderation). |
| Employer pipeline UI | Add Kanban board view over existing transitions (backend already supports it). |
| Messaging | Extend per-application messages → bidirectional conversation inbox (new models, keep old endpoints compatible). |
| `README.md` | Rewrite for marketplace positioning. |
| `.env.example` | Update for new variables (see §11). |

### REMOVE (with dependency graph — delete only in Phase 0)
| Item | Dependency graph | Risk |
|---|---|---|
| **Legacy v0 API** — `routes/{authRoutes,userRoutes,jobRoutes,candidateProfileRoutes,matchingRoutes}.js` → `controllers/{authController,userController,jobController,candidateProfileController,matchingController}.js` → `validators/{authValidator,userValidator,jobValidator,candidateProfileValidator,applicationValidator}.js` → `middleware/authMiddleware.js` (protect/authorize) → `app.js` mounts under `if (config.enableLegacyApi)` → `ENABLE_LEGACY_API` in `config/env.js` + `.env.example` | All v0-only. Shared models (User/Job/Application) are **kept**. Legacy application status enum values ("Applied", "Shortlisted"…) stay for existing data (compat comment already in `constants/enums.js`). | Low — v1 covers every v0 capability; tests reference v0 paths, so those tests move to REMOVE too. |
| **`Company` model** (`server/models/Company.js`) | **Zero references anywhere** (grep across server/ = dead). Organization already is the company. | None. |
| **Unused npm deps** (server): `express-async-handler`, `http-status-codes`, `dotenv-safe` | 0 imports (grep-verified). Custom `asyncHandler` middleware and local status usage instead. | None. |
| Legacy client redirects (`/recruiter/*`, `/my-resume`, `/my-applications`, …) | `App.jsx` → `LegacyWorkspaceRedirect`. Keep until end of Phase 1, then remove. | Cosmetic. |
| Legacy seed/demo scripts | `scripts/{seed-data,demo-accounts,probe-srv-fallback}.js` — dev-only, not shipped. Keep in repo (harmless) or move to `scripts/dev/`. | None. |

"nina"/unnecessary-feature note: no symbol or feature named "nina" exists in the codebase (case-insensitive grep = 0 hits); the REMOVE list above is the full unnecessary-feature inventory.

### REPLACE
- Public IA & landing: "recruiting OS" pitch → marketplace search experience (REPLACE content/IA, keep components/Navbar/Footer).
- Public job listing search: single-input + location → structured + semantic search experience (keep endpoint, extend).

### NEW (does not exist today)
1. **Public company pages** — `GET /api/v1/companies/:slug` + `/companies/:slug/jobs` + `CompanyPage` (from Organization: logo, industry, size, website, open roles, reviews placeholder).
2. **Job alerts** — `JobAlert` model (user, filters snapshot, cadence, lastRunAt, deliveredJobIds) + CRUD endpoints + nightly scan + email delivery + UI (alert builder from search page).
3. **Search history & preferences** — `SearchHistory` model + endpoints; feeds recommendations.
4. **Conversation inbox** — `Conversation` + `Message` models, org↔candidate, both-side UI, notifications.
5. **Natural-language job search** — new AI feature `nl_job_search`: LLM parses "remote React job under 15 LPA in Pune" → structured filter JSON (validated by zod; deterministic fallback = keyword parse).
6. **Semantic job search** — embed published jobs (title+description+skills) via existing AI embeddings provider → `JobEmbedding` (or vector field on Job); hybrid lexical+cosine ranking. Consent NOT required (jobs are employer-published, not candidate PII).
7. **Job moderation** — `pending_review` status path when org `requireJobApproval` or platform flag; duplicate-job heuristic (title+company similarity); moderation queue in admin.
8. **Public saved-job** button on job detail (auth-gated, existing endpoint).
9. **SEO** — per-route `<title>`/meta description/OG tags + JSON-LD `JobPosting` schema on public job pages.
10. **Employer Kanban pipeline** UI (backend transitions exist).
11. **India localization** — city/region data for location autocomplete (static list, no geo API needed for v1), ₹ formatting (currency already INR-default), IST timestamps (org timezone exists).
12. **Related jobs** on detail page (shared requiredSkills query).

## 4. Exact files/modules likely affected

- Server: `models/{Job,Organization}.js` (+ new `JobAlert.js`, `Conversation.js`, `SearchHistory.js`), `controllers/{v1RecruitmentController,v1CandidateController,v1OrganizationController}.js` (+ new `v1CompanyController.js`, `v1AlertController.js`, `v1ConversationController.js`), `services/{hybridMatchingService,ai/orchestrator,ai/schemas,emailService}.js`, `routes/v1Routes.js`, `scripts/create-indexes.js`, `app.js` (v0 removal), `package.json` (3 deps out), removed v0 routes/controllers/validators (see §3).
- Client: `pages/{PublicPages,CandidatePages,RecruiterPages}.jsx`, `lib/api.js`, `App.jsx` (new public routes, admin moderation, removal of legacy redirects at end), new small pages: `CompanyPage`, `AlertsPage`, `InboxPage`, `KanbanBoard` component.
- Docs: `README.md`, `.env.example`, this file.

## 5. Target product architecture

Same monorepo and stack (Express + Mongoose + React + Tailwind + Vite). No framework change is justified — the current stack already supports multi-tenant, versioned, consent-gated AI with audit; the gap is **surface area and data**, not architecture.

```
Public (no auth)                       Candidate app                     Employer app (org tenant)
─────────────────────                  ───────────────                   ───────────────────────────
/  search-first home                   /app/candidate/*                  /app/o/:orgId/*
/jobs  keyword+location+filters        · dashboard                       · dashboard
        (+ NL search box)              · search + saved                  · jobs (draft/publish/moderated)
/jobs/:id  detail + JSON-LD            · applications + tracker          · applicants (list + Kanban)
/companies/:slug  company              · interviews + prep               · candidates + compare
/companies/:slug/jobs                  · alerts                          · conversations
/resume-check (growth)                 · copilot (career AI)             · interviews + scorecards
/auth/*  (candidate | employer)        · inbox                           · analytics
/accept-invite?token=…                 · profile + resume                · team (invitations)
                                                                 · copilot (recruiter AI)
Platform admin /app/admin/*: users, orgs, job moderation, AI usage, audit, security
```

## 6. Target information architecture / navigation

- **Public navbar**: Logo · Jobs · Companies · For employers (CTA) · Sign in · Post a job.
- **Search page**: hero search (what / where / work-mode chip), filter sidebar (salary, experience, type, industry, skills, date), result cards (title, company, location, salary, mode, posted), sort + cursor "load more".
- **Job detail**: sticky apply/save rail, company card, skill chips, salary, experience, benefits; related jobs; "why I recommend this job" for signed-in candidates (match preview).
- **Company page**: header (logo, size, industry, website), open roles list, about.
- **Candidate shell**: Jobs · Saved · Applications · Alerts · Interviews · Inbox · Copilot · Profile.
- **Employer shell**: Overview · Jobs · Applicants (list/Kanban) · Candidates · Conversations · Interviews · Analytics · Team · Copilot.
- **Admin**: Users · Organizations · Job moderation · AI usage · Audit · Security.

## 7. Candidate journey

1. Land → search "React developer, Pune, remote" (or plain English). 2. Browse filtered cards → open job. 3. Save without account (prompt to sign in). 4. Register (candidate) → resume upload → parsed profile. 5. See match preview + gaps on job detail → apply (resume version + screening). 6. Track application (status timeline, messages from employer). 7. Set alert for saved search → weekly email. 8. Get recommendations on dashboard (skills + saved + search signals). 9. Interview scheduled → AI prep. 10. Outcome → improvement suggestions on resume.

## 8. Employer journey

1. Register (employer) → onboarding: company profile (name/logo/industry/size/website) → create org (existing `POST /organizations`). 2. Post job (AI JD assist) → moderation (if enabled) → published. 3. Applicants arrive → match scores + explainable factors → Kanban transitions. 4. Shortlist → message (conversation) → schedule interview (invite sent). 5. Structured feedback + AI questions → decision. 6. Analytics (funnel, sources, time-to-hire, AI usage/cost). 7. Team: invite hiring managers/interviewers with roles (existing invitations).

## 9. AI architecture & AI/data boundaries

- **Orchestrator stays**: feature → providers list (primary, fallback) → zod schema (injected via `z.toJSONSchema`) → deterministic fallback → `AIAnalysis` audit. All new features (`nl_job_search`, fraud flags) plug in as new schema+feature pairs.
- **Boundaries (non-negotiable)**:
  - AI **never** mutates hiring state; every consequential action (status change, reject, hire) is a human click (existing transition system).
  - AI output validated by zod before persistence/display; failures → deterministic fallback, never silent.
  - Candidate PII (resumes, contacts) used by AI only with `Consent(purpose:"ai_processing")` (existing gate). Job-side AI (JD, moderation, semantic index) does not touch candidate PII.
  - Prompt-injection defense already in system prompt (all untrusted content is data); keep + test.
  - Rate limits + auth on every AI endpoint (existing `authLimit`); add per-user AI quota counter if abuse appears.
  - Costs tracked per org in AIAnalysis (admin visibility already exists).
- **Deterministic vs probabilistic**: matching engine stays deterministic (weights, versioned `scorePolicyVersion`); LLMs only for language tasks (parse, draft, explain, NL search, moderation assist).

## 10. Database / schema changes

| Change | Detail |
|---|---|
| `Job` (modify) | + `minExpYears`, `maxExpYears` (Number, default 0), `educationRequired` (String ""), `benefits` ([String] []), `moderation` ({status: none/pending/approved/rejected, reviewedBy, reviewedAt, reason}). Keep `salary`/`experience` deprecated. New indexes: `{status:1, createdAt:-1, workplaceMode:1}`, `{status:1, "compensation.min":1}`, `{location:1, status:1}`, text index already on title/location/skills. |
| `JobAlert` (new) | user, name, filters (object snapshot: query/location/workplaceMode/skills/minSalary…), cadence (daily/weekly), lastRunAt, deliveredJobIds ([ObjectId], capped), active. Index {user:1, active:1}. |
| `Conversation` (new) | organization, application (nullable), candidate, lastMessageAt, unread {candidate: n, org: n}. Index {organization:1, lastMessageAt:-1}. |
| `Message` (new) | conversation, senderUser, senderSide (candidate/organization), body (max 5000), metadata. Index {conversation:1, createdAt:-1}. |
| `SearchHistory` (new) | user, query, filters, jobIds clicked ([ObjectId] capped 20), createdAt (TTL 180d). |
| `JobEmbedding` (new, optional phase 4) | job, vector (capped ~1024), model, createdAt; upsert on publish/update. |
| `Organization` (modify) | + `logo` (String), `about` (String 2000), `benefits` optional. |
| `User` (modify) | + `alertDigestPrefs` optional. savedJobs stays. |
| Removals | `Company` model dropped; no data migration needed (never referenced). |
| Migrations | Additive only → no destructive migrations; `create-indexes.js` updated; legacy v0 removal touches no data. |

## 11. API changes

- Extend `GET /api/v1/jobs`: `minSalary,maxSalary,minExp,maxExp,jobType,skills(a|b|c),industry,postedWithin(d|w|m),sort(relevance|date|salary)`.
- New: `GET /api/v1/companies/:slug`, `GET /api/v1/companies/:slug/jobs`, `GET /api/v1/companies` (top companies).
- New: `POST/GET/PATCH/DELETE /api/v1/candidates/me/alerts[/:id]`.
- New: `GET/POST /api/v1/candidates/me/conversations`, `GET/POST /api/v1/candidates/me/conversations/:id/messages`; org-side mirrors under `/organizations/:orgId/conversations…` (tenant-scoped).
- New: `GET/DELETE /api/v1/candidates/me/search-history`.
- New (admin): `GET /api/v1/admin/jobs?moderation=pending`, `POST /api/v1/admin/jobs/:id/moderate`.
- Org job endpoints: honor `requireJobApproval` (publish → pending_review when enabled); `PUT .../jobs/:id` re-triggers moderation on published-field changes.
- AI: new feature `nl_job_search` via existing `POST /api/v1/ai/:feature`.
- Removed: all v0 `/api/{auth,user,jobs,candidate,matching}` routes + `ENABLE_LEGACY_API`.

## 12. Search architecture

- **v1 (this build)**: MongoDB `$text` (existing index) + structured filter composition in `publicJobs` (regex location → keep for compat, add exact city match), cursor pagination (existing `applyCursor`), sort variants. Relevance = $text score + recency blend. URL-serializable params (deep-linkable, shareable).
- **Semantic (phase 4)**: on publish/update → enqueue embedding (existing queue) → `JobEmbedding`. Query embeds the user's text (rate-limited, cached per query string 10 min) → cosine top-200 → merge with lexical (RRF-style) → page. At current scale (<10k jobs) in-memory cosine is fine; upgrade path is Atlas vector search when data grows — no code change beyond the storage layer.
- **NL search (phase 2)**: `nl_job_search` LLM call → zod-validated filter object → same public search pipeline (AI never returns jobs directly).

## 13. Recommendation / matching architecture

- Keep hybrid matching as the scoring engine (explainable, versioned).
- **Signals**: profile skills + latest resume (existing) + saved jobs (skills of saved) + search history (terms/skills) + applied jobs (negative signal: exclude applied/closed).
- **Execution**: replace on-demand "score latest 100 jobs" with a **queue job** (`JobRun` reuse) per user (debounced on profile/resume/save/search change) + nightly batch; store top-50 per user in `CandidateMatch` with `purpose:"recommendation"`. Dashboard reads stored results (fast), falls back to on-demand if absent.
- **Personalization proof**: recommendations must differ per user given different signals; store signal snapshot in metadata for audit/debug.

## 14. Auth / authorization model

Unchanged core (platform role + org membership, cookie refresh, tenant scoping). Additions:
- Public company/job endpoints: no auth, PII-minimized payloads (no candidate data).
- Employer onboarding: `POST /organizations` stays owner-created; new `PUT /organizations/:id` fields (logo/about) gated by owner/admin.
- Moderation actions: platform admin only.
- Conversations: candidate sees only own; org members see only own-tenant (existing `requireOrganization` pattern).
- Alerts/history: strictly `req.user._id` scoped.

## 15. Security / privacy requirements

- Public surfaces: no candidate PII, no resume text, no applicant counts per user; job pages expose only employer-published data.
- Resumes: existing encryption-at-rest options + storage keys are session-populated; never returned in public/job lists (existing `-resumeSnapshot` projections).
- AI: injection defenses (existing prompt), schema validation, per-endpoint rate limits, consent gating, cost caps; NL-search input sanitized + length-capped.
- Uploads: existing size/type limits + malware hook; add AVirus/ClamAV `MALWARE_SCANNER_URL` in production.
- Tenant isolation: every org-scoped query filters `organization` (existing pattern; new endpoints must follow + be covered by isolation tests).
- Secrets: `.env` gitignored (existing); no new secrets beyond optional embedding keys.

## 16. Observability & audit

- Existing: AuditLog (action/resource/org/user), SecurityEvent, AIAnalysis (feature/provider/tokens/cost/fallback), request logger, health/ready.
- Add: search analytics counters (queries, zero-result rate), alert delivery metrics, moderation decisions to AuditLog, recommendation-refresh job metrics. Admin pages already display AI usage/audit/security.

## 17. Performance / scalability

- Recommendations off the request path (phase 3) — biggest current hotspot (100 jobs × LLM-embedding calls per dashboard load).
- New indexes (§10); cursor pagination everywhere (no offset).
- Embedding cache per job version + query cache (10 min) to bound AI cost.
- Frontend: keep lazy chunks; new pages are route-level chunks (existing pattern); avoid extra queries on job card (denormalize company name — already `Job.company`).
- Queue for: resume processing (existing), embeddings, alert scans, recommendation refresh, moderation scan.
- Target: p95 public search < 300 ms (Mongo only), job detail < 200 ms, dashboard < 500 ms (stored recs).

## 18. Migration strategy (no breaking changes)

Strictly additive phases; v0 removal is isolated in Phase 0 and reversible by one commit. At each phase: `npm test` (server) + `npm run lint` + client `vitest` + `vite build` green before push. No destructive data migrations. Public URLs stay stable (`/jobs`, `/jobs/:id` keep working with old params).

## 19. Phased roadmap

| Phase | Scope | Deliverables |
|---|---|---|
| **0 — Cleanup** | Remove v0 legacy stack, `Company` model, 3 unused deps, legacy client redirects; update env | Green CI; v1-only API |
| **1 — Public marketplace** | Job schema additions, extended public search filters/sort, new public UI (search page, rich job detail, related jobs), public company pages, employer onboarding flow, SEO/JSON-LD, README | Deep-linkable search; company pages; mobile-responsive |
| **2 — Candidate growth** | Saved jobs on public page, job alerts (model+API+UI+email), search history, NL search (AI), recommendations v2 (signals + queue), related jobs | Alert emails; personalized dashboard |
| **3 — Employer growth** | Job moderation (enforce `requireJobApproval` + admin queue + duplicate heuristic), bidirectional conversations + inbox UI, Kanban pipeline, org company profile (logo/about) | Moderated publishing; inbox; Kanban |
| **4 — AI depth** | Semantic job search (embeddings + hybrid), fraud/spam detection (heuristics + LLM assist, human review), evaluation harness (golden set for matching), cost/latency tuning | Semantic results; clean job feed |
| **5 — Production readiness** | NODE_ENV=production hardening (CORS, secure cookies, S3, scanner), load testing, deploy docs (render/fly + Atlas), final e2e passes | Deployable build |

## 20. Acceptance criteria (per phase)

- **P0**: `grep -r "ENABLE_LEGACY_API" server/` → 0 hits; `models/Company.js` gone; `npm test` + lint + client build green; all v1 e2e workflow tests pass; no public behaviour change.
- **P1**: URL `/jobs?query=react&location=Pune&workplaceMode=remote&minSalary=8&jobType=Full-Time` returns correct filtered set (API test); job detail shows salary/experience/skills/company link; company page lists published jobs; JSON-LD present; mobile layout passes; all Phase-1 pages reachable without auth.
- **P2**: Creating an alert fires on matching new job (queue test) and emails via SMTP; dashboard recommendations differ between two users with different saved/search signals; NL query "remote react job under 15 lpa pune" produces structured filters (schema test) and results.
- **P3**: Org with `requireJobApproval=true` cannot have a job visible publicly until admin/org-admin approves (integration test); candidate↔employer messages round-trip with unread badges; Kanban transitions equal existing transition rules; duplicate job heuristic flags a 90%-similar listing.
- **P4**: Semantic search returns related jobs for synonym queries ("front end" ↔ "react"); job feed has <1% suspected-duplicate rate on test corpus; matching eval harness reports score drift < threshold on golden set; AI cost per 1k dashboard loads bounded (cache hit ratio reported).
- **P5**: `NODE_ENV=production npm start` boots with production env validation; e2e candidate journey (register→resume→search→apply→alert→interview) and employer journey (onboard→post→approve→shortlist→message→interview→hire) pass; security checklist (§15) verified; deploy doc reproduces the build on a fresh machine.

---

## Open decisions (need owner sign-off before Phase 1)

1. **Job moderation default**: platform-wide "all new jobs need approval" vs opt-in per org (`requireJobApproval`)? (Blueprint assumes opt-in + platform can force.)
2. **Employer branding**: can employers customize their public company page (logo/about/benefits)? (Blueprint: yes, owner/admin-editable.)
3. **Alert email cadence**: daily vs weekly default? (Blueprint: weekly default, user-selectable.)
4. **v0 removal timing**: immediately in Phase 0 (recommended) or after Phase 1 for safety? (Recommendation: Phase 0 — it's fully gated and redundant.)

---

## Status (updated as phases ship)

| Phase | Scope | Status |
|---|---|---|
| 0 | Remove legacy v0 API + dead code (Company model, 3 unused deps, ENABLE_LEGACY_API, v0 tests) | ✅ Shipped — no public behavior change beyond v0 endpoints going away; 66/66 non-DB tests unchanged |
| 1 | Public marketplace: richer Job model (exp years/education/benefits/industry), full search filters (salary/exp/type/skills/industry/date/sort, URL-shareable), job detail with SEO + JobPosting JSON-LD, related jobs, public company pages + top companies, employer company-profile editor | ✅ Shipped |
| 2 | Candidate growth: job alerts (daily/weekly, queue scan, email + notification, dedupe), search history (180d), natural-language AI search (validated filters + deterministic fallback), personalized recommendations (saved-job/search-term signals, applied excluded) | ✅ Shipped |
| 3 | Employer trust: per-org `requireJobApproval` moderation (opt-in + platform override), re-review on versioned edits, admin review queue with approve/reject + owner notification, org settings endpoint | ✅ Shipped |
| 4 | AI hardening & scale: precomputed recommendation snapshots via queue (<24h served from cache), prompt-injection delimiters, alert-scan N+1 fix, rate limits (global + auth + AI) verified | ✅ Shipped |
| 5 | Production config (SMTP/S3/deploy) | ⏳ Owner-driven — run on the deployment machine, see `.env.example` |

**Locked decisions** (owner sign-off): moderation = per-org opt-in + platform override; employers customize public company page (logo/about); job alerts default **weekly** (user-selectable); v0 removed in Phase 0.

**Deliberate deviations**
- Legacy client redirects (`/login`, `/dashboard`, `/my-resume`, `/my-applications`, `/recommendations`, `/recruiter/*`) are **kept** beyond end-of-P1 to protect existing bookmarks; removal is a one-line-per-route change when the owner is ready.
- Recommendations stay on-demand-capable: the snapshot is a cache (≤24h), live scoring remains the source of truth — queue precompute keeps first-paint fast without blocking correctness.

**Test status**: 100 server tests — 67 pass without a database; 33 are Mongo-backed integration suites (marketplace, alerts, moderation, snapshots, v1 workflow, production core) that run in CI on `mongo:7`. Client: 8/8 vitest + production build + lint green.
