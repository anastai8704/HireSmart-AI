import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, BriefcaseBusiness, Building2, ChartNoAxesCombined, ChevronDown, FileText, HeartHandshake, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, Sparkles, UserRound, UsersRound, Video, X } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { cn, initials } from "../../lib/utils";

const candidateLinks = [
  ["/app/candidate", "Home", LayoutDashboard], ["/app/candidate/jobs", "Discover", Search], ["/app/candidate/applications", "Applications", BriefcaseBusiness], ["/app/candidate/resumes", "Resumes", FileText], ["/app/candidate/alerts", "Alerts", Bell], ["/app/candidate/copilot", "Career copilot", Sparkles],
];
const recruiterLinks = (org) => [[`/app/o/${org}`, "Overview", LayoutDashboard], [`/app/o/${org}/jobs`, "Jobs", BriefcaseBusiness], [`/app/o/${org}/candidates`, "Candidates", UsersRound], [`/app/o/${org}/interviews`, "Interviews", Video], [`/app/o/${org}/analytics`, "Analytics", ChartNoAxesCombined], [`/app/o/${org}/copilot`, "Recruiter copilot", Sparkles], [`/app/o/${org}/team`, "Team", Building2]];
const managerLinks = (org) => [[`/app/o/${org}/assigned`, "Assigned jobs", HeartHandshake], [`/app/o/${org}/candidates`, "Candidate review", UsersRound], [`/app/o/${org}/interviews`, "Interviews", Video]];
const adminLinks = [["/app/admin", "System", LayoutDashboard], ["/app/admin/moderation", "Moderation", BriefcaseBusiness], ["/app/admin/users", "Users", UserRound], ["/app/admin/organizations", "Organizations", Building2], ["/app/admin/ai-usage", "AI usage", Sparkles], ["/app/admin/security", "Security & audit", ShieldCheck]];

const AppShell = () => {
  const auth = useAuth(); const navigate = useNavigate(); const [open, setOpen] = useState(false);
  const isAdmin = auth.role === "admin";
  const links = isAdmin ? adminLinks : auth.organization ? (["hiring_manager", "interviewer", "viewer"].includes(auth.membership?.role) ? managerLinks(auth.organizationId) : recruiterLinks(auth.organizationId)) : candidateLinks;
  const switchOrg = (event) => { const value=event.target.value; auth.setOrganizationId(value); navigate(value?`/app/o/${value}`:"/app/candidate"); setOpen(false); };
  const signOut = async () => { await auth.logout(); navigate("/"); };
  return <div className="min-h-screen bg-canvas text-ink-900">
    <a href="#main-content" className="skip-link">Skip to content</a>
    {open && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-ink-950/40 lg:hidden" onClick={() => setOpen(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink-200 bg-ink-950 text-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-18 items-center justify-between px-5"><NavLink to="/" className="flex items-center gap-2.5 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500"><Sparkles className="h-5 w-5" /></span><span>HireSmart <span className="text-cyan-300">AI</span></span></NavLink><button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
      {!isAdmin && auth.organizations.length > 0 && <div className="px-4 pb-4"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400" htmlFor="organization-switcher">Workspace</label><div className="relative"><select id="organization-switcher" value={auth.organizationId || ""} onChange={switchOrg} className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-white/8 px-3 pr-8 text-sm text-white">{auth.role==="candidate"&&<option value="">Candidate workspace</option>}{auth.organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role.replace("_", " ")}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-ink-400" /></div></div>}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Workspace navigation">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={label === "Home" || label === "Overview" || label === "System"} onClick={() => setOpen(false)} className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-white text-ink-950" : "text-ink-300 hover:bg-white/8 hover:text-white")}><Icon className="h-4.5 w-4.5" />{label}</NavLink>)}</nav>
      <div className="border-t border-white/10 p-3"><NavLink to="/app/settings" className="flex items-center gap-3 rounded-xl p-3 hover:bg-white/8"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-xs font-bold">{initials(auth.user?.displayName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{auth.user?.displayName}</span><span className="block truncate text-xs text-ink-400">{auth.workspaceRole?.replace("_", " ")}</span></span><Settings className="h-4 w-4 text-ink-400" /></NavLink><button onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-400 hover:bg-danger-500/10 hover:text-danger-300"><LogOut className="h-4 w-4" />Sign out</button></div>
    </aside>
    <div className="lg:pl-72"><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6"><button onClick={() => setOpen(true)} className="rounded-lg p-2 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div className="hidden text-sm text-ink-500 sm:block">{auth.organization?.name || (isAdmin ? "Platform administration" : "Candidate workspace")}</div><NavLink to="/app/notifications" className="relative rounded-xl border border-ink-200 p-2.5 text-ink-600 hover:bg-ink-50" aria-label="Notifications"><Bell className="h-4.5 w-4.5" /></NavLink></header><main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-4rem)]"><Outlet /></main></div>
  </div>;
};
export default AppShell;
