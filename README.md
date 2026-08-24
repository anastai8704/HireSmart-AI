# HireSmart AI

[![CI](https://github.com/anastai8704/HireSmart-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/anastai8704/HireSmart-AI/actions/workflows/ci.yml)

**AI-Powered Applicant Tracking System + Resume Analyzer**

Scores any resume against any job with an **explainable** matching engine, ranks
applicants automatically for recruiters, and tells candidates exactly what to fix.

```
Automated test suite   ·   Stack: React · Node.js · Express · MongoDB · Tailwind CSS
```

---

## The problem

Over 90% of large employers filter resumes through software before a human reads them.

- **Candidates** apply to a hundred jobs, hear nothing back, and never learn *why*.
- **Recruiters** receive 300 resumes for one role and read them in arrival order, so
  the best candidate might be number 187.

## What this does

| For candidates | For recruiters |
|---|---|
| ATS score with a letter grade and prioritised, actionable fixes | Every applicant scored and ranked automatically |
| Personalised job recommendations ranked by real fit | A "why this score?" breakdown on every candidate |
| Pre-apply gap analysis — see missing skills *before* applying | Pipeline management with private notes |
| One-click apply and full application tracking | Funnel analytics and conversion rates |

### The design principle

> **Every number the AI produces is explainable.**

A bare "72% match" invites the question *"says who?"*. So wherever a score appears, so
does the breakdown: the four weighted components, the matched and missing skills, and
plain-English reasons.

---

## The AI, briefly

**Matching engine** (`server/services/resumeMatchingService.js`) — a weighted blend of
four independently-measured components:

| Component | Weight | Method |
|---|---|---|
| Skill match | 55% | Normalised skill matching with synonyms and stemming |
| Semantic relevance | 25% | TF-IDF vectorisation + cosine similarity |
| Experience | 15% | Years extracted from text vs. requirement |
| Education | 5% | Qualification signal detection |

Components that can't be measured are excluded and the remaining weights re-normalised,
so a job with no stated experience requirement doesn't cap everyone at 85%.

**Resume analyzer** (`server/services/resumeAnalyzerService.js`) — grades a resume
across 6 weighted ATS checks (contact parsing, section detection, skill coverage,
quantified achievements, writing quality, length) and returns prioritised fixes.

Both are **pure, dependency-free functions**: no database, no network, no API key.
They always work, and they unit-test in milliseconds.

---


## Production frontend

The React client now runs entirely on the versioned `/api/v1` contract. It uses an in-memory access token with rotating refresh/CSRF cookies, organization-aware workspaces, TanStack Query caching, accessible responsive navigation, versioned resume processing, explainable hybrid matching, structured AI copilots, application/interview workflows, notifications, analytics, and platform administration. Frontend checks are `cd client && npm run lint && npm test && npm run build`.

## Production API v1

The backend now exposes a versioned `/api/v1` contract with rotating sessions, organizations and memberships, versioned resume processing, structured jobs/applications, hybrid explainable matching, interviews, notifications, analytics, audit/security events, configurable AI providers, and a separate background worker. The original `/api` contract remains available for the current frontend. See [docs/backend-api.md](docs/backend-api.md).

## Quick start

### Option A — Docker (one command, nothing else to install)

```bash
docker compose up --build
```

Open <http://localhost:8080>. This builds the API, the frontend and MongoDB, wires them
together and starts everything. Seed the demo data with:

```bash
docker compose exec api npm run seed
```

### Option B — Run locally

**Prerequisites:** Node.js 18+ and MongoDB (local, or a free
[Atlas](https://www.mongodb.com/atlas) cluster).

**Fastest path** — installs both apps and creates `server/.env` with a generated
secret:

```powershell
.\setup.ps1          # Windows PowerShell
```

```bash
./setup.sh           # macOS / Linux
```

Or do it manually:

```bash
# 1. Backend
cd server
cp .env.example .env          # then edit MONGO_URI and JWT_SECRET
npm install
npm run seed                  # demo data: 5 users, 6 jobs, 6 applications
npm run dev                   # → http://localhost:5000

# 2. Frontend (in a second terminal)
cd client
npm install
npm run dev                   # → http://localhost:5173
```

> Generate a real JWT secret with:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Candidate | `anastai.candidate@hiresmart.ai` | `Password@123` |
| Recruiter | `alexander.recruiter@hiresmart.ai` | `Password@123` |

The login page has one-click buttons for both. You can also try the resume analyzer
with **no account at all** at `/resume-check`.

---

> **After any `git pull` that changes `package.json`, run `npm install` again**
> (or re-run the setup script). Git does not track `node_modules`, so new
> dependencies are not downloaded automatically. Skipping this produces
> `Failed to resolve import "react-router-dom" ... Are they installed?`

### Troubleshooting

**`MongoDB Connection Failed: querySrv ECONNREFUSED _mongodb._tcp....`**

`mongodb+srv://` URIs require a DNS SRV lookup on port 53, and some networks
(corporate firewalls, restricted VMs) block it. `server/config/db.js`
repairs this automatically:

1. It first retries with public resolvers (`1.1.1.1`, `8.8.8.8`) in case the
   local resolver configuration is simply broken.
2. If DNS is blocked outright, it re-resolves the cluster over
   DNS-over-HTTPS (Cloudflare, then Google — plain HTTPS, which such
   networks almost always allow) and connects to the shard hosts directly,
   with full TLS certificate verification.

If you see `Falling back to DNS-over-HTTPS resolution...` in the log and the
connection still fails, check that HTTPS to `cloudflare-dns.com` (or
`dns.google`) works on your network and that the cluster's IP allow list
includes your machine.

To verify the recovery works on your own machine (it safely reproduces the
DNS failure against your real cluster, then proves the connection):

```bash
cd server
npm run probe               # stage 1: public-resolver retry
SCENARIO=stage3 npm run probe   # stage 2: force the DNS-over-HTTPS path
```

Exit code 0 means the connection recovered.

## Documentation

| Document | What's in it |
|---|---|
| **[docs/LEARN.md](docs/LEARN.md)** | Complete walkthrough from zero — how web apps work, every layer of this one, the AI explained, security, testing |
| **[docs/VIVA.md](docs/VIVA.md)** | Examiner and interview questions with model answers |
| **[docs/RESUME.md](docs/RESUME.md)** | Resume bullets, LinkedIn wording, STAR interview stories |
| **[docs/ci/](docs/ci/)** | GitHub Actions pipeline and how to activate it |
| **[docs/backend-api.md](docs/backend-api.md)** | Full REST API reference |

---

## Project structure

```
server/                    Backend — Node.js + Express + MongoDB
├── config/                Environment validation, database connection
├── controllers/           Business logic per endpoint
├── middleware/            Auth, error handling, uploads, logging
├── models/                Mongoose schemas
├── routes/                URL → controller mapping
├── services/              ★ AI engine, storage, email
├── validators/            Input validation
└── test/                  Unit, security and API workflow tests

client/                    Frontend — React + Vite + Tailwind CSS v4
└── src/
    ├── components/ui/     Design system (Button, Card, Modal, ScoreRing...)
    ├── components/ai/     Score visualisation
    ├── pages/             One file per screen
    ├── context/           Global auth state
    ├── hooks/             useFetch, useMutation, useDebouncedValue
    └── lib/               API client and helpers
```

---

## Commands

| Command | Directory | Purpose |
|---|---|---|
| `npm run dev` | server | API with auto-restart |
| `npm test` | server | Run backend unit and integration tests |
| `npm run seed` | server | Reset database with demo data |
| `npm run bootstrap:admin` | server | Create the first admin |
| `npm run dev` | client | React dev server |
| `npm run build` | client | Production build |
| `npm run lint` | client | Code quality check |

---

## Security

| Defence | Against |
|---|---|
| bcrypt password hashing | Database theft exposing credentials |
| JWT with signature verification | Forged or tampered tokens |
| Server-side RBAC + ownership checks | Privilege escalation, cross-tenant data access |
| `express-mongo-sanitize` | NoSQL injection (`{"email": {"$gt": ""}}`) |
| Rate limiting | Brute-force password attacks |
| Authenticated-only file routes | Public exposure of private resumes |
| Helmet, HPP, CORS allowlist | Common HTTP-level attacks |

Route guards in React are **UX only** — all enforcement is server-side.

---

## Testing and CI

```bash
cd server && npm test
# runs unit and isolated-database integration tests
```

Unit tests cover the AI engine as pure functions. Integration tests run real HTTP
requests through Express against an in-memory MongoDB, with a safety guard that
refuses to run if the connection string ever points at production.

A GitHub Actions pipeline is included in [`docs/ci/`](docs/ci/) (one manual copy step to
activate — see that folder). It runs backend tests against a
real MongoDB service container, plus frontend lint and a production build.

---

## Team

- **Anas** — Project Lead
- Member 2 — Developer
- Member 3 — Developer
- Member 4 — Developer

Built as an MCA Semester 3 project.
