# HireSmart AI — Production Frontend Audit and Implementation Plan

**Audit date:** 2026-08-18  
**Branch inspected:** `arena/01a0154f-hiresmart-ai` at `29a06a3`  
**Frontend:** React 19, React Router 7, Vite 8, Tailwind CSS 4  
**Backend contract:** `/api/v1` plus preserved legacy `/api` compatibility routes  
**Scope:** frontend audit and design only; no frontend implementation is included in this plan.

---

## Executive assessment

The current frontend is a well-organized demo UI, not a production client for the modernized backend. It has useful primitives, consistent loading/error/empty states, lazy page loading, a relative API base URL, and better accessibility than a typical demo. Its entire data and identity layer, however, is coupled to the legacy API: long-lived JWTs in `localStorage`, global `candidate|recruiter|admin` routing, offset pagination, one mutable resume, legacy job/application status values, and old deterministic match response shapes.

The backend deliberately preserved those legacy endpoints, so the current frontend still builds and most existing screens are not immediately broken. That compatibility must not be mistaken for integration with the new platform. None of the organization, membership, refresh-session, versioned resume, processing job, consent, structured AI, hiring-manager, interview, notification, audit, or v1 analytics capabilities are consumed.

The production frontend should be rebuilt incrementally around:

1. an in-memory access token plus refresh-cookie session client;
2. URL-scoped organization/membership context;
3. TanStack Query for server state and async-job polling;
4. generated/typed v1 DTO adapters rather than shape guessing;
5. feature modules for candidate, organization recruiting, hiring manager, and platform admin;
6. a token-driven accessible design system informed by Google Stitch screens;
7. explicit AI state, provenance, fallback, confidence, and failure handling.

Do not simply change the Axios base URL to `/api/v1`. That would break almost every current screen because methods, payloads, IDs, pagination, enums, and response shapes differ.

---

# 1. Frontend-specific current-state audit

## 1.1 Repository and quality status

The frontend contains approximately 8,600 source lines across:

- one route shell (`App.jsx`);
- 20 page modules;
- layout, AI, job, and UI components;
- one Axios client and one endpoint registry;
- a custom auth context;
- custom `useFetch`, `useMutation`, and debounce hooks;
- one Tailwind CSS token/theme file.

Verification performed during this audit:

```text
cd client && npm run lint   -> passed
cd client && npm run build  -> passed
```

The build is route-split, but the base application chunk is about 339 KB and the analytics page chunk is about 371 KB before gzip. There are no frontend unit, component, accessibility, contract, or end-to-end tests and no test dependencies/scripts.

## 1.2 Current route and page inventory

| Current route | Page | Actual behavior | Production disposition |
|---|---|---|---|
| `/` | Landing | Static marketing, feature list, hero, role CTAs | Rebuild visual hierarchy and claims; retain public conversion purpose |
| `/jobs` | Jobs | Legacy public list, keyword/location/type filters, numbered pagination, candidate saved-job state | Rebuild against v1 cursor jobs; saved jobs need contract decision |
| `/jobs/:id` | JobDetail | Legacy job, save/apply/withdraw/status and on-demand old match | Rebuild; v1 fit/apply require exact resume version |
| `/resume-check` | ResumeCheck | Public pasted sample or text sent to legacy deterministic analyzer | Retain only as explicitly labeled public heuristic demo, or replace with sign-up flow; v1 has no public equivalent |
| `/login` | Login | Legacy token response stored in `localStorage` | Replace completely with v1 session flow |
| `/register` | Register | Candidate/recruiter toggle, 8-char password, legacy recruiter endpoint | Replace payload, consent, verification and organization onboarding |
| `/profile` | Profile | Edits flat legacy `User`; recruiter company strings mixed into the same page | Replace with candidate profile or organization settings by context |
| `/settings` | Settings | Change password, local logout | Expand to sessions, consents, export/delete, notification preferences where supported |
| `/dashboard` | Candidate Dashboard | Legacy aggregate dashboard plus old recommendations | Replace with composed v1 queries and task-oriented home |
| `/my-applications` | MyApplications | Legacy applications plus saved jobs tab | Replace with status timeline/detail; saved jobs are not in v1 |
| `/recommendations` | Recommendations | Old recommendation response and match shape | Replace with v1 `overallScore`/evidence contract |
| `/my-resume` | ResumeHub | One 5 MB PDF/DOC/DOCX resume; immediate upload result; old analyzer | Replace with version list, 10 MB PDF/DOCX, async processing and AI analysis |
| `/recruiter` | Recruiter Dashboard | Legacy recruiter totals and recent jobs | Replace with organization-scoped operational overview |
| `/recruiter/jobs` | ManageJobs | Legacy create/update/delete modal with flat skills and direct status | Replace with structured editor, AI JD workspace, explicit publish/close |
| `/recruiter/jobs/:jobId/applicants` | JobApplicants | Old synchronous ranking, one note field and legacy stage update | Replace with paginated pipeline, persisted v1 matches, detail drawer/page, tags/notes/interviews |
| `/recruiter/analytics` | Analytics | Legacy stage totals in Recharts | Replace with v1 funnel, source, job, time-to-stage, and separate AI analytics |
| `/admin` | Admin Dashboard | Legacy platform totals | Replace with focused platform health/attention view |
| `/admin/users` | ManageUsers | Legacy offset list and reversible activation | Rebuild; v1 currently supports cursor list and suspension only |
| `/forbidden`, `*` | Error pages | Basic access denied/not found | Retain concepts; redesign within new shell |

There are no pages for verification, password recovery/reset, onboarding, organizations/team, hiring managers, candidate/application detail, comparison, interviews, notifications, AI copilots, audit/security, AI usage, organization settings, or processing jobs.

## 1.3 Existing components: reuse versus replacement

