const JobAlert = require("../models/JobAlert");
const Job = require("../models/Job");
const User = require("../models/User");
const { buildPublicJobFilter } = require("../utils/jobFilters");
const { notify } = require("./notificationService");
const logger = require("../utils/logger");

const DUE = (now) => ({
  active: true,
  $or: [
    { lastRunAt: null },
    { cadence: "daily", lastRunAt: { $lt: new Date(now.getTime() - 24 * 3600 * 1000) } },
    { cadence: "weekly", lastRunAt: { $lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  ],
});

const trimDelivered = (ids) => ids.slice(-100);

const runAlert = async (alert) => {
  const { filter } = await buildPublicJobFilter({
    query: alert.query,
    location: alert.location,
    workplaceMode: alert.workplaceMode,
    jobType: alert.jobType,
    minSalary: alert.minSalary,
    maxExp: alert.maxExp,
    skills: (alert.skills || []).join(","),
    industry: alert.industry,
  });
  // 1-hour overlap window so jobs created just before the last run are not skipped.
  const since = alert.lastRunAt
    ? new Date(alert.lastRunAt.getTime() - 3600 * 1000)
    : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const jobs = await Job.find({ ...filter, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("_id title company location");
  const delivered = new Set(alert.deliveredJobIds || []);
  const fresh = jobs.filter((job) => !delivered.has(String(job._id))).slice(0, 20);
  if (!fresh.length) return 0;
  const user = alert._userByEmail || (await User.findById(alert.user).select("email").lean());
  for (const job of fresh) {
    try {
      await notify({
        user: alert.user,
        type: "job_alert",
        title: `New job match: ${job.title}`,
        message: `${job.title} at ${job.company} (${job.location}) matches your alert “${alert.name}”.`,
        resourceType: "job",
        resourceId: job._id,
        email: user?.email || null,
        idempotencyKey: `alert:${alert._id}:${job._id}`,
      });
    } catch (error) {
      logger.error(
        `Job alert ${alert._id} -> job ${job._id} notification failed: ${error.code || error.message}`,
      );
    }
  }
  await JobAlert.updateOne(
    { _id: alert._id },
    {
      $set: {
        deliveredJobIds: trimDelivered([
          ...(alert.deliveredJobIds || []),
          ...fresh.map((job) => String(job._id)),
        ]),
      },
    },
  );
  return fresh.length;
};

let scanning = false;
let lastTick = 0;

/** Run the alert scan (idempotent: each alert is claimed atomically). */
const runAlertScan = async () => {
  if (scanning) return { scanned: 0, delivered: 0 };
  scanning = true;
  let scanned = 0;
  let delivered = 0;
  try {
    const now = new Date();
    const due = await JobAlert.find(DUE(now)).limit(500);
    const users = await User.find({ _id: { $in: due.map((a) => a.user) } })
      .select("_id email")
      .lean();
    const usersById = new Map(users.map((u) => [String(u._id), u]));
    for (const alert of due) {
      const claimed = await JobAlert.findOneAndUpdate(
        { _id: alert._id, ...DUE(now) },
        { $set: { lastRunAt: now } },
        { returnDocument: "after" },
      );
      if (!claimed) continue;
      scanned += 1;
      claimed._userByEmail = usersById.get(String(alert.user)) || null;
      delivered += await runAlert(claimed);
    }
  } finally {
    scanning = false;
  }
  if (scanned)
    logger.info(
      `Alert scan complete: ${scanned} alerts scanned, ${delivered} job matches delivered`,
    );
  return { scanned, delivered };
};

/** Throttled tick for worker/api processes — at most one scan per 60s. */
const tickAlertScan = async () => {
  const now = Date.now();
  if (now - lastTick < 60000) return { skipped: true };
  lastTick = now;
  return runAlertScan();
};

module.exports = { runAlertScan, tickAlertScan, runAlert };
