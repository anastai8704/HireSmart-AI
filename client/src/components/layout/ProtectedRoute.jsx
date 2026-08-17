/**
 * ProtectedRoute.jsx
 * -----------------------------------------------------------------------------
 * Route guards.
 *
 * IMPORTANT SECURITY NOTE
 * These guards are a USER-EXPERIENCE feature, not a security boundary. Anyone
 * can edit JavaScript in their browser. The real enforcement is the `protect`
 * and `authorize` middleware on the Express API - the frontend simply avoids
 * showing people screens that would fail anyway.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingState } from "../ui/States";
import { homeRouteForRole } from "../../lib/roleRoutes";
import { useAuth } from "../../context/useAuth";

/**
 * Requires a signed-in user, and optionally a specific role.
 *
 * @param {string[]} allowedRoles  Empty means "any signed-in user".
 */
export const ProtectedRoute = ({ allowedRoles = [] }) => {
    const { isAuthenticated, isLoading, role } = useAuth();
    const location = useLocation();

    // While we are still checking the stored token, render a loader. Redirecting
    // here would bounce signed-in users to /login on every page refresh.
    if (isLoading) {
        return <LoadingState message="Checking your session..." />;
    }

    if (!isAuthenticated) {
        // `state.from` lets the login page send the user back where they were
        // trying to go, instead of dumping them on a generic dashboard.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        return <Navigate to="/forbidden" replace />;
    }

    return <Outlet />;
};

/**
 * The opposite guard: keeps already-signed-in users away from /login and
 * /register, sending them to their own dashboard instead.
 */
export const PublicOnlyRoute = () => {
    const { isAuthenticated, isLoading, role } = useAuth();

    if (isLoading) {
        return <LoadingState message="Loading..." />;
    }

    if (isAuthenticated) {
        return <Navigate to={homeRouteForRole(role)} replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
