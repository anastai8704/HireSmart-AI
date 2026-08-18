class AppError extends Error {
    constructor(message, statusCode = 500, code = statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED", fieldErrors = undefined) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.code = code;
        this.fieldErrors = fieldErrors;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
module.exports = AppError;
