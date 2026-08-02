const AppError = require("../utils/AppError");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const validateRegistration = ({ name, email, password }) => {
    if (!name || !email || !password) {
        throw new AppError("Name, email, and password are required", 400);
    }

    const normalizedName = String(name).trim();
    const normalizedEmailStr = normalizeEmail(email);

    if (normalizedName.length < 2 || normalizedName.length > 100) {
        throw new AppError("Name must be between 2 and 100 characters", 400);
    }

    if (!emailPattern.test(normalizedEmailStr)) {
        throw new AppError("Please provide a valid email address", 400);
    }

    if (String(password).length < 8) {
        throw new AppError("Password must contain at least 8 characters", 400);
    }
};

const validateLogin = ({ email, password }) => {
    if (!email || !password) {
        throw new AppError("Email and password are required", 400);
    }

    if (!emailPattern.test(normalizeEmail(email))) {
        throw new AppError("Please provide a valid email address", 400);
    }
};

module.exports = {
    validateRegistration,
    validateLogin,
};
