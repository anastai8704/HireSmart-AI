# HireSmart AI frontend implementation report

Date: 2026-08-18

## Delivered

The legacy demo UI was replaced by a production React/Vite client for `/api/v1` while preserving the modern backend. The approved Google Stitch-inspired direction was translated into a reusable token system, public shell, responsive application shell, evidence-led AI surfaces, accessible forms/dialogs/states, and role/membership-aware product workflows.

## Architecture

- TanStack Query owns cached server state, retries, invalidation, cursor pagination and bounded applicant scoring.
- React Hook Form + Zod power authentication and registration validation.
- Access tokens remain in memory. Refresh and CSRF cookies are backend-managed; refresh is single-flight and replays a failed request once.
- Organization IDs scope routes and query keys. Membership roles drive navigation UX while backend authorization remains authoritative.
- V1 endpoint modules cover auth, profiles, organizations, resumes, jobs, applications, matching, interviews, notifications, AI, analytics and admin.
- Public, auth, candidate, organization/hiring-manager and admin pages are lazy-loaded into separate chunks.

## Candidate workflow

- Premium public landing, public jobs and public job detail
- Candidate registration, verification/resend, login, forgot/reset password
- Onboarding and professional profile
- Resume manager with PDF/DOCX validation, drag/drop, upload progress, version history, processing status, retry, download and deletion confirmation
- Structured extraction, ATS/readiness analysis and prioritized AI improvements
- Evidence-preserving rewrite lab with before/after approval and no automatic overwrite
- Job discovery, recommendations, saved jobs, explicit resume-version fit and apply
- Hybrid score, confidence, required/preferred gaps, experience/education/semantic evidence and limitations
- Job-specific resume tailoring through a dedicated backend endpoint
- Application list/detail/timeline/withdrawal
- Interview list, confirmation and preparation
- Career copilot with provider/fallback provenance
- Notifications, sessions, consent, data export and account deletion

## Recruiter and hiring-team workflow

- Organization-scoped attention dashboard with jobs, pipeline, interviews and recent applications
- Structured job editor, deterministic/LLM JD generation, JD improvement, bias warnings, human apply/reject and explicit publish
- Hiring-team assignment for hiring managers/interviewers
- Cursor-paginated applicant list with search, stage/tag filters, fit sorting, visible unscored states and bounded match refresh
- Candidate search by skill/location/experience
- Candidate detail with private resume preview/download, structured application history, hybrid match evidence, notes, tags, communication and transitions
- Side-by-side candidate comparison without an automatic winner
- Interview scheduling, question-kit generation and structured feedback
- Funnel, source, job, time-to-stage and separately labeled AI analytics
- Recruiter copilot with provenance and non-executing proposed actions
- Team membership management using the backend’s actual “existing registered user” semantics
- Hiring-manager assigned jobs, candidate review, comparison and feedback reuse the same tenant-safe components

## Admin workflow

- System attention/readiness
- User suspension
- Organization inspection list
- Organization-scoped AI usage without fabricated global totals
- Security events and audit logs

## Small backend compatibility additions

No hypothetical APIs were invented in the browser. The smallest server additions needed for requested production flows were implemented and documented:

- v1 saved-job list/save/unsave
- candidate interview list
- assigned-job list and hiring-team update
- job-specific resume tailoring
- structured `resume_rewrite` and `jd_generation` AI features
- candidate search returns related application IDs for authorized review navigation
- CSRF cookie path corrected so the browser can read and echo the double-submit token

## Accessibility and responsive behavior

- Skip link, route heading focus, visible focus states and reduced-motion support
- Responsive public header and dark desktop side rail/mobile drawer
- Card/list recruiter layouts rather than overflowing tables
- Accessible labels, validation, status text, progress, live feedback and score explanations
- Dialog focus trap and focus restoration
- Textual analytics rather than mouse-only chart dependence
- Mobile-first forms, grids and action layout

## Verification

Successful:

```bash
cd client && npm run lint
cd client && npm test
cd client && npm run build
cd server && npm run check
cd server && npm run lint
cd server && npm audit --omit=dev --audit-level=high
NODE_ENV=test node --test --test-concurrency=1 \
  server/test/app.test.js server/test/productionCore.test.js
```

- Frontend: 3 test files, 6 tests passed.
- Backend database-independent verification: 26 tests passed in the final focused run; the broader deterministic suite passed 50 tests earlier in the implementation.
- Client production build is code-split by public/auth/candidate/recruiter/system page groups.
- Vite live preview starts successfully on `0.0.0.0:5173`.

The complete backend `npm test` command was also run. This sandbox has no Docker or local `mongod`, and the MongoDB Memory Server binary download repeatedly fails with `ECONNRESET`; 52 database-independent tests pass and 19 database suites fail in setup hooks, not assertions. CI supplies MongoDB 7 directly and contains the complete v1 workflow tests, including the new saved-job, tailoring, candidate-interview and assigned-job paths.

## Remaining non-critical limitations

- External calendar provider connection remains backend integration work; core interview scheduling is functional.
- Team onboarding adds an already registered user because tokenized invitations are not a backend capability yet.
- Frontend tests cover the API boundary and explainable score components; Playwright browser journeys should be expanded in CI when a full test stack is available.
- Browser preview cannot exercise authenticated API workflows in this sandbox because MongoDB is unavailable; API contracts are covered by server workflow tests configured for CI’s isolated MongoDB service.
