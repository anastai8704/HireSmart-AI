const crypto = require("node:crypto");
const AuditLog = require("../models/AuditLog");
const SecurityEvent = require("../models/SecurityEvent");
const { config } = require("../config/env");
const hashIp = (ip) => crypto.createHmac("sha256", config.jwtSecret || "local-audit-key").update(String(ip || "unknown")).digest("hex");
const audit = async ({ req, organization, action, resourceType, resourceId, outcome = "success", metadata = {} }) => AuditLog.create({ organization: organization || null, actor: req?.user?._id || null, action, resourceType, resourceId: String(resourceId || ""), outcome, requestId: req?.id || "", metadata });
const security = async ({ req, user, organization, type, severity = "info", details = {} }) => SecurityEvent.create({ user: user || req?.user?._id || null, organization: organization || null, type, severity, requestId: req?.id || "", ipHash: hashIp(req?.ip), details });
module.exports = { audit, security, hashIp };
