// Operational queues for the admin control center (Requirement 7). Every count is a live DB count supplied by
// the overview endpoint. A missing count stays null ("no data"), never 0.
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined && v !== "" ? Number(v) : null);

const sumOrNull = (...values) => {
  const present = values.map(num).filter((v) => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
};

/**
 * @param {object} stats  overview payload from GET /admin/analytics/overview
 * @returns {Array<{key:string,label:string,hint:string,count:number|null,to:string,tone:"warning"|"neutral"}>}
 */
export const buildQueues = (stats) => {
  const companies = stats?.companies || {};
  const jobs = stats?.jobs || {};
  const kpis = stats?.kpis || {};
  const queues = stats?.queues || {};
  const users = stats?.users || {};

  const rows = [
    {
      key: "jobApprovals",
      label: "Job approvals",
      hint: "Postings waiting for moderation",
      count: num(jobs.pending),
      to: "/app/admin/moderation",
    },
    {
      key: "companyVerification",
      label: "Company verification",
      hint: "Pending or under review",
      count: sumOrNull(companies.pending, companies.underReview),
      to: "/app/admin/verification",
    },
    {
      key: "fraudRisk",
      label: "Fraud-risk review",
      hint: "Companies with open risk flags",
      count: num(kpis.fraudReviewQueue),
      to: "/app/admin/verification",
    },
    {
      key: "placementVerification",
      label: "Placements to verify",
      hint: "Joinings confirmed, not yet platform-verified",
      count: num(queues.placementsAwaitingVerification),
      to: "/app/admin/placements",
    },
    {
      key: "pastDue",
      label: "Subscriptions past due",
      hint: "Renewal payment did not go through",
      count: num(queues.subscriptionsPastDue),
      to: "/app/admin/subscriptions",
    },
    {
      key: "failedPayments",
      label: "Failed payments",
      hint: "In the selected date range",
      count: num(kpis.failedPayments),
      to: "/app/admin/revenue",
    },
    {
      key: "suspended",
      label: "Suspended accounts",
      hint: "Accounts currently suspended",
      count: num(users.suspended),
      to: "/app/admin/users",
    },
  ];

  return rows.map((row) => ({ ...row, tone: row.count > 0 ? "warning" : "neutral" }));
};