### Reuse or evolve

- `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Card`: good conceptual primitives with centralized style and accessibility wiring. Evolve tokens, variants, density, dark surfaces, and polymorphism.
- `States`: loading, skeleton, empty and error patterns are worth retaining and broadening.
- `ScoreRing`/`ScoreBar`: accessible numeric alternative exists; adapt to v1 score/confidence/weight semantics.
- `Toast`: useful provider API and live region; replace timer/lifecycle mechanics or wrap an accessible library.
- `JobCard`: retain information hierarchy, but normalize `id`, compensation, workplace, required/preferred skills, and new match DTO.
- React lazy routes, Vite relative proxy, Nginx SPA fallback, Lucide icons, formatting utilities.

### Replace or substantially refactor

- `apiClient.js`, `api.js`, `AuthContext.jsx`, `ProtectedRoute.jsx`, `roleRoutes.js`: structurally incompatible with v1 identity and tenancy.
- `useApi.js`: lacks cache, request cancellation, deduplication, stale-time, mutation invalidation, retries, offline handling and cursor helpers. Replace server-state behavior with TanStack Query.
- `Navbar`/`Footer`: replace the single marketing-style top nav inside authenticated workflows with role/membership-aware application shells.
- `Modal`: lacks focus trapping, background inertness and focus restoration. Replace with a tested accessible dialog primitive.
- `MatchBreakdown`: hard-coded to legacy `matchScore`, four old components, `missingSkills`, and TF-IDF help text. Rebuild for hybrid v1 evidence.
- `ResumeReport`: hard-coded to old ATS report rather than processing versions and structured AI output.
- Most pages should be rebuilt using feature components rather than visually patched.

## 1.4 Existing API consumption

Every current endpoint in `client/src/lib/api.js` points at legacy `/api` routes:

- auth: register, recruiter register, login, password operations, one mutable resume;
- user: flat profile and legacy admin aggregates/users;
- jobs: public list/detail, saved jobs, direct apply/withdraw, legacy dashboards, recruiter CRUD/applicants/notes/download/analytics;
- candidate profile: embedded subresource CRUD;
- matching: old resume analysis, public text analysis, recommendations, fit and rankings.

Because `VITE_API_URL` defaults to `/api`, none of these calls reaches `/api/v1`. The preserved backend compatibility routes prevent an immediate outage, but the production frontend must introduce a separate v1 client and remove legacy calls feature by feature.

## 1.5 Static, demo and placeholder behavior

No page fabricates successful network responses. Existing AI buttons call the backend and display errors. Static content includes:

- landing feature/how-it-works arrays;
- a pasted sample resume for the public analyzer;
- duplicated status/job-type/role options;
- explanatory AI copy that specifically claims TF-IDF behavior;
- stale comments about demo-account buttons and “viva/demo” behavior.

The sample resume is acceptable only when explicitly labeled as sample input; it must never appear as a candidate record or AI result. Static enum arrays are not fake data, but they are now stale and should derive from a shared frontend domain definition aligned to v1. Marketing claims must distinguish deterministic fallback from configured LLM/embedding features.

## 1.6 Incomplete and missing experiences

- Registration has no terms/privacy policy versions or AI-processing consent.
- No email verification, resend, forgot-password or reset-password screens despite old client methods.
- No session/device management, consent controls, data export or deletion flow.
- No onboarding state or organization selector.
- Candidate profile exposes only flat fields and not education/experience/projects/certifications in the actual page.
- Resume upload assumes immediate completion; no queue, processing stages, retry, duplicate state, version history or parsed extraction review.
- No AI resume improvement workspace, job tailoring, career copilot or provenance display.
- No application detail timeline, interview list/prep, or notification center.
- No organization/team management, structured requirements, JD copilot, explicit publish flow, candidate detail, comparison, reusable notes/tags, communication composer, interview scheduling, feedback or decisions.
- No hiring-manager experience.
- Admin lacks organizations, AI usage, audit/security, and health.

## 1.7 Loading, error and empty states

The current app is stronger than average here: list/detail pages generally use `LoadingState`, `SkeletonList`, `ErrorState`, and `EmptyState`; mutations show loading buttons and toasts.

Gaps:

- no background-processing state model (`queued|processing|completed|failed|cancelled`);
- no partial/stale-data state while filters change;
- no field-error mapping from v1 `fieldErrors`;
- no offline, timeout, rate-limit cooldown, session-refresh, permission-revoked, conflict or stale-version states;
- errors are flattened to one message and lose `code`, `requestId`, and field paths;
- refetch often replaces the entire view with a loader instead of retaining prior data;
- AI has no malformed/fallback/low-confidence/provenance states;
- no optimistic-state rollback presentation;
- no global route error boundary.

## 1.8 Authentication and role problems

- Access tokens are stored in `localStorage`, contrary to the new backend’s in-memory access plus rotating refresh-cookie design.
- Logout only clears browser state and never calls v1 session revocation.
- Every 401 triggers logout. It cannot distinguish invalid credentials, expired access requiring refresh, revoked session, or domain errors.
- There is no refresh mutex; concurrent expired calls would cause multiple rotations and token-family problems.
- CSRF cookie/header rotation is unsupported.
- Bootstrap trusts presence of a legacy local token and calls the old profile endpoint.
- Routes use global `user.role`; hiring manager/interviewer are organization membership roles, not global user roles.
- There is no organization context, membership status, or permission-aware UI.
- Recruiters and admins share recruiter routes in the old app even though v1 organization context is mandatory.
- Registration validation accepts 8 characters while v1 requires 12.
- Recruiter form fields map to old names and old backend behavior.

Frontend guards remain UX only; all sensitive actions must continue to rely on backend enforcement.

## 1.9 Responsive/mobile audit

Strengths:

