const express = require("express");
const compression = require("compression");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");

const { config } = require("./config/env");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./utils/AppError");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const jobRoutes = require("./routes/jobRoutes");

const app = express();

app.disable("x-powered-by");

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
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isProduction ? 300 : 1000,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => config.isTest,
    message: {
        success: false,
        message: "Too many requests. Please try again later.",
    },
});

const sanitizeRequest = (req, res, next) => {
    for (const value of [req.body, req.params, req.query]) {
        if (value) {
            mongoSanitize.sanitize(value);
        }
    }

    next();
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(sanitizeRequest);
app.use(hpp());

app.use(requestLogger);
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/jobs", jobRoutes);

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

module.exports = app;
