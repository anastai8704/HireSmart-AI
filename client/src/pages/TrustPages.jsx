import { Link } from "react-router-dom";
import { ArrowLeft, Lock, ShieldCheck, Sparkles } from "lucide-react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import { usePageMeta } from "../lib/usePageMeta";

/**
 * Plain-English trust pages. They describe only what the product actually
 * does: consent controls, data export and deletion, session management,
 * job moderation, audit logging and human-made hiring decisions.
 */
const DOCS = {
  privacy: {
    icon: Lock,
    title: "Your information stays protected",
    intro:
      "This page explains, in plain English, what information HireSmart AI collects and how it is used. No legal jargon.",
    sections: [
      {
        heading: "What we collect",
        points: [
          "Account details: your name, email address and a password you choose.",
          "Your job search profile: resumes you upload, plus the skills, experience and preferences you add.",
          "Your activity: the jobs you search for, save and apply to.",
          "For employers: company details, job posts, candidate notes and hiring progress.",
        ],
      },
      {
        heading: "How we use it",
        points: [
          "To show you jobs that match your skills and explain why they match.",
          "To review your resume and suggest improvements, if you allow AI processing.",
          "To help employers review candidates for the jobs they posted.",
          "To keep the platform safe and stop misuse.",
        ],
      },
      {
        heading: "Who can see your information",
        points: [
          "Employers see your resume and profile when you apply to their job, or if you choose to join their talent pool.",
          "Your resume is never sold or shared for advertising.",
          "Platform administrators see limited information only to review reported content and security events.",
        ],
      },
      {
        heading: "Your choices",
        points: [
          "Turn AI processing, talent pool and marketing messages on or off at any time in Settings, under AI & Data Permissions.",
          "Download a copy of your data from Settings at any time.",
          "Delete your account from Settings. This removes your profile, resumes and applications.",
        ],
      },
    ],
  },
  security: {
    icon: ShieldCheck,
    title: "How we keep your account safe",
    intro:
      "A short summary of the protections built into HireSmart AI, and the controls you can use yourself.",
    sections: [
      {
        heading: "Signing in",
        points: [
          "New accounts verify their email address before they can sign in.",
          "Passwords must be at least 12 characters long and are stored hashed, never in plain text.",
          "Login sessions expire on their own and use secure, rotating cookies.",
        ],
      },
      {
        heading: "Your sessions and devices",
        points: [
          "Settings shows every device currently signed in to your account.",
          "You can sign out any device you do not recognize, right from Settings.",
        ],
      },
      {
        heading: "Your files and data",
        points: [
          "Resumes are stored in private storage, not on public web addresses.",
          "Uploads are limited to PDF or DOCX files up to 10 MB.",
          "You can export or delete your data from Settings whenever you want.",
        ],
      },
      {
        heading: "Hiring data and AI",
        points: [
          "Job posts can be reviewed and approved before they appear in search.",
          "Sensitive actions are recorded in security and audit logs that administrators can review.",
          "Every AI result is labeled with how it was produced, and a person always makes the final hiring decision.",
        ],
      },
    ],
  },
  terms: {
    icon: Sparkles,
    title: "The basics, in plain English",
    intro:
      "The simple rules for using HireSmart AI. If anything below is unclear, the same ideas are repeated throughout the product.",
    sections: [
      {
        heading: "Who can use HireSmart AI",
        points: [
          "Job seekers and employers can create an account.",
          "You agree to give accurate information and to keep your password safe.",
        ],
      },
      {
        heading: "For job seekers",
        points: [
          "You own your resume and profile, and you control who can see them.",
          "Match scores and suggestions are guidance, not a promise of an interview or a job.",
        ],
      },
      {
        heading: "For employers",
        points: [
          "You are responsible for the jobs you post and the hiring decisions you make.",
          "Job posts must describe real openings and must not discriminate against anyone.",
        ],
      },
      {
        heading: "About AI on HireSmart",
        points: [
          "AI produces match scores and suggestions to help people decide.",
          "AI never hires or rejects anyone by itself. A person always makes the final decision.",
        ],
      },
      {
        heading: "Fair use",
        points: [
          "Do not scrape the site, send spam, post misleading jobs, or use the platform to discriminate unlawfully.",
          "Accounts that break these rules can be suspended.",
        ],
      },
    ],
  },
};

const OTHER_DOCS = {
  privacy: ["security", "terms"],
  security: ["privacy", "terms"],
  terms: ["privacy", "security"],
};

const DOC_LABELS = { privacy: "Privacy", security: "Security", terms: "Terms" };

export const TrustPage = ({ doc = "privacy" }) => {
  const content = DOCS[doc] || DOCS.privacy;
  const Icon = content.icon;
  usePageMeta({
    title: `${DOC_LABELS[doc]} — HireSmart AI`,
    description: content.intro,
  });
  return (
    <>
      <Navbar />
      <main id="main-content" className="page-wrap max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">{DOC_LABELS[doc]}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink-950">{content.title}</h1>
          </div>
        </div>
        <p className="mt-5 leading-7 text-ink-600">{content.intro}</p>
        <div className="mt-8 space-y-8">
          {content.sections.map((section) => (
            <section key={section.heading} className="panel p-6 sm:p-7">
              <h2 className="text-lg font-bold text-ink-950">{section.heading}</h2>
              <ul className="mt-3 space-y-2.5">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm leading-6 text-ink-600">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-500">
          Related:{" "}
          {OTHER_DOCS[doc].map((key, index) => (
            <span key={key}>
              {index > 0 && " · "}
              <Link to={`/${key}`} className="font-semibold text-brand-600 hover:text-brand-700">
                {DOC_LABELS[key]}
              </Link>
            </span>
          ))}{" "}
          ·{" "}
          <Link to="/app/settings" className="font-semibold text-brand-600 hover:text-brand-700">
            Account settings
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
};

export default TrustPage;
