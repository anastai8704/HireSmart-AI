// Admin analytics aggregations (Phase 5). Every number comes from a database aggregation over stored
// records; nothing is fetched per record into memory. Definitions live in domain/analyticsDefinitions.js.
const User = require("../models/User");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { Application } = require("../models/Application");
const Interview = require("../models/Interview");
const Placement = require("../models/Placement");
const Subscription = require("../models/Subscription");
const PaymentTransaction = require("../models/PaymentTransaction");
const {
  ANALYTICS_TIMEZONE,
  ratePercent,
  summarizeRevenue,
  METRIC_DEFINITIONS,
} = require("../domain/analyticsDefinitions");

const inRange = (field, range) => ({ [field]: { $gte: range.start, $lt: range.end } });
const dayOf = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: ANALYTICS_TIMEZONE } });

// Legacy→lifecycle mapping done inside MongoDB so counts never double-count one application.
const LEGACY_PAIRS = [
  ["Applied", "submitted"],
  ["Shortlisted", "shortlisted"],
  ["Interview", "interview"],
  ["Selected", "hired"],
  ["Rejected", "rejected"],
  ["Withdrawn", "withdrawn"],
];
const canonExpr = (expr) => ({
  $switch: {
    branches: LEGACY_PAIRS.map(([from, to]) => ({ case: { $eq: [expr, from] }, then: to })),
    default: expr,
  },
});
const HIRED_VALUES = ["hired", "Selected"];
const WITHDRAWN_VALUES = ["withdrawn", "Withdrawn"];

// Fill missing days with zero so every chart has one point per IST day in the range.
const fillDaily = (rows, range, field = "count") => {
  const byDay = new Map(rows.map((r) => [r._id, r[field] || 0]));
  return dayList(range).map((day) => ({ date: day, [field]: byDay.get(day) || 0 }));
};
const dayList = (range) => {
  const out = [];
  const [y, m, d] = range.fromDay.split("-").map(Number);
  for (let i = 0; i < range.days; i += 1) {
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  }
  return out;
};

const sumOf = (rows, key) => rows.reduce((acc, r) => acc + (r[key] || 0), 0);

