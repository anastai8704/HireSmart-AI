const mongoose = require("mongoose");

const searchHistorySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    query: { type: String, trim: true, maxlength: 100, default: "" },
    location: { type: String, trim: true, maxlength: 150, default: "" },
    workplaceMode: { type: String, enum: ["", "onsite", "hybrid", "remote"], default: "" },
    jobType: { type: String, trim: true, maxlength: 50, default: "" },
    skills: { type: [String], default: [] },
    // Mongoose `expires` (TTL) is expressed in SECONDS. 180 days of history
    // before Mongo drops the document. (15552000 fits in a 32-bit int; the
    // millisecond value 15552000000 exceeded it and broke createIndexes.)
    createdAt: { type: Date, default: Date.now, expires: 180 * 24 * 3600 },
});

searchHistorySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SearchHistory", searchHistorySchema);
