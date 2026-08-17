/**
 * api.js
 * -----------------------------------------------------------------------------
 * Every backend endpoint the app can call, grouped by feature and expressed as
 * a plain named function.
 *
 * WHY CENTRALISE THIS
 * Components should describe *intent* ("list my applications"), not URLs and
 * HTTP verbs. If a route ever changes, it changes here once instead of in
 * fifteen components - and the whole API surface is readable in one file,
 * which doubles as living documentation of the backend.
 */

import apiClient from "./apiClient";

/** Removes empty values so we never send `?search=&status=` to the server. */
const buildQuery = (params = {}) => {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            query.append(key, value);
        }
    }

    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
};

/* ==========================================================================
 * AUTHENTICATION
 * ========================================================================== */
export const authApi = {
    register: (payload) => apiClient.post("/auth/register", payload),

    registerRecruiter: (payload) => apiClient.post("/auth/register-recruiter", payload),

    login: (payload) => apiClient.post("/auth/login", payload),

    changePassword: (payload) => apiClient.post("/auth/change-password", payload),

    forgotPassword: (email) => apiClient.post("/auth/forgot-password", { email }),

    resetPassword: (payload) => apiClient.post("/auth/reset-password", payload),

    verifyEmail: (token) => apiClient.post("/auth/verify-email", { token }),

    /**
     * Resume upload needs multipart/form-data rather than JSON, because we are
     * sending a binary file. We delete the Content-Type header so the browser
     * sets it along with the required multipart boundary.
     */
    uploadResume: (file, onUploadProgress) => {
        const formData = new FormData();
        formData.append("resume", file);

        return apiClient.put("/auth/resume", formData, {
            headers: { "Content-Type": undefined },
            onUploadProgress,
        });
    },

    deleteResume: () => apiClient.delete("/auth/resume"),

    /** Returns the raw file as a Blob so the browser can download it. */
    downloadResume: () => apiClient.get("/auth/resume", { responseType: "blob" }),
};

/* ==========================================================================
 * USER PROFILE & ADMIN
 * ========================================================================== */
export const userApi = {
    getProfile: () => apiClient.get("/user/profile"),

    updateProfile: (payload) => apiClient.put("/user/profile", payload),

    adminOverview: () => apiClient.get("/user/admin"),

    listUsers: (params) => apiClient.get(`/user/admin/users${buildQuery(params)}`),

    setUserStatus: (id, isActive) =>
        apiClient.patch(`/user/admin/users/${id}/status`, { isActive }),
};

/* ==========================================================================
 * JOBS - public browsing
 * ========================================================================== */
export const jobApi = {
    list: (params) => apiClient.get(`/jobs${buildQuery(params)}`),

    get: (id) => apiClient.get(`/jobs/${id}`),

    /* ---- Candidate actions ---- */
    apply: (id) => apiClient.post(`/jobs/${id}/apply`),
    withdraw: (id) => apiClient.delete(`/jobs/${id}/apply`),
    save: (id) => apiClient.post(`/jobs/${id}/save`),
    unsave: (id) => apiClient.delete(`/jobs/${id}/save`),
    savedJobs: () => apiClient.get("/jobs/saved"),
    appliedJobs: (params) => apiClient.get(`/jobs/applied${buildQuery(params)}`),
    jobStatus: (id) => apiClient.get(`/jobs/${id}/status`),
    candidateDashboard: () => apiClient.get("/jobs/candidate-dashboard"),

    /* ---- Recruiter actions ---- */
    create: (payload) => apiClient.post("/jobs", payload),
    update: (id, payload) => apiClient.put(`/jobs/${id}`, payload),
    remove: (id) => apiClient.delete(`/jobs/${id}`),
    myJobs: (params) => apiClient.get(`/jobs/my-jobs${buildQuery(params)}`),
    applicants: (id, params) => apiClient.get(`/jobs/${id}/applicants${buildQuery(params)}`),

    setApplicantStatus: (jobId, userId, payload) =>
        apiClient.put(`/jobs/${jobId}/applicant/${userId}/status`, payload),

    setApplicantNotes: (jobId, userId, recruiterNotes) =>
        apiClient.put(`/jobs/${jobId}/applicant/${userId}/notes`, { recruiterNotes }),

    applicantProfile: (id) => apiClient.get(`/jobs/applicant/${id}`),

    downloadApplicantResume: (candidateId, jobId) =>
        apiClient.get(`/jobs/candidate/${candidateId}/resume${buildQuery({ jobId })}`, {
            responseType: "blob",
        }),

    recruiterDashboard: () => apiClient.get("/jobs/dashboard"),
    analytics: () => apiClient.get("/jobs/analytics"),
};

/* ==========================================================================
 * CANDIDATE PROFILE (education, experience, projects, certifications)
 * ========================================================================== */
export const profileApi = {
    get: () => apiClient.get("/candidate/profile"),
    create: (payload) => apiClient.post("/candidate/profile", payload),
    update: (payload) => apiClient.put("/candidate/profile", payload),
    remove: () => apiClient.delete("/candidate/profile"),

    addEducation: (payload) => apiClient.post("/candidate/profile/education", payload),
    updateEducation: (id, payload) => apiClient.put(`/candidate/profile/education/${id}`, payload),
    deleteEducation: (id) => apiClient.delete(`/candidate/profile/education/${id}`),

    addExperience: (payload) => apiClient.post("/candidate/profile/experience", payload),
    updateExperience: (id, payload) => apiClient.put(`/candidate/profile/experience/${id}`, payload),
    deleteExperience: (id) => apiClient.delete(`/candidate/profile/experience/${id}`),

    addProject: (payload) => apiClient.post("/candidate/profile/projects", payload),
    updateProject: (id, payload) => apiClient.put(`/candidate/profile/projects/${id}`, payload),
    deleteProject: (id) => apiClient.delete(`/candidate/profile/projects/${id}`),

    addCertification: (payload) => apiClient.post("/candidate/profile/certifications", payload),
    updateCertification: (id, payload) =>
        apiClient.put(`/candidate/profile/certifications/${id}`, payload),
    deleteCertification: (id) => apiClient.delete(`/candidate/profile/certifications/${id}`),
};

/* ==========================================================================
 * AI - matching, ranking and resume analysis
 * ========================================================================== */
export const aiApi = {
    /** Candidate: ATS health report for their uploaded resume. */
    resumeAnalysis: () => apiClient.get("/matching/resume/analysis"),

    /** Anyone: analyse pasted text without saving it. */
    analyzeText: (resumeText) =>
        apiClient.post("/matching/resume/analyze-text", { resumeText }),

    /** Candidate: jobs ranked by how well they fit. */
    recommendations: (limit = 10) =>
        apiClient.get(`/matching/recommendations${buildQuery({ limit })}`),

    /** Candidate: detailed gap analysis for one specific job. */
    jobFit: (jobId) => apiClient.get(`/matching/jobs/${jobId}/fit`),

    /** Recruiter: all applicants for a job, ranked best-first. */
    ranking: (jobId) => apiClient.get(`/matching/jobs/${jobId}/ranking`),

    /** Recruiter: score for a single application. */
    applicationMatch: (applicationId) =>
        apiClient.get(`/matching/applications/${applicationId}/match`),
};

export default { authApi, userApi, jobApi, profileApi, aiApi };
