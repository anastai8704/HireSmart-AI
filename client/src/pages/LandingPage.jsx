import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  HeartHandshake,
  Lightbulb,
  Lock,
  MapPin,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Video,
} from "lucide-react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Button from "../components/ui/Button";
import Input, { Select } from "../components/ui/Input";
import { EmptyState, Skeleton } from "../components/ui/States";
import { companiesApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { usePageMeta } from "../lib/usePageMeta";
import { cn, initials } from "../lib/utils";

/* ------------------------------ page data ------------------------------ */
/* Every link here points at a route that already exists in the app.
   The match/resume previews are demo UI (labeled product mockup data),
   not claims about real companies or candidates. */

const POPULAR_SEARCHES = [
  { label: "React Developer", to: "/jobs?query=react%20developer" },
  { label: "Python Developer", to: "/jobs?query=python%20developer" },
  { label: "Data Analyst", to: "/jobs?query=data%20analyst" },
  { label: "Data Scientist", to: "/jobs?query=data%20scientist" },
  { label: "DevOps", to: "/jobs?query=devops" },
  { label: "Remote", to: "/jobs?workplaceMode=remote" },
  { label: "Mumbai", to: "/jobs?location=Mumbai" },
];

const VALUE_CARDS = [
  {
    icon: Search,
    title: "Find better jobs",
    text: "Search by role, skills, location and work preference.",
    accent: "bg-brand-50 text-brand-600",
  },
  {
    icon: Target,
    title: "Understand your match",
    text: "See which skills match the job and what you may be missing.",
    accent: "bg-[#edf3ff] text-[#2f5fe0]",
  },
  {
    icon: FileText,
    title: "Improve your resume",
    text: "Get practical suggestions to make your resume stronger.",
    accent: "bg-success-50 text-success-700",
  },
  {
    icon: ClipboardList,
    title: "Track your applications",
    text: "Keep your applications and hiring updates organized.",
    accent: "bg-warning-50 text-warning-700",
  },
];

const STEPS = [
  {
    icon: Search,
    title: "Search",
    text: "Find jobs that match your role, skills and preferences.",
  },
  {
    icon: Target,
    title: "Check your match",
    text: "See what matches your profile and where you can improve.",
  },
  {
    icon: Rocket,
    title: "Take the next step",
    text: "Improve your resume, apply for jobs and prepare for interviews.",
  },
];

const DEMO_MATCH = {
  role: "Python Developer",
  meta: "Mumbai · Full-time",
  score: 87,
  matched: ["Python", "Django", "REST APIs"],
  improve: ["Docker", "AWS"],
};

const DEMO_BREAKDOWN = {
  skills: [
    ["Python", true],
    ["Django", true],
    ["REST APIs", true],
    ["MongoDB", true],
    ["Docker", false],
  ],
  experience: "Good match",
  education: "Meets requirement",
  missing: ["Docker", "AWS"],
};

const DEMO_RESUME = {
  score: 78,
  strengths: ["Clear technical skills", "Good project experience"],
  improvements: ["Add measurable achievements", "Add missing job-specific skills"],
};

const SEEKER_CARDS = [
  {
    icon: Search,
    title: "Find Jobs",
    text: "Search relevant opportunities.",
    to: "/jobs",
  },
  {
    icon: FileText,
    title: "Resume Check",
    text: "Know what to improve before applying.",
    to: "/resume-check",
  },
  {
    icon: ClipboardList,
    title: "Applications",
    text: "Track where you've applied.",
    to: "/app/candidate/applications",
  },
  {
    icon: Video,
    title: "Interview Prep",
    text: "Prepare with AI-powered guidance.",
    to: "/app/candidate/interviews",
  },
];

const SEEKER_JOURNEY = [
  "Search jobs",
  "Check your match",
  "Improve your resume",
  "Apply",
  "Track your application",
];

const EMPLOYER_FEATURES = [
  {
    icon: BriefcaseBusiness,
    title: "Post Jobs",
    text: "Create and manage job openings.",
  },
  {
    icon: UserCheck,
    title: "Find Candidates",
    text: "Discover candidates based on relevant skills.",
  },
  {
    icon: ClipboardList,
    title: "Review Applications",
    text: "Keep applicants and hiring progress organized.",
  },
  {
    icon: Sparkles,
    title: "AI Candidate Matching",
    text: "Understand why candidates match your job.",
  },
];

const EMPLOYER_JOURNEY = [
  "Post a job",
  "Review candidates",
  "Compare matches",
  "Interview",
  "Hire",
];

const TRUST_POINTS = [
  {
    icon: Eye,
    title: "Clear",
    text: "Understand why a candidate or job is recommended.",
  },
  { icon: Lightbulb, title: "Helpful", text: "Get suggestions you can actually act on." },
  {
    icon: HeartHandshake,
    title: "Human-led",
    text: "AI supports decisions. It does not make the final hiring decision.",
  },
];

const PRIVACY_POINTS = [
  { icon: Lock, title: "Private", text: "Your personal information is protected." },
  { icon: ShieldCheck, title: "Secure", text: "Your account and sessions are secured." },
  {
    icon: SlidersHorizontal,
    title: "In your control",
    text: "You control your profile and account information.",
  },
];

/* ---------------------------- small building blocks ---------------------------- */

/** Subtle scroll-reveal: fade + rise once the element enters the viewport. */
const Reveal = ({ children, className, delay = 0 }) => {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transform-none motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
};

const GradientText = ({ children }) => (
  <span className="bg-gradient-to-r from-brand-600 to-[#4f7cff] bg-clip-text text-transparent">
    {children}
  </span>
);

const SectionHeading = ({ eyebrow, title, text, action, center = false }) => (
  <div
    className={
      center
        ? "mx-auto max-w-2xl text-center"
        : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    }
  >
    <div className={center ? "" : "max-w-2xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{title}</h2>
      {text && <p className="mt-3 leading-7 text-ink-600">{text}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** Product-preview ring showing a demo match score. */
const MatchRing = ({ value, size = 72, stroke = 6, dark = false }) => {
  const gradientId = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6f64e3" />
            <stop offset="100%" stopColor="#4f7cff" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={dark ? "rgb(255 255 255 / 0.12)" : "var(--color-ink-100)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(value, 100) / 100)}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 grid place-items-center text-sm font-extrabold tabular-nums",
          dark ? "text-white" : "text-ink-950",
        )}
      >
        {value}%
      </span>
    </div>
  );
};

const Journey = ({ label, steps, dark = false }) => (
  <div
    className={cn(
      "mt-8 flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4",
      dark ? "border-white/10 bg-white/5" : "border-ink-200 bg-white shadow-[var(--shadow-card)]",
    )}
  >
    <span
      className={cn(
        "shrink-0 text-xs font-bold uppercase tracking-wider",
        dark ? "text-ink-400" : "text-ink-400",
      )}
    >
      {label}
    </span>
    <ol
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm",
        dark ? "text-ink-300" : "text-ink-600",
      )}
    >
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-1.5">
          {index > 0 && (
            <ChevronRight
              className={cn("h-3.5 w-3.5", dark ? "text-ink-500" : "text-ink-300")}
              aria-hidden="true"
            />
          )}
          <span className="font-medium">{step}</span>
        </li>
      ))}
    </ol>
  </div>
);

