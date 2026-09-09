import { Link } from "react-router-dom";
import { HeartHandshake } from "lucide-react";

import Logo from "../brand/Logo";
import { useAuth } from "../../context/useAuth";

/**
 * Public footer. Every link is a real route in the app — employer links point
 * into the signed-in employer's workspace when one exists.
 */
const Footer = () => {
  const auth = useAuth();
  const orgId = auth.organizationId;
  const columns = [
    {
      title: "Product",
      links: [
        { to: "/jobs", label: "Find Jobs" },
        { to: "/resume-check", label: "Resume Check" },
        { to: "/companies", label: "Companies" },
        { to: orgId ? `/app/o/${orgId}` : "/auth/register/recruiter", label: "For Employers" },
      ],
    },
    {
      title: "For Job Seekers",
      links: [
        { to: "/jobs", label: "Find Jobs" },
        { to: "/resume-check", label: "Resume Check" },
        { to: "/app/candidate/applications", label: "Applications" },
        { to: "/app/candidate/interviews", label: "Interview Prep" },
      ],
    },
    {
      title: "For Employers",
      links: [
        { to: orgId ? `/app/o/${orgId}` : "/auth/register/recruiter", label: "Post a Job" },
        {
          to: orgId ? `/app/o/${orgId}/candidates` : "/auth/register/recruiter",
          label: "Find Candidates",
        },
      ],
    },
    {
      title: "Trust",
      links: [
        { to: "/privacy", label: "Privacy" },
        { to: "/security", label: "Security" },
        { to: "/terms", label: "Terms" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/10 bg-ink-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] lg:px-8">
        <div>
          <Link to="/" className="inline-flex items-center hover:opacity-90" aria-label="HireSmart AI — home">
            <Logo tone="light" className="h-10 sm:h-11 w-auto" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-ink-400">
            AI-powered job search and hiring for people and companies.
          </p>
          <p className="mt-6 flex items-center gap-2 border-t border-white/10 pt-6 text-sm text-ink-300">
            <HeartHandshake className="h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
            AI supports decisions. People make the final call.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={`${column.title} links`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-ink-500 sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} HireSmart AI</p>
          <p>Find the right job. Hire the right people.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
