const winston = require("winston");
const path = require("node:path");
const logDir = path.join(__dirname, "../logs");
const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";
const redact = winston.format((info) => {
    for (const key of ["password", "token", "authorization", "resumeText", "apiKey"]) if (key in info) info[key] = "[REDACTED]";
    return info;
});
const format = isProduction
    ? winston.format.combine(redact(), winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
    : winston.format.combine(redact(), winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston.format.errors({ stack: true }), winston.format.printf(({ timestamp, level, message, stack }) => `${timestamp} [${level.toUpperCase()}] ${stack || message}`));
const transports = isTest ? [] : isProduction
    ? [new winston.transports.Console()]
    : [new winston.transports.Console(), new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }), new winston.transports.File({ filename: path.join(logDir, "combined.log") })];
module.exports = winston.createLogger({ level: process.env.LOG_LEVEL || "info", format, silent: isTest, defaultMeta: { service: "hiresmart-api", environment: process.env.NODE_ENV || "development" }, transports });
