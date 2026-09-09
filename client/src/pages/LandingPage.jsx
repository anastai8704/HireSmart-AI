import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartHandshake,
  Lightbulb,
  ListChecks,
  Lock,
  MapPin,
  PenLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  User,
  UserCheck,
  Video,
} from "lucide-react";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Button from "../components/ui/Button";
import Input, { Select } from "../components/ui/Input";
import { EmptyState, Skeleton } from "../components/ui/States";
import { LogoMark } from "../components/brand/Logo";
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
  { label: "Data Scientist", to: "/jobs?query=data%20scientist" },
  { label: "DevOps", to: "/jobs?query=devops" },
  { label: "Mumbai", to: "/jobs?location=Mumbai" },
  { label: "Remote", to: "/jobs?workplaceMode=remote" },
];

const SEEKER_CARDS = [
  {
    icon: Search,
    title: "Find jobs",
    text: "Search by role, skills, location and work mode — see what fits before you apply.",
    to: "/jobs",
  },
  {
    icon: FileText,
    title: "Check your resume",
    text: "See your strengths and the skills you may be missing, before you apply.",
    to: "/resume-check",
  },
  {
    icon: ClipboardList,
    title: "Track applications",
    text: "Follow every application and update in one organized place.",
    to: "/app/candidate/applications",
  },
  {
    icon: Video,
    title: "Prepare for interviews",
    text: "Get practical preparation for the roles you are aiming for.",
    to: "/app/candidate/interviews",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Find a job",
    text: "Search jobs using role, skills, location and work preferences.",
  },
  {
    number: "02",
    title: "Check your match",
    text: "See how your skills and experience fit the role.",
  },
  {
    number: "03",
    title: "Take the next step",
    text: "Improve your resume, apply, prepare for interviews and continue your search.",
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

const EMPLOYER_FEATURES = [
  {
    icon: BriefcaseBusiness,
    title: "Create job openings",
    text: "Post roles and manage them in one place.",
  },
  {
    icon: UserCheck,
    title: "Review candidates",
    text: "See every applicant with a clear, organized overview.",
  },
  {
    icon: Target,
    title: "Compare matches",
    text: "Understand which candidates fit your requirements — and why.",
  },
  {
    icon: CalendarClock,
    title: "Schedule interviews",
    text: "Plan and run interviews without the back-and-forth.",
  },
  {
    icon: ClipboardList,
    title: "Manage hiring progress",
    text: "Follow each candidate through your hiring pipeline.",
  },
];

/* Sample data for the employer product preview (mirrors the real recruiter
   pipeline stages; clearly labeled "Product preview"). */
const DEMO_CANDIDATES = [
  {
    name: "Aarav Shah",
    role: "Python Developer · 3 yrs",
    matched: ["Python", "Django"],
    missing: ["AWS"],
    score: 87,
  },
  {
    name: "Priya Nair",
    role: "React Developer · 2 yrs",
    matched: ["React", "TypeScript"],
    missing: ["Node.js"],
    score: 74,
  },
];

const DEMO_PIPELINE = [
  ["Submitted", 18],
  ["Under review", 7],
  ["Shortlisted", 3],
  ["Interview", 2],
  ["Hired", 1],
];

const RESUME_FEATURES = [
  { icon: FileText, title: "Resume review", text: "A clear overall view of your resume." },
  { icon: ListChecks, title: "Missing skills", text: "Find the skills the job expects that are missing." },
  { icon: PenLine, title: "Better wording", text: "Suggestions to say things more clearly." },
  { icon: Target, title: "Job-specific suggestions", text: "Tips tailored to the roles you are applying for." },
];

const DEMO_RESUME = {
  score: 78,
  strengths: ["Clear technical skills", "Good project experience"],
  improvements: ["Add measurable achievements", "Add missing job-specific skills"],
};

const PRIVACY_POINTS = [
  { icon: Lock, title: "Private", text: "Your profile and resume are protected." },
  { icon: ShieldCheck, title: "Secure", text: "Your account and sessions are secured." },
  { icon: SlidersHorizontal, title: "In your control", text: "You choose how your information is used." },
];

const PRINCIPLES = [
  {
    icon: Target,
    title: "Understand job matches",
    text: "See which skills fit a role — and where you can grow.",
  },
  {
    icon: FileText,
    title: "Improve your resume",
    text: "Practical suggestions you can act on right away.",
  },
  {
    icon: UserCheck,
    title: "Make hiring easier",
    text: "Find, compare and shortlist candidates with confidence.",
  },
  {
    icon: HeartHandshake,
    title: "Stay in control",
    text: "AI provides recommendations. People make the final decision.",
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

/** Selective headline accent: violet → cyan, used on a couple of key words only. */
const AccentText = ({ children }) => (
  <span className="bg-gradient-to-r from-brand-300 via-brand-200 to-cyan-300 bg-clip-text text-transparent">
    {children}
  </span>
);

const SectionHeading = ({ eyebrow, title, text, action, center = false, dark = false }) => (
  <div
    className={
      center
        ? "mx-auto max-w-2xl text-center"
        : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    }
  >
    <div className={center ? "" : "max-w-2xl"}>
      <p className={cn("eyebrow", dark && "!text-brand-300")}>{eyebrow}</p>
      <h2
        className={cn(
          "mt-2 text-2xl font-bold tracking-tight sm:text-3xl",
          dark ? "text-white" : "text-ink-950",
        )}
      >
        {title}
      </h2>
      {text && <p className={cn("mt-3 leading-7", dark ? "text-ink-300" : "text-ink-600")}>{text}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** Product-preview ring showing a demo match score (violet → cyan). */
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
            <stop offset="100%" stopColor="#22d3ee" />
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

  // Browsing jobs is public, so "Find a Job" always opens the real job search.
  // Hiring needs an account, so that path leads to the employer sign-up or,
  // for signed-in employers, straight into their workspace.
  const employerHome = auth.organizationId
    ? `/app/o/${auth.organizationId}`
    : "/auth/register/recruiter";

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
      <Navbar dark />
      <main id="main-content">
        {/* --------------------------------- hero --------------------------------- */}
        <section className="relative overflow-hidden bg-ink-950">
          {/* layered background: violet core glow, faint cyan edge, fine dot grid */}
          <div
            className="absolute inset-x-0 top-0 h-[36rem] animate-glow-breathe bg-[radial-gradient(56rem_24rem_at_50%_-10rem,rgb(111_100_227/0.32),transparent_62%)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(40rem_18rem_at_88%_-6rem,rgb(34_211_238/0.12),transparent_60%)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:26px_26px]"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-ink-200">
                <LogoMark className="h-4 w-4" title="" />
                AI-powered job search and hiring
              </p>
              <h1 className="mx-auto mt-7 max-w-4xl text-balance text-4xl font-extrabold tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
                Find the <AccentText>right job</AccentText>.
                <br className="hidden sm:block" /> Hire the{" "}
                <AccentText>right people</AccentText>.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-300 sm:text-lg sm:leading-8">
                Search jobs, check your resume, and understand why a role matches your skills.
                Employers can find qualified candidates faster with AI-powered hiring tools.
              </p>
              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-400">
                <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                AI helps you understand the match — people make the final decision.
              </p>
            </Reveal>

            {/* premium search component */}
            <Reveal delay={120} className="relative z-10 mt-8">
              <form
                onSubmit={search}
                role="search"
                aria-label="Search jobs"
                className="mx-auto grid max-w-5xl items-end gap-3 rounded-2xl border border-white/10 bg-white p-4 text-left shadow-[0_30px_80px_-24px_rgb(0_0_0/0.65)] sm:p-5 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]"
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
              <div className="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center sm:gap-3">
                <span className="text-sm font-medium text-ink-400">Popular searches</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {POPULAR_SEARCHES.map((item) => (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-ink-300 transition-all hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-white/10 hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* product preview */}
            <Reveal delay={150} className="relative mt-14">
              <div
                className="absolute left-1/2 top-1/2 h-72 w-[38rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(111_100_227/0.22),transparent)]"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_40px_90px_-30px_rgb(0_0_0/0.7)]">
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

        {/* --------------------------- job seeker experience --------------------------- */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading
                center
                eyebrow="For job seekers"
                title="Everything you need to find your next job"
                text="From your first search to your final interview, HireSmart AI keeps every step clear."
              />
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </section>

        {/* ----------------------------- how it works ----------------------------- */}
        <section className="bg-ink-50/70 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading
                center
                eyebrow="How it works"
                title="A clear path from search to hire"
                text="Three simple steps — the same logic whether you are looking for work or looking to hire."
              />
            </Reveal>
            <div className="relative mt-14">
              {/* connecting progression line (desktop) */}
              <div className="absolute left-[16%] right-[16%] top-7 hidden h-0.5 overflow-hidden rounded-full bg-ink-200 md:block" aria-hidden="true">
                <div className="h-full w-full origin-left bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-400" />
              </div>
              <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
                {STEPS.map((step, index) => (
                  <Reveal key={step.number} delay={index * 130}>
                    <li className="group relative flex gap-5 md:flex-col md:items-center md:text-center">
                      <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-ink-200 bg-white text-lg font-extrabold tabular-nums text-brand-600 shadow-[var(--shadow-card)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:text-brand-700 group-hover:shadow-[var(--shadow-card-hover)]">
                        {step.number}
                      </span>
                      <div className="md:mt-5">
                        <h3 className="text-lg font-bold text-ink-950">{step.title}</h3>
                        <p className="mt-1.5 max-w-xs text-sm leading-6 text-ink-600 md:mx-auto">
                          {step.text}
                        </p>
                      </div>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------------------- for employers ---------------------------- */}
        <section className="relative overflow-hidden bg-ink-950 py-16 text-white sm:py-24">
          <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(48rem_22rem_at_20%_-8rem,rgb(111_100_227/0.3),transparent_65%)]" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(40rem_18rem_at_90%_110%,rgb(34_211_238/0.1),transparent_60%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
              <Reveal>
                <div>
                  <p className="eyebrow !text-brand-300">For employers</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    Build your team with less effort
                  </h2>
                  <p className="mt-3 leading-7 text-ink-300">
                    HireSmart AI keeps your whole hiring process in one place — from the first
                    job post to the final offer.
                  </p>
                  <ul className="mt-8 space-y-4">
                    {EMPLOYER_FEATURES.map((feature) => (
                      <li key={feature.title} className="flex items-start gap-3.5">
                        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-brand-300">
                          <feature.icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                          <p className="mt-0.5 text-sm leading-6 text-ink-400">{feature.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button as={Link} to={employerHome} size="lg" variant="gradient" className="mt-9">
                    Hire Talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </Reveal>

              {/* realistic product preview: candidate matches + pipeline */}
              <Reveal delay={140}>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">Candidate matches</p>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-300">
                      Product preview
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {DEMO_CANDIDATES.map((candidate) => (
                      <div
                        key={candidate.name}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-950/60 p-3.5"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white"
                        >
                          {initials(candidate.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{candidate.name}</p>
                          <p className="truncate text-xs text-ink-400">{candidate.role}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {candidate.matched.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center gap-1 rounded-full bg-success-500/15 px-2 py-0.5 text-[11px] font-medium text-success-500"
                              >
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                {skill}
                              </span>
                            ))}
                            {candidate.missing.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-ink-400 ring-1 ring-inset ring-white/10"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-extrabold tabular-nums text-cyan-300">
                            {candidate.score}%
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                            Match
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                      Hiring pipeline
                    </p>
                    <div className="mt-3 grid grid-cols-5 gap-1.5">
                      {DEMO_PIPELINE.map(([stage, count], index) => (
                        <div key={stage} className="min-w-0">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              index === 0 ? "bg-gradient-to-r from-brand-500 to-cyan-400" : "bg-white/15",
                            )}
                            aria-hidden="true"
                          />
                          <p className="mt-2 truncate text-center text-[11px] font-medium text-ink-300">
                            {count}
                          </p>
                          <p className="truncate text-center text-[9px] font-semibold uppercase tracking-wide text-ink-500">
                            {stage}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------ AI value ------------------------------ */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <Reveal>
                <div>
                  <p className="eyebrow">HireSmart AI</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                    AI that helps you make better decisions.
                  </h2>
                  <p className="mt-3 leading-7 text-ink-600">
                    No guesswork, no black box. Every recommendation comes with the reasons
                    behind it, so you always know what you are looking at.
                  </p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                        For candidates
                      </span>
                      <p className="mt-2 text-sm leading-6 text-ink-700">
                        See why a job may fit your skills and where you can improve.
                      </p>
                    </div>
                    <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        For employers
                      </span>
                      <p className="mt-2 text-sm leading-6 text-ink-700">
                        See which candidates best match your requirements and why.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5">
                    <HeartHandshake className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
                    <p className="text-sm font-semibold text-ink-900">
                      AI provides recommendations. People make the final decision.
                    </p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={140}>
                <div className="ai-panel p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-300">
                        Job match
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-white">{DEMO_MATCH.role}</h3>
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
          </div>
        </section>

        {/* ------------------------------ resume check ------------------------------ */}
        <section className="bg-ink-50/70 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <Reveal>
                <div>
                  <p className="eyebrow">Resume Check</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                    Make your resume stronger.
                  </h2>
                  <p className="mt-4 leading-7 text-ink-600">
                    Upload your resume to see your strengths, missing skills and practical ways
                    to improve it.
                  </p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {RESUME_FEATURES.map((feature) => (
                      <div
                        key={feature.title}
                        className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                          <feature.icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink-950">{feature.title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-ink-500">{feature.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button as={Link} to="/resume-check" size="lg" variant="gradient">
                      Check my resume <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <p className="text-sm text-ink-500">PDF &amp; DOCX supported</p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={140}>
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
                        className="h-full rounded-r-full bg-gradient-to-r from-brand-500 to-cyan-400"
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
          </div>
        </section>

        {/* ------------------------------ trust / privacy ------------------------------ */}
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading
                center
                eyebrow="Privacy"
                title="Your information stays protected."
                text="We keep your job search private and your account safe — on your terms."
              />
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {PRIVACY_POINTS.map((point, index) => (
                <Reveal key={point.title} delay={index * 90}>
                  <div className="panel h-full p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-success-50 text-success-700">
                      <point.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-bold text-ink-950">{point.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-600">{point.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <div className="mt-8 text-center">
                <Link
                  to="/privacy"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  Learn how we protect your data <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------- companies ------------------------------- */}
        <section className="bg-ink-50/70 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
          </div>
        </section>

        {/* --------------------------- why hiresmart (dark) --------------------------- */}
        <section className="relative overflow-hidden bg-ink-950 py-16 text-white sm:py-24">
          <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50rem_22rem_at_50%_-10rem,rgb(111_100_227/0.3),transparent_65%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow !text-brand-300">Why HireSmart</p>
                <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Smart tools.
                  <br />
                  Clear answers.
                  <br />
                  <span className="bg-gradient-to-r from-brand-300 to-cyan-300 bg-clip-text text-transparent">
                    Human decisions.
                  </span>
                </h2>
              </div>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((principle, index) => (
                <Reveal key={principle.title} delay={index * 90}>
                  <div className="group h-full rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-300/40 hover:bg-white/10">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/20 text-brand-300 transition-transform duration-200 group-hover:scale-105">
                      <principle.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-bold text-white">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-300">{principle.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* final CTA — conversion card */}
            <Reveal delay={120} className="mt-16">
              <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-14 text-center sm:px-12">
                <div
                  className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(38rem_16rem_at_50%_-4rem,rgb(111_100_227/0.4),transparent_65%)]"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(34rem_14rem_at_80%_110%,rgb(34_211_238/0.16),transparent_60%)]"
                  aria-hidden="true"
                />
                <div className="relative">
                  <LogoMark className="mx-auto h-12 w-12" title="" />
                  <h3 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                    Ready for your next opportunity?
                  </h3>
                  <p className="mx-auto mt-4 max-w-xl leading-7 text-ink-300">
                    Find a job, improve your resume, or start hiring with HireSmart AI.
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
                      variant="lightOutline"
                      className="w-full sm:w-auto"
                    >
                      Hire Talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-400">
                    <TrendingUp className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                    AI-powered guidance. Human decisions.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default LandingPage;
