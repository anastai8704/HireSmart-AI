import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import Button from "../ui/Button";
import Logo from "../brand/Logo";
import { useAuth } from "../../context/useAuth";
import { cn } from "../../lib/utils";

/**
 * Public navigation. The four destinations map to real routes only:
 * job search, company directory, resume check and the employer sign-up /
 * workspace. When a visitor is already signed in we send them to the
 * workspace they actually have instead of a sign-up form.
 */
const NAV_LINKS = [
  { to: "/jobs", label: "Find Jobs" },
  { to: "/companies", label: "Companies" },
  { to: "/resume-check", label: "Resume Check" },
  { to: "/auth/register/recruiter", label: "For Employers", employer: true },
];

const linkClass = ({ isActive }) =>
  cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
    isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100/80 hover:text-ink-950",
  );

const mobileLinkClass = ({ isActive }) =>
  cn(
    "rounded-xl px-3 py-3 text-base font-medium transition-colors duration-150",
    isActive ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-ink-100/80 hover:text-ink-950",
  );

const Navbar = () => {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Escape closes the menu, matching native dialog behaviour.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const workspaceHome =
    auth.role === "admin"
      ? "/app/admin"
      : auth.organizationId
        ? `/app/o/${auth.organizationId}`
        : "/app/candidate";
  const links = NAV_LINKS.map((link) =>
    link.employer && auth.organizationId ? { ...link, to: workspaceHome } : link,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/90 backdrop-blur-xl">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-17 lg:px-8"
      >
        <Link to="/" className="flex shrink-0 transition-opacity hover:opacity-90" aria-label="HireSmart AI — home">
          <Logo tone="dark" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <NavLink key={link.label} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {auth.isAuthenticated ? (
            <Button
              as={Link}
              to={workspaceHome}
              size="sm"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Open workspace
            </Button>
          ) : (
            <>
              <Button as={Link} to="/auth/login" variant="ghost" size="sm" className="px-4">
                Sign in
              </Button>
              <Button as={Link} to="/auth/register/candidate" size="sm" variant="gradient">
                Get Started
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950 md:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {open && (
        <div
          id="mobile-navigation"
          className="animate-fade-in border-t border-ink-200 bg-white px-4 pb-5 pt-2 sm:px-6 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink key={link.label} to={link.to} className={mobileLinkClass} onClick={close}>
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="mt-3 grid gap-2 border-t border-ink-100 pt-4">
            {auth.isAuthenticated ? (
              <Button
                as={Link}
                to={workspaceHome}
                fullWidth
                onClick={close}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Open workspace
              </Button>
            ) : (
              <>
                <Button
                  as={Link}
                  to="/auth/register/candidate"
                  fullWidth
                  variant="gradient"
                  onClick={close}
                >
                  Get Started
                </Button>
                <Button as={Link} to="/auth/login" variant="secondary" fullWidth onClick={close}>
                  Sign in
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
