const mongoose = require("mongoose");

const recommendationSnapshotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    resumeVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "ResumeVersion", default: null },
    results: { type: [mongoose.Schema.Types.Mixed], default: [] },
    signals: { type: mongoose.Schema.Types.Mixed, default: {} },
    evaluated: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RecommendationSnapshot", recommendationSnapshotSchema);
