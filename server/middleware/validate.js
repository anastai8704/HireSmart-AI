const AppError = require("../utils/AppError");
module.exports = (schema, source = "body") => (req, res, next) => {
    // A JSON request with no body (e.g. POST /approve with no payload) leaves
    // req.body undefined; validate it as an empty object instead of failing
    // at the root before any field rule can run.
    const input = source === "body" ? (req.body ?? {}) : req[source];
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        return next(new AppError("Request validation failed", 422, "VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }))));
    }
    req[source] = parsed.data;
    next();
};
