const morgan = require("morgan");
const logger = require("../utils/logger");
morgan.token("request-id", (req) => req.id || "-");
morgan.token("safe-path", (req) => req.path || req.originalUrl.split("?")[0]);
const stream = { write: (message) => logger.info(message.trim()) };
module.exports = morgan(":request-id :method :safe-path :status :response-time ms", { stream });
