const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    type: { type: String, required: true, maxlength: 100 },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    resourceType: { type: String, default: "", maxlength: 80 },
    resourceId: { type: String, default: "" },
    readAt: { type: Date, default: null, index: true },
    delivery: { email: { type: String, enum: ["not_requested", "queued", "sent", "failed"], default: "not_requested" }, providerId: String },
    idempotencyKey: { type: String, default: undefined },
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("Notification", notificationSchema);
