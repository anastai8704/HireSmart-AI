import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
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
  UserCheck,
  UsersRound,
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

/* ------------------------------ page data ------------------------------ */
/* Every link here points at a route that already exists in the app. */

const POPULAR_SEARCHES = [
  { label: "React Developer", to: "/jobs?query=react%20developer" },
  { label: "Python Developer", to: "/jobs?query=python%20developer" },
  { label: "Data Scientist", to: "/jobs?query=data%20scientist" },
  { label: "DevOps", to: "/jobs?query=devops" },
  { label: "Mumbai", to: "/jobs?location=Mumbai" },
  { label: "Remote", to: "/jobs?workplaceMode=remote" },
];

const STEPS = [
  {
    icon: Search,
    title: "Search",
    text: "Find jobs based on your skills, role, location and work preferences.",
  },
  {
    icon: Target,
    title: "Check your match",
    text: "See which skills and experience match the job and what you may be missing.",
  },
  {
    icon: Rocket,
    title: "Take the next step",
    text: "Improve your resume, apply for jobs, or connect with employers.",
  },
];

const AI_FEATURES = [
  {
    icon: Target,
    title: "Understand job matches",
    text: "See the skills and experience that match a job.",
  },
  {
    icon: FileText,
    title: "Improve your resume",
    text: "Get practical suggestions to make your resume stronger.",
  },
  {
    icon: UsersRound,
    title: "Make hiring easier",
    text: "Recruiters can quickly review candidates and focus on the best matches.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    text: "AI gives recommendations. People make the final hiring decision.",
  },
];

const RESUME_FEATURES = [
  {
    icon: FileText,
    title: "Check your resume",
    text: "Upload a PDF or DOCX and get a clear, honest review.",
  },
  {
    icon: Search,
    title: "Find missing skills",
    text: "See the skills a job asks for that your resume does not show yet.",
  },
  {
    icon: Lightbulb,
    title: "Improve your content",
    text: "Get specific suggestions you can act on right away.",
  },
  {
    icon: Target,
    title: "Get job-specific suggestions",
    text: "See how to adjust your resume for the job you want.",
  },
];

const CANDIDATE_CARDS = [
  {
    icon: Search,
    title: "Find jobs",
    text: "Search jobs by role, skills, location and work mode.",
    to: "/jobs",
  },
  {
    icon: FileText,
    title: "Check your resume",
    text: "Understand how well your resume fits the jobs you want.",
    to: "/resume-check",
  },
  {
    icon: ClipboardList,
    title: "Track applications",
    text: "Keep your job applications and updates in one place.",
    to: "/app/candidate/applications",
  },
  {
    icon: Video,
    title: "Prepare for interviews",
    text: "Get AI-powered interview preparation and guidance.",
    to: "/app/candidate/interviews",
  },
];

const CANDIDATE_JOURNEY = [
  "Search jobs",
  "Check your match",
  "Improve your resume",
  "Apply",
  "Track your application",
];

