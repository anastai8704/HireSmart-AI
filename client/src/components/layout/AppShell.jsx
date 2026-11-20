import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  CreditCard,
  DollarSign,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/useAuth";
import { notificationApi } from "../../lib/api";
import { cn, formatDate, formatRelativeTime, notificationTarget } from "../../lib/utils";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { Logo, LogoMark } from "../brand/Logo";
import { PlanBadge } from "../billing/PlanBadge";
import { SearchableSelect } from "../ui/SearchableSelect";

const candidateGroups = [
  [
    "Workspace",
    [
      ["/app/candidate", "Dashboard", LayoutDashboard],
      ["/app/candidate/jobs", "Job Discovery", Search],
      ["/app/candidate/applications", "Applications", BriefcaseBusiness],
      ["/app/candidate/interviews", "Interviews", Video],
      ["/app/candidate/placements", "Placements & Employment", BadgeCheck],
    ],
  ],
  [
    "Career Assets",
    [
      ["/app/candidate/resumes", "Resume Manager", FileText],
      ["/app/candidate/copilot", "Career AI Copilot", Sparkles, "Career Assistant"],
    ],
  ],
  [
    "Account",
    [
      ["/app/candidate/plans", "Subscription & Plan", CreditCard],
      ["/app/candidate/alerts", "Alerts", Bell],
      ["/app/profile", "Profile", UserRound],
      ["/app/settings", "Settings", Settings],
    ],
  ],
];

