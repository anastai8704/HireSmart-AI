/**
 * NotFound.jsx - the 404 page.
 * A dead end is a bad experience, so we always offer a way back.
 */

import { Link } from "react-router-dom";
import { Home, Search } from "lucide-react";

import Button from "../components/ui/Button";

const NotFound = () => (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-7xl font-extrabold text-brand-100">404</p>

        <h1 className="mt-4 text-2xl font-bold text-ink-900">Page not found</h1>

        <p className="mt-2 max-w-md text-sm text-ink-500">
            The page you are looking for does not exist, or it may have been moved.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button as={Link} to="/" leftIcon={<Home className="h-4 w-4" />}>
                Back to home
            </Button>

            <Button
                as={Link}
                to="/jobs"
                variant="secondary"
                leftIcon={<Search className="h-4 w-4" />}
            >
                Browse jobs
            </Button>
        </div>
    </div>
);

export default NotFound;
