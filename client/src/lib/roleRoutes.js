/**
 * roleRoutes.js
 * -----------------------------------------------------------------------------
 * Maps a user role to the page they should land on after signing in.
 *
 * This lives in its own module (rather than beside the route guards) so that
 * files exporting React components export ONLY components. Mixing components
 * and plain helpers in one file breaks Vite's Fast Refresh, which then reloads
 * the whole page on every edit instead of hot-swapping the component.
 */

export const homeRouteForRole = (role) =>
    ({
        candidate: "/dashboard",
        recruiter: "/recruiter",
        admin: "/admin",
    }[role] || "/");

export default homeRouteForRole;
