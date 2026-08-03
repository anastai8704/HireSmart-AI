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
    "Applied",
    "Shortlisted",
    "Interview",
    "Selected",
    "Rejected",
    "Withdrawn",
]);

module.exports = {
    roles,
    jobTypes,
    jobStatuses,
    applicationStatuses,
};
