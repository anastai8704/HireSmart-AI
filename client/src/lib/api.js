import api from "./apiClient";

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") search.set(key, value); });
  return search.size ? `?${search}` : "";
};
const id = (value) => value?.id || value?._id;
export const normalize = (value) => value && typeof value === "object" ? { ...value, id: id(value) } : value;

export const authApi = {
  register: (body) => api.post("/auth/register", body),
  verify: (token) => api.post("/auth/verify-email", { token }),
  resend: (email) => api.post("/auth/verification-emails", { email }),
  login: (body) => api.post("/auth/login", body),
  logout: () => api.post("/auth/logout"),
  forgot: (email) => api.post("/auth/password/forgot", { email }),
  reset: (body) => api.post("/auth/password/reset", body),
  changePassword: (body) => api.patch("/auth/password", body),
  sessions: () => api.get("/auth/sessions"),
  revokeSession: (sessionId) => api.delete(`/auth/sessions/${sessionId}`),
};
export const userApi = {
  me: () => api.get("/users/me"), exportData: () => api.get("/users/me/export", { responseType: "blob" }),
  remove: (reason) => api.delete("/users/me", { data: { reason } }),
  consents: () => api.get("/users/me/consents"), consent: (purpose, body) => api.put(`/users/me/consents/${purpose}`, body),
};
export const organizationApi = {
  list: () => api.get("/organizations"), create: (body) => api.post("/organizations", body),
  get: (orgId) => api.get(`/organizations/${orgId}`), update: (orgId, body) => api.patch(`/organizations/${orgId}`, body),
  members: (orgId, params) => api.get(`/organizations/${orgId}/members${query(params)}`),
  addMember: (orgId, body) => api.post(`/organizations/${orgId}/members`, body),
  updateMember: (orgId, memberId, body) => api.patch(`/organizations/${orgId}/members/${memberId}`, body),
  invitations: (orgId) => api.get(`/organizations/${orgId}/invitations`),
  invite: (orgId, body) => api.post(`/organizations/${orgId}/invitations`, body),
  revokeInvitation: (orgId, invitationId) => api.delete(`/organizations/${orgId}/invitations/${invitationId}`),
};
export const inviteApi = {
  info: (token) => api.get(`/invitations/${token}`),
  accept: (token, body) => api.post(`/invitations/${token}/accept`, body),
  acceptExisting: (token) => api.post(`/invitations/${token}/accept-existing`),
};
export const candidateApi = {
  profile: () => api.get("/candidates/me/profile"), updateProfile: (body) => api.patch("/candidates/me/profile", body),
  recommendations: (limit = 20) => api.get(`/candidates/me/recommendations${query({ limit })}`),
  applications: (params) => api.get(`/candidates/me/applications${query(params)}`),
  application: (applicationId) => api.get(`/candidates/me/applications/${applicationId}`),
  withdraw: (applicationId, reason) => api.post(`/candidates/me/applications/${applicationId}/withdraw`, { reason }),
  interviews: () => api.get("/candidates/me/interviews"),
};
export const resumeApi = {
  list: () => api.get("/candidates/me/resumes"), detail: (versionId) => api.get(`/candidates/me/resumes/versions/${versionId}`),
  upload: (file, onUploadProgress) => { const form = new FormData(); form.append("resume", file); return api.post("/candidates/me/resumes", form, { headers: { "Content-Type": undefined }, onUploadProgress, timeout: 60000 }); },
  download: (versionId) => api.get(`/candidates/me/resumes/versions/${versionId}/download`, { responseType: "blob" }),
  remove: (versionId) => api.delete(`/candidates/me/resumes/versions/${versionId}`), retry: (versionId) => api.post(`/candidates/me/resumes/versions/${versionId}/retry`),
  analysis: (versionId) => api.post(`/candidates/me/resumes/versions/${versionId}/analysis`),
  tailor: (versionId, jobId) => api.post(`/candidates/me/resumes/versions/${versionId}/tailor`, { jobId }),
  jobRun: (runId) => api.get(`/job-runs/${runId}`),
};
export const jobsApi = {
  list: (params, config = {}) => api.get(`/jobs${query(params)}`, config), get: (jobId) => api.get(`/jobs/${jobId}`),
  fit: (jobId, resumeVersionId, preferences) => api.post(`/jobs/${jobId}/fit`, { resumeVersionId, preferences }),
  apply: (jobId, body, key) => api.post(`/jobs/${jobId}/applications`, body, { headers: key ? { "Idempotency-Key": key } : {} }),
  saved: () => api.get("/candidates/me/saved-jobs"), save: (jobId) => api.post(`/candidates/me/saved-jobs/${jobId}`), unsave: (jobId) => api.delete(`/candidates/me/saved-jobs/${jobId}`),
  orgList: (orgId, params) => api.get(`/organizations/${orgId}/jobs${query(params)}`), create: (orgId, body) => api.post(`/organizations/${orgId}/jobs`, body),
  update: (orgId, jobId, body) => api.patch(`/organizations/${orgId}/jobs/${jobId}`, body), publish: (orgId, jobId) => api.post(`/organizations/${orgId}/jobs/${jobId}/publish`), close: (orgId, jobId) => api.post(`/organizations/${orgId}/jobs/${jobId}/close`),
  assigned: (orgId) => api.get(`/organizations/${orgId}/assigned-jobs`), setHiringTeam: (orgId, jobId, memberIds) => api.put(`/organizations/${orgId}/jobs/${jobId}/hiring-team`, { memberIds }),
};
export const recruitmentApi = {
  applications: (orgId, jobId, params) => api.get(`/organizations/${orgId}/jobs/${jobId}/applications${query(params)}`),
  detail: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}`), transition: (orgId, appId, body) => api.post(`/organizations/${orgId}/applications/${appId}/transitions`, body),
  shortlist: (orgId, appId, note) => api.post(`/organizations/${orgId}/applications/${appId}/shortlist`, { note }),
  match: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}/match`), ranking: (orgId, jobId, params) => api.get(`/organizations/${orgId}/jobs/${jobId}/ranking${query(params)}`),
  compare: (orgId, applicationIds) => api.post(`/organizations/${orgId}/applications/compare`, { applicationIds }),
  search: (orgId, params, config = {}) => api.get(`/organizations/${orgId}/candidates/search${query(params)}`, config),
  notes: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}/notes`), addNote: (orgId, appId, body) => api.post(`/organizations/${orgId}/applications/${appId}/notes`, body),
  tags: (orgId, appId, tags) => api.put(`/organizations/${orgId}/applications/${appId}/tags`, { tags }), message: (orgId, appId, body, key) => api.post(`/organizations/${orgId}/applications/${appId}/messages`, body, { headers: { "Idempotency-Key": key } }),
  resume: (orgId, appId) => api.get(`/organizations/${orgId}/applications/${appId}/resume`, { responseType: "blob" }),
};
export const interviewApi = {
  list: (orgId, params) => api.get(`/organizations/${orgId}/interviews${query(params)}`), create: (orgId, body, key) => api.post(`/organizations/${orgId}/interviews`, body, { headers: key ? { "Idempotency-Key": key } : {} }), update: (orgId, id, body) => api.patch(`/organizations/${orgId}/interviews/${id}`, body),
  cancel: (orgId, id, reason) => api.post(`/organizations/${orgId}/interviews/${id}/cancel`, { reason }), complete: (orgId, id) => api.post(`/organizations/${orgId}/interviews/${id}/complete`),
  confirm: (id) => api.post(`/interviews/${id}/confirm`), reschedule: (id, reason) => api.post(`/interviews/${id}/reschedule`, { reason }), prep: (id) => api.post(`/interviews/${id}/preparation`),
  feedback: (orgId, id, body) => api.post(`/organizations/${orgId}/interviews/${id}/feedback`, body), questions: (orgId, id) => api.post(`/organizations/${orgId}/interviews/${id}/questions`),
};
export const notificationApi = { list: (params) => api.get(`/notifications${query(params)}`), read: (id) => api.post(`/notifications/${id}/read`), readAll: () => api.post("/notifications/read-all") };
export const aiApi = { run: (feature, input, subject = {}) => api.post(`/ai/${feature}`, { input, ...subject }), runOrg: (orgId, feature, input, subject = {}) => api.post(`/organizations/${orgId}/ai/${feature}`, { input, ...subject }) };
export const analyticsApi = { recruitment: (orgId, params) => api.get(`/organizations/${orgId}/analytics/recruitment${query(params)}`), ai: (orgId) => api.get(`/organizations/${orgId}/analytics/ai-usage`) };
export const adminApi = { users: (params) => api.get(`/admin/users${query(params)}`), organizations: (params) => api.get(`/admin/organizations${query(params)}`), audit: (params) => api.get(`/admin/audit-logs${query(params)}`), security: (params) => api.get(`/admin/security-events${query(params)}`), suspend: (id, reason) => api.post(`/admin/users/${id}/suspend`, { reason }), reactivate: (id, reason) => api.post(`/admin/users/${id}/reactivate`, { reason }), aiUsage: () => api.get("/admin/ai-usage"), live: () => api.get("/health/live"), ready: () => api.get("/health/ready") };
export const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
