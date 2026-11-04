import api from "./apiClient";

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  return search.size ? `?${search}` : "";
};
const id = (value) => value?.id || value?._id;
export const normalize = (value) =>
  value && typeof value === "object" ? { ...value, id: id(value) } : value;

export const authApi = {
  register: (body) => api.post("/auth/register", body),
  verify: (token) => api.post("/auth/verify-email", { token }),
  resend: (email) => api.post("/auth/verification-emails", { email }),
  login: (body) => api.post("/auth/login", body),
  logout: () => api.post("/auth/logout"),
  forgot: (email) => api.post("/auth/password/forgot", { email }),
  reset: (body) => api.post("/auth/password/reset", body),
  changePassword: (body) => api.patch("/auth/password", body),
  changeEmail: (newEmail) => api.post("/auth/change-email", { newEmail }),
  confirmEmailChange: (token) => api.post("/auth/confirm-email-change", { token }),
  security: () => api.get("/auth/security"),
  sessions: () => api.get("/auth/sessions"),
  revokeSession: (sessionId) => api.delete(`/auth/sessions/${sessionId}`),
  revokeOtherSessions: () => api.post("/auth/sessions/revoke-others"),
};
export const userApi = {
  me: () => api.get("/users/me"),
  updateProfile: (body) => api.patch("/users/me", body),
  updateNotificationPrefs: (prefs) => api.patch("/users/me/notification-prefs", prefs),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append("avatar", file);
    return api.post("/users/me/avatar", form, {
      headers: { "Content-Type": undefined },
      timeout: 60000,
    });
  },
  removeAvatar: () => api.delete("/users/me/avatar"),
  exportData: () => api.get("/users/me/export", { responseType: "blob" }),
  remove: (reason) => api.delete("/users/me", { data: { reason } }),
  consents: () => api.get("/users/me/consents"),
  consent: (purpose, body) => api.put(`/users/me/consents/${purpose}`, body),
};
export const organizationApi = {
  list: () => api.get("/organizations"),
  create: (body) => api.post("/organizations", body),
  get: (orgId) => api.get(`/organizations/${orgId}`),
  update: (orgId, body) => api.patch(`/organizations/${orgId}`, body),
  settings: (orgId, body) => api.put(`/organizations/${orgId}/settings`, body),
  members: (orgId, params) => api.get(`/organizations/${orgId}/members${query(params)}`),
  addMember: (orgId, body) => api.post(`/organizations/${orgId}/members`, body),
  updateMember: (orgId, memberId, body) =>
    api.patch(`/organizations/${orgId}/members/${memberId}`, body),
  invitations: (orgId) => api.get(`/organizations/${orgId}/invitations`),
  invitationLink: (orgId, invitationId) =>
    api.get(`/organizations/${orgId}/invitations/${invitationId}/link`),
  invite: (orgId, body) => api.post(`/organizations/${orgId}/invitations`, body),
  revokeInvitation: (orgId, invitationId) =>
    api.delete(`/organizations/${orgId}/invitations/${invitationId}`),
};
export const inviteApi = {
  info: (token) => api.get(`/invitations/${token}`),
  accept: (token, body) => api.post(`/invitations/${token}/accept`, body),
  acceptExisting: (token) => api.post(`/invitations/${token}/accept-existing`),
};
export const candidateApi = {
  profile: () => api.get("/candidates/me/profile"),
  updateProfile: (body) => api.patch("/candidates/me/profile", body),
  recommendations: (limit = 20) => api.get(`/candidates/me/recommendations${query({ limit })}`),
  applications: (params) => api.get(`/candidates/me/applications${query(params)}`),
  application: (applicationId) => api.get(`/candidates/me/applications/${applicationId}`),
  withdraw: (applicationId, reason) =>
    api.post(`/candidates/me/applications/${applicationId}/withdraw`, { reason }),
  interviews: () => api.get("/candidates/me/interviews"),
};
export const resumeApi = {
  list: () => api.get("/candidates/me/resumes"),
  detail: (versionId) => api.get(`/candidates/me/resumes/versions/${versionId}`),
  upload: (file, onUploadProgress) => {
    const form = new FormData();
    form.append("resume", file);
    return api.post("/candidates/me/resumes", form, {
      headers: { "Content-Type": undefined },
      onUploadProgress,
      timeout: 60000,
    });
  },
  download: (versionId) =>
    api.get(`/candidates/me/resumes/versions/${versionId}/download`, { responseType: "blob" }),
  remove: (versionId) => api.delete(`/candidates/me/resumes/versions/${versionId}`),
  retry: (versionId) => api.post(`/candidates/me/resumes/versions/${versionId}/retry`),
  analysis: (versionId) => api.post(`/candidates/me/resumes/versions/${versionId}/analysis`),
  tailor: (versionId, jobId) =>
    api.post(`/candidates/me/resumes/versions/${versionId}/tailor`, { jobId }),
  jobRun: (runId) => api.get(`/job-runs/${runId}`),
};
export const jobsApi = {
  list: (params, config = {}) => api.get(`/jobs${query(params)}`, config),
  get: (jobId) => api.get(`/jobs/${jobId}`),
  related: (jobId) => api.get(`/jobs/${jobId}/related`),
  fit: (jobId, resumeVersionId, preferences) =>
    api.post(`/jobs/${jobId}/fit`, { resumeVersionId, preferences }),
  apply: (jobId, body, key) =>
    api.post(`/jobs/${jobId}/applications`, body, {
      headers: key ? { "Idempotency-Key": key } : {},
    }),
  saved: () => api.get("/candidates/me/saved-jobs"),
  save: (jobId) => api.post(`/candidates/me/saved-jobs/${jobId}`),
  unsave: (jobId) => api.delete(`/candidates/me/saved-jobs/${jobId}`),
  orgList: (orgId, params) => api.get(`/organizations/${orgId}/jobs${query(params)}`),
  create: (orgId, body) => api.post(`/organizations/${orgId}/jobs`, body),
  update: (orgId, jobId, body) => api.patch(`/organizations/${orgId}/jobs/${jobId}`, body),
  publish: (orgId, jobId) => api.post(`/organizations/${orgId}/jobs/${jobId}/publish`),
  close: (orgId, jobId) => api.post(`/organizations/${orgId}/jobs/${jobId}/close`),
  assigned: (orgId) => api.get(`/organizations/${orgId}/assigned-jobs`),
  setHiringTeam: (orgId, jobId, memberIds) =>
    api.put(`/organizations/${orgId}/jobs/${jobId}/hiring-team`, { memberIds }),
};
export const companiesApi = {
  list: () => api.get("/companies"),
  get: (slug) => api.get(`/companies/${slug}`),
  jobs: (slug, params = {}) => api.get(`/companies/${slug}/jobs${query(params)}`),
};
export const alertsApi = {
  list: () => api.get("/candidates/me/alerts"),
  create: (body) => api.post("/candidates/me/alerts", body),
  update: (id, body) => api.patch(`/candidates/me/alerts/${id}`, body),
  remove: (id) => api.delete(`/candidates/me/alerts/${id}`),
};
export const historyApi = {
  list: (params = {}) => api.get(`/candidates/me/search-history${query(params)}`),
  clear: () => api.delete("/candidates/me/search-history"),
};
export const recruitmentApi = {
  applications: (orgId, jobId, params) =>
    api.get(`/organizations/${orgId}/jobs/${jobId}/applications${query(params)}`),
  detail: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}`),
  transition: (orgId, appId, body) =>
    api.post(`/organizations/${orgId}/applications/${appId}/transitions`, body),
  shortlist: (orgId, appId, note) =>
    api.post(`/organizations/${orgId}/applications/${appId}/shortlist`, { note }),
  match: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}/match`),
  ranking: (orgId, jobId, params) =>
    api.get(`/organizations/${orgId}/jobs/${jobId}/ranking${query(params)}`),
  compare: (orgId, applicationIds) =>
    api.post(`/organizations/${orgId}/applications/compare`, { applicationIds }),
  search: (orgId, params, config = {}) =>
    api.get(`/organizations/${orgId}/candidates/search${query(params)}`, config),
  notes: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}/notes`),
  addNote: (orgId, appId, body) =>
    api.post(`/organizations/${orgId}/applications/${appId}/notes`, body),
  tags: (orgId, appId, tags) =>
    api.put(`/organizations/${orgId}/applications/${appId}/tags`, { tags }),
  message: (orgId, appId, body, key) =>
    api.post(`/organizations/${orgId}/applications/${appId}/messages`, body, {
      headers: { "Idempotency-Key": key },
    }),
  resume: (orgId, appId) =>
    api.get(`/organizations/${orgId}/applications/${appId}/resume`, { responseType: "blob" }),
};
export const interviewApi = {
  list: (orgId, params) => api.get(`/organizations/${orgId}/interviews${query(params)}`),
  get: (orgId, id) => api.get(`/organizations/${orgId}/interviews/${id}`),
  create: (orgId, body, key) =>
    api.post(`/organizations/${orgId}/interviews`, body, {
      headers: key ? { "Idempotency-Key": key } : {},
    }),
  update: (orgId, id, body) => api.patch(`/organizations/${orgId}/interviews/${id}`, body),
  cancel: (orgId, id, reason) =>
    api.post(`/organizations/${orgId}/interviews/${id}/cancel`, { reason }),
  complete: (orgId, id) => api.post(`/organizations/${orgId}/interviews/${id}/complete`),
  candidateGet: (id) => api.get(`/interviews/${id}`),
  confirm: (id) => api.post(`/interviews/${id}/confirm`),
  reschedule: (id, reason) => api.post(`/interviews/${id}/reschedule`, { reason }),
  prep: (id) => api.post(`/interviews/${id}/preparation`),
  feedback: (orgId, id, bodyOrRatings, recommendation, summary) => {
    const body = Array.isArray(bodyOrRatings)
      ? { ratings: bodyOrRatings, recommendation, summary }
      : bodyOrRatings;
    return api.post(`/organizations/${orgId}/interviews/${id}/feedback`, body);
  },
  questions: (orgId, id) => api.post(`/organizations/${orgId}/interviews/${id}/questions`),
};
export const notificationApi = {
  list: (params) => api.get(`/notifications${query(params)}`),
  read: (id) => api.post(`/notifications/${id}/read`),
  markUnread: (id) => api.post(`/notifications/${id}/unread`),
  readAll: () => api.post("/notifications/read-all"),
  unreadCount: () => api.get("/notifications/unread-count"),
  preferences: () => api.get("/notifications/preferences"),
};
export const aiApi = {
  run: (feature, input, subject = {}) => api.post(`/ai/${feature}`, { input, ...subject }),
  runOrg: (orgId, feature, input, subject = {}) =>
    api.post(`/organizations/${orgId}/ai/${feature}`, { input, ...subject }),
  nlSearch: (text) => api.post("/ai/nl_job_search", { input: { text } }),
};
export const analyticsApi = {
  recruitment: (orgId, params) =>
    api.get(`/organizations/${orgId}/analytics/recruitment${query(params)}`),
  ai: (orgId) => api.get(`/organizations/${orgId}/analytics/ai-usage`),
};
export const adminApi = {
  users: (params) => api.get(`/admin/users${query(params)}`),
  organizations: (params) => api.get(`/admin/organizations${query(params)}`),
  overviewAnalytics: (params) => api.get(`/admin/analytics/overview${query(params)}`),
  revenueAnalytics: () => api.get("/admin/analytics/revenue"),
  orgVerificationDetails: (orgId) => api.get(`/admin/organizations/${orgId}/verification`),
  verifyOrg: (orgId, notes) => api.post(`/admin/organizations/${orgId}/verify`, { notes }),
  rejectOrg: (orgId, reason) => api.post(`/admin/organizations/${orgId}/reject`, { reason }),
  requestMoreInfoOrg: (orgId, notes) =>
    api.post(`/admin/organizations/${orgId}/request-info`, { notes }),
  suspendOrg: (orgId, reason) => api.post(`/admin/organizations/${orgId}/suspend`, { reason }),
  reactivateOrg: (orgId, reason) => api.post(`/admin/organizations/${orgId}/reactivate`, { reason }),
  moderationCompanies: (params) => api.get(`/admin/moderation/companies${query(params)}`),
  companyModerationJobs: (orgId, params) =>
    api.get(`/admin/moderation/companies/${orgId}/jobs${query(params)}`),
  bulkApproveJobs: (orgId) => api.post(`/admin/moderation/companies/${orgId}/approve-all`),
  placements: (params) => api.get(`/admin/placements${query(params)}`),
  verifyPlacement: (placementId, body) =>
    api.post(`/admin/placements/${placementId}/verify`, body),
  audit: (params) => api.get(`/admin/audit-logs${query(params)}`),
  security: (params) => api.get(`/admin/security-events${query(params)}`),
  suspend: (id, reason) => api.post(`/admin/users/${id}/suspend`, { reason }),
  reactivate: (id, reason) => api.post(`/admin/users/${id}/reactivate`, { reason }),
  aiUsage: () => api.get("/admin/ai-usage"),
  aiActivity: (params = {}) => api.get(`/admin/ai-activity${query(params)}`),
  live: () => api.get("/health/live"),
  ready: () => api.get("/health/ready"),
  moderation: (params = {}) => api.get(`/admin/moderation/jobs${query(params)}`),
  moderate: (jobId, action, reason) =>
    api.post(`/admin/moderation/jobs/${jobId}/${action}`, reason ? { reason } : {}),
};

export const placementApi = {
  myPlacements: (params) => api.get(`/candidates/me/placements${query(params)}`),
  confirmJoining: (placementId, body) =>
    api.post(`/candidates/me/placements/${placementId}/confirm-joining`, body),
  orgPlacements: (orgId, params) => api.get(`/organizations/${orgId}/placements${query(params)}`),
  updateEmploymentStatus: (placementId, body) =>
    api.patch(`/placements/${placementId}/employment-status`, body),
};

// Company verification (Phase 2). Recruiters see only their own status; admins see the full case.
export const verificationApi = {
  get: (orgId) => api.get(`/organizations/${orgId}/verification`),
  submit: (orgId, body) => api.post(`/organizations/${orgId}/verification`, body),
  sendBusinessEmailCode: (orgId) => api.post(`/organizations/${orgId}/verification/business-email`),
  confirmBusinessEmailCode: (orgId, code) =>
    api.post(`/organizations/${orgId}/verification/business-email/confirm`, { code }),
  uploadDocument: (orgId, file, documentType) => {
    const form = new FormData();
    form.append("documentType", documentType);
    form.append("file", file);
    return api.post(`/organizations/${orgId}/verification/documents`, form, {
      headers: { "Content-Type": undefined },
      timeout: 60000,
    });
  },
  adminQueue: (params) => api.get(`/admin/verification/cases${query(params)}`),
  adminCase: (caseId) => api.get(`/admin/verification/cases/${caseId}`),
  adminRecordCheck: (caseId, body) => api.post(`/admin/verification/cases/${caseId}/checks`, body),
  adminRegistryCheck: (caseId) => api.post(`/admin/verification/cases/${caseId}/registry-check`),
  adminRequestChanges: (caseId, items) =>
    api.post(`/admin/verification/cases/${caseId}/request-changes`, { items }),
  adminApprove: (caseId, notes) => api.post(`/admin/verification/cases/${caseId}/approve`, { notes }),
  adminReject: (caseId, reason) => api.post(`/admin/verification/cases/${caseId}/reject`, { reason }),
  adminSuspend: (caseId, reason) => api.post(`/admin/verification/cases/${caseId}/suspend`, { reason }),
  adminRestore: (caseId, reason) => api.post(`/admin/verification/cases/${caseId}/restore`, { reason }),
  downloadDocument: (documentId) =>
    api.get(`/admin/verification/documents/${documentId}`, { responseType: "blob" }),
};

// Organization billing calls name the organization explicitly. Candidates send no header.
const orgConfig = (organizationId) =>
  organizationId ? { headers: { "X-Organization-Id": String(organizationId) } } : undefined;
export const subscriptionApi = {
  plans: () => api.get("/subscriptions/plans"),
  current: (organizationId) => api.get("/subscriptions/current", orgConfig(organizationId)),
  checkout: (body, organizationId) =>
    api.post("/subscriptions/checkout", body, orgConfig(organizationId)),
  verifyPayment: (body, organizationId) =>
    api.post("/subscriptions/verify-payment", body, orgConfig(organizationId)),
  cancel: (organizationId) => api.post("/subscriptions/cancel", undefined, orgConfig(organizationId)),
  invoices: (params, organizationId) =>
    api.get(`/subscriptions/invoices${query(params)}`, orgConfig(organizationId)),
};
export const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};
