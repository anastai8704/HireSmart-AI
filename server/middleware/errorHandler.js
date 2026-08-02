const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
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

    res.status(statusCode).json({
        success: false,
        status: `${statusCode}`.startsWith("4") ? "fail" : "error",
        message: statusCode >= 500 ? "Internal Server Error" : message,
    });
};

module.exports = errorHandler;