- grids use responsive Tailwind breakpoints;
- navbar has a mobile drawer;
- job/applicant content uses cards rather than rigid tables;
- widths and padding are generally bounded;
- forms often collapse to one column.

Problems:

- authenticated navigation does not scale to the much larger product IA; a single top navbar/mobile drawer will become crowded.
- modals use a horizontal footer and `max-h-[70vh]`, which is awkward for long forms and small keyboards.
- toast container (`w-full` anchored right) can crowd narrow screens.
- analytics rely on fixed-height charts and mouse-oriented tooltips without mobile data alternatives.
- recruiter pipeline, comparison, resume extraction review and structured job editor need purpose-designed mobile transformations rather than stacked desktop cards.
- no compact density control, mobile bottom action bar, safe-area handling, or persistent filter drawer.
- very small 10–12 px metadata is overused.

## 1.10 Accessibility audit

Strengths:

- real labels and `aria-describedby` for fields;
- visible global focus rings;
- loading live regions, alert roles, accessible progress bars and score labels;
- most decorative icons are hidden;
- icon actions usually have labels;
- native buttons/links are commonly used.

Problems to correct:

- modal moves focus but does not trap it, make the background inert, restore the trigger, or wire the description ID;
- account dropdown lacks robust keyboard arrow/Home/End/Escape behavior and focus management;
- tabs lack roving tab index, arrow navigation and panel labeling;
- Recharts visualizations have no textual table/summary equivalent;
- no `prefers-reduced-motion` handling despite several entrance/progress animations and smooth scrolling;
- page navigation scrolls but does not move focus to the new page heading;
- toasts do not pause on hover/focus, timers are not cleaned up, and errors use a polite status rather than an assertive strategy;
- no skip-to-content link;
- some color/10 px metadata combinations need WCAG contrast/size review;
- drag/drop, comparison, kanban-like pipeline, AI evidence highlights and charts require keyboard-first designs from the start.

## 1.11 Duplication and state management debt

Repeated patterns include stat cards, headers, pagination, status maps, role maps, stage options, modal forms, response shape fallbacks, metric formatting and card-list layouts. Candidate/recruiter/admin dashboards independently recreate the same presentation structures.

The custom hooks keep all server state local to each page. Consequences:

- duplicate requests across navbar/dashboard/pages;
- no cache or mutation invalidation;
- no prefetching, stale time, retry policy or offline status;
- manual `refetch()` chains;
- no shared cursor pagination;
- inline mutation functions cause callback churn;
- request IDs suppress stale state writes but do not abort network requests;
- URL state is used well on Jobs, but inconsistently elsewhere.

Global Redux is not justified. Server state belongs in TanStack Query; session and organization selection belong in small contexts; filters belong in URLs; transient form state belongs in React Hook Form.

## 1.12 Performance audit

- Route lazy loading is a good foundation.
- Recharts is isolated to analytics but still creates a large route chunk; retain lazy loading and avoid importing charts into shared shells.
- The base chunk remains sizable because shared dependencies and all shell infrastructure live there.
- No query caching/deduplication means returning to pages re-downloads data.
- No AbortController means obsolete searches still consume network/server capacity.
- Saved jobs fetch all items; legacy applicant ranking fetches/scores all candidates.
- No list virtualization or incremental rendering for recruiter-scale datasets.
- Repeated full-page refetch after mutations harms perceived performance.
- No image optimization issue currently exists because the app barely uses imagery; future Stitch exports must not introduce large decorative assets.

---

# 2. Backend/frontend contract audit

## 2.1 Contract migration matrix

| Capability | Current frontend | Actual v1 contract | Required frontend change |
|---|---|---|---|
| Base path | `/api` | `/api/v1` | New client; keep legacy client only during migration |
| Login | `{token,user}` | `{data:{accessToken,expiresIn,user}}` + refresh/CSRF cookies | Memory token, cookie credentials, then hydrate `/users/me` and `/organizations` |
| Refresh | none | `POST /auth/token` with refresh cookie and `X-CSRF-Token` | Single-flight refresh interceptor and one retry |
| Logout | local clear | authenticated `POST /auth/logout` | Revoke server session, then clear query/cache state |
| Registration | `{name,password,role,...}` | `{displayName,password>=12,accountIntent,organizationName?,termsConsent,policyVersions?,aiProcessingConsent?}` | New forms and verification state |
| Identity | `/user/profile` | `/users/me` plus role; `/organizations` for membership context | Split identity/profile/org state |
| Candidate profile | flat old user + old subresources | `GET/PATCH /candidates/me/profile` | One normalized form adapter; no per-subresource v1 endpoints |
| Resume | one mutable PUT/GET/DELETE | version list, multipart POST, detail/download/delete/retry, job run | Version UI and polling |
| Resume file rules | PDF/DOC/DOCX, 5 MB | PDF/DOCX, 10 MB, verified content | Update accept copy and validation; reject DOC |
| Resume AI | old synchronous ATS object | version analysis returns structured v1 AI artifact and metadata | New report/copilot components |
| Public jobs | offset, `keyword`, top-level jobs | cursor `limit/after`, `query`, `{data,meta}` | URL cursor/filter adapter; normalize `id` |
| Job fit | GET by job, implicit current resume | POST with `resumeVersionId` | Resume selector and explicit mutation |
| Apply | POST empty body | POST `{resumeVersionId,source?,screeningAnswers?}` | Confirmation/review form |
| Withdraw | DELETE by job ID | POST by application ID with optional reason | Application detail action |
| Recommendations | old `match.matchScore` | `{data:[{job,match}]}` with `overallScore`, evidence | New card and match model |
| Organization jobs | recruiter-owned `/jobs/my-jobs` | `/organizations/:orgId/jobs` | URL tenant scope and permission-aware UI |
| Job create | flat skills/status | structured `requiredSkills`, `preferredSkills`, compensation/workplace; starts draft | Multi-section editor and explicit publish |
| Applicants | offset legacy list/ranking | cursor applications; persisted match is separate | Pipeline query plus match state orchestration |
| Match | old four-part response | persisted hybrid `overallScore`, confidence, six components/evidence/limitations | Replace visualization and labels |
| Notes | one mutable string | multiple note records with visibility/tags | Activity composer/list |
| Stages | title-case legacy values | lower-case v1 state machine | New enum labels and allowed action UX |
| Interviews | absent | org interview lifecycle and candidate endpoints | Full feature module |
| Notifications | absent | list/read/read-all | Notification center and unread query |
| Analytics | legacy totals | funnel/rates/time/source/job/AI separation | New charts and accessible data summaries |
| AI | old analyzer/matcher only | feature executor and version-specific endpoints | Structured workspaces with metadata/error states |
| Admin | old overview/users/status | cursor users/orgs/audit/security/suspend | New admin modules; account reactivation gap |

