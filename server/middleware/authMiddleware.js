const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { config } = require("../config/env");

exports.protect = async (req, res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return next(new AppError("Access denied. No token provided.", 401));
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return next(new AppError("User not found", 404));
        }

        if (!user.isActive) {
            return next(new AppError("This account has been deactivated", 403));
        }

        req.user = user;
        next();
    } catch (error) {
        return next(new AppError("Invalid or expired token", 401));
    }
};

exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                new AppError("You are not authorized to access this resource.", 403)
            );
        }

        next();
    };
};
