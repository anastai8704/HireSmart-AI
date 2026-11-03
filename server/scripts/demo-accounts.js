/**
 * Demo Accounts & Presentation Dataset Setup (Idempotent, Safe, Non-Destructive).
 *
 * Runs the complete MCA project demonstration dataset containing:
 *  - Primary Candidate: Anas Tai (tanastai5018@gmail.com / hiresmart8704)
 *  - Primary Recruiter: 2025mca150@gmail.com / hiresmart8704
 *  - Platform Admin: Preserves existing admin account
 *  - Complete connected world with 8 candidates, 5 companies, 12 jobs, 22 applications,
 *    interviews, notes, hybrid matches, AI analysis metrics, and notifications.
 *
 * Usage:
 *   cd server && npm run demo
 */

const { seedPresentationData } = require("./seed-presentation-demo");

seedPresentationData().catch((error) => {
  console.error("Demo setup failed:", error.message);
  process.exitCode = 1;
});
