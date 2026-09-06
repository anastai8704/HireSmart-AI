import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

/**
 * Public footer. Every link below is a real route in the app — no dead ends.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { to: "/jobs", label: "Find Jobs" },
      { to: "/companies", label: "Companies" },
      { to: "/resume-check", label: "Resume Check" },
      { to: "/auth/register/recruiter", label: "For Employers" },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/auth/login", label: "Sign in" },
      { to: "/auth/register/candidate", label: "Get Started" },
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

const Footer = () => (
  <footer className="border-t border-ink-200 bg-white">
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink-950 hover:opacity-90"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink-950 text-white">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          HireSmart AI
        </Link>
        <p className="mt-4 max-w-xs text-sm leading-6 text-ink-500">
          AI-powered tools for better job search and hiring.
        </p>
      </div>
      {COLUMNS.map((column) => (
        <nav key={column.title} aria-label={`${column.title} links`}>
          <h2 className="text-sm font-semibold text-ink-950">{column.title}</h2>
          <ul className="mt-4 space-y-2.5">
            {column.links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm text-ink-500 transition-colors hover:text-brand-700"
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

export default Footer;