## 2.2 Response normalization issues

The v1 contract is usable but not perfectly uniform:

- public and organization job DTOs use `id`, while several raw Mongoose resources (applications, interviews, notifications, notes, matches) expose `_id`;
- resume list returns resume tracks in `data` and versions in `meta.versions`;
- `GET /auth/login` user does not include global role; `/users/me` must be called after login;
- `/organizations` returns membership role and custom permission additions, but not the effective permission set from the backend role template;
- cursor metadata is not present on every list (recommendations and resume versions are bounded lists);
- field errors are available on validation failures, but current client discards them.

The frontend should use a boundary adapter per resource (`normalizeId`, `mapJob`, `mapApplication`, etc.) and not scatter `_id || id` checks throughout components. Types should reflect actual responses, not documentation aspirations.

## 2.3 Backend contract gaps affecting requested frontend scope

These are implementation preconditions, not reasons to weaken frontend architecture:

1. **Assigned hiring-manager jobs are not queryable.** Membership roles exist and jobs store `hiringTeam`, but there is no hiring-team assignment endpoint/filter or capability DTO. A genuine “Assigned jobs” page cannot be implemented correctly yet.
2. **Saved jobs are legacy-only.** V1 has no save/unsave/list contract. Either retain a narrow legacy adapter temporarily or add v1 saved-job resources before rebuilding that feature.
3. **No v1 dashboard aggregate endpoints.** This is acceptable: candidate and recruiter homes can compose cached profile/resume/application/job/analytics queries, but loading/error behavior must be designed accordingly.
4. **No admin reactivation endpoint.** V1 can suspend but not restore users. The new UI must not show a fake Reactivate action.
5. **Global admin AI usage is absent.** AI usage is organization-scoped. Platform admin can inspect one organization at a time, but a global usage screen needs a backend aggregate endpoint or clearly scoped UI.
6. **Batch match recomputation is absent.** Ranking returns persisted matches; opening a new job may show no scores until per-application match calls run. A production pipeline needs a batch/recompute command or careful per-item orchestration with bounded concurrency.
7. **Resume tailoring to a specific job has no dedicated server-owned endpoint.** Job fit supplies gaps and generic resume improvement exists, but the browser should not invent or transmit unavailable raw resume text. Add a version+job tailoring endpoint before the tailoring workspace.
8. **JD generation from a brief is implicit rather than explicit.** `jd_improvement` can accept a brief through generic input, but a dedicated schema/endpoint would produce a stronger contract.
9. **Organization invitation is “add registered user,” not a tokenized invitation workflow.** Team UI must accurately say “Add existing user” unless the backend adds invitation email/acceptance.
10. **Admin user list payload is broader than needed and lacks search/role filters.** Frontend must not rely on or expose unrelated PII; backend projection/filter follow-up is recommended.
11. **No notification preferences endpoint** despite notification delivery. Settings should expose only actual consent controls until one exists.
12. **No calendar-provider integration endpoints.** Scheduling is core and usable; external calendar connection UI must wait.

All other principal flows are callable: registration/verification/session, organization membership, profile, resume versions and jobs, fit/apply/tracking, match/shortlist/notes/tags/contact, interview lifecycle, structured AI features, notifications, analytics, audit/security and health.

## 2.4 Authentication integration protocol

The production client must follow this exact flow:

1. Axios uses `baseURL: /api/v1` and `withCredentials: true`.
2. Access token lives only in a module-level memory store.
3. Login stores `data.accessToken` in memory, then requests `/users/me` and `/organizations`.
4. Page reload has no access token; bootstrap reads the non-secret `hiresmart_csrf` cookie and calls `/auth/token` with `X-CSRF-Token`.
5. Refresh returns a new access token and rotates both cookies. Update memory before replaying requests.
6. Only one refresh may run at once. Other 401 requests await the same promise.
7. Retry the original request once. `SESSION_INVALID|SESSION_REVOKED|REFRESH_REQUIRED|CSRF_INVALID` ends the session; validation or credential errors do not.
8. Logout calls `/auth/logout` while access is valid, then clears token, organization selection and all private query caches.
9. Never place access/refresh/CSRF values in logs, URLs, analytics, error reports or persistent app state.

---

# 3. Target information architecture

## 3.1 Product shells

### Public shell

Marketing header, minimal navigation, job discovery, auth. No authenticated dashboard navigation or heavy product dependencies.

### Candidate shell

Task-oriented left rail on desktop, compact top bar plus bottom navigation on mobile:

- Home
- Jobs
- Applications
- Resumes
- Copilot
- Notifications
- Profile & settings

### Organization shell

Organization switcher and membership-aware navigation:

- Overview
- Jobs
- Candidates / applications
- Interviews
- Analytics
- Copilot
- Team & organization settings

