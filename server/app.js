const express = require("express");
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const { config } = require("./config/env");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./utils/AppError");

const v1Routes = require("./routes/v1Routes");
const requestContext = require("./middleware/requestContext");

const app = express();

app.disable("x-powered-by");
if (config.isProduction) app.set("trust proxy", 1);

const corsOptions = {
    origin(origin, callback) {
        const isAllowed =
            !origin ||
            (!config.isProduction && config.corsOrigins.length === 0) ||
            config.corsOrigins.includes(origin);

        if (isAllowed) {
            return callback(null, true);
        }

        return callback(new AppError("Origin is not allowed by CORS", 403));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Organization-Id", "X-Request-Id", "X-CSRF-Token"],
    maxAge: 86400,
    credentials: true,
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isProduction ? 300 : 1000,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (req, res) => res.status(429).json(req.originalUrl.startsWith("/api/v1") ? { success: false, status: "fail", code: "RATE_LIMITED", message: "Too many requests. Please try again later.", requestId: req.id } : { success: false, message: "Too many requests. Please try again later." }),
});

const sanitizeRequest = (req, res, next) => {
    for (const value of [req.body, req.params, req.query]) {
        if (value) {
            mongoSanitize.sanitize(value);
        }
    }

    next();
};

app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(sanitizeRequest);
app.use(hpp());

app.use(requestLogger);
app.use("/api", apiLimiter);

app.use("/api/v1", v1Routes);

app.get("/", (req, res) => {
    res.send("Welcome to HireSmart AI");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        status: "ok",
        environment: config.nodeEnv,
    });
});

if (!config.isProduction) {
    app.get("/test-error", (req, res, next) => {
        next(new AppError("Testing Global Error Handler", 400));
    });
}

app.use((req, res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} was not found`, 404));
});

app.use(errorHandler);

// Job-alert scans run from the API process too, so deployments without a
// separate worker still deliver alerts. The service throttles to one scan
// per 60s and claims each alert atomically, so overlapping runs are safe.
if (config.nodeEnv !== "test") {
    const { tickAlertScan } = require("./services/alertScanService");
    const { tickRecommendationRefresh } = require("./services/recommendationSnapshotService");
    const interval = setInterval(() => { tickAlertScan().catch(() => {}); tickRecommendationRefresh().catch(() => {}); }, 5 * 60 * 1000);
    if (typeof interval.unref === "function") interval.unref();
}

module.exports = app;
