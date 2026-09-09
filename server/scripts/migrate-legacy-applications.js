const mongoose = require("mongoose");

const connectDB = require("../config/db");
const { validateEnvironment } = require("../config/env");
const User = require("../models/User");
const { Application, applicationStatuses } = require("../models/Application");

const migrate = async () => {
  validateEnvironment();
  await connectDB();

  const legacyJobs = await mongoose.connection
    .collection("jobs")
    .find({ "applicants.0": { $exists: true } })
    .toArray();

  let migrated = 0;
  let skipped = 0;

  for (const job of legacyJobs) {
    for (const legacyApplication of job.applicants || []) {
      if (!legacyApplication.candidate) {
        skipped += 1;
        continue;
      }

      const candidate = await User.findById(legacyApplication.candidate);

      if (!candidate) {
        skipped += 1;
        continue;
      }

      const status = applicationStatuses.includes(legacyApplication.status)
        ? legacyApplication.status
        : "Applied";
      const appliedAt = legacyApplication.createdAt || job.createdAt || new Date();

      const result = await Application.updateOne(
        { job: job._id, candidate: candidate._id },
        {
          $setOnInsert: {
            job: job._id,
            candidate: candidate._id,
            status,
            appliedAt,
            resumeSnapshot: {
              storageKey: candidate.resume || "",
              originalName: candidate.resumeOriginalName || "Unavailable resume",
              mimeType: candidate.resumeMimeType || "application/octet-stream",
              size: candidate.resumeSize || 0,
            },
            statusHistory: [
              {
                status,
                changedBy: candidate._id,
                changedAt: appliedAt,
                note: "Migrated from the legacy job application record",
              },
            ],
            createdAt: appliedAt,
            updatedAt: appliedAt,
          },
        },
        { upsert: true },
      );

      migrated += result.upsertedCount;
    }
  }

  const statusUpdate = await mongoose.connection
    .collection("jobs")
    .updateMany({ status: { $exists: false } }, { $set: { status: "published" } });

  console.log(
    `Migration complete. Applications created: ${migrated}; skipped: ${skipped}; jobs published: ${statusUpdate.modifiedCount}.`,
  );
  console.log("Legacy applicants arrays were left intact for rollback verification.");
};

migrate()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
