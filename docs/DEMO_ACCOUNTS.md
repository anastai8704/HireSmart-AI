# HireSmart AI — Demo Accounts & Database Seeding

Demo accounts and seeding scripts exist for local evaluation, presentation, and testing. They are intended for local development environments only.

---

## 1. Demo User Accounts

| Role | Email | Assigned Organization / Plan | Notes |
| :--- | :--- | :--- | :--- |
| **Platform Admin** | `tofu1180@gmail.com` | Global Platform Governance | System administrator access across all workspaces. |
| **Recruiter (Lead)** | `2025mca150@gmail.com` | Apex Innovations (Enterprise) | Organization owner with active hiring pipeline and jobs. |
| **Recruiter** | `rohit.sharma@nexusbyte.com` | Nexus Byte Solutions (Growth) | Cloud systems firm with active requisitions. |
| **Recruiter** | `kavya.nair@zenithlabs.in` | Zenith Technologies (Starter) | Fintech engineering requisitions and candidates. |
| **Candidate (Lead)** | `tanastai5018@gmail.com` | Candidate Plus (₹149/mo) | Complete MERN profile, verified resume, applications, and scheduled interview. |
| **Candidate** | `priya.sharma@example.com` | Candidate Free | Frontend React Engineer with verified placement. |
| **Candidate** | `sneha.kulkarni@example.com` | Candidate Free | Site Reliability Engineer with active placement. |

### Password & Security Policy
- Existing user accounts store strong bcrypt-hashed passwords.
- Passwords are never logged, printed, or exposed in repository files.
- The platform refuses to run destructive seeding or resets in `production` (`NODE_ENV=production`).

---

## 2. Repeatable Seeding & Backup Commands

All commands are executed from the `server/` directory:

### Dry-Run Seeding Inspection (Safe & Non-Destructive)
Inspects the database, verifies active accounts and collection metrics without modifying any data:
```bash
npm run seed:fresh
```

### Full Safe Demo Reset & Fresh Seed
Automatically creates an EJSON verified backup of all 33 collections under `server/backups/`, clears obsolete application demo data, strictly preserves all existing user accounts/passwords, and inserts fresh interconnected data:
```bash
npm run seed:fresh:confirm
```

### Relational Integrity Check
Scans all foreign keys across users, organizations, jobs, applications, interviews, and placements to verify 0 orphaned references:
```bash
npm run seed:verify
```

### Standalone Database Backup
Creates an immediate, verified snapshot of all database collections in `server/backups/`:
```bash
npm run db:backup
```

---

## 3. Safety Rules
1. Never run reset or seed commands on a production or unknown database.
2. Backups are saved in `server/backups/` and are automatically git-ignored.
3. Seeding preserves platform configuration (`platformsettings`, `razorpayplans`, and existing `users`).
