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
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
    refreshTokenExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30,
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || "hiresmart_refresh",
    cookieSecure: process.env.COOKIE_SECURE ? String(process.env.COOKIE_SECURE).toLowerCase() === "true" : nodeEnv === "production",
    cookieSameSite: process.env.COOKIE_SAME_SITE || "lax",
    aiPrimaryProvider: (process.env.AI_PRIMARY_PROVIDER || "deterministic").toLowerCase(),
    aiFallbackProvider: (process.env.AI_FALLBACK_PROVIDER || "deterministic").toLowerCase(),
    aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    aiApiKey: process.env.AI_API_KEY || "",
    aiModel: process.env.AI_MODEL || "gpt-4o-mini",
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS) || 30000,
    aiMaxRetries: Number(process.env.AI_MAX_RETRIES) || 2,
    aiInputCostPerMillion: Number(process.env.AI_INPUT_COST_PER_MILLION) || 0,
    aiOutputCostPerMillion: Number(process.env.AI_OUTPUT_COST_PER_MILLION) || 0,
    embeddingsProvider: (process.env.EMBEDDINGS_PROVIDER || "deterministic").toLowerCase(),
    embeddingsModel: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small",
    processJobsInline: String(process.env.PROCESS_JOBS_INLINE).toLowerCase() === "true" || nodeEnv === "test",
    malwareScannerUrl: process.env.MALWARE_SCANNER_URL || "",
    malwareScanTimeoutMs: Number(process.env.MALWARE_SCAN_TIMEOUT_MS) || 15000,
    matchingWeights: {
        requiredSkills: Number(process.env.MATCH_WEIGHT_REQUIRED_SKILLS) || 0.35,
        preferredSkills: Number(process.env.MATCH_WEIGHT_PREFERRED_SKILLS) || 0.10,
        experience: Number(process.env.MATCH_WEIGHT_EXPERIENCE) || 0.20,
        education: Number(process.env.MATCH_WEIGHT_EDUCATION) || 0.10,
        semantic: Number(process.env.MATCH_WEIGHT_SEMANTIC) || 0.20,
        preferences: Number(process.env.MATCH_WEIGHT_PREFERENCES) || 0.05,
    },
});

const validateEnvironment = () => {
    const required = ["MONGO_URI", "JWT_SECRET"];

    if (config.isProduction) {
        required.push("CORS_ORIGIN");
        if (config.jwtSecret && config.jwtSecret.length < 32) {
            throw new Error("JWT_SECRET must be at least 32 characters in production");
        }
        if (!config.requireEmailVerification) {
            throw new Error("REQUIRE_EMAIL_VERIFICATION must be true in production");
        }
        if (!config.cookieSecure) {
            throw new Error("COOKIE_SECURE must be true in production");
        }
        if (config.storageProvider !== "s3") {
            throw new Error("STORAGE_PROVIDER must be s3 in production");
        }
        if (!config.malwareScannerUrl) {
            throw new Error("MALWARE_SCANNER_URL is required in production");
        }
        if (config.aiPrimaryProvider !== "deterministic" && !config.aiApiKey) {
            throw new Error("AI_API_KEY is required for the configured AI provider");
        }
    }

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }
};

module.exports = { config, validateEnvironment };
