/**
 * Navbar.jsx
 * -----------------------------------------------------------------------------
 * The top navigation bar.
 *
 * It is role-aware: a candidate, a recruiter and an admin each see a different
 * set of links, because showing links that 403 on click is a poor experience.
 * The links themselves come from one config object so adding a page is a
 * one-line change.
 */

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
    BarChart3,
    Briefcase,
    ChevronDown,
    FileSearch,
    LayoutDashboard,
    LogOut,
    Menu,
    Settings,
    Sparkles,
    User,
    Users,
    X,
} from "lucide-react";

import Button from "../ui/Button";
import { useAuth } from "../../context/AuthContext";
import { cn, initials } from "../../lib/utils";

/** Navigation entries per role. One place to add or remove a page. */
const NAV_LINKS = {
    anonymous: [
        { to: "/jobs", label: "Browse Jobs", icon: Briefcase },
        { to: "/resume-check", label: "Free Resume Check", icon: FileSearch },
    ],
    candidate: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/jobs", label: "Browse Jobs", icon: Briefcase },
        { to: "/recommendations", label: "For You", icon: Sparkles },
        { to: "/my-applications", label: "Applications", icon: FileSearch },
    ],
    recruiter: [
        { to: "/recruiter", label: "Dashboard", icon: LayoutDashboard },
        { to: "/recruiter/jobs", label: "My Jobs", icon: Briefcase },
        { to: "/recruiter/analytics", label: "Analytics", icon: BarChart3 },
    ],
    admin: [
        { to: "/admin", label: "Overview", icon: LayoutDashboard },
        { to: "/admin/users", label: "Users", icon: Users },
        { to: "/jobs", label: "Jobs", icon: Briefcase },
    ],
};

const Navbar = () => {
    const { user, isAuthenticated, role, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    const links = NAV_LINKS[isAuthenticated ? role : "anonymous"] || NAV_LINKS.anonymous;

    // Close both menus whenever the route changes, otherwise the mobile drawer
    // stays open on top of the page the user just navigated to.
    useEffect(() => {
        setIsMobileOpen(false);
        setIsMenuOpen(false);
    }, [location.pathname]);

    // Close the account dropdown when clicking anywhere outside it.
    useEffect(() => {
        if (!isMenuOpen) return undefined;

        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isMenuOpen]);

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const linkClasses = ({ isActive }) =>
        cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive
                ? "bg-brand-50 text-brand-700"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        );

    return (
        <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur-md">
            <nav
                className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
                aria-label="Main navigation"
            >
                {/* Brand */}
                <Link to="/" className="flex shrink-0 items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-bold tracking-tight text-ink-900">
                        HireSmart<span className="text-brand-600"> AI</span>
                    </span>
                </Link>

                {/* Desktop links */}
                <div className="hidden items-center gap-1 md:flex">
                    {links.map((link) => (
                        <NavLink key={link.to} to={link.to} className={linkClasses} end={link.to === "/"}>
                            {link.label}
                        </NavLink>
                    ))}
                </div>

                {/* Right side */}
                <div className="flex items-center gap-2">
                    {isAuthenticated ? (
                        <div className="relative hidden md:block" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => setIsMenuOpen((open) => !open)}
                                className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-ink-100"
                                aria-expanded={isMenuOpen}
                                aria-haspopup="menu"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                    {initials(user?.name)}
                                </span>

                                <span className="max-w-[8rem] truncate text-sm font-medium text-ink-800">
                                    {user?.name}
                                </span>

                                <ChevronDown
                                    className={cn(
                                        "h-4 w-4 text-ink-400 transition-transform",
                                        isMenuOpen && "rotate-180"
                                    )}
                                    aria-hidden="true"
                                />
                            </button>

                            {isMenuOpen && (
                                <div
                                    className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lg animate-[fade-up_0.15s_ease-out_both]"
                                    role="menu"
                                >
                                    <div className="border-b border-ink-100 px-3 py-2.5">
                                        <p className="truncate text-sm font-semibold text-ink-900">
                                            {user?.name}
                                        </p>
                                        <p className="truncate text-xs text-ink-500">{user?.email}</p>
                                        <span className="mt-1.5 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                                            {role}
                                        </span>
                                    </div>

                                    <Link
                                        to="/profile"
                                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                                        role="menuitem"
                                    >
                                        <User className="h-4 w-4 text-ink-400" aria-hidden="true" />
                                        My Profile
                                    </Link>

                                    <Link
                                        to="/settings"
                                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                                        role="menuitem"
                                    >
                                        <Settings className="h-4 w-4 text-ink-400" aria-hidden="true" />
                                        Settings
                                    </Link>

                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2.5 border-t border-ink-100 px-3 py-2 text-left text-sm text-danger-700 transition-colors hover:bg-danger-50"
                                        role="menuitem"
                                    >
                                        <LogOut className="h-4 w-4" aria-hidden="true" />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="hidden items-center gap-2 md:flex">
                            <Button as={Link} to="/login" variant="ghost" size="sm">
                                Sign in
                            </Button>
                            <Button as={Link} to="/register" size="sm">
                                Get started
                            </Button>
                        </div>
                    )}

                    {/* Mobile toggle */}
                    <button
                        type="button"
                        onClick={() => setIsMobileOpen((open) => !open)}
                        className="rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 md:hidden"
                        aria-label={isMobileOpen ? "Close menu" : "Open menu"}
                        aria-expanded={isMobileOpen}
                    >
                        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </nav>

            {/* Mobile drawer */}
            {isMobileOpen && (
                <div className="border-t border-ink-200 bg-white px-4 py-3 md:hidden">
                    <div className="flex flex-col gap-1">
                        {links.map((link) => {
                            const Icon = link.icon;

                            return (
                                <NavLink
                                    key={link.to}
                                    to={link.to}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                            isActive
                                                ? "bg-brand-50 text-brand-700"
                                                : "text-ink-600 hover:bg-ink-100"
                                        )
                                    }
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {link.label}
                                </NavLink>
                            );
                        })}
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3">
                        {isAuthenticated ? (
                            <>
                                <Link
                                    to="/profile"
                                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100"
                                >
                                    <User className="h-4 w-4" aria-hidden="true" />
                                    My Profile
                                </Link>

                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger-700 hover:bg-danger-50"
                                >
                                    <LogOut className="h-4 w-4" aria-hidden="true" />
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <>
                                <Button as={Link} to="/login" variant="secondary" fullWidth>
                                    Sign in
                                </Button>
                                <Button as={Link} to="/register" fullWidth>
                                    Get started
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
};

export default Navbar;