Hiring managers see Assigned jobs, Reviews and Interviews rather than job creation/team administration. Interviewers see assigned interviews/feedback only. Navigation uses membership capabilities for UX; backend remains authoritative.

### Platform admin shell

- Users
- Organizations
- AI usage (organization-scoped until global contract exists)
- Security events
- Audit logs
- System health

Keep admin visually restrained and operational; do not turn it into a generic tile dashboard.

## 3.2 Primary entity hierarchy

```text
Identity
├── sessions / consents / account
└── organization memberships

Candidate
├── profile
├── resume tracks
│   └── immutable versions -> processing -> parsed resume -> AI analyses
├── job fits / recommendations
├── applications
│   └── status history -> messages -> interviews
└── notifications / copilots

Organization
├── members
├── jobs
│   └── applications -> matches -> notes/tags -> interviews -> feedback
├── candidate search / comparison
├── analytics
└── audit/security/AI usage
```

---

# 4. Target route/page architecture

Use stable, explicit, bookmarkable routes. Organization ID is in the URL so switching tenants cannot accidentally reuse another tenant’s cache.

## 4.1 Public and auth

```text
/
/jobs
/jobs/:jobId
/auth/login
/auth/register/candidate
/auth/register/recruiter
/auth/verify-email
/auth/resend-verification
/auth/forgot-password
/auth/reset-password
/legal/privacy
/legal/terms
```

Legacy `/login`, `/register`, `/dashboard`, `/recruiter/*`, `/admin/*` become redirects after migration.

## 4.2 Candidate

```text
/app/candidate                         task-focused home
/app/candidate/onboarding
/app/candidate/profile
/app/candidate/resumes
/app/candidate/resumes/:versionId      processing, extraction, analysis
/app/candidate/resumes/:versionId/copilot
/app/candidate/jobs
/app/candidate/jobs/:jobId             fit, gaps, apply
/app/candidate/recommendations
/app/candidate/applications
/app/candidate/applications/:applicationId
/app/candidate/interviews/:interviewId/prepare
/app/candidate/copilot
/app/notifications
/app/settings/account
/app/settings/sessions
/app/settings/privacy
```

## 4.3 Recruiter/organization

```text
/app/o/:organizationId
/app/o/:organizationId/jobs
/app/o/:organizationId/jobs/new
/app/o/:organizationId/jobs/:jobId
/app/o/:organizationId/jobs/:jobId/edit
/app/o/:organizationId/jobs/:jobId/applications
/app/o/:organizationId/applications/:applicationId
/app/o/:organizationId/compare?applicationIds=...
/app/o/:organizationId/candidates/search
/app/o/:organizationId/interviews
/app/o/:organizationId/interviews/:interviewId
/app/o/:organizationId/analytics
/app/o/:organizationId/copilot
/app/o/:organizationId/team
/app/o/:organizationId/settings
/app/o/:organizationId/audit
/app/o/:organizationId/security
```

## 4.4 Hiring manager/interviewer

```text
/app/o/:organizationId/assigned        blocked on assignment contract
/app/o/:organizationId/reviews
/app/o/:organizationId/applications/:applicationId
/app/o/:organizationId/compare
/app/o/:organizationId/interviews/:interviewId/feedback
```

Use the same application/interview components with capability-controlled actions; do not fork a second candidate-detail implementation.

## 4.5 Platform admin

```text
/app/admin/users
/app/admin/organizations
/app/admin/organizations/:organizationId
/app/admin/ai-usage
/app/admin/security
/app/admin/audit
/app/admin/health
```

---

# 5. Target component architecture

