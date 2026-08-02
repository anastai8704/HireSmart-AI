const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, "..", ".env"),
    quiet: process.env.NODE_ENV === "test",
});

const nodeEnv = process.env.NODE_ENV || "development";

const config = Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    port: Number(process.env.PORT) || 5000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    corsOrigins: (process.env.CORS_ORIGIN || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    recruiterInviteCode: process.env.RECRUITER_INVITE_CODE || "",
});

const validateEnvironment = () => {
    const required = ["MONGO_URI", "JWT_SECRET"];

    if (config.isProduction) {
        required.push("CORS_ORIGIN");
    }

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }
};

module.exports = { config, validateEnvironment };
