# HireSmart AI

HireSmart AI is a recruitment platform with three kinds of user: **candidates** who build profiles, upload resumes and
apply for jobs; **recruiters** who work for a verified company, post jobs and run a hiring pipeline; and **platform
administrators** who verify companies, moderate job posts, manage subscriptions and read reports.

> Status: feature-complete for a test-mode launch candidate. Live payments are not enabled. See
> [Current limitations](#current-limitations) before any production use.

## Main features

- **Candidates:** profile, versioned resume upload with text extraction, job search and recommendations, fit scoring
  against a job, saved jobs, applications, offer responses and joining confirmation.
- **Recruiters and companies:** organisation with team members and permissions, company verification, job drafting
  and moderation, candidate pipeline (stages, notes, interviews, offers), employment tracking, company analytics.
- **Platform administration:** company verification review, job moderation (approve, reject, request changes,
  suspend), user management, audit log and security event viewer, analytics dashboard.
- **Billing:** plans and subscriptions with usage limits. Payments run through Razorpay **Test Mode** only.
- **Notifications:** in-app notifications and e-mail for the main hiring and billing events, with per-user preferences.
- **Reports:** authorised CSV exports for platform and company data, with formula-injection protection
  (see [docs/REPORTS.md](docs/REPORTS.md)).
- **Security:** rotating refresh sessions, CSRF protection on refresh, role and tenant checks on every route, redacted
  audit logs, rate limiting (see [docs/SECURITY.md](docs/SECURITY.md)).

## Technology stack

| Layer | What is used |
| --- | --- |
| Backend | Node.js 20 (Docker image) / 22 (CI), Express 5, Mongoose 9, MongoDB 7 |
| Auth | JWT access tokens, rotating refresh sessions in an httpOnly cookie, bcrypt password hashing |
| Files | Local disk in development, S3-compatible storage in production (`@aws-sdk/client-s3`), multer uploads, pdf-parse and mammoth for resume text |
| Background work | A job queue in the database, processed by `server/worker.js` (or inline in tests and development) |
| E-mail | nodemailer over SMTP. Mailpit in Docker Compose for local testing |
| Payments | Razorpay SDK, Test Mode subscriptions and webhooks |
| Frontend | React 19, React Router 7, TanStack Query, Vite 8, Tailwind CSS 4, Recharts, Vitest |
| Delivery | Docker (Node API image, Nginx static web image), Docker Compose, GitHub Actions CI |

## Architecture overview

```
Browser (React SPA)
   │  /api/v1 (same origin in Docker via Nginx; Vite proxy in development)
   ▼
Express API (server/app.js → routes/v1Routes.js)
   │  middleware: auth, org/permission checks, validation, rate limits
   ▼
controllers → services (business rules) → domain (pure rules) → models (Mongoose) → MongoDB
   │
   ├─ queued work (e-mail, notifications, recurring billing) → worker.js
   └─ files → storage service (local or S3)
```

- Controllers stay thin. Business rules live in `services/` and pure calculations in `domain/`, so they can be unit
  tested without a database.
- Every organisation route takes the organisation id from the path and checks membership and permission on each
  request. Platform admin routes sit behind one guard.
- Responses use a `data` envelope and a stable error `code`. See [docs/backend-api.md](docs/backend-api.md).

## Folder structure

```
HireSmart-AI/
├── client/                 React single-page app (Vite)
│   └── src/
│       ├── pages/          Screens by area: admin, auth, candidate, recruiter, public
│       ├── components/     Reusable UI: ui, layout, hiring, admin, brand
│       ├── lib/            API client, date ranges, formatting, safe URL helpers
│       ├── context/        Session and app-wide state
│       ├── hooks/          Shared React hooks
│       └── security/       Route guards for each role
├── server/                 Express API and worker
│   ├── app.js              Express app: security middleware, /api/v1 mount, error handler
│   ├── server.js           Starts the HTTP server and connects to MongoDB
│   ├── worker.js           Background worker: queue, alerts, recommendations, notices
│   ├── config/             Environment loading and validation, plans, notification catalogue
│   ├── constants/          Shared enums and fixed values
│   ├── controllers/        HTTP handlers (v1* files) for each area
│   ├── domain/             Pure business rules (state machines, analytics definitions)
│   ├── middleware/         Authentication, organisation checks, validation, uploads, errors
│   ├── models/             Mongoose schemas
│   ├── routes/v1Routes.js  Every /api/v1 route and its access rule
│   ├── services/           Business logic, integrations (email, storage, payments, AI)
│   ├── scripts/            Admin bootstrap, seeding, index creation, migrations
│   ├── test/               Node test suites (database suites run in CI)
│   └── utils/              Helpers: pagination, redaction, logging, validation
├── docs/                   Project documentation (see the index below)
├── .github/workflows/      CI pipeline
├── docker-compose.yml      Local stack: MongoDB, API, worker, Mailpit, web
├── setup.sh / setup.ps1    Dependency install helpers for macOS/Linux and Windows
└── README.md
```

## Prerequisites

- Node.js 20 or newer (CI uses 22). npm comes with Node.
- MongoDB 7 for local development (or Docker, see below).
- Git.
- Docker and Docker Compose, optional, for the full stack in containers.

## Installation

```bash
git clone https://github.com/anastai8704/HireSmart-AI.git
cd HireSmart-AI
cd server && npm ci && cd ..
cd client && npm ci && cd ..
```

`setup.sh` (macOS/Linux) and `setup.ps1` (Windows) run the same installs and print the next steps.

## Environment configuration

1. Copy the example file: `cp server/.env.example server/.env`.
2. Set at least `MONGO_URI` and a random `JWT_SECRET` (32+ characters).
3. Leave payments disabled (`PAYMENT_MODE=disabled`) unless you are working on billing in test mode.

Every variable, its default and its production rules are listed in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
Never commit `server/.env`. It is git-ignored.

## Database setup

Start MongoDB locally (for example `mongod --dbpath ./data`), or run `docker compose up mongo`.

```bash
cd server
npm run indexes:create   # creates indexes (only runs fully when CI=true; otherwise it is a no-op)
npm run bootstrap:admin  # needs ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD in the environment
```

For demo data in a **local or test** database only: `npm run seed`. It deletes every collection first and refuses to
run when `NODE_ENV=production`. `npm run seed:demo` loads the presentation dataset.

Migrations (`npm run migrate:v1`, `npm run migrate:applications`) are not run automatically. Read the script first and
run it against a restored copy before any real data is changed.

## Development commands

```bash
# Terminal 1: API (http://localhost:5000)
cd server && npm run dev

# Terminal 2: worker (only if PROCESS_JOBS_INLINE is not true)
cd server && npm run worker

# Terminal 3: web app (http://localhost:5173; /api is proxied to port 5000)
cd client && npm run dev
```

Root shortcuts: `npm run dev:server`, `npm run dev:client`.

## Testing commands

```bash
cd server
npm run check            # syntax check of server files
node --test test/*.unit.test.js   # unit suites, no database needed
npm run lint
npm test                 # all suites; database suites need MongoDB (CI provides it)

cd ../client
npx vitest run           # component and unit tests
npm run lint
```

Database-backed suites cannot run without MongoDB. CI runs them with a MongoDB 7 service. The suite inventory and
coverage map are in [docs/TESTING.md](docs/TESTING.md). There is no browser end-to-end suite yet.

## Build commands

```bash
cd client && npm run build      # static files in client/dist
cd client && npm run preview    # serve the built files locally
```

The API has no build step. Start it with `npm start` in `server/`.

## Docker

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
docker compose up --build
```

| Service | Address | Purpose |
| --- | --- | --- |
| `web` | http://localhost:8080 | React build served by Nginx, which forwards `/api` to the API |
| `api` | internal (port 5000) | Express API. Health: `/api/v1/health/ready` |
| `worker` | internal | Background jobs |
| `mongo` | internal | MongoDB 7 with a named volume |
| `mailpit` | http://localhost:8025 | Captures outgoing e-mail for inspection |

Uploaded resumes are stored in the `resume-uploads` volume. Compose does not set `PAYMENT_MODE`, so payments stay
disabled by default.

## Payment setup (Razorpay Test Mode)

Billing is implemented for Razorpay **Test Mode** only. Live keys are refused at startup.

1. Create a Razorpay account and switch the dashboard to Test Mode.
2. Set `PAYMENT_MODE=razorpay_test`, `RAZORPAY_KEY_ID` (`rzp_test_…`), `RAZORPAY_KEY_SECRET`, and
   `RAZORPAY_WEBHOOK_SECRET` (16+ characters).
3. Expose the API to Razorpay (for example with a tunnel) and register the webhook at
   `POST /api/v1/payments/webhooks/razorpay` with the same secret. Subscribe to the events listed in
   `server/.env.example`.

Plans are defined in `server/config/subscriptionPlans.js`. Yearly prices are not set (`yearlyPriceInr: null`) until
pricing is finalised, so only monthly billing is offered. Details: [docs/PAYMENTS.md](docs/PAYMENTS.md).

## Email setup

E-mail is sent over SMTP when `SMTP_HOST` is set. Docker Compose includes Mailpit: the API container uses
`SMTP_HOST=mailpit`, `SMTP_PORT=1025`, and the messages are readable at http://localhost:8025. Mailpit's SMTP port is
not published to the host, so an API run directly on your machine needs its own SMTP server (or a Mailpit container
with port 1025 published). Production requires `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS`.

## Test accounts

Create a local admin with `npm run bootstrap:admin`, and create a candidate and a recruiter through the sign-up screens.
`npm run seed` creates demo users and sets a default admin password (`Password@123`) unless `ADMIN_PASSWORD` is set.
Use seeded data only in a local or test database, and never with a password you use elsewhere.

## Deployment considerations

- Run the API and the worker as separate processes, both with the same `MONGO_URI` and `JWT_SECRET`.
- Serve the built web app and the API under one origin (or set `CORS_ORIGIN` and `CLIENT_URL` correctly).
- Use HTTPS. Production requires `COOKIE_SECURE=true`.
- Use S3-compatible storage (`STORAGE_PROVIDER=s3`) and a malware scanning endpoint (`MALWARE_SCANNER_URL`). See
  the limitations below.
- Create indexes once per deployment (`npm run indexes:create` with `CI=true`, or from your migration process).
- The Docker API image runs `node server.js` and has a health check on `/api/v1/health/ready`.

## Troubleshooting

- **The server exits at startup with a message about an environment variable.** Production has stricter rules. Check
  the list in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
- **`MongoServerError` or connection refused.** Check that MongoDB is running and that `MONGO_URI` matches it. In
  Docker, use the service name `mongo`, not `localhost`.
- **The web app shows network errors in development.** Start the API on port 5000 first. The Vite dev server proxies
  `/api` to it.
- **Login says 429 `RATE_LIMITED`.** Wait for the window to pass. Limits are per account and per IP.
- **Uploads are rejected.** Only the supported resume and image types are accepted. Avatar uploads are also checked
  against the file's content signature, not only its extension.
- **Background e-mails or notifications never arrive.** Make sure the worker is running, or that
  `PROCESS_JOBS_INLINE=true` is set in development.
- **Tests that need a database fail locally.** Those suites run in CI. Use `node --test test/*.unit.test.js` locally.

## Security notes

- Passwords are hashed with bcrypt. Login has per-account and per-IP throttling. Refresh tokens rotate, and reuse of a
  rotated token revokes the session family.
- Every organisation and admin route is checked on the server. Non-members and non-admins get 404 so that existence is
  not revealed.
- Audit logs and security events redact secrets and tokens. They never store passwords or payment secrets.
- Report exports protect against spreadsheet formula injection and contain no candidate names or e-mail addresses.
- Dependency audit: `npm audit --omit=dev` reports no known vulnerabilities at the time of the last run.
- Read [docs/SECURITY.md](docs/SECURITY.md) for the full list of controls and accepted trade-offs.

## Current limitations

- **Payments:** Razorpay Test Mode only. Live mode is not enabled. Yearly prices are not set. Dismissing a hosted
  Checkout cancels the local record only, so the provider subscription stays in `created` until it expires. See
  [docs/PAYMENTS.md](docs/PAYMENTS.md).
- **Invoices:** PDF invoice generation is pending.
- **Malware scanning:** the scanner integration exists, but a production scanner is not provisioned here.
- **Data retention:** the retention and hard-delete policy is deferred. Current protections are documented in
  [docs/SECURITY.md](docs/SECURITY.md) and must be decided before launch.
- **Browser end-to-end tests:** not implemented. Workflows are covered at API and unit level
  ([docs/TESTING.md](docs/TESTING.md)).
- **Reports:** exports run synchronously with a 10,000-row cap. PDF reports are not provided.
- **Development CORS:** when `CORS_ORIGIN` is empty in development, any origin is reflected. Production requires an
  explicit list.
- **Migrations and external integrations** (Razorpay webhook from a deployed URL, real SMTP provider, S3 bucket) have
  not been verified end to end in this repository.

## Production-launch checklist

- [ ] Strong random `JWT_SECRET` (32+ characters) stored in a secrets manager.
- [ ] `NODE_ENV=production`; startup checks pass.
- [ ] HTTPS everywhere; `COOKIE_SECURE=true`; `CORS_ORIGIN` set to the web origin only.
- [ ] S3 bucket with private access; `STORAGE_PROVIDER=s3`; malware scanner endpoint reachable.
- [ ] SMTP provider configured; sender domain authenticated (SPF, DKIM).
- [ ] MongoDB backups, restore tested, and access restricted to the API and worker.
- [ ] Indexes created; migrations reviewed and run against a restored copy first.
- [ ] Data-retention and hard-delete policy decided and documented ([docs/SECURITY.md](docs/SECURITY.md)).
- [ ] Razorpay: decision on live mode, final plan prices, webhook URL verified in Test Mode end to end.
- [ ] Admin account created with a unique password; seed scripts not run against production.
- [ ] Logs reviewed for redaction; error monitoring configured.
- [ ] `npm audit --omit=dev` clean in `server/` and `client/`; CI green on the release commit.
- [ ] Legal pages and privacy notice reviewed for the launch jurisdiction.

## Documentation index

| Document | What it covers |
| --- | --- |
| [docs/backend-api.md](docs/backend-api.md) | API conventions and every route with its access rule |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Environment variables, defaults and production rules |
| [docs/SECURITY.md](docs/SECURITY.md) | Security controls, accepted trade-offs and open items |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Billing modes, Razorpay Test Mode setup and webhooks |
| [docs/REPORTS.md](docs/REPORTS.md) | Report catalogue, CSV rules and export limits |
| [docs/ANALYTICS.md](docs/ANALYTICS.md) | Dashboard metrics and date rules |
| [docs/TESTING.md](docs/TESTING.md) | Test suites, classification and coverage gaps |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | Data model and status lifecycles |
| [docs/CANDIDATE_PIPELINE.md](docs/CANDIDATE_PIPELINE.md) | Applications, stages, interviews and offers |
| [docs/COMPANY_VERIFICATION.md](docs/COMPANY_VERIFICATION.md) | Company verification rules |
| [docs/JOB_MODERATION.md](docs/JOB_MODERATION.md) | Job moderation states and decisions |
| [docs/RESUME.md](docs/RESUME.md) | Resume processing and fit scoring |

Some files in `docs/` are planning, study or presentation material (for example `LEARN.md`, `VIVA.md`,
`marketplace-blueprint.md`, `PROJECT_AUDIT.md`). They describe history and intent, not the current API.
