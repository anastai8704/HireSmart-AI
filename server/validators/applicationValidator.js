const AppError = require("../utils/AppError");

const validStatuses = [
    "Applied",
    "Shortlisted",
    "Interview",
    "Selected",
    "Rejected",
];

const validateApplicationStatus = (status) => {
    if (!validStatuses.includes(status)) {
        throw new AppError("Invalid application status", 400);
    }
};

const validateResumeDownloadRequest = ({ candidateId, jobId }) => {
    if (!candidateId) {
        throw new AppError("candidateId is required", 400);
    }
    if (!jobId) {
        throw new AppError("jobId is required to download a candidate resume", 400);
    }
};

module.exports = {
    validateApplicationStatus,
    validateResumeDownloadRequest,
};
