/**
 * apiClient.js
 * -----------------------------------------------------------------------------
 * One configured axios instance that every API call in the app goes through.
 *
 * WHY A SINGLE CLIENT INSTEAD OF CALLING fetch() EVERYWHERE
 *   1. The auth token is attached automatically - no component ever handles it.
 *   2. Expired sessions are handled in ONE place (401 -> log out -> /login).
 *   3. Backend error shapes are normalised, so components always receive a
 *      plain readable `error.message`.
 *   4. The base URL is configurable, so dev / staging / production differ only
 *      by an environment variable.
 */

import axios from "axios";

/**
 * We default to a RELATIVE base URL ("/api").
 *
 * That matters: the browser then requests the same origin it was served from,
 * and Vite's dev proxy (see vite.config.js) forwards it to Express. Hard-coding
 * http://localhost:5000 would break the moment the app is opened from any other
 * device or from a hosted preview URL.
 */
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const TOKEN_STORAGE_KEY = "hiresmart.token";

export const tokenStorage = {
    get: () => localStorage.getItem(TOKEN_STORAGE_KEY),
    set: (token) => localStorage.setItem(TOKEN_STORAGE_KEY, token),
    clear: () => localStorage.removeItem(TOKEN_STORAGE_KEY),
};

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
});

/**
 * REQUEST INTERCEPTOR
 * Runs before every outgoing request and attaches the JWT if we have one.
 */
apiClient.interceptors.request.use((config) => {
    const token = tokenStorage.get();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

/**
 * Callback invoked when the server tells us the session is no longer valid.
 * AuthContext registers itself here so it can clear React state too - the
 * API layer stays decoupled from React.
 */
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
    onUnauthorized = handler;
};

/**
 * RESPONSE INTERCEPTOR
 * Converts every failure into a predictable Error with a readable message.
 */
apiClient.interceptors.response.use(
    (response) => response.data,

    (error) => {
        // The request reached the server and it responded with an error status.
        if (error.response) {
            const { status, data } = error.response;

            // The token is missing, invalid or expired. Sign the user out once,
            // centrally, rather than in every screen.
            if (status === 401) {
                tokenStorage.clear();

                if (onUnauthorized) {
                    onUnauthorized();
                }
            }

            const normalised = new Error(
                data?.message || `Request failed with status ${status}`
            );
            normalised.status = status;
            normalised.data = data;

            return Promise.reject(normalised);
        }

        // The request was made but no response came back (server down, offline).
        if (error.request) {
            const offline = new Error(
                "Could not reach the server. Check that the API is running and try again."
            );
            offline.status = 0;
            return Promise.reject(offline);
        }

        return Promise.reject(error);
    }
);

export default apiClient;
