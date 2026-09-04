const JobRun = require("../models/JobRun");
const { config } = require("../config/env");
const logger = require("../utils/logger");

const handlers = {
  "resume.process": async (payload) => {
    const { processVersion } = require("./resumeProcessingService");
    const version = await processVersion(payload.resumeVersionId);
    return { resumeVersionId: version._id, status: version.processingStatus };
  },
  "recommendations.refresh": async (payload) => {
    const { refreshSnapshot } = require("./recommendationSnapshotService");
    return refreshSnapshot(payload.userId);
  },
  "notification.email": async (payload) => {
    const Notification = require("../models/Notification");
    const { sendMail } = require("./emailService");
    const notification = await Notification.findById(payload.notificationId);
    if (!notification || notification.delivery.email === "sent") return { skipped: true };
    try {
      const result = await sendMail({
        to: payload.to,
        subject: payload.subject,
        text: payload.message,
        html: `<p>${payload.message.replace(/[<>&]/g, "")}</p>`,
      });
      notification.delivery = { email: "sent", providerId: result.messageId };
      await notification.save();
      return { notificationId: notification._id, sent: true };
    } catch (error) {
      notification.delivery.email = "failed";
      await notification.save();
      throw error;
    }
  },
};
const execute = async (job) => {
  const handler = handlers[job.type];
  if (!handler) throw new Error(`No job handler registered for ${job.type}`);
  job.status = "processing";
  job.attempts += 1;
  job.lockedAt = job.lockedAt || new Date();
  job.progress = 10;
  await job.save();
  try {
    const result = await handler(job.payload);
    job.status = "completed";
    job.progress = 100;
    job.result = result;
    job.error = undefined;
    await job.save();
    return job;
  } catch (error) {
    job.status = job.attempts >= job.maxAttempts ? "failed" : "queued";
    job.nextAttemptAt = new Date(Date.now() + 1000 * 2 ** job.attempts);
    job.error = { code: error.code || "JOB_FAILED", message: String(error.message).slice(0, 500) };
    await job.save();
    throw error;
  }
};
const enqueue = async ({ type, owner, organization = null, payload, maxAttempts = 3 }) => {
  const job = await JobRun.create({ type, owner, organization, payload, maxAttempts });
  if (config.processJobsInline) await execute(await JobRun.findById(job._id).select("+payload"));
  return JobRun.findById(job._id);
};
const processNext = async () => {
  const staleLock = new Date(Date.now() - 10 * 60 * 1000);
  const job = await JobRun.findOneAndUpdate(
    {
      $or: [
        { status: "queued", nextAttemptAt: { $lte: new Date() } },
        { status: "processing", lockedAt: { $lte: staleLock } },
      ],
    },
    { status: "processing", lockedAt: new Date() },
    { returnDocument: "after", sort: { createdAt: 1 } },
  ).select("+payload");
  if (!job) return false;
  try {
    await execute(job);
  } catch (error) {
    logger.error(`Background job ${job._id} failed: ${error.message}`);
  }
  return true;
};
module.exports = { enqueue, execute, processNext };
