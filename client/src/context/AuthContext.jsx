/**
 * AuthContext.jsx
 * -----------------------------------------------------------------------------
 * Holds "who is signed in" for the entire application.
 *
 * WHY CONTEXT RATHER THAN PASSING PROPS
 * The navbar, every dashboard, and every route guard all need the current user.
 * Threading that through a dozen layers of props ("prop drilling") is painful
 * and brittle. React Context lets any component read it directly with useAuth().
 *
 * WHAT LIVES HERE
 *   user        - the signed-in user object, or null
 *   status      - "loading" | "authenticated" | "anonymous"
 *   login()     - authenticate and store the token
 *   register()  - create an account and sign straight in
 *   logout()    - clear the token and state
 *   refresh()   - re-fetch the profile after an update
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authApi, userApi } from "../lib/api";
import { setUnauthorizedHandler, tokenStorage } from "../lib/apiClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [status, setStatus] = useState("loading");

    /**
     * On first load, a token in localStorage means the user was signed in
     * previously. We do NOT trust it blindly - we ask the server for the
     * profile. If the token expired the request fails and we sign out.
     */
    const bootstrap = useCallback(async () => {
        if (!tokenStorage.get()) {
            setStatus("anonymous");
            return;
        }

        try {
            const response = await userApi.getProfile();
            setUser(response.user || response.data || null);
            setStatus("authenticated");
        } catch {
            tokenStorage.clear();
            setUser(null);
            setStatus("anonymous");
        }
    }, []);

    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    /**
     * The API client calls this whenever the server returns 401, so a session
     * that expires mid-use clears the UI immediately instead of leaving the app
     * showing stale data it can no longer refresh.
     */
    useEffect(() => {
        setUnauthorizedHandler(() => {
            setUser(null);
            setStatus("anonymous");
        });
    }, []);

    const login = useCallback(async (credentials) => {
        const response = await authApi.login(credentials);

        tokenStorage.set(response.token);
        setUser(response.user);
        setStatus("authenticated");

        return response.user;
    }, []);

    const register = useCallback(async (payload) => {
        // Recruiters use a separate endpoint because they need company details
        // and (optionally) an invite code.
        const response =
            payload.role === "recruiter"
                ? await authApi.registerRecruiter(payload)
                : await authApi.register(payload);

        // Some deployments require email verification before issuing a token.
        // In that case we return the user without signing them in.
        if (response.token) {
            tokenStorage.set(response.token);
            setUser(response.user);
            setStatus("authenticated");
        }

        return response;
    }, []);

    const logout = useCallback(() => {
        tokenStorage.clear();
        setUser(null);
        setStatus("anonymous");
    }, []);

    /** Re-reads the profile, e.g. after uploading a resume or editing details. */
    const refresh = useCallback(async () => {
        try {
            const response = await userApi.getProfile();
            setUser(response.user || response.data || null);
            return response.user;
        } catch {
            return null;
        }
    }, []);

    const value = useMemo(
        () => ({
            user,
            status,
            isLoading: status === "loading",
            isAuthenticated: status === "authenticated",
            role: user?.role ?? null,
            login,
            register,
            logout,
            refresh,
            setUser,
        }),
        [user, status, login, register, logout, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Reads the auth state. Throws early if used outside the provider. */
export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside an <AuthProvider>");
    }

    return context;
};

export default AuthContext;
