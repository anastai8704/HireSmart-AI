/**
 * useAuth.js
 * -----------------------------------------------------------------------------
 * The hook for reading auth state.
 *
 * Kept separate from AuthContext.jsx so that file exports only the
 * <AuthProvider> component, which keeps Vite's Fast Refresh working.
 */

import { useContext } from "react";

import AuthContext from "./AuthContext";

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used inside an <AuthProvider>");
    }

    return context;
};

export default useAuth;
