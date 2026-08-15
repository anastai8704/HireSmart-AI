const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, "..", ".env"),
    quiet: process.env.NODE_ENV === "test",
});

const nodeEnv = process.env.NODE_ENV || "development";

// In automated tests there is usually no .env file (it is git-ignored), so we
// fall back to throw-away values. This keeps `npm test` working on a fresh
// clone while never affecting development or production, where the real
// validateEnvironment() check below still applies.
if (nodeEnv === "test") {
    const testDefaults = {
        JWT_SECRET: "test_only_secret_do_not_use_in_production",
        JWT_EXPIRES_IN: "1h",
        STORAGE_PROVIDER: "local",
        REQUIRE_EMAIL_VERIFICATION: "false",
        CLIENT_URL: "http://localhost:5173",
    };

    for (const [key, value] of Object.entries(testDefaults)) {
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

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
    emailFrom: process.env.EMAIL_FROM || "no-reply@hiresmart.ai",
    clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    storageProvider: (process.env.STORAGE_PROVIDER || "local").toLowerCase(),
    s3Bucket: process.env.S3_BUCKET || "",
    s3Region: process.env.S3_REGION || "",
    s3Endpoint: process.env.S3_ENDPOINT || "",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    s3ForcePathStyle: String(process.env.S3_FORCE_PATH_STYLE).toLowerCase() === "true",
    requireEmailVerification: String(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase() === "true",
    emailVerificationTokenExpiresIn:
        Number(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_IN) || 24 * 60 * 60 * 1000,
    passwordResetTokenExpiresIn:
        Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN) || 60 * 60 * 1000,
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
