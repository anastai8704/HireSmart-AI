const AppError = require("../utils/AppError");
module.exports = (schema, source = "body") => (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
        if (process.env.NODE_ENV === "test" && source === "body" && req.body === undefined) {
            console.warn(`[validate-debug] ${req.method} ${req.originalUrl} content-type=${req.headers["content-type"]} transfer-encoding=${req.headers["transfer-encoding"]} content-length=${req.headers["content-length"]}`);
        }
        return next(new AppError("Request validation failed", 422, "VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }))));
    }
    req[source] = parsed.data;
    next();
};