const CompanyCard = ({ company }) => (
  <Link
    to={`/companies/${company.slug}`}
    className="panel group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
  >
    <div className="flex items-center gap-3">
      {company.logo ? (
        <img
          src={company.logo}
          alt={`${company.name} logo`}
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-xl border border-ink-100 bg-white object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ink-900 to-ink-700 text-sm font-bold text-white"
        >
          {initials(company.name) || "?"}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="truncate font-bold text-ink-950 group-hover:text-brand-700">
          {company.name}
        </h3>
        <p className="truncate text-xs text-ink-500">{company.industry || "Company"}</p>
      </div>
    </div>
    <p className="mt-4 text-sm text-ink-600">
      <span className="font-bold text-ink-900">{company.openRoles}</span> open{" "}
      {company.openRoles === 1 ? "role" : "roles"}
    </p>
    <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
      View company <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  </Link>
);

const CompanyCardSkeleton = () => (
  <div className="panel p-5" aria-hidden="true">
    <div className="flex items-center gap-3">
      <Skeleton className="h-11 w-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    <Skeleton className="mt-4 h-4 w-1/2" />
    <Skeleton className="mt-4 h-4 w-2/5" />
  </div>
);

/* --------------------------------- landing --------------------------------- */

export const LandingPage = () => {
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [mode, setMode] = useState("");
  const navigate = useNavigate();
  const auth = useAuth();
  const companies = useQuery({
    queryKey: ["companies-top"],
    queryFn: () => companiesApi.list(),
  });

  // Browsing jobs is public, so "Find a job" always opens the real job search.
  // Hiring needs an account, so that path leads to the employer sign-up or,
  // for signed-in employers, straight into their workspace.
  const employerHome = auth.organizationId
    ? `/app/o/${auth.organizationId}`
    : "/auth/register/recruiter";
  const candidateHome =
    auth.isAuthenticated && auth.role === "candidate"
      ? "/app/candidate"
      : "/auth/register/candidate";

  const search = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (what.trim()) params.set("query", what.trim());
    if (where.trim()) params.set("location", where.trim());
    if (mode) params.set("workplaceMode", mode);
    navigate(`/jobs${params.toString() ? `?${params.toString()}` : ""}`);
  };

  usePageMeta({
    title: "HireSmart AI — Find the right job. Hire the right people.",
    description:
      "Search jobs, check your resume and understand why a role matches your skills. Employers can find qualified candidates faster with AI-powered hiring tools.",
  });

  return (
    <>
      <Navbar />
      <main id="main-content">
        {/* --------------------------------- hero --------------------------------- */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(52rem_22rem_at_50%_-8rem,rgb(111_100_227/0.16),transparent_62%)]" />
          <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(38rem_16rem_at_82%_-4rem,rgb(79_124_255/0.12),transparent_60%)]" />
          <div className="relative mx-auto max-w-7xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                AI-powered job search &amp; hiring
              </p>
              <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-extrabold tracking-[-0.035em] text-ink-950 sm:text-5xl lg:text-6xl">
                Find the <GradientText>right job</GradientText>.
                <br className="hidden sm:block" /> Hire the{" "}
                <GradientText>right people</GradientText>.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-600 sm:text-lg sm:leading-8">
                Search jobs, check your resume, and understand why a role matches your skills.
                Employers can find qualified candidates faster with AI-powered hiring tools.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  as={Link}
                  to="/jobs"
                  size="lg"
                  variant="gradient"
                  className="w-full sm:w-auto"
                >
                  Find a Job <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  as={Link}
                  to={employerHome}
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  Hire Talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
                AI helps you understand the match — people make the final decision.
              </p>
            </Reveal>

            {/* floating search card */}
            <Reveal delay={120} className="relative z-10 mt-10">
              <form
                onSubmit={search}
                role="search"
                aria-label="Search jobs"
                className="mx-auto grid max-w-5xl items-end gap-3 rounded-3xl border border-white/60 bg-white/85 p-4 text-left shadow-[0_24px_70px_-28px_rgb(92_80_212/0.45)] ring-1 ring-ink-900/5 backdrop-blur-xl sm:p-5 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]"
              >
                <Input
                  id="hero-job"
                  label="What job are you looking for?"
                  placeholder="e.g. Python Developer"
                  icon={<Search className="h-4 w-4" />}
                  containerClassName="md:col-span-2 lg:col-span-1"
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                />
                <Input
                  id="hero-location"
                  label="Where?"
                  placeholder="e.g. Mumbai, Bengaluru"
                  icon={<MapPin className="h-4 w-4" />}
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                />
                <Select
                  id="hero-mode"
                  label="Work mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  options={[
                    { value: "", label: "Any work mode" },
                    { value: "remote", label: "Remote" },
                    { value: "hybrid", label: "Hybrid" },
                    { value: "onsite", label: "On-site" },
                  ]}
                />
                <Button
                  type="submit"
                  size="lg"
                  variant="gradient"
                  className="w-full md:col-span-2 lg:col-span-1 lg:w-auto"
                  leftIcon={<Search className="h-4 w-4" />}
                >
                  Search Jobs
                </Button>
              </form>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-5 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center sm:gap-3">
                <span className="text-sm font-medium text-ink-500">Popular searches</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {POPULAR_SEARCHES.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="rounded-full border border-ink-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* product preview */}
          <div className="relative mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <div
              className="absolute left-1/2 top-1/2 h-72 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(111_100_227/0.16),transparent)]"
              aria-hidden="true"
            />
            <Reveal delay={150} className="relative">
              <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-ink-200/80 bg-white shadow-[0_40px_90px_-35px_rgb(14_18_34/0.4)]">
                <div className="flex items-center gap-1.5 border-b border-ink-100 bg-ink-50/60 px-5 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-200" aria-hidden="true" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-200" aria-hidden="true" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ink-200" aria-hidden="true" />
                  <span className="ml-3 text-xs font-bold uppercase tracking-wider text-ink-400">
                    Job Match
                  </span>
                  <span className="ml-auto rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-700">
                    AI preview
                  </span>
                </div>
                <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
                  <div className="flex flex-col items-center gap-2">
                    <MatchRing value={DEMO_MATCH.score} size={88} stroke={7} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Match
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                      {DEMO_MATCH.meta}
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-ink-950">{DEMO_MATCH.role}</h3>
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-ink-500">Skills matched</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {DEMO_MATCH.matched.map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700"
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-ink-500">Skills to improve</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {DEMO_MATCH.improve.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-100"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button as={Link} to="/jobs?query=python+developer" size="sm" className="mt-5">
                      View match details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- value proposition --------------------------- */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Reveal>
            <SectionHeading
              center
              eyebrow="Why HireSmart AI"
              title="Everything you need to move your career forward"
              text="From finding a job to getting hired, HireSmart AI keeps your job search simple."
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_CARDS.map((card, index) => (
              <Reveal key={card.title} delay={index * 80}>
                <div className="panel group h-full p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]">
                  <span
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105",
                      card.accent,
                    )}
                  >
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-bold text-ink-950">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{card.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ----------------------------- how it works ----------------------------- */}
        <section className="bg-[#f8f9fc] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading
                center
                eyebrow="How it works"
                title="How HireSmart AI works"
                text="Three simple steps to find better opportunities."
              />
            </Reveal>
            <div className="relative mt-12">
              <div
                className="absolute left-[16%] right-[16%] top-6 hidden h-px bg-gradient-to-r from-brand-200 via-[#a9c0ff] to-brand-200 md:block"
                aria-hidden="true"
              />
              <ol className="grid gap-8 md:grid-cols-3 md:gap-4">
                {STEPS.map((step, index) => (
                  <Reveal key={step.title} delay={index * 120}>
                    <li className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                      <span className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-brand-600 shadow-[var(--shadow-card)] ring-1 ring-ink-100">
                        <step.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="md:mt-5">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                          Step 0{index + 1}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-ink-950">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-ink-600">{step.text}</p>
                      </div>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------------------- AI matching ---------------------------- */}
        <section className="relative overflow-hidden bg-ink-950 py-16 text-white sm:py-24">
          <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(44rem_20rem_at_50%_-8rem,rgb(111_100_227/0.35),transparent_65%)]" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(36rem_16rem_at_12%_100%,rgb(79_124_255/0.18),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
            <Reveal>
              <div>
                <p className="eyebrow !text-brand-300">AI matching</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  Know why a job matches you
                </h2>
                <p className="mt-3 leading-7 text-ink-300">
                  Don't just see a match score. Understand what makes you a good fit.
                </p>
                <ul className="mt-7 space-y-4">
                  {[
                    "Every skill the job needs, checked against your profile",
                    "Clear flags for skills you can still build",
                    "A suggestion you can act on — not a black box",
                  ].map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-3 text-sm leading-6 text-ink-200"
                    >
                      <BadgeCheck
                        className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-300"
                        aria-hidden="true"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
                <Button as={Link} to="/jobs" variant="gradient" className="mt-8">
                  See why <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-300">
                      Job match
                    </p>
                    <h3 className="mt-1 text-lg font-bold">{DEMO_MATCH.role}</h3>
                  </div>
                  <MatchRing value={DEMO_MATCH.score} dark />
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Skills</p>
                  <ul className="mt-3 space-y-2.5">
                    {DEMO_BREAKDOWN.skills.map(([skill, matched]) => (
                      <li key={skill} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink-200">{skill}</span>
                        {matched ? (
                          <CheckCircle2
                            className="h-4 w-4 text-success-500"
                            aria-label={`${skill} matched`}
                          />
                        ) : (
                          <span
                            className="h-4 w-4 rounded-full border-2 border-ink-500"
                            aria-label={`${skill} not matched`}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 p-3.5 ring-1 ring-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Experience
                    </p>
                    <p className="mt-1 text-sm font-semibold text-success-500">
                      {DEMO_BREAKDOWN.experience}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3.5 ring-1 ring-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Education
                    </p>
                    <p className="mt-1 text-sm font-semibold text-success-500">
                      {DEMO_BREAKDOWN.education}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-white/5 p-3.5 ring-1 ring-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Missing skills
                  </p>
                  <p className="mt-1 text-sm text-ink-200">{DEMO_BREAKDOWN.missing.join(" · ")}</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------- resume check ---------------------------- */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
            <Reveal>
              <div>
                <p className="eyebrow">Resume Check</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                  Make your resume stronger before you apply.
                </h2>
                <p className="mt-4 leading-7 text-ink-600">
                  Upload your resume and get clear feedback on skills, content and job fit.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button as={Link} to="/resume-check" size="lg" variant="gradient">
                    Check My Resume <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <p className="text-sm text-ink-500">PDF &amp; DOCX supported</p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <div className="relative">
                <div
                  className="absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(111_100_227/0.14),transparent)]"
                  aria-hidden="true"
                />
                <div className="panel overflow-hidden shadow-[var(--shadow-card-hover)]">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
                    <p className="text-sm font-bold text-ink-950">Resume Score</p>
                    <p className="text-xl font-extrabold tabular-nums text-ink-950">
                      {DEMO_RESUME.score}
                      <span className="text-sm font-semibold text-ink-400">/100</span>
                    </p>
                  </div>
                  <div className="h-2 bg-ink-100" aria-hidden="true">
                    <div
                      className="h-full rounded-r-full bg-gradient-to-r from-brand-500 to-[#4f7cff]"
                      style={{ width: `${DEMO_RESUME.score}%` }}
                    />
                  </div>
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <div className="rounded-xl bg-success-50/70 p-4 ring-1 ring-inset ring-success-100">
                      <p className="text-xs font-bold uppercase tracking-wider text-success-700">
                        Strengths
                      </p>
                      <ul className="mt-2.5 space-y-2">
                        {DEMO_RESUME.strengths.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-ink-700">
                            <CheckCircle2
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-500"
                              aria-hidden="true"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-warning-50/70 p-4 ring-1 ring-inset ring-warning-100">
                      <p className="text-xs font-bold uppercase tracking-wider text-warning-700">
                        Improve
                      </p>
                      <ul className="mt-2.5 space-y-2">
                        {DEMO_RESUME.improvements.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-ink-700">
                            <Lightbulb
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-500"
                              aria-hidden="true"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="border-t border-ink-100 px-5 py-3.5">
                    <Button as={Link} to="/resume-check" size="sm" variant="secondary" fullWidth>
                      View suggestions
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------- for job seekers --------------------------- */}
        <section className="bg-[#f8f9fc] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-16">
              <Reveal>
                <div>
                  <p className="eyebrow">For job seekers</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                    Your job search, all in one place
                  </h2>
                  <p className="mt-3 leading-7 text-ink-600">
                    Find opportunities, improve your resume and keep track of every application.
                  </p>
                  <Journey label="Your journey" steps={SEEKER_JOURNEY} />
                  <Button as={Link} to={candidateHome} size="lg" className="mt-8">
                    I'm looking for a job <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </Reveal>
              <div className="grid gap-4 sm:grid-cols-2">
                {SEEKER_CARDS.map((card, index) => (
                  <Reveal key={card.title} delay={index * 80}>
                    <Link
                      to={card.to}
                      className="panel group flex h-full flex-col p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-transform duration-200 group-hover:scale-105">
                          <card.icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <ArrowRight
                          className="h-4 w-4 text-ink-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
                          aria-hidden="true"
                        />
                      </div>
                      <h3 className="mt-4 font-bold text-ink-950">{card.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-ink-600">{card.text}</p>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------- for employers ---------------------------- */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading
                eyebrow="For employers"
                title="Build your team with less effort."
                text="Post jobs, review applicants and quickly understand which candidates match your requirements."
              />
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EMPLOYER_FEATURES.map((feature, index) => (
                <Reveal key={feature.title} delay={index * 80}>
                  <div className="h-full rounded-2xl border border-ink-100 bg-gradient-to-b from-ink-50/80 to-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-ink-900 hover:shadow-[var(--shadow-card-hover)]">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-950 text-white">
                      <feature.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-bold text-ink-950">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-600">{feature.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Journey label="Your hiring flow" steps={EMPLOYER_JOURNEY} />
            <div className="mt-8">
              <Button as={Link} to={employerHome} size="lg">
                I'm hiring <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* ------------------------- trust: AI helps, you decide ------------------------- */}
        <section className="relative overflow-hidden bg-ai-900 py-16 text-white sm:py-24">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(42rem_18rem_at_50%_-6rem,rgb(111_100_227/0.3),transparent_65%)]" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow !text-brand-300">Responsible AI</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  AI helps. You decide.
                </h2>
                <p className="mt-3 leading-7 text-ink-300">
                  HireSmart AI gives useful recommendations, while people stay in control of hiring
                  decisions.
                </p>
              </div>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {TRUST_POINTS.map((point, index) => (
                <Reveal key={point.title} delay={index * 100}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors hover:bg-white/10">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/20 text-brand-300">
                      <point.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-semibold">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-300">{point.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------ privacy strip ------------------------------ */}
        <section className="bg-white py-14 sm:py-16">
          <Reveal className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="panel flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-50 text-success-700">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-bold text-ink-950 sm:text-xl">
                  Your data stays protected
                </h2>
              </div>
              <div className="grid flex-1 gap-4 sm:grid-cols-3 lg:max-w-3xl">
                {PRIVACY_POINTS.map((point) => (
                  <div key={point.title} className="flex items-start gap-2.5">
                    <point.icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-success-600"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink-950">{point.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-ink-500">{point.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to="/privacy"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                Learn about privacy <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------- companies ------------------------------- */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Reveal>
            <SectionHeading
              eyebrow="Companies"
              title="Explore companies hiring on HireSmart AI"
              text="Discover opportunities from companies looking for new talent."
              action={
                <Link
                  to="/companies"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  View all companies <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {companies.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <CompanyCardSkeleton key={index} />)
              : companies.error
                ? null
                : companies.data?.data?.slice(0, 8).map((company, index) => (
                    <Reveal key={company.id} delay={index * 60}>
                      <CompanyCard company={company} />
                    </Reveal>
                  ))}
          </div>
          {companies.error && (
            <div className="mt-8">
              <EmptyState
                icon={Building2}
                title="We couldn't load companies right now"
                description="Something went wrong on our side. Please try again."
                action={
                  <Button size="sm" variant="secondary" onClick={() => companies.refetch()}>
                    Try again
                  </Button>
                }
              />
            </div>
          )}
          {!companies.isLoading && !companies.error && !companies.data?.data?.length && (
            <div className="mt-8">
              <EmptyState
                icon={Building2}
                title="No companies to show yet"
                description="Companies appear here once they publish jobs on HireSmart AI."
                action={
                  <Button as={Link} to="/jobs" size="sm" variant="secondary">
                    Browse all jobs
                  </Button>
                }
              />
            </div>
          )}
        </section>

        {/* -------------------------------- final CTA -------------------------------- */}
        <section className="relative overflow-hidden bg-ink-950 py-20 text-white sm:py-24">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(46rem_20rem_at_50%_-8rem,rgb(111_100_227/0.4),transparent_65%)]" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(36rem_16rem_at_85%_100%,rgb(79_124_255/0.22),transparent_60%)]" />
          <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <TrendingUp className="mx-auto h-10 w-10 text-brand-300" aria-hidden="true" />
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Ready for your next opportunity?
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-ink-300">
              Find jobs, improve your resume and take the next step with HireSmart AI.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                as={Link}
                to="/jobs"
                size="lg"
                variant="gradient"
                className="w-full sm:w-auto"
              >
                Find a Job <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                as={Link}
                to={employerHome}
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Hire Talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-400">
              <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
              AI-powered guidance. Human decisions.
            </p>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default LandingPage;
