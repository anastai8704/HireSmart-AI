/**
 * Landing.jsx
 * -----------------------------------------------------------------------------
 * The public home page. It has one job: explain what the product does in ten
 * seconds and route the visitor to the right next step (candidate or recruiter).
 */

import { Link } from "react-router-dom";
import {
    ArrowRight,
    BarChart3,
    Brain,
    CheckCircle2,
    FileSearch,
    Gauge,
    Layers,
    ShieldCheck,
    Sparkles,
    Users,
} from "lucide-react";

import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { useAuth } from "../context/useAuth";
import { homeRouteForRole } from "../lib/roleRoutes";

const FEATURES = [
    {
        icon: Brain,
        title: "Explainable match scoring",
        description:
            "Every resume is scored 0-100 against a job using skills, TF-IDF content similarity, experience and education - and the app shows exactly how each part contributed.",
    },
    {
        icon: FileSearch,
        title: "ATS resume analyzer",
        description:
            "Get the same structural checks a real applicant tracking system runs: contact parsing, section detection, keyword coverage and quantified-impact analysis.",
    },
    {
        icon: Layers,
        title: "Automatic applicant ranking",
        description:
            "Recruiters open the strongest candidates first instead of reading 200 resumes in the order they happened to arrive.",
    },
    {
        icon: Gauge,
        title: "Personalised recommendations",
        description:
            "Candidates see the open roles that genuinely fit their resume, with the missing skills spelled out for each one.",
    },
    {
        icon: ShieldCheck,
        title: "Secure by design",
        description:
            "JWT authentication, role-based access control, rate limiting, input sanitisation and private resume storage that is never publicly served.",
    },
    {
        icon: BarChart3,
        title: "Hiring analytics",
        description:
            "Funnel metrics from applied through shortlisted to selected, so a recruiter can see where candidates drop off.",
    },
];

const HOW_IT_WORKS = [
    {
        step: "01",
        title: "Upload your resume",
        description:
            "We extract the text from your PDF or DOCX and parse out skills, contact details, sections and experience.",
    },
    {
        step: "02",
        title: "Get your ATS score",
        description:
            "See how machine-readable your resume is and exactly what to fix, ordered by how much each change matters.",
    },
    {
        step: "03",
        title: "Apply where you fit",
        description:
            "Browse jobs ranked by real match score, see the skill gaps before you apply, and track every application in one place.",
    },
];

