const AppError = require("../utils/AppError");
const { applicationStatuses } = require("../constants/enums");

const validateApplicationStatus = (status) => {
    if (!applicationStatuses.includes(status)) {
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
