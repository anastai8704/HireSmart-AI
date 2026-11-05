const crypto = require("node:crypto");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const { config } = require("../config/env");
const { redact } = require("../utils/redact");
const hashIp = (ip) =>
  crypto
    .createHmac("sha256", config.jwtSecret || "local-audit-key")
    .update(String(ip || "unknown"))
    .digest("hex");
// Audit entries never hold credentials, tokens or payment secrets. Redaction is recursive (utils/redact.js).
const MAX_REASON = 1000;

/** Builds the stored audit document. Pure, so the redaction rules can be tested without a database. */
const buildAuditEntry = ({
  req,
  organization,
  action,
  resourceType,
  resourceId,
  outcome = "success",
  metadata = {},
  previousState,
  newState,
  reason,
}) => ({
  organization: organization || null,
  actor: req?.user?._id || null,
  action,
  resourceType,
  resourceId: String(resourceId || ""),
  outcome,
  requestId: req?.id || "",
  metadata: redact(metadata || {}),
  ...(previousState !== undefined ? { previousState: redact(previousState) } : {}),
  ...(newState !== undefined ? { newState: redact(newState) } : {}),
  reason: reason ? String(reason).slice(0, MAX_REASON) : "",
});

const audit = async (input) => AuditLog.create(buildAuditEntry(input));

const security = async ({ req, user, organization, type, severity = "info", details = {} }) => {
  const event = await SecurityEvent.create({
    user: user || req?.user?._id || null,
    organization: organization || null,
    type,
    severity,
    requestId: req?.id || "",
    ipHash: hashIp(req?.ip),
    details: redact(details || {}),
  });
  // High-severity events alert platform admins without failing the caller.
  if (severity === "high") {
    const { notifyAdmins, notify } = require("./notificationService");
    notifyAdmins({
      type: "security_alert",
      category: "security",
      title: `Security alert: ${type.replace(/_/g, " ")}`,
      message: `A high-severity security event (${type}) was recorded${organization ? ` for organization ${organization}` : ""}.`,
      resourceType: "security_event",
      resourceId: event._id,
      idempotencyKey: `security:${event._id}`,
    }).catch(() => {});
    // The affected user gets the same event as a premium security email
    // (in-app + email; the security group is always on).
    if (user) {
      const User = require("../models/User");
      User.findById(user)
        .select("email name")
        .lean()
        .then((userDoc) => {
          if (!userDoc?.email) return;
          const labels = {
            "session.refresh_token_reuse": "possible session takeover",
          };
          const what = labels[type] || `unusual activity (${type.replace(/_/g, " ")})`;
          return notify({
            user,
            type: "security_alert",
            category: "security",
            title: "Important security alert",
            message: `We detected ${what} on your account and signed you out of all devices. If this wasn't you, reset your password now.`,
            resourceType: "security_event",
            resourceId: event._id,
            email: userDoc.email,
            recipientName: userDoc.name,
            emailContext: { event: type, at: new Date() },
            idempotencyKey: `security:user:${event._id}`,
          });
        })
        .catch(() => {});
    }
  }
  return event;
};
module.exports = { audit, security, hashIp, buildAuditEntry };
