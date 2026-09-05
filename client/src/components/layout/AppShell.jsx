import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { cn, initials } from "../../lib/utils";

const candidateGroups = [
  [
    "Workspace",
    [
      ["/app/candidate", "Home", LayoutDashboard],
      ["/app/candidate/jobs", "Discover", Search],
      ["/app/candidate/applications", "Applications", BriefcaseBusiness],
      ["/app/candidate/interviews", "Interviews", Video],
      ["/app/candidate/resumes", "Resumes", FileText],
      ["/app/candidate/alerts", "Alerts", Bell],
    ],
  ],
  ["Assistant", ["/app/candidate/copilot", "Career Assistant", Sparkles]],
];
const recruiterGroups = (org) => [
  [
    "Hiring",
    [
      [`/app/o/${org}`, "Overview", LayoutDashboard],
      [`/app/o/${org}/jobs`, "Jobs", BriefcaseBusiness],
      [`/app/o/${org}/candidates`, "Candidates", UsersRound],
      [`/app/o/${org}/interviews`, "Interviews", Video],
      [`/app/o/${org}/compare`, "Compare", HeartHandshake],
    ],
  ],
  [
    "Insights",
    [
      [`/app/o/${org}/analytics`, "Analytics", ChartNoAxesCombined],
      [`/app/o/${org}/copilot`, "AI Assistant", Sparkles],
    ],
  ],
  ["Workspace", [`/app/o/${org}/team`, "Team", Building2]],
];
const managerGroups = (org) => [
  [
    "Hiring",
    [
      [`/app/o/${org}/assigned`, "Assigned Jobs", HeartHandshake],
      [`/app/o/${org}/candidates`, "Candidates", UsersRound],
      [`/app/o/${org}/interviews`, "Interviews", Video],
    ],
  ],
];
const adminGroups = [
  [
    "Platform",
    [
      ["/app/admin", "Overview", LayoutDashboard],
      ["/app/admin/moderation", "Approvals", BriefcaseBusiness],
      ["/app/admin/users", "Users", UserRound],
      ["/app/admin/organizations", "Companies", Building2],
    ],
  ],
  [
    "Insights",
    [
      ["/app/admin/ai-usage", "AI Activity", Sparkles],
      ["/app/admin/security", "Security & Audit", ShieldCheck],
    ],
  ],
];

const AppShell = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = auth.role === "admin";
  const groups = isAdmin
    ? adminGroups
    : auth.organization
      ? ["hiring_manager", "interviewer", "viewer"].includes(auth.membership?.role)
        ? managerGroups(auth.organizationId)
        : recruiterGroups(auth.organizationId)
      : candidateGroups;
  const switchOrg = (event) => {
    const value = event.target.value;
    auth.setOrganizationId(value);
    navigate(value ? `/app/o/${value}` : "/app/candidate");
    setOpen(false);
  };
  const signOut = async () => {
    await auth.logout();
    navigate("/");
  };
  return (
    <div className="min-h-screen bg-canvas text-ink-900">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink-800 bg-ink-950 text-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-18 items-center justify-between px-5">
          <NavLink to="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-[17px]">
              HireSmart <span className="text-brand-300">AI</span>
            </span>
          </NavLink>
          <button
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!isAdmin && auth.organizations.length > 0 && (
          <div className="px-4 pb-2 pt-1">
            <label
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-ink-500"
              htmlFor="organization-switcher"
            >
              Workspace
            </label>
            <div className="relative">
              <select
                id="organization-switcher"
                value={auth.organizationId || ""}
                onChange={switchOrg}
                className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-3 pr-8 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                {auth.role === "candidate" && <option value="">Candidate workspace</option>}
                {auth.organizations.map((item) => (
                  <option key={item.id} value={item.id} className="bg-ink-900">
                    {item.name} · {item.role.replace("_", " ")}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-ink-400" />
            </div>
          </div>
        )}
        <nav
          className="flex-1 space-y-1 overflow-y-auto px-3 py-3"
          aria-label="Workspace navigation"
        >
          {groups.map(([label, items]) => (
            <div key={label} className="mb-1.5">
              <p className="px-3 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-ink-500">
                {label}
              </p>
              {items.map(([to, itemLabel, Icon]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={itemLabel === "Home" || itemLabel === "Overview"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-white text-ink-950 shadow-sm"
                        : "text-ink-300 hover:bg-white/8 hover:text-white",
                    )
                  }
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {itemLabel}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold">
              {initials(auth.user?.displayName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{auth.user?.displayName}</span>
              <span className="block truncate text-xs text-ink-400">
                {auth.workspaceRole?.replace("_", " ")}
              </span>
            </span>
            <NavLink
              to="/app/settings"
              className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </NavLink>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-400 transition-colors hover:bg-danger-500/10 hover:text-danger-500"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 hover:bg-ink-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 items-center gap-2 text-sm font-medium text-ink-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
            <span className="truncate">
              {auth.organization?.name ||
                (isAdmin ? "Platform administration" : "Candidate workspace")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/app/notifications"
              className="relative rounded-xl border border-ink-200 bg-white p-2.5 text-ink-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
            </NavLink>
            <span className="hidden h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white sm:grid">
              {initials(auth.user?.displayName)}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
export default AppShell;
