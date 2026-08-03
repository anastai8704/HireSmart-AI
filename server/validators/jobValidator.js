const AppError = require("../utils/AppError");
const { jobTypes, jobStatuses } = require("../constants/enums");

const normalizeSkills = (skills) => {
    const values = Array.isArray(skills) ? skills : String(skills || "").split(",");
    const normalized = [
        ...new Set(values.map((skill) => String(skill).trim()).filter(Boolean)),
    ];

    if (normalized.length === 0 || normalized.length > 50) {
        throw new AppError("Please provide between 1 and 50 skills", 400);
    }

    return normalized;
};

const validateJobPayload = (body, { partial = false } = {}) => {
    const payload = {};
    const stringFields = ["title", "company", "location", "experience", "description"];

    for (const field of stringFields) {
        if (body[field] !== undefined) {
            const value = String(body[field]).trim();

            if (!value) {
                throw new AppError(`${field} cannot be empty`, 400);
            }

            payload[field] = value;
        }
    }

    if (body.salary !== undefined) {
        const salary = Number(body.salary);

        if (!Number.isFinite(salary) || salary < 0) {
            throw new AppError("salary must be a non-negative number", 400);
        }

        payload.salary = salary;
    }

    if (body.jobType !== undefined) {
        if (!jobTypes.includes(body.jobType)) {
            throw new AppError("Invalid job type", 400);
        }

        payload.jobType = body.jobType;
    }

    if (body.status !== undefined) {
        if (!jobStatuses.includes(body.status)) {
            throw new AppError("Invalid job status", 400);
        }

        payload.status = body.status;
    }

    if (body.skills !== undefined) {
        payload.skills = normalizeSkills(body.skills);
    }

    if (body.closesAt !== undefined) {
        if (body.closesAt === null || body.closesAt === "") {
            payload.closesAt = null;
        } else {
            const date = new Date(body.closesAt);
            if (Number.isNaN(date.getTime())) {
                throw new AppError("closesAt must be a valid date", 400);
            }
            payload.closesAt = date;
        }
    }

    if (!partial) {
        const requiredFields = [
            "title",
            "company",
            "location",
            "salary",
            "experience",
            "description",
            "skills",
        ];
        const missing = requiredFields.filter((field) => payload[field] === undefined);

        if (missing.length > 0) {
            throw new AppError(`Missing required fields: ${missing.join(", ")}`, 400);
        }
    }

    return payload;
};

const validateJobStatus = (status) => {
    if (!jobStatuses.includes(status)) {
        throw new AppError("Invalid job status", 400);
    }
};

module.exports = {
    validateJobPayload,
    validateJobStatus,
};
