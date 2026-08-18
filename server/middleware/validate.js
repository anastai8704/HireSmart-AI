const AppError = require("../utils/AppError");
module.exports = (schema, source = "body") => (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
        return next(new AppError("Request validation failed", 422, "VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }))));
    }
    req[source] = parsed.data;
    next();
};
