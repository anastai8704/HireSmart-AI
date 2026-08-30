const logger = require("../utils/logger");

const errorHandler = (err, req, res, _next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    if (err.name === "CastError") {
        statusCode = 400;
        message = "Invalid resource identifier";
    }

    if (err.code === 11000) {
        statusCode = 409;
        message = "A record with that value already exists";
    }

    if (err.name === "ValidationError") {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((item) => item.message)
            .join(", ");
    }

    if (err.name === "MulterError") {
        statusCode = 400;
    }

    if (err.type === "entity.parse.failed") {
        statusCode = 400;
        message = "Invalid JSON request body";
    }

    logger.error(err.stack || err.message);

    const body = {
        success: false,
        status: `${statusCode}`.startsWith("4") ? "fail" : "error",
        message: statusCode >= 500 ? "Internal Server Error" : message,
    };

    // The versioned API has a stable machine-readable error contract while the
    // legacy routes retain their exact response shape for compatibility.
    if (req.originalUrl.startsWith("/api/v1")) {
        body.code = statusCode >= 500 ? "INTERNAL_ERROR" : (err.code || "REQUEST_FAILED");
        body.requestId = req.id;
        if (err.fieldErrors) body.fieldErrors = err.fieldErrors;
    }

    // Test environment only: surface the underlying server error so test
    // failures identify the actual bug. Production keeps the masked 500 body.
    if (process.env.NODE_ENV === "test" && statusCode >= 500) {
        body.serverError = { name: err.name, message: err.message, stack: err.stack };
    }

    res.status(statusCode).json(body);
};

module.exports = errorHandler;