async function computeAnalytics(range) {
  const dailyCount = (model, match, dateField) =>
    model.aggregate([
      { $match: { ...match, ...inRange(dateField, range) } },
      { $group: { _id: dayOf(`$${dateField}`), count: { $sum: 1 } } },
    ]);

  const [
    userCounts,
    candidateDaily,
    recruiterDaily,
    newCandidates,
    newRecruiters,
    orgStatusRows,
    fraudQueue,
    jobStatusRows,
    jobDaily,
    newJobs,
    cohortRows,
    applicationFacet,
    interviewsCreated,
    interviewDaily,
    offersIssued,
    hiredEvents,
    confirmedEmployment,
    paidActiveRows,
    paidSubDaily,
    paymentFacet,
    suspendedAccounts,
  ] = await Promise.all([
    User.aggregate([{ $match: { role: { $in: ["candidate", "recruiter"] } } }, { $group: { _id: "$role", count: { $sum: 1 } } }]),
    dailyCount(User, { role: "candidate" }, "createdAt"),
    dailyCount(User, { role: "recruiter" }, "createdAt"),
    User.countDocuments({ role: "candidate", ...inRange("createdAt", range) }),
    User.countDocuments({ role: "recruiter", ...inRange("createdAt", range) }),
    Organization.aggregate([{ $group: { _id: "$verificationStatus", count: { $sum: 1 } } }]),
    Organization.countDocuments({
      verificationStatus: { $in: ["pending", "under_review"] },
      "riskFlags.0": { $exists: true },
    }),
    Job.aggregate([{ $group: { _id: { status: "$status", moderation: "$moderation.status" }, count: { $sum: 1 } } }]),
    dailyCount(Job, {}, "createdAt"),
    Job.countDocuments(inRange("createdAt", range)),
    Application.aggregate([
      { $match: { ...inRange("appliedAt", range), status: { $nin: WITHDRAWN_VALUES } } },
      {
        $project: {
          appliedDay: dayOf("$appliedAt"),
          stages: {
            $setUnion: [
              [canonExpr("$status")],
              { $map: { input: { $ifNull: ["$statusHistory", []] }, as: "h", in: canonExpr("$$h.status") } },
            ],
          },
        },
      },
      {
        $facet: {
          totals: [{ $group: { _id: null, eligible: { $sum: 1 } } }],
          reached: [{ $unwind: "$stages" }, { $group: { _id: "$stages", count: { $sum: 1 } } }],
          daily: [{ $group: { _id: "$appliedDay", count: { $sum: 1 } } }],
        },
      },
    ]),
    Application.aggregate([
      {
        $facet: {
          // Current stage distribution for every application (as of now).
          currentStages: [{ $group: { _id: canonExpr("$status"), count: { $sum: 1 } } }],
          // Outcomes for applications submitted in the range.
          outcomes: [
            { $match: inRange("appliedAt", range) },
            { $group: { _id: canonExpr("$status"), count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    Interview.countDocuments({ status: { $ne: "cancelled" }, ...inRange("createdAt", range) }),
    dailyCount(Interview, { status: { $ne: "cancelled" } }, "createdAt"),
    Application.countDocuments(inRange("offer.issuedAt", range)),
    // Distinct applications that reached hired, by the day of their first hire entry in the range.
    Application.aggregate([
      { $unwind: "$statusHistory" },
      {
        $match: {
          "statusHistory.status": { $in: HIRED_VALUES },
          ...inRange("statusHistory.changedAt", range),
        },
      },
      { $group: { _id: "$_id", at: { $min: "$statusHistory.changedAt" } } },
      { $group: { _id: dayOf("$at"), count: { $sum: 1 } } },
    ]),
    Placement.countDocuments({ "verification.isVerified": true, ...inRange("verification.verifiedAt", range) }),
    Subscription.aggregate([
      { $match: { status: "active", priceInr: { $gt: 0 } } },
      { $group: { _id: "$subscriberType", count: { $sum: 1 } } },
    ]),
    dailyCount(Subscription, { priceInr: { $gt: 0 } }, "createdAt"),
    PaymentTransaction.aggregate([
      {
        $facet: {
          // Captured payments created in the range (refunded ones were captured first).
          capturedInRange: [
            { $match: { status: { $in: ["captured", "refunded"] }, ...inRange("createdAt", range) } },
            { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
          ],
          // Refunds processed in the range (last status update; see metric definition).
          refundsInRange: [
            { $match: { status: "refunded", ...inRange("updatedAt", range) } },
            { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
          ],
          failedInRange: [
            { $match: { status: "failed", ...inRange("createdAt", range) } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
          capturedDaily: [
            { $match: { status: { $in: ["captured", "refunded"] }, ...inRange("createdAt", range) } },
            { $group: { _id: dayOf("$createdAt"), amount: { $sum: "$amount" } } },
          ],
          refundsDaily: [
            { $match: { status: "refunded", ...inRange("updatedAt", range) } },
            { $group: { _id: dayOf("$updatedAt"), amount: { $sum: "$amount" } } },
          ],
          failedDaily: [
            { $match: { status: "failed", ...inRange("createdAt", range) } },
            { $group: { _id: dayOf("$createdAt"), count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    User.countDocuments({ accountStatus: "suspended" }),
  ]);

  const countBy = (rows, keyFn) => {
    const map = new Map();
    for (const row of rows) {
      const key = keyFn(row);
      map.set(key, (map.get(key) || 0) + row.count);
    }
    return map;
  };

  const roleCount = (role) => (userCounts.find((r) => r._id === role) || {}).count || 0;
  const orgCounts = countBy(orgStatusRows, (r) => r._id || "unknown");
  const companiesTotal = sumOf(orgStatusRows, "count");
  const companiesVerified = orgCounts.get("verified") || 0;
  const companiesAwaiting = (orgCounts.get("pending") || 0) + (orgCounts.get("under_review") || 0);

  const jobCountsByModeration = countBy(jobStatusRows, (r) => r._id.moderation || "none");
  const activeJobs = jobStatusRows
    .filter((r) => r._id.status === "published" && ["approved", "none"].includes(r._id.moderation))
    .reduce((acc, r) => acc + r.count, 0);

  const cohort = cohortRows[0] || {};
  const cohortTotals = (cohort.totals || [])[0] || { eligible: 0 };
  const reached = new Map((cohort.reached || []).map((r) => [r._id, r.count]));
  const hiredInCohort = reached.get("hired") || 0;
  const applicationsInRange = cohortTotals.eligible;

  const funnelOrder = ["submitted", "shortlisted", "interview", "offer", "hired"];
  const funnel = funnelOrder.map((stage) => ({
    stage,
    count: reached.get(stage) || 0,
  }));

  const facet = applicationFacet[0] || {};
  const currentStageRows = facet.currentStages || [];
  const outcomeRows = facet.outcomes || [];
  const stageDistribution = countBy(currentStageRows, (r) => r._id || "unknown");
  const outcomes = countBy(outcomeRows, (r) => r._id || "unknown");

  const revenueFacet = (paymentFacet[0] || {});
  const captured = (revenueFacet.capturedInRange || [])[0] || { amount: 0, count: 0 };
  const refunds = (revenueFacet.refundsInRange || [])[0] || { amount: 0, count: 0 };
  const failed = (revenueFacet.failedInRange || [])[0] || { count: 0 };
  const revenue = summarizeRevenue({
    grossCapturedAmount: captured.amount,
    refundsAmount: refunds.amount,
    successfulCount: captured.count,
    failedCount: failed.count,
  });

  const activePaidOrgs = (paidActiveRows.find((r) => r._id === "organization") || {}).count || 0;
  const activePaidCandidates = (paidActiveRows.find((r) => r._id === "candidate") || {}).count || 0;
  const activePaidTotal = activePaidOrgs + activePaidCandidates;

  const kpis = {
    candidatesTotal: roleCount("candidate"),
    candidatesNew: newCandidates,
    recruitersTotal: roleCount("recruiter"),
    recruitersNew: newRecruiters,
    companiesTotal,
    companiesVerified,
    companiesAwaitingVerification: companiesAwaiting,
    activeJobs,
    pendingJobApprovals: jobCountsByModeration.get("pending") || 0,
    jobPostings: newJobs,
    applications: applicationsInRange,
    interviewsScheduled: interviewsCreated,
    offersIssued,
    candidatesHired: hiredEvents.reduce((acc, r) => acc + r.count, 0),
    confirmedEmployment: confirmedEmployment,
    activePaidSubscriptions: activePaidTotal,
    subscriptionConversion: ratePercent(activePaidOrgs, companiesTotal),
    successfulPayments: revenue.successfulPayments,
    revenue: revenue.netRevenue,
    refunds: refunds.count,
    failedPayments: revenue.failedPayments,
    suspendedAccounts,
    fraudReviewQueue: fraudQueue,
    hiringConversion: ratePercent(hiredInCohort, cohortTotals.eligible),
  };

  const series = {
    candidateRegistrations: fillDaily(candidateDaily, range),
    recruiterRegistrations: fillDaily(recruiterDaily, range),
    jobPostings: fillDaily(jobDaily, range),
    applications: fillDaily(cohort.daily || [], range),
    interviews: fillDaily(interviewDaily, range),
    hires: fillDaily(hiredEvents, range),
    paidSubscriptionsStarted: fillDaily(paidSubDaily, range),
    grossCapturedRevenue: fillDaily(revenueFacet.capturedDaily || [], range, "amount"),
    refundsRevenue: fillDaily(revenueFacet.refundsDaily || [], range, "amount"),
    failedPayments: fillDaily(revenueFacet.failedDaily || [], range),
  };

  const pick = (map, keys, labels) =>
    keys.map((key) => ({ key, label: labels[key] || key, count: map.get(key) || 0 }));

  const applicationStageLabels = {
    submitted: "Applied",
    under_review: "Screening",
    shortlisted: "Shortlisted",
    interview: "Interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Not selected",
    withdrawn: "Withdrawn",
    closed: "Closed",
  };
  const verificationLabels = { pending: "Pending", under_review: "Under review", verified: "Verified", rejected: "Rejected", suspended: "Suspended" };
  const moderationLabels = { none: "No review needed", pending: "Pending", approved: "Approved", rejected: "Rejected", changes_requested: "Changes requested", suspended: "Suspended" };

  const breakdowns = {
    funnel,
    stageDistribution: pick(stageDistribution, Object.keys(applicationStageLabels), applicationStageLabels).filter((r) => r.count > 0),
    hiringOutcomes: pick(outcomes, ["hired", "rejected", "withdrawn"], applicationStageLabels),
    companyVerification: pick(orgCounts, Object.keys(verificationLabels), verificationLabels),
    jobApproval: pick(jobCountsByModeration, Object.keys(moderationLabels), moderationLabels),
  };

  return {
    kpis,
    series,
    breakdowns,
    definitions: METRIC_DEFINITIONS,
    notes: {
      timezone: ANALYTICS_TIMEZONE,
      unavailable: {
        confirmedEmployment: "Shown from platform-verified placements only. Candidate and company reports are not counted.",
      },
    },
  };
}

module.exports = { computeAnalytics, fillDaily, dayList };