const Landing = () => {
    const { isAuthenticated, role } = useAuth();

    return (
        <div>
            {/* ================= HERO ================= */}
            <section className="relative overflow-hidden bg-white">
                {/* Soft decorative gradient - purely visual. */}
                <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-brand-100),transparent)]"
                    aria-hidden="true"
                />

                <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
                    <div className="mx-auto max-w-3xl text-center">
                        <Badge variant="brand" className="mb-5">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            AI-powered applicant tracking
                        </Badge>

                        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
                            Stop guessing why your
                            <span className="text-brand-600"> resume gets rejected</span>
                        </h1>

                        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-600">
                            HireSmart AI scores any resume against any job in seconds, shows the
                            exact skills you are missing, and ranks applicants for recruiters -
                            with a transparent breakdown behind every single number.
                        </p>

                        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            {isAuthenticated ? (
                                <Button
                                    as={Link}
                                    to={homeRouteForRole(role)}
                                    size="lg"
                                    rightIcon={<ArrowRight className="h-4 w-4" />}
                                >
                                    Go to your dashboard
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        as={Link}
                                        to="/resume-check"
                                        size="lg"
                                        rightIcon={<ArrowRight className="h-4 w-4" />}
                                    >
                                        Check my resume free
                                    </Button>

                                    <Button as={Link} to="/jobs" size="lg" variant="secondary">
                                        Browse open jobs
                                    </Button>
                                </>
                            )}
                        </div>

                        <p className="mt-4 text-xs text-ink-400">
                            No sign-up needed for the resume check. Nothing is stored.
                        </p>
                    </div>

                    {/* Score preview - shows the product's core idea visually. */}
                    <div className="mx-auto mt-16 max-w-4xl">
                        <Card className="overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-4 py-2.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-danger-500/60" />
                                <span className="h-2.5 w-2.5 rounded-full bg-warning-500/60" />
                                <span className="h-2.5 w-2.5 rounded-full bg-success-500/60" />
                                <span className="ml-2 text-xs font-medium text-ink-500">
                                    Match analysis - Full Stack MERN Developer
                                </span>
                            </div>

                            <CardContent className="grid gap-6 p-6 sm:grid-cols-3">
                                <div className="flex flex-col items-center justify-center rounded-xl bg-success-50 py-6">
                                    <span className="text-4xl font-bold text-success-700">90</span>
                                    <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-success-700/70">
                                        Excellent match
                                    </span>
                                </div>

                                <div className="space-y-3 sm:col-span-2">
                                    {[
                                        { label: "Skill match", value: 92 },
                                        { label: "Content relevance", value: 88 },
                                        { label: "Experience level", value: 100 },
                                        { label: "Education signals", value: 67 },
                                    ].map((row) => (
                                        <div key={row.label}>
                                            <div className="mb-1 flex justify-between text-xs">
                                                <span className="font-medium text-ink-600">
                                                    {row.label}
                                                </span>
                                                <span className="font-semibold tabular-nums text-ink-900">
                                                    {row.value}
                                                </span>
                                            </div>

                                            <div className="h-2 overflow-hidden rounded-full bg-ink-200">
                                                <div
                                                    className="h-full rounded-full bg-brand-500"
                                                    style={{ width: `${row.value}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* ================= FEATURES ================= */}
            <section className="border-y border-ink-200 bg-ink-50 py-20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-ink-900">
                            Everything both sides of hiring actually need
                        </h2>
                        <p className="mt-3 text-ink-600">
                            One platform for candidates who want feedback and recruiters who want
                            their shortlist to build itself.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((feature) => {
                            const Icon = feature.icon;

                            return (
                                <Card key={feature.title} hoverable className="p-6">
                                    <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                                        <Icon className="h-5 w-5" aria-hidden="true" />
                                    </span>

                                    <h3 className="text-base font-semibold text-ink-900">
                                        {feature.title}
                                    </h3>

                                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                                        {feature.description}
                                    </p>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ================= HOW IT WORKS ================= */}
            <section className="py-20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-ink-900">
                            How it works for candidates
                        </h2>
                    </div>

                    <div className="mt-12 grid gap-8 md:grid-cols-3">
                        {HOW_IT_WORKS.map((item) => (
                            <div key={item.step} className="relative">
                                <span className="text-5xl font-extrabold text-brand-100">
                                    {item.step}
                                </span>

                                <h3 className="mt-2 text-lg font-semibold text-ink-900">
                                    {item.title}
                                </h3>

                                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ================= RECRUITER CTA ================= */}
            <section className="border-t border-ink-200 bg-white py-20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <Card className="overflow-hidden border-brand-200 bg-brand-600">
                        <CardContent className="flex flex-col items-center gap-6 p-10 text-center lg:flex-row lg:text-left">
                            <div className="flex-1">
                                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                                    Hiring? Let the shortlist build itself.
                                </h2>

                                <p className="mt-3 max-w-2xl text-brand-100">
                                    Post a role and every applicant is scored and ranked
                                    automatically, with the reasoning attached. Move candidates
                                    through your pipeline and watch the funnel in real time.
                                </p>

                                <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-brand-50 lg:justify-start">
                                    {[
                                        "Ranked applicants",
                                        "Pipeline tracking",
                                        "Funnel analytics",
                                        "Private notes",
                                    ].map((item) => (
                                        <li key={item} className="inline-flex items-center gap-1.5">
                                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <Button
                                as={Link}
                                to="/register?role=recruiter"
                                size="lg"
                                className="shrink-0 bg-white text-brand-700 hover:bg-brand-50"
                                leftIcon={<Users className="h-4 w-4" />}
                            >
                                Start hiring
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
};

export default Landing;
