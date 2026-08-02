const AppError = require("../utils/AppError");

const validateProfileUpdate = (body) => {
    const allowedFields = [
        "name",
        "phone",
        "profileImage",
        "headline",
        "location",
        "bio",
        "skills",
        "companyName",
        "companyWebsite",
        "companyDescription",
    ];

    const payload = {};

    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            const value = String(body[field]).trim();

            if (value.length === 0) {
                throw new AppError(`${field} cannot be empty`, 400);
            }

            payload[field] = value;
        }
    }

    if (body.skills !== undefined) {
        if (!Array.isArray(body.skills)) {
            throw new AppError("skills must be an array", 400);
        }

        payload.skills = body.skills.map((skill) => {
            const normalized = String(skill || "").trim();
            if (!normalized) {
                throw new AppError("skills cannot contain empty values", 400);
            }
            return normalized;
        });
    }

    return payload;
};

module.exports = {
    validateProfileUpdate,
};