## 5.1 Recommended source layout

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   ├── shells/
│   └── error-boundary/
├── api/
│   ├── client.ts
│   ├── auth-refresh.ts
│   ├── contracts/
│   ├── adapters/
│   └── query-keys.ts
├── design-system/
│   ├── tokens.css
│   ├── primitives/
│   ├── forms/
│   ├── feedback/
│   ├── data-display/
│   └── charts/
├── features/
│   ├── auth/
│   ├── organizations/
│   ├── candidate-profile/
│   ├── resumes/
│   ├── jobs/
│   ├── applications/
│   ├── matching/
│   ├── interviews/
│   ├── notifications/
│   ├── ai/
│   ├── analytics/
│   └── admin/
├── shared/
│   ├── hooks/
│   ├── lib/
│   └── types/
└── test/
```

Migrate to TypeScript module by module. Do not perform a blind all-files conversion before contract adapters and tests exist.

## 5.2 Primitive layer

- Button/IconButton/ButtonLink
- TextField/Textarea/Select/Combobox/Checkbox/Radio/Switch
- Dialog/AlertDialog/Drawer/Popover/Dropdown/Tooltip
- Tabs/Accordion/Command menu
- Badge/Tag/Avatar
- Skeleton/Spinner/Progress/AsyncStatus
- Toast/InlineAlert/Callout
- DataTable/Pagination/FilterBar
- ChartFrame with accessible summary/table

Use Radix UI primitives (or React Aria) for dialog, dropdown, tooltip, tabs and focus behavior rather than maintaining bespoke accessibility logic. Keep visual styling local and product-specific.

## 5.3 Product components

### Shared

- `AppShell`, `PublicHeader`, `OrganizationSwitcher`, `MembershipGate`
- `PageHeader`, `SectionHeader`, `Metric`, `ActivityTimeline`
- `ResourceError`, `PermissionState`, `RateLimitState`, `ConflictState`
- `CursorPagination`, `FilterDrawer`, `MobileActionBar`

### AI

- `AIActionButton` with cost/consent context
- `AIJobStatus` (`queued`, `processing`, `validating`, `complete`, `failed`)
- `AIProvenance` (provider, model, prompt version, fallback, generated time)
- `ConfidenceIndicator` and `LimitationsCallout`
- `EvidenceList` with source snippets
- `SuggestionDiff` with explicit accept/reject; accepting triggers a normal validated mutation
- `CopilotPanel` with citations and proposed-action confirmation

### Resume

- `ResumeUploader`, `ResumeVersionList`, `ProcessingTimeline`
- `ParsedResumeReview`, `ResumeQualityReport`, `ResumeSuggestionList`
- `ResumeVersionPicker`, `ResumeDeleteDialog`

### Matching/recruiting

- `HybridScoreSummary`, `ScoreComponentChart`, `SkillEvidenceMatrix`
- `CandidateRow`, `CandidateDetailHeader`, `ApplicationTimeline`
- `PipelineFilterBar`, `StatusTransitionDialog`, `CandidateCompareGrid`
- `NoteComposer`, `TagEditor`, `CommunicationComposer`
- `InterviewScheduler`, `InterviewKit`, `FeedbackScorecard`

Centralize resource adapters so components always consume normalized frontend models.

---

# 6. State and data-fetching architecture

## 6.1 Libraries

Add:

- `@tanstack/react-query` for server state;
- `react-hook-form` and `zod`/resolver for forms and backend-aligned schemas;
- Radix UI or React Aria primitives for accessible overlays/menus/tabs;
- Vitest, Testing Library, MSW, Playwright and axe for testing.

Do not add Redux. Add Zustand only if a real cross-tree transient interaction appears; auth/org contexts and query cache are enough initially.

## 6.2 State ownership

| State | Owner |
|---|---|
| Identity/access token/session bootstrap | Auth provider + memory token module |
| Server resources | TanStack Query |
| Selected organization | URL parameter; last org ID may persist as non-secret preference |
| Effective membership/capabilities | Organization provider derived from `/organizations` plus centralized role map until backend exposes effective permissions |
| Search/filter/sort/cursors | URL search params |
| Forms | React Hook Form |
| Dialog/open-row/temporary selection | Local component state |
| Compare application IDs | URL query plus local selection before navigation |
| Theme/density | small preferences context/local storage |

## 6.3 Query-key examples

```text
['me']
['organizations']
['organization', orgId]
['organization-members', orgId, filters]
['candidate-profile']
['resumes']
['resume-version', versionId]
['job-run', runId]
['jobs-public', filters]
['jobs-org', orgId, filters]
['job', scope, jobId]
['applications-candidate', filters]
['applications-job', orgId, jobId, filters]
['application', orgId, applicationId]
['match', orgId, applicationId]
['ranking', orgId, jobId, filters]
['interviews', orgId, filters]
['notifications', filters]
['analytics-recruitment', orgId, range]
```

Tenant ID must appear in every organization-owned cache key. On organization switch, never display stale prior-tenant content.

## 6.4 Mutation policy

- Apply, publish, status decisions, messages and interview scheduling use generated idempotency keys.
- Optimistically update low-risk UI only: notification read state, tags, private notes. Roll back on failure.
- Do not optimistically claim application submission, publication, interview confirmation, status progression, or AI completion.
- Invalidate the smallest relevant query set after success.
- Surface `409` as a conflict/state refresh, `422` as field/domain feedback, `429` with retry timing, and `403/404` as permission/not-found without leaking tenant existence.

## 6.5 Async resume processing

1. upload returns 202 with resume version and job run;
2. show uploaded/queued immediately;
3. poll `GET /job-runs/:id` with 1s → 2s → 5s interval while visible;
4. stop on completed/failed/cancelled or after a documented timeout;
5. refetch resume detail on completion;
6. persist run ID in query cache/route state so reload resumes tracking;
7. render exact failure code/message and offer retry only when backend allows it.

---

# 7. AI interaction architecture

## 7.1 Principles

- AI is an asynchronous or explicit user action, never decorative loading copy.
- Never fabricate token streaming; the backend currently returns complete structured responses.
- Disable duplicate submissions and show actual backend errors.
- Display provider/model/prompt/fallback metadata in a collapsible “About this result.”
- Always render confidence, uncertainty, limitations and evidence where present.
- Label deterministic fallback accurately; do not call TF-IDF an embedding model.
- Never auto-publish a JD, auto-edit a resume/profile, auto-shortlist/reject, auto-send a message or auto-submit feedback.
- Proposed changes use a diff/selection flow; accepted items go through ordinary validated domain endpoints.
- Require or explain AI-processing consent before external candidate-data processing.

## 7.2 Interaction state machine

```text
idle
  -> submitting
  -> succeeded(validated, provider metadata)
  -> failed(retryable | validation | rate-limited | permission)

