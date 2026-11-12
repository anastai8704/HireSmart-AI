const mongoose = require("mongoose");

// One Google Calendar connection per recruiter user. The refresh token is stored only encrypted (services/tokenCrypto).
// The access token is never stored: it is refreshed when a Calendar call needs it.
const googleCalendarConnectionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    googleEmail: { type: String, default: "", maxlength: 254 },
    encryptedRefreshToken: { type: String, required: true, select: false },
    scope: { type: String, default: "" },
    status: { type: String, enum: ["connected", "revoked"], default: "connected", index: true },
    connectedAt: { type: Date, default: Date.now },
    lastErrorCode: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("GoogleCalendarConnection", googleCalendarConnectionSchema);