const recruiterGroups = (org) => [
  [
    "Hiring",
    [
      [`/app/o/${org}`, "Overview", LayoutDashboard],
      [`/app/o/${org}/jobs`, "Requisitions", BriefcaseBusiness],
      [`/app/o/${org}/applications`, "Applications", FileText],
      [`/app/o/${org}/candidates`, "Candidates", UsersRound],
      [`/app/o/${org}/interviews`, "Interviews", Video],
      [`/app/o/${org}/offers`, "Offers", FileCheck],
      [`/app/o/${org}/placements`, "Placements", BadgeCheck],
    ],
  ],
  [
    "Tools",
    [
      [`/app/o/${org}/compare`, "Candidate Comparison", HeartHandshake],
      [`/app/o/${org}/copilot`, "AI Copilot", Sparkles, "Hiring Assistant"],
      [`/app/o/${org}/analytics`, "Analytics", ChartNoAxesCombined],
    ],
  ],
  [
    "Organization",
    [
      [`/app/o/${org}/verification`, "Company Profile / Verification", ShieldCheck],
      [`/app/o/${org}/team`, "Team Members", Building2],
      [`/app/o/${org}/billing`, "Billing & Subscription", CreditCard],
      ["/app/settings", "Settings", Settings],
    ],
  ],
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

// A viewer only has job.read, so only the assigned-jobs view is reachable —
// keeping a link that 404s would teach the role nothing.
const viewerGroups = (org) => [
  [
    "Hiring",
    [[`/app/o/${org}/assigned`, "Assigned Jobs", HeartHandshake]],
  ],
];

const adminGroups = [
  [
    "Platform Governance",
    [
      ["/app/admin", "Control Center", LayoutDashboard],
      ["/app/admin/moderation", "Job Moderation", BriefcaseBusiness],
      ["/app/admin/placements", "Placements", BadgeCheck],
    ],
  ],
  [
    "Directories",
    [
      ["/app/admin/users", "Candidates & Users", UserRound],
      ["/app/admin/organizations", "Companies", Building2],
    ],
  ],
  [
    "Finance",
    [
      ["/app/admin/revenue", "Revenue & Transactions", DollarSign],
      ["/app/admin/subscriptions", "Subscriptions & Quotas", CreditCard],
    ],
  ],
  [
    "System",
    [
      ["/app/admin/security", "Security & Audit", ShieldAlert],
      ["/app/admin/reports", "Reports & Exports", FileSpreadsheet],
      ["/app/admin/settings", "Platform Settings", Settings],
      ["/app/admin/ai-usage", "AI Analytics", Sparkles],
    ],
  ],
];

const SECTION_TITLES = [
  ["/app/admin/moderation", "Job Moderation"],
  ["/app/admin/users", "Candidates & Users"],
  ["/app/admin/organizations", "Companies"],
  ["/app/admin/verification", "Company Verification"],
  ["/app/admin/revenue", "Revenue & Transactions"],
  ["/app/admin/search", "Global Search"],
  ["/app/admin/placements", "Placements & Employment"],
  ["/app/admin/subscriptions", "Subscriptions & Quotas"],
  ["/app/admin/reports", "Reports & Exports"],
  ["/app/admin/settings", "Platform Settings"],
  ["/app/admin/ai-usage", "Platform Analytics & AI"],
  ["/app/admin/security", "Security & Audit"],
  ["/app/notifications", "Notifications"],
  ["/app/profile", "My Profile"],
  ["/app/settings", "Settings"],
];
const sectionTitle = (path) =>
  path === "/app/admin" ? "Control Center" : SECTION_TITLES.find(([p]) => path.startsWith(p))?.[1] || "";

const AppShell = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [bellOpen, setBellOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    location = useLocation();
  const isAdmin = auth.role === "admin";
  const qc = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", {}],
    queryFn: () => notificationApi.list({ limit: 100 }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const unread = (notifications.data?.data || []).filter((n) => !n.readAt);
  const markRead = useMutation({
    mutationFn: notificationApi.read,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const openNotification = (n) => {
    setBellOpen(false);
    if (!n.readAt) markRead.mutate(n._id);
    const target = notificationTarget(auth, n);
    navigate(target?.to || "/app/notifications");
  };

  // Accessibility: close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setBellOpen(false);
        setMenuOpen(false);
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const groups = isAdmin
    ? adminGroups
    : auth.organization
      ? auth.membership?.role === "viewer"
        ? viewerGroups(auth.organizationId)
        : ["hiring_manager", "interviewer"].includes(auth.membership?.role)
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
          className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink-800 bg-ink-950 text-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Sidebar navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/8 px-5">
          <NavLink to="/" className="flex items-center">
            <Logo tone="light" />
          </NavLink>
          <button
            className="rounded-lg p-2 text-ink-400 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!isAdmin && auth.organizations.length > 0 && (
          <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <label
                className="block text-[10px] font-bold uppercase tracking-widest text-ink-300"
                htmlFor="organization-switcher"
              >
                Workspace
              </label>
              <PlanBadge compact billingHref={auth.organizationId ? `/app/o/${auth.organizationId}/billing` : undefined} />
            </div>
            <div className="relative">
              <SearchableSelect
                id="organization-switcher"
                aria-label="Switch workspace"
                value={auth.organizationId || ""}
                onChange={switchOrg}
                options={[
                  ...(auth.role === "candidate" ? [{ value: "", label: "Candidate workspace" }] : []),
                  ...auth.organizations.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.role.replace("_", " ")}`,
                  })),
                ]}
                searchPlaceholder="Find a workspace"
                emptyText="No workspace matches"
                className="h-10 cursor-pointer border-white/20 bg-white/10 text-xs text-white hover:bg-white/15 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/30"
                inputClassName="text-white placeholder:text-ink-300 text-xs font-semibold cursor-pointer"
                buttonClassName="text-ink-300 hover:text-white cursor-pointer"
              />
            </div>
          </div>
        )}
        <nav
          className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
          aria-label="Workspace navigation"
        >
          {groups.map(([label, items]) => (
            <div key={label} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                {label}
                {label === "Platform Governance" && <span className="sr-only">Platform</span>}
              </p>
              <div className="space-y-0.5">
                {items.map(([to, itemLabel, Icon, testLabel]) => {
                  const isExact = to === "/app/candidate" || to === "/app/admin" || to === `/app/o/${auth.organizationId}`;
                  return (
                    <NavLink
                      key={to + itemLabel}
                      to={to}
                      end={isExact}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-brand-600 text-white shadow-xs font-semibold"
                            : "text-ink-300 hover:bg-white/8 hover:text-white",
                        )
                      }
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      <span className="truncate">{itemLabel}</span>
                      {testLabel && <span className="sr-only">{testLabel}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/8 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/6">
            <Avatar user={auth.user} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{auth.user?.displayName}</span>
              <span className="block truncate text-xs text-ink-400">
                {isAdmin ? "Platform Admin" : auth.workspaceRole?.replace("_", " ")}
              </span>
            </span>
            <NavLink
              to={isAdmin ? "/app/admin/settings" : "/app/settings"}
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </NavLink>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium text-ink-400 transition-colors hover:bg-danger-500/10 hover:text-danger-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-ink-200/80 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 items-center gap-2 text-sm font-medium text-ink-600 sm:flex">
            <span className="h-2 w-2 rounded-full bg-success-500" aria-hidden="true" />
            <span className="truncate font-semibold text-ink-800">
              {isAdmin
                ? sectionTitle(location.pathname) || "Platform administration"
                : auth.organization?.name || "Candidate workspace"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <form
                  role="search"
                  aria-label="Platform search"
                  className="hidden md:block"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const term = new FormData(e.currentTarget).get("q")?.toString().trim() || "";
                    if (term.length >= 2) navigate(`/app/admin/search?q=${encodeURIComponent(term)}`);
                  }}
                >
                  <label className="sr-only" htmlFor="admin-global-search">Search companies and users</label>
                  <input
                    id="admin-global-search"
                    name="q"
                    type="search"
                    maxLength={100}
                    placeholder="Search companies, users…"
                    className="w-56 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </form>
                <span className="hidden whitespace-nowrap text-xs font-medium text-ink-500 xl:inline" data-testid="admin-header-date">
                  {formatDate(new Date(), "Asia/Kolkata")}
                </span>
              </>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
                aria-expanded={bellOpen}
                className="relative rounded-xl border border-ink-200 bg-white p-2.5 text-ink-600 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600"
              >
                <Bell className="h-4.5 w-4.5" />
                {unread.length > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-danger-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                    {unread.length > 99 ? "99+" : unread.length}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close notifications"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setBellOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                      <span className="flex items-center gap-2">
                        <LogoMark className="h-5 w-5" title="" />
                        <p className="text-sm font-bold">Notifications</p>
                      </span>
                      <span className="text-xs text-ink-400">
                        {unread.length ? `${unread.length} unread` : "All read"}
                      </span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {(notifications.data?.data || []).slice(0, 6).map((n) => (
                        <button
                          key={n._id}
                          type="button"
                          onClick={() => openNotification(n)}
                          className="flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition-colors hover:bg-ink-50"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              n.readAt ? "bg-ink-200" : "bg-brand-500"
                            }`}
                          />
                          <span className="min-w-0">
                            <span
                              className={`block truncate text-sm ${n.readAt ? "text-ink-600" : "font-semibold"}`}
                            >
                              {n.title}
                            </span>
                            <span className="block text-xs text-ink-400">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </span>
                        </button>
                      ))}
                      {notifications.data?.data?.length === 0 && (
                        <p className="px-4 py-6 text-center text-sm text-ink-500">
                          You're all caught up.
                        </p>
                      )}
                    </div>
                    <NavLink
                      to="/app/notifications"
                      onClick={() => setBellOpen(false)}
                      className="block border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      View all notifications
                    </NavLink>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                className="hidden transition-transform hover:scale-105 sm:block"
              >
                <Avatar user={auth.user} />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close account menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
                    <div className="border-b border-ink-100 px-4 py-3">
                      <p className="truncate text-sm font-bold">{auth.user?.displayName}</p>
                      <p className="truncate text-xs text-ink-500">{auth.user?.email}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-brand-600">
                        {auth.workspaceRole?.replace("_", " ")}
                      </p>
                      <div className="mt-2">
                        <PlanBadge compact />
                      </div>
                    </div>
                    <div className="p-1.5">
                      <NavLink
                        to="/app/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
                      >
                        <UserRound className="h-4 w-4" />
                        My Profile
                      </NavLink>
                      <NavLink
                        to="/app/settings"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </NavLink>
                      <div className="mx-2 my-1.5 border-t border-ink-100" role="separator" />
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setHelpOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
                      >
                        <LifeBuoy className="h-4 w-4" />
                        Help &amp; Support
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setMenuOpen(false);
                          await signOut();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)] flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <Modal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Help & support"
        description="Find answers in our policies, or check the areas most relevant to your role."
        footer={<Button variant="secondary" onClick={() => setHelpOpen(false)}>Close</Button>}
      >
        <ul className="space-y-2">
          {[
            ["/app/notifications", "Notifications", "Application, interview and approval updates"],
            ["/app/settings", "Settings", "Security, preferences and data"],
            ["/security", "Security & privacy", "How your data is protected"],
            ["/privacy", "Privacy policy", "What we collect and why"],
            ["/terms", "Terms of service", "The rules of the platform"],
          ].map(([to, title, copy]) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setHelpOpen(false)}
                className="flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brand-700 shadow-sm">
                  <LifeBuoy className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs text-ink-500">{copy}</span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
};
export default AppShell;

