import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";
let accessToken = null;
let refreshPromise = null;
let onSessionEnded = null;

export const tokenStore = {
  get: () => accessToken,
  set: (value) => { accessToken = value || null; },
  clear: () => { accessToken = null; },
};

export const setSessionEndedHandler = (handler) => { onSessionEnded = handler; };
const readCookie = (name) => document.cookie.split("; ").find((part) => part.startsWith(`${name}=`))?.split("=").slice(1).join("=") || "";

const apiClient = axios.create({ baseURL: BASE_URL, timeout: 30000, withCredentials: true, headers: { Accept: "application/json" } });

apiClient.interceptors.request.use((request) => {
  if (accessToken) request.headers.Authorization = `Bearer ${accessToken}`;
  return request;
});

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    const csrf = readCookie("hiresmart_csrf");
    refreshPromise = axios.post(`${BASE_URL}/auth/token`, {}, { withCredentials: true, timeout: 15000, headers: csrf ? { "X-CSRF-Token": csrf } : {} })
      .then(({ data }) => { tokenStore.set(data.data.accessToken); return data.data.accessToken; })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;
    const isAuthCall = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/token") || original?.url?.includes("/auth/register");
    if (error.response?.status === 401 && !original?._retried && !isAuthCall) {
      original._retried = true;
      try { const token = await refreshAccessToken(); original.headers.Authorization = `Bearer ${token}`; return apiClient(original); }
      catch { tokenStore.clear(); onSessionEnded?.(); }
    }
    const problem = new Error(error.response?.data?.message || (error.request ? "We could not reach HireSmart. Check your connection and try again." : error.message));
    problem.status = error.response?.status || 0;
    problem.code = code || (error.request ? "NETWORK_ERROR" : "REQUEST_FAILED");
    problem.requestId = error.response?.data?.requestId;
    problem.fieldErrors = error.response?.data?.fieldErrors || [];
    problem.retryAfter = error.response?.headers?.["retry-after"];
    throw problem;
  }
);

export const bootstrapSession = async () => {
  try { return await refreshAccessToken(); } catch { tokenStore.clear(); return null; }
};
export default apiClient;
