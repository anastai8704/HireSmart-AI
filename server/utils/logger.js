const winston = require("winston");
const path = require("path");

const logDir = path.join(__dirname, "../logs");

const logger = winston.createLogger({
    level: "info",

    format: winston.format.combine(
        winston.format.timestamp({
            format: "YYYY-MM-DD HH:mm:ss",
        }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            return `${timestamp} [${level.toUpperCase()}] ${
                stack || message
            }`;
        })
    ),

    transports: [
        new winston.transports.File({
            filename: path.join(logDir, "error.log"),
            level: "error",
        }),

        new winston.transports.File({
            filename: path.join(logDir, "combined.log"),
        }),
    ],
});

if (process.env.NODE_ENV !== "production") {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        })
    );
}

module.exports = logger;