const EMPLOYER_FEATURES = [
  {
    icon: BriefcaseBusiness,
    title: "Create job openings",
    text: "Create and manage your job posts.",
  },
  {
    icon: UserCheck,
    title: "Find candidates",
    text: "Discover candidates based on relevant skills and experience.",
  },
  {
    icon: ClipboardList,
    title: "Review applications",
    text: "Keep candidate information and hiring progress organized.",
  },
  {
    icon: HeartHandshake,
    title: "AI-assisted decisions",
    text: "Use AI recommendations while keeping humans in control.",
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
  { icon: Eye, title: "Clear", text: "Understand why a match is recommended." },
  { icon: Lightbulb, title: "Helpful", text: "Get suggestions you can actually act on." },
  {
    icon: HeartHandshake,
    title: "Human-controlled",
    text: "AI supports decisions. It does not make hiring decisions on its own.",
  },
];

const PRIVACY_POINTS = [
  { icon: Lock, title: "Private", text: "Your personal information is protected." },
  { icon: ShieldCheck, title: "Secure", text: "Your account and sessions are secured." },
  {
    icon: SlidersHorizontal,
    title: "In your control",
    text: "Manage your data and permissions from your account settings.",
  },
];

/* ---------------------------- small building blocks ---------------------------- */

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

const Journey = ({ label, steps }) => (
  <div className="mt-8 flex flex-col gap-2 rounded-2xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:gap-4">
    <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-ink-400">
      {label}
    </span>
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-600">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-1.5">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />}
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 text-sm font-bold text-white"
        >
          {(company.name || "?").slice(0, 2).toUpperCase()}
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
    auth.isAuthenticated && auth.role === "candidate" ? "/app/candidate" : "/auth/register/candidate";

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
        {/* ------------------------------- hero ------------------------------- */}
        <section className="relative overflow-hidden bg-white">
          <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,#e0e7ff,transparent_65%)]" />
          <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pt-20 lg:px-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI-powered job search and hiring
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-extrabold tracking-[-0.035em] text-ink-950 sm:text-5xl lg:text-6xl">
              Find the <span className="text-brand-600">right job</span>.{" "}
              <br className="hidden sm:block" />
              Hire the <span className="text-brand-600">right people</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink-600 sm:text-lg sm:leading-8">
              Search jobs, check your resume, and understand why a role matches your skills.
              Employers can find qualified candidates faster with AI-powered hiring tools.
            </p>

            <form
              onSubmit={search}
              role="search"
              aria-label="Search jobs"
              className="mx-auto mt-10 grid max-w-5xl items-end gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-lg shadow-ink-900/5 sm:p-5 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]"
            >
              <Input
                id="hero-job"
                label="What job are you looking for?"
                placeholder="e.g. Python Developer, Data Analyst"
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
                className="w-full md:col-span-2 lg:col-span-1 lg:w-auto"
                leftIcon={<Search className="h-4 w-4" />}
              >
                Search jobs
              </Button>
            </form>

            <div className="mt-5 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center sm:gap-3">
              <span className="text-sm font-medium text-ink-500">Popular searches:</span>
              <div className="flex flex-wrap justify-center gap-2">
                {POPULAR_SEARCHES.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button as={Link} to="/jobs" size="lg" className="w-full sm:w-auto">
                Find a job <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                as={Link}
                to={employerHome}
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Hire talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* --------------------------- trust message --------------------------- */}
        <section aria-label="How hiring decisions are made" className="border-y border-ink-200/70 bg-white">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-7 text-center sm:px-6 lg:flex-row lg:gap-5 lg:text-left">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success-50 text-success-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-ink-950">
                AI helps you understand the match — people make the final decision.
              </p>
              <p className="mt-1.5 text-sm leading-6 text-ink-600">
                See which skills match a job, what you are missing, and what you can improve. AI
                supports hiring decisions instead of making them automatically.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------- how HireSmart helps ------------------------- */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            center
            eyebrow="How it works"
            title="How HireSmart AI helps"
            text="Three simple steps from searching to getting hired."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="panel relative p-6">
                <span className="absolute right-5 top-5 text-4xl font-extrabold tracking-tight text-ink-100">
                  {index + 1}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-600">{step.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-brand-100 bg-brand-50/70">
            <div className="flex flex-col gap-6 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="eyebrow">For employers</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-ink-950">
                  Find better candidates, faster.
                </h3>
                <p className="mt-3 leading-7 text-ink-600">
                  Create jobs, review applicants and use AI to understand candidate-job matches.
                </p>
              </div>
              <Button as={Link} to={employerHome} size="lg" className="shrink-0">
                Start hiring <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* --------------------- AI that helps, without taking over --------------------- */}
        <section className="bg-ink-950 py-16 text-white sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow !text-brand-300">Why HireSmart AI</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                AI that helps — without taking over
              </h2>
              <p className="mt-3 leading-7 text-ink-300">
                Understand why a candidate matches a job and where they may need improvement.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {AI_FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/20 text-brand-300">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-300">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------- resume check ----------------------------- */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
            <div>
              <p className="eyebrow">Resume Check</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                Not sure if your resume is strong enough?
              </h2>
              <p className="mt-4 leading-7 text-ink-600">
                Upload your resume and get clear feedback on your skills, experience and job fit.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button as={Link} to={candidateHome} size="lg">
                  Check my resume <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <p className="text-sm text-ink-500">Free for job seekers · PDF or DOCX</p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {RESUME_FEATURES.map((feature) => (
                <li key={feature.title} className="panel p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-semibold text-ink-950">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ink-600">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------- companies ------------------------------- */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            eyebrow="Companies"
            title="Explore jobs from growing companies"
            text="Discover opportunities from companies hiring on HireSmart AI."
            action={
              <Link
                to="/companies"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
              >
                View all companies <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {companies.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <CompanyCardSkeleton key={index} />)
              : companies.error
                ? null
                : companies.data?.data?.slice(0, 8).map((company) => (
                    <CompanyCard key={company.id} company={company} />
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

        {/* ------------------------------ for job seekers ------------------------------ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="For job seekers"
              title="Everything you need to find your next job"
              text="One place for your search, your resume and your applications."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CANDIDATE_CARDS.map((card) => (
                <Link
                  key={card.title}
                  to={card.to}
                  className="panel group flex h-full flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card-hover)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <card.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-bold text-ink-950">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{card.text}</p>
                </Link>
              ))}
            </div>
            <Journey label="Your journey" steps={CANDIDATE_JOURNEY} />
            <div className="mt-8">
              <Button as={Link} to={candidateHome} size="lg">
                I'm looking for a job <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* ------------------------------- for employers ------------------------------- */}
        <section className="bg-ink-50/70 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="For employers"
              title="Build your team with less effort"
              text="Post jobs, review candidates and use AI to understand who matches your requirements."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EMPLOYER_FEATURES.map((feature) => (
                <div key={feature.title} className="panel h-full p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-950 text-white">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-bold text-ink-950">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{feature.text}</p>
                </div>
              ))}
            </div>
            <Journey label="Your journey" steps={EMPLOYER_JOURNEY} />
            <div className="mt-8">
              <Button as={Link} to={employerHome} size="lg">
                I'm hiring <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* --------------------------- trust and privacy --------------------------- */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div className="panel p-8 sm:p-10">
              <h2 className="text-2xl font-bold tracking-tight text-ink-950">AI you can understand</h2>
              <p className="mt-4 leading-7 text-ink-600">
                We use AI to help with job matching, resumes and recruitment. Our goal is to make
                recommendations easier to understand — not to hide how decisions are made.
              </p>
              <ul className="mt-7 space-y-5">
                {TRUST_POINTS.map((point) => (
                  <li key={point.title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <point.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-ink-950">{point.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink-600">{point.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-8 sm:p-10">
              <h2 className="text-2xl font-bold tracking-tight text-ink-950">
                Your information stays protected
              </h2>
              <p className="mt-4 leading-7 text-ink-600">
                Your profile, resume and application data are handled securely and you control how
                your information is used.
              </p>
              <ul className="mt-7 space-y-5">
                {PRIVACY_POINTS.map((point) => (
                  <li key={point.title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success-50 text-success-700">
                      <point.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-ink-950">{point.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink-600">{point.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
                <Link to="/privacy" className="text-brand-600 transition-colors hover:text-brand-700">
                  Learn about privacy →
                </Link>
                <Link to="/app/settings" className="text-brand-600 transition-colors hover:text-brand-700">
                  Manage your account →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------- final CTA -------------------------------- */}
        <section className="relative overflow-hidden bg-ink-950 py-16 text-white sm:py-20">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(40rem_18rem_at_50%_-6rem,rgb(111_100_227/0.35),transparent_65%)]" />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to find your next opportunity?
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-ink-300">
              Search jobs, improve your resume and take the next step with HireSmart AI.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button as={Link} to="/jobs" size="lg" className="w-full sm:w-auto">
                Find a job <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                as={Link}
                to={employerHome}
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Hire talent <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-400">
              <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden="true" />
              Free for job seekers. AI explains every recommendation.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default LandingPage;
