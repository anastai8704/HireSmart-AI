const AppError = require("../utils/AppError");

const urlPattern = /^https?:\/\/.+/i;

const normalizeString = (value) => String(value || "").trim();

const normalizeStringArray = (value, fieldName, maxItems = 50) => {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new AppError(`${fieldName} must be an array`, 400);
    }

    const values = [
        ...new Set(
            value
                .map((item) => normalizeString(item))
                .filter(Boolean)
        ),
    ];

    if (values.length > maxItems) {
        throw new AppError(
            `${fieldName} cannot contain more than ${maxItems} items`,
            400
        );
    }

    return values;
};

const validateUrl = (value, fieldName) => {
    if (value === undefined || value === null || value === "") {
        return "";
    }

    const normalized = normalizeString(value);

    if (!urlPattern.test(normalized)) {
        throw new AppError(`${fieldName} must be a valid URL`, 400);
    }

    return normalized;
};

const validateCandidateProfilePayload = (
    body,
    { partial = false } = {}
) => {
    const payload = {};

    // ----------------------------------
    // Basic Information
    // ----------------------------------

    if (body.phone !== undefined) {
        const phone = normalizeString(body.phone);

        if (phone.length > 30) {
            throw new AppError(
                "Phone number cannot exceed 30 characters",
                400
            );
        }

        payload.phone = phone;
    }

    if (body.profileImage !== undefined) {
        payload.profileImage = validateUrl(
            body.profileImage,
            "Profile image URL"
        );
    }

    if (body.bio !== undefined) {
        const bio = normalizeString(body.bio);

        if (bio.length > 500) {
            throw new AppError(
                "Bio cannot exceed 500 characters",
                400
            );
        }

        payload.bio = bio;
    }

    // ----------------------------------
    // Gender
    // ----------------------------------

    if (body.gender !== undefined) {
        const gender = normalizeString(body.gender);

        if (!["Male", "Female", "Other"].includes(gender)) {
            throw new AppError(
                "Gender must be Male, Female, or Other",
                400
            );
        }

        payload.gender = gender;
    }

    // ----------------------------------
    // Date of Birth
    // ----------------------------------

    if (body.dateOfBirth !== undefined) {
        const date = new Date(body.dateOfBirth);

        if (Number.isNaN(date.getTime())) {
            throw new AppError(
                "dateOfBirth must be a valid date",
                400
            );
        }

        payload.dateOfBirth = date;
    }

    // ----------------------------------
    // Address
    // ----------------------------------

    const addressFields = [
        "address",
        "city",
        "state",
        "country",
    ];

    for (const field of addressFields) {
        if (body[field] !== undefined) {
            const value = normalizeString(body[field]);

            if (value.length > 150) {
                throw new AppError(
                    `${field} cannot exceed 150 characters`,
                    400
                );
            }

            payload[field] = value;
        }
    }

    // ----------------------------------
    // Skills
    // ----------------------------------

    if (body.skills !== undefined) {
        payload.skills = normalizeStringArray(
            body.skills,
            "skills"
        );
    }

    // ----------------------------------
    // Languages
    // ----------------------------------

    if (body.languages !== undefined) {
        payload.languages = normalizeStringArray(
            body.languages,
            "languages",
            20
        );
    }

    // ----------------------------------
    // Social Links
    // ----------------------------------

    if (body.socialLinks !== undefined) {
        if (
            typeof body.socialLinks !== "object" ||
            Array.isArray(body.socialLinks)
        ) {
            throw new AppError(
                "socialLinks must be an object",
                400
            );
        }

        payload.socialLinks = {};

        if (body.socialLinks.github !== undefined) {
            payload.socialLinks.github = validateUrl(
                body.socialLinks.github,
                "GitHub URL"
            );
        }

        if (body.socialLinks.linkedin !== undefined) {
            payload.socialLinks.linkedin = validateUrl(
                body.socialLinks.linkedin,
                "LinkedIn URL"
            );
        }

        if (body.socialLinks.portfolio !== undefined) {
            payload.socialLinks.portfolio = validateUrl(
                body.socialLinks.portfolio,
                "Portfolio URL"
            );
        }

        if (body.socialLinks.website !== undefined) {
            payload.socialLinks.website = validateUrl(
                body.socialLinks.website,
                "Website URL"
            );
        }
    }

    // ----------------------------------
    // Education
    // ----------------------------------

    if (body.education !== undefined) {
        if (!Array.isArray(body.education)) {
            throw new AppError(
                "education must be an array",
                400
            );
        }

        payload.education = body.education;
    }

    // ----------------------------------
    // Experience
    // ----------------------------------

    if (body.experience !== undefined) {
        if (!Array.isArray(body.experience)) {
            throw new AppError(
                "experience must be an array",
                400
            );
        }

        payload.experience = body.experience;
    }

    // ----------------------------------
    // Projects
    // ----------------------------------

    if (body.projects !== undefined) {
        if (!Array.isArray(body.projects)) {
            throw new AppError(
                "projects must be an array",
                400
            );
        }

        payload.projects = body.projects;
    }

    // ----------------------------------
    // Certifications
    // ----------------------------------

    if (body.certifications !== undefined) {
        if (!Array.isArray(body.certifications)) {
            throw new AppError(
                "certifications must be an array",
                400
            );
        }

        payload.certifications = body.certifications;
    }

    // ----------------------------------
    // Required Fields
    // ----------------------------------

    if (!partial) {
        // For now, a profile does not require
        // every professional field.
        //
        // The authenticated user is automatically
        // attached by the controller.
        //
        // This allows a candidate to create
        // an empty/basic profile and complete it later.
    }

    return payload;
};

module.exports = {
    validateCandidateProfilePayload,
};