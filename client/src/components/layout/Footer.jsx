import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { useAuth } from "../../context/useAuth";

/**
 * Public footer. Every link is a real route in the app — employer links point
 * into the signed-in employer's workspace when one exists.
 */
const Footer = () => {
  const auth = useAuth();
  const orgId = auth.organizationId;
  const employerLinks = [
    { to: orgId ? `/app/o/${orgId}` : "/auth/register/recruiter", label: "Post a Job" },
    {
      to: orgId ? `/app/o/${orgId}/candidates` : "/auth/register/recruiter",
      label: "Find Candidates",
    },
    { to: "/companies", label: "Companies" },
    { to: "/jobs", label: "Job Board" },
  ];
  const columns = [
    {
      title: "For Job Seekers",
      links: [
        { to: "/jobs", label: "Find Jobs" },
        { to: "/resume-check", label: "Resume Check" },
        { to: "/app/candidate/applications", label: "Applications" },
        { to: "/app/candidate/interviews", label: "Interview Prep" },
      ],
    },
    { title: "For Employers", links: employerLinks },
    {
      title: "Account",
      links: [
        { to: "/auth/login", label: "Sign In" },
        { to: "/auth/register/candidate", label: "Get Started" },
        { to: "/privacy", label: "Privacy" },
        { to: "/terms", label: "Terms" },
      ],
    },
  ];
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink-950 hover:opacity-90"
            aria-label="HireSmart AI — home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-[#4f7cff] text-white shadow-md shadow-brand-500/30">
              <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            HireSmart AI
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-ink-500">
            AI-powered tools for better job search and hiring.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={`${column.title} links`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-600 transition-colors hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-ink-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-ink-400 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} HireSmart AI</p>
          <p>AI supports hiring decisions. People make the final call.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
