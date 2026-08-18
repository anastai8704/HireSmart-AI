const roles = Object.freeze({
    candidate: "candidate",
    recruiter: "recruiter",
    admin: "admin",
});

const jobTypes = Object.freeze([
    "Full-Time",
    "Part-Time",
    "Internship",
    "Contract",
    "Remote",
]);

const jobStatuses = Object.freeze(["draft", "published", "closed"]);

const applicationStatuses = Object.freeze([
    // Legacy values retained for compatibility with the existing UI/API.
    "Applied", "Shortlisted", "Interview", "Selected", "Rejected", "Withdrawn",
    // Versioned API lifecycle values.
    "submitted", "under_review", "shortlisted", "interview", "offer", "hired",
    "rejected", "withdrawn", "closed",
]);

module.exports = {
    roles,
    jobTypes,
    jobStatuses,
    applicationStatuses,
};