For queued work:
idle -> queued -> processing -> validating -> succeeded | failed
```

Do not transition to succeeded from a timer or animation; only a successful backend response/job terminal state can do so.

## 7.3 Feature UX

- **Resume analysis:** version-scoped quality score, strengths, prioritized suggestions, uncertainties and provenance.
- **Resume improvement:** suggestion list/diff; user applies selected changes manually to profile/resume source. Never invent credentials.
- **Resume tailoring:** blocked until dedicated version+job backend endpoint; meanwhile show factual job fit/skill gaps only.
- **JD copilot:** split editor with brief/current JD and validated improved proposal; required/preferred skill extraction; inclusive-language warnings; explicit “Use draft.”
- **Job fit:** hybrid score, confidence, required versus preferred gaps, experience/education/semantic evidence, preferences and limitations.
- **Candidate ranking:** persisted match status per candidate; sorting only when scores exist; “not scored/stale/failed” are first-class states.
- **Candidate comparison:** maximum 2–4 visually; evidence matrix and human notes; no winner badge generated solely from AI score.
- **Interview questions:** structured competency/question/follow-up/rubric cards editable before use.
- **Interview prep:** candidate-specific, job-grounded focus areas and practice questions; no promise of actual interview questions.
- **Copilots:** conversation-like panel for structured complete responses, citations and confirmed proposed actions; never fake streaming or tool execution.
- **Recommendations:** explain why each job appears and which resume version was used.

---

# 8. Responsive strategy

## Breakpoint behavior

- **Small (<640):** single column, 16 px gutters, bottom navigation for top candidate tasks, drawers for filters/details, sticky bottom primary action, charts replaced by concise metrics + expandable data table.
- **Medium (640–1024):** compact side rail, two-column cards, overlay candidate detail, responsive editor sections.
- **Large (>1024):** persistent navigation, split panes for job editor/copilot and applicant list/detail, comparison grid, richer analytics.

## Feature transformations

- Applicant pipeline becomes a filterable list on mobile, not horizontally scrolling kanban.
- Candidate comparison becomes vertically grouped criteria with sticky candidate selector.
- JD editor/copilot toggles tabs on mobile and split view on desktop.
- Resume parsed review uses section accordions on mobile.
- Long dialog workflows become full-screen mobile drawers/routes.
- Data tables provide card/list alternatives where columns cannot be responsibly compressed.
- Respect safe-area insets for bottom navigation/actions.

Test at 320, 375, 768, 1024 and 1440 px plus zoom at 200%.

---

# 9. Accessibility strategy

Target WCAG 2.2 AA.

- Semantic landmarks, skip link, one page `h1`, focus target on route navigation.
- Radix/React Aria dialog/menu/tabs/tooltip/combobox primitives with focus trap/restoration and keyboard models.
- All icon-only actions named; all errors linked to fields; first invalid field focused after submit.
- Status is never represented by color alone; score always has text, confidence and explanation.
- Chart components include a nearby summary and accessible data table.
- `prefers-reduced-motion` disables nonessential entrance/progress animation and smooth scroll.
- Toasts pause on hover/focus; errors use appropriate assertive announcement; async progress uses polite updates without repeated chatter.
- Pipeline, compare, upload and evidence highlighting are fully keyboard operable.
- Minimum touch target 44×44 for primary mobile controls; body text generally 14–16 px.
- Contrast is tested for every token in light and dark/AI surfaces.
- Automated axe checks plus manual keyboard, VoiceOver/NVDA and 200% zoom acceptance tests.

---

# 10. Design system

## 10.1 Visual direction

Google Stitch-inspired, not template-derived: editorial whitespace, precise type, calm neutral surfaces, deep ink navigation, restrained indigo/cyan intelligence accents, dense but readable recruiting data, and selective dark AI workspaces. Avoid gradients except a very subtle marketing hero atmosphere; no glass cards stacked across dashboards.

## 10.2 Typography

- Display/section: self-hosted variable **Manrope** or **Instrument Sans**, 600–700.
- UI/body: self-hosted **Inter Variable**, 400–650.
- Numeric/data: tabular numerals; monospace only for request IDs/model metadata.
- Scale: 12 metadata, 14 compact UI, 16 body, 20 section, 28 page, 40–56 marketing display.
- Line height: 1.45–1.65 for content, tighter only for headings.

## 10.3 Color tokens

Light foundation:

- canvas `#F6F7FB`
- surface `#FFFFFF`
- subtle surface `#EFF2F7`
- ink `#101828`
- secondary ink `#475467`
- border `#DDE2EA`
- brand `#4F46E5`
- intelligence cyan `#0891B2`
- success `#078C67`
- warning `#B7791F`
- danger `#C43D4B`

Dark AI surface:

- canvas `#10131B`
- panel `#171B26`
- elevated `#202636`
- text `#F5F7FA`
- muted `#AAB2C3`

Every semantic family needs background, border, text and focus variants with tested contrast. Organization branding may affect logo/accent only, never semantic status colors.

## 10.4 Spacing, shape and elevation

- 4 px base scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Controls: 40 px default, 36 compact, 48 touch/hero.
- Radius: 8 controls, 12 panels, 16 feature surfaces; pills only for tags/status.
- Borders and tonal separation before shadows; one low and one floating elevation.
- Card use is intentional: group related controls or one resource, not every statistic/text block.

## 10.5 Components and states

Buttons: primary, secondary, quiet, danger, AI-accent; all with default/hover/active/focus/disabled/loading.

Inputs: default/error/success/read-only, prefix/suffix, character count, async suggestions.

Data: accessible table, compact row, metric, timeline, chart frame, evidence citation, score component.

AI: idle prompt, queued, generating, validating, fallback, completed, partial/low confidence, failed/rate-limited.

Motion: 120–180 ms controls, 180–240 ms overlays, no gratuitous stagger; reduced-motion fallback.

---

# 11. Google Stitch screen plan

Create Stitch screens before implementation, using the design tokens and real v1 field names. Generate desktop and mobile variants for each master screen. Treat Stitch output as a visual reference: extract layout, hierarchy and interaction intent; do not paste inaccessible generated markup directly.

## Stitch foundation prompt

> Design HireSmart AI, a premium AI-native recruitment operating system. Use editorial whitespace, a light neutral canvas, crisp white surfaces, deep ink typography, restrained indigo and cyan intelligence accents, subtle borders, minimal shadows, Manrope headings and Inter UI text. Prioritize recruitment evidence, workflow status and actionable next steps. Avoid generic admin templates, excessive cards, glassmorphism, decorative AI sparkles, giant metrics and meaningless gradients. All AI output must visibly include confidence, evidence, limitations and provider/fallback state. Create WCAG-friendly desktop and mobile layouts.

## Screen sequence

