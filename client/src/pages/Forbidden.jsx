/**
 * Forbidden.jsx - shown when a signed-in user reaches a page their role cannot
 * access (for example a candidate opening a recruiter URL directly).
 *
 * We send them somewhere useful rather than just saying "no".
 */

import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import Button from "../components/ui/Button";
import { homeRouteForRole } from "../components/layout/ProtectedRoute";
import { useAuth } from "../context/AuthContext";

const Forbidden = () => {
    const { role } = useAuth();

    return (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-50">
                <ShieldAlert className="h-8 w-8 text-danger-500" aria-hidden="true" />
            </span>

            <h1 className="mt-5 text-2xl font-bold text-ink-900">Access denied</h1>

            <p className="mt-2 max-w-md text-sm text-ink-500">
                Your account role ({role || "guest"}) does not have permission to view this
                page.
            </p>

            <Button as={Link} to={homeRouteForRole(role)} className="mt-7">
                Go to your dashboard
            </Button>
        </div>
    );
};

export default Forbidden;
