# Demo accounts

Demo accounts exist for presentations and local testing. They are development data, not real users.

| Role | Email | Plan (source) |
|---|---|---|
| Admin | `tofu1180@gmail.com` (override with `DEMO_ADMIN_EMAIL`) | Platform admin access (no billing plan needed) |
| Recruiter | `2025mca150@gmail.com` | Enterprise (`source=demo_seed`, `isDemo=true`) |
| Candidate | `tanastai5018@gmail.com` | Career Plus (`source=demo_seed`, `isDemo=true`) |

## Passwords

- The password is supplied only through `DEMO_PASSWORD` in `server/.env` (minimum 12 characters).
- It is never written in code or in these docs. Passwords are bcrypt-hashed before storage and are never printed.

## Seeding (idempotent)

```powershell
cd server
npm run seed:demo
```

Running the seed again updates the demo records in place (upserts). It does not duplicate accounts.

## Resetting (development only)

`npm run demo:reset` clears the target database. It refuses to run unless all of these hold:

1. `NODE_ENV` is not `production`.
2. The `--confirm-reset` flag is passed.
3. `DEMO_RESET_DATABASE` is set to the exact name of the database that is connected.
4. A backup of every collection is written and verified before anything is deleted (under `server/backups/`).

It is never run at server startup. Only run it against a disposable local database.

```powershell
$env:DEMO_RESET_DATABASE="hiresmart_dev"
cd server
npm run demo:reset -- --confirm-reset
```

## Payments

Demo subscriptions are complimentary grants. They have no `PaymentTransaction` records, create no Razorpay transactions, and add no revenue. Revenue reports only count captured Razorpay records.

## Status

- Seed and reset logic: code-reviewed and unit-tested for the policy checks (`demoResetPolicy`).
- Running the seed against a real database and signing in with each account: NOT VERIFIED in this sandbox (no MongoDB available here). Verify in CI or on a local disposable database.