1. **Public landing + job search** — compact proof-oriented hero, live job search, explainable AI value, security/fairness trust section.
2. **Auth suite** — login, candidate/recruiter registration, verification, forgot/reset; no distracting marketing carousel.
3. **Candidate onboarding** — progressive profile, AI consent, preferences, resume next step.
4. **Candidate home** — next-best actions rather than metric wall: resume processing, recommended roles, active application/interview.
5. **Resume center** — version list, upload, processing timeline, duplicate/failure/retry states.
6. **Resume analysis/copilot** — quality report, evidence, prioritized suggestions and diff acceptance.
7. **Job discovery/detail** — strong filtering, compensation/workplace clarity, resume selector, fit evidence, apply review.
8. **Application tracking/detail** — accessible status timeline, messages, submitted resume version, interview actions.
9. **Candidate interview prep** — structured focus areas, practice questions, limitations and completion state.
10. **Organization overview** — operational attention queue, recent applications, interviews and job health; restrained metrics.
11. **Structured job editor + JD copilot** — split desktop workspace/tabbed mobile, required/preferred skills and publish checklist.
12. **Applicant pipeline** — dense list with score status, filters, selection and detail; no opaque leaderboard.
13. **Candidate detail + explainable match** — resume evidence, hybrid components, notes/tags/actions and audit-safe download.
14. **Candidate comparison** — evidence matrix, human feedback alongside AI, no automatic winner.
15. **Interview scheduler + feedback scorecard** — clear lifecycle, participants, rubric and locked submission state.
16. **Recruiter analytics** — funnel, source/job performance, time-to-stage and separate AI/human indicators with data tables.
17. **Recruiter/candidate copilots** — focused dark intelligence surface inside the light app, citations and confirmable proposals.
18. **Team and organization settings** — existing-user membership semantics until invitations exist.
19. **Admin operations** — users, organizations, security/audit, scoped AI usage, health; high information density and clear severity.
20. **Global states sheet** — skeleton, empty, error, 403/404, offline, 409 conflict, 429 cooldown, session expired, AI fallback/failure, processing and reduced-motion.

For each Stitch screen, export: desktop 1440, tablet 768 and mobile 375; interaction annotations; component inventory; exact states; accessibility notes. Validate it against actual API DTOs before coding.

---

# 12. Exact implementation order

1. **Contract freeze and blocker resolution:** record actual v1 fixtures; resolve hiring-team assignment, saved-job decision, admin projection/reactivation/global AI usage, batch matching, and resume-tailoring contracts before their screens.
2. **Frontend test foundation:** add Vitest, Testing Library, MSW, Playwright and axe; make lint/build/unit checks mandatory in CI.
3. **Type and API boundary:** introduce TypeScript for new modules, v1 endpoint clients, resource adapters, problem-details parsing, request IDs and contract fixtures. Keep a named legacy client only for explicitly deferred compatibility.
4. **Secure session client:** implement memory token, credentials, CSRF, single-flight refresh, one-request replay, logout/revocation and private-cache clearing. Add exhaustive auth tests.
5. **Identity and organization state:** hydrate `/users/me` and `/organizations`; URL-scoped org context; membership-role/capability gates; organization switch isolation tests.
6. **Design-system foundation:** apply Stitch-approved tokens; build accessible primitives, shell, navigation, states, responsive drawers and chart frame. Add reduced motion and theme strategy.
7. **Public/auth pages:** landing, jobs shell, login, candidate/recruiter registration, verification/resend, forgot/reset. Remove stale demo/security copy.
8. **Candidate onboarding/profile/settings:** profile, consent, sessions, export/delete and organization-independent account settings.
9. **Resume workflow:** versions, secure upload validation, job-run polling, processing failures/retry, parsed detail and version download/delete.
10. **Candidate AI:** resume analysis/improvement, provenance/confidence/limitations, career copilot. Defer job tailoring until its dedicated contract exists.
11. **Jobs/applications:** v1 cursor discovery, job detail/fit, resume selection, apply confirmation, recommendations, application list/detail/withdrawal.
12. **Candidate interviews/notifications:** center, read state, confirmation/reschedule and preparation.
13. **Organization job workflow:** organization shell, structured job editor, JD parse/improvement proposal, draft/publish/close and job lists.
14. **Recruiter pipeline:** applications, bounded match generation/recompute contract, ranking states, candidate detail, evidence, resume download, status transitions, tags, notes and communication.
15. **Comparison/interviews:** compare route, scheduler, question kit, participant workflow and structured feedback.
16. **Hiring-manager experience:** assigned jobs/reviews once assignment contract exists; reuse candidate detail/compare/feedback components under membership capabilities.
17. **Analytics and copilots:** lazy accessible charts/data tables, source/job/time metrics, AI usage separation, recruiter copilot with citations/confirmation.
18. **Admin:** users, organizations, scoped/global AI usage as contract permits, security, audit and health. Never expose raw unnecessary PII.
19. **Performance pass:** query stale times/prefetch, aborts, cursor UX, list virtualization where measured, bundle analysis and chart isolation.
20. **Accessibility/responsive/E2E acceptance:** keyboard/screen-reader/zoom/reduced-motion, mobile master flows, no fake AI success, cross-tenant route tests, then remove unused legacy client code and redirects.

## Definition of frontend complete

The frontend is complete only when a candidate can verify, onboard, process and review a resume, receive genuine backend AI/fit results, apply with a chosen immutable resume version, track the application, prepare for and confirm an interview, and manage notifications/session/privacy; a recruiter can operate inside an organization, build and improve a structured JD, publish, review evidence-backed applicants, collaborate, contact, schedule/evaluate and decide; a hiring manager can review only assigned resources; and an admin can operate the supported platform controls.

Every success state must originate from a successful v1 response or terminal job status. Every organization cache/request must be tenant-scoped. No protected route may rely on frontend role checks for security, and no AI score may be shown without explanation, confidence/limitations and fallback provenance when supplied.
