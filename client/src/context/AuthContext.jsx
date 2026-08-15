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

import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { authApi, userApi } from "../lib/api";
import { setUnauthorizedHandler, tokenStorage } from "../lib/apiClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    // Lazy initialiser: if there is no stored token we already know the visitor
    // is anonymous, so we start in that state instead of rendering "loading"
    // and immediately calling setState from an effect (which costs a render).
    const [status, setStatus] = useState(() =>
        tokenStorage.get() ? "loading" : "anonymous"
    );

    /**
     * On first load, a token in localStorage means the user was signed in
     * previously. We do NOT trust it blindly - we ask the server for the
     * profile. If the token expired the request fails and we sign out.
     */
    const bootstrap = useCallback(async () => {
        // No token means there is nothing to verify; the initial state above is
        // already correct.
        if (!tokenStorage.get()) {
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
        // bootstrap() only calls setState after awaiting the network, so this is
        // the "subscribe to an external system" case the docs endorse, not a
        // synchronous cascade. The linter cannot see across the await boundary.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

export default AuthContext;
