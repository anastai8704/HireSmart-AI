import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Building2, CheckCircle2, Clock, GraduationCap, MapPin, Search, ShieldCheck, Target, UsersRound } from "lucide-react";
import Navbar from "../components/layout/Navbar"; import Footer from "../components/layout/Footer"; import Button from "../components/ui/Button"; import Input, { Select } from "../components/ui/Input"; import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../components/ui/States"; import { jobsApi, companiesApi } from "../lib/api"; import { formatRelativeTime, formatSalary } from "../lib/utils"; import { useAuth } from "../context/useAuth"; import { usePageMeta } from "../lib/usePageMeta"; import { useDebouncedValue } from "../hooks/useApi";

/* ----------------------------- shared bits ----------------------------- */

const salaryText = (job) => {
    const comp = job.compensation;
    if (!comp || !(comp.min || comp.max)) return null;
    if (comp.min && comp.max && comp.min !== comp.max) return `${formatSalary(comp.min)} – ${formatSalary(comp.max)}`;
    return formatSalary(comp.min || comp.max);
};

const Chip = ({ children }) => <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-100">{children}</span>;

const PublicJobCard = ({ job }) => {
    const salary = salaryText(job);
    const company = job.organization?.name || job.company;
    const chips = [job.workplaceMode && job.workplaceMode !== "unspecified" ? job.workplaceMode : null, job.jobType, job.experience && !job.minExpYears ? job.experience : null, job.minExpYears ? `${job.minExpYears}${job.maxExpYears ? `–${job.maxExpYears}` : "+"} yrs` : null].filter(Boolean);
    return (
        <article className="panel flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold"><Link to={`/jobs/${job.id}`} className="hover:text-brand-600">{job.title}</Link></h3>
                    <p className="mt-1 text-sm text-ink-500">
                        {job.organization?.slug ? <Link to={`/companies/${job.organization.slug}`} className="font-medium text-ink-700 hover:text-brand-600">{company}</Link> : company}
                        {" · "}{job.location}
                    </p>
                </div>
                {salary && <span className="shrink-0 text-sm font-bold text-ink-900">{salary}<span className="block text-right text-[10px] font-medium text-ink-400">per year</span></span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((chip) => <Chip key={chip}>{chip}</Chip>)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">{(job.requiredSkills || []).slice(0, 4).map((skill) => <span key={skill} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{skill}</span>)}</div>
            <div className="mt-4 flex items-center gap-2 pt-1">
                <Button as={Link} to={`/jobs/${job.id}`} size="sm" variant="secondary">View job <ArrowRight className="h-3.5 w-3.5" /></Button>
                <span className="ml-auto flex items-center gap-1 text-xs text-ink-400"><Clock className="h-3.5 w-3.5" />{job.createdAt ? formatRelativeTime(job.createdAt) : "New"}</span>
            </div>
        </article>
    );
};

/* ------------------------------- landing ------------------------------- */

const TRENDING = [
    { label: "React", to: "/jobs?query=react" },
    { label: "DevOps", to: "/jobs?query=devops" },
    { label: "Data Scientist", to: "/jobs?query=data%20scientist" },
    { label: "Pune", to: "/jobs?location=Pune" },
    { label: "Mumbai", to: "/jobs?location=Mumbai" },
    { label: "Remote", to: "/jobs?workplaceMode=remote" },
];

export const LandingPage = () => {
    const [what, setWhat] = useState("");
    const [where, setWhere] = useState("");
    const [mode, setMode] = useState("");
    const navigate = useNavigate();
    const topCompanies = useQuery({ queryKey: ["companies-top"], queryFn: () => companiesApi.list() });
    const search = (event) => { event.preventDefault(); const p = new URLSearchParams(); if (what.trim()) p.set("query", what.trim()); if (where.trim()) p.set("location", where.trim()); if (mode) p.set("workplaceMode", mode); navigate(`/jobs${p.toString() ? `?${p.toString()}` : ""}`); };
    usePageMeta({ title: "HireSmart AI — Find jobs in India with evidence-backed matching", description: "Search jobs by role, location, salary and skills. Evidence-backed AI match scores, explainable results, and human-in-the-loop hiring." });
    return (
        <>
            <Navbar />
            <main>
                <section className="relative overflow-hidden bg-white">
                    <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,#e0e7ff,transparent_65%)]" />
                    <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
                        <p className="eyebrow">India's evidence-backed job marketplace</p>
                        <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold tracking-[-.04em] text-ink-950 sm:text-6xl">Find work that fits <span className="text-brand-600">your evidence.</span></h1>
                        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink-600">Search jobs by role, location and salary — then see exactly how you match, with explainable AI and human decisions.</p>
                        <form onSubmit={search} className="mx-auto mt-9 grid max-w-4xl gap-3 rounded-2xl border border-ink-200 bg-white p-3 shadow-lg shadow-ink-900/5 sm:grid-cols-[1fr_.7fr_.5fr_auto]">
                            <Input aria-label="What do you want to do" placeholder="Job title, skill or keyword" icon={<Search className="h-4 w-4" />} value={what} onChange={(e) => setWhat(e.target.value)} />
                            <Input aria-label="Where do you want to work" placeholder="City or location" icon={<MapPin className="h-4 w-4" />} value={where} onChange={(e) => setWhere(e.target.value)} />
                            <Select aria-label="Work mode" value={mode} onChange={(e) => setMode(e.target.value)} options={[{ value: "", label: "Any mode" }, { value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" }]} />
                            <Button type="submit" size="lg">Search</Button>
                        </form>
                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
                            <span className="text-ink-400">Trending:</span>
                            {TRENDING.map((item) => <Link key={item.label} to={item.to} className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600 transition hover:border-brand-300 hover:text-brand-700">{item.label}</Link>)}
                        </div>
                    </div>
                </section>
                {topCompanies.data?.data?.length > 0 && (
                    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="eyebrow">Hiring now</p>
                                <h2 className="mt-1 text-2xl font-bold">Top companies on HireSmart</h2>
                            </div>
                            <Link to="/companies" className="text-sm font-semibold text-brand-600 hover:text-brand-700">All companies →</Link>
                        </div>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {topCompanies.data.data.slice(0, 8).map((c) => (
                                <Link key={c.id} to={`/companies/${c.slug}`} className="panel flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-950 text-sm font-bold text-white">{(c.name || "?").slice(0, 2).toUpperCase()}</span>
                                    <span>
                                        <span className="block font-bold">{c.name}</span>
                                        <span className="block text-xs text-ink-500">{c.openRoles} open {c.openRoles === 1 ? "role" : "roles"}{c.industry ? ` · ${c.industry}` : ""}</span>
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
                <section className="bg-ink-950 py-20 text-white">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
                            <div>
                                <p className="eyebrow !text-cyan-300">Intelligence you can inspect</p>
                                <h2 className="mt-3 text-3xl font-bold">No opaque score. No autonomous rejection.</h2>
                                <p className="mt-4 leading-7 text-ink-300">Every match separates required skills, preferred skills, experience, education and confidence — so candidates learn what to fix and hiring stays human.</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {[[Target, "Explainable fit", "See matched evidence and missing requirements for every job."], [Bot, "Real AI, validated", "Structured outputs, provenance and a deterministic fallback — never a guess."], [UsersRound, "Team workflows", "Recruiters, hiring managers and interviewers stay aligned."], [ShieldCheck, "Private by design", "Versioned resumes, tenant isolation and revocable sessions."]].map(([Icon, t, c]) => (
                                    <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                        <Icon className="h-5 w-5 text-cyan-300" />
                                        <h3 className="mt-3 font-semibold">{t}</h3>
                                        <p className="mt-2 text-sm leading-6 text-ink-400">{c}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
                <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                        <Button as={Link} to="/auth/register/candidate" size="lg">I'm looking for work <ArrowRight className="h-4 w-4" /></Button>
                        <Button as={Link} to="/auth/register/recruiter" size="lg" variant="secondary">I'm building a team</Button>
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
};

/* --------------------------- resume check --------------------------- */

export const ResumeCheckPage = () => (
    <>
        <Navbar />
        <main className="page-wrap max-w-5xl">
            <div className="grid gap-8 rounded-3xl bg-ink-950 p-8 text-white lg:grid-cols-[1fr_.8fr] lg:p-12">
                <div>
                    <p className="eyebrow !text-cyan-300">Private resume intelligence</p>
                    <h1 className="mt-3 text-4xl font-bold">Analyze a real resume version—not pasted demo text.</h1>
                    <p className="mt-4 leading-7 text-ink-300">Create a candidate account to upload a PDF or DOCX. HireSmart verifies content, preserves versions, extracts structured evidence and returns validated AI or deterministic analysis.</p>
                    <Button as={Link} to="/auth/register/candidate" className="mt-7" variant="secondary">Start a secure analysis <ArrowRight className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-3">
                    {["Private, non-public storage", "Processing and failure status you can inspect", "Prioritized recommendations with confidence", "No automatic overwrite of your resume"].map((x) => (
                        <div key={x} className="flex gap-3 rounded-xl bg-white/6 p-4 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />{x}</div>
                    ))}
                </div>
            </div>
        </main>
        <Footer />
    </>
);

/* ----------------------------- job search ----------------------------- */

const FILTER_KEYS = ["query", "location", "workplaceMode", "jobType", "minSalary", "maxSalary", "maxExp", "minExp", "skills", "industry", "postedWithin", "sort"];

export const PublicJobsPage = () => {
    const [params, setParams] = useSearchParams();
    const paramsKey = params.toString();
    const get = (key) => params.get(key) || "";
    const setParam = (key, value) => setParams((prev) => { const next = new URLSearchParams(prev); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true });
    const [keyword, setKeyword] = useState(get("query"));
    const [location, setLocation] = useState(get("location"));
    const clearAll = () => { setKeyword(""); setLocation(""); setParams(new URLSearchParams(), { replace: true }); };
    const debouncedKeyword = useDebouncedValue(keyword, 350);
    useEffect(() => {
        const currentQuery = params.get("query") || "";
        const timer = setTimeout(() => { if (debouncedKeyword.trim() !== currentQuery) setParam("query", debouncedKeyword.trim()); }, 60);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedKeyword]);
    const requestParams = Object.fromEntries(FILTER_KEYS.filter((k) => get(k)).map((k) => [k, get(k)]));
    const q = useInfiniteQuery({
        queryKey: ["jobs-public", paramsKey],
        queryFn: ({ pageParam, signal }) => jobsApi.list({ limit: 12, ...requestParams, ...(pageParam ? { after: pageParam } : {}) }, { signal }),
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.meta?.hasMore ? lastPage.meta.nextCursor : undefined,
    });
    const items = (q.data?.pages || []).flatMap((page) => page.data);
    usePageMeta({ title: "Browse jobs — HireSmart AI", description: "Search Indian jobs by keyword, location, salary, experience, work mode and skills. Shareable, filterable job search." });
    const activeCount = FILTER_KEYS.filter((k) => get(k) && k !== "sort").length;
    return (
        <>
            <Navbar />
            <main className="page-wrap">
                <div className="rounded-3xl bg-ink-950 px-5 py-8 text-white sm:px-10">
                    <p className="eyebrow !text-cyan-300">Open opportunities</p>
                    <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Find work that fits your evidence.</h1>
                    <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_.6fr_auto]" onSubmit={(e) => { e.preventDefault(); if (keyword.trim() !== get("query")) setParam("query", keyword.trim()); if (location.trim() !== get("location")) setParam("location", location.trim()); }}>
                        <Input aria-label="Search jobs" placeholder="Role, skill or keyword" icon={<Search className="h-4 w-4" />} value={keyword} onChange={(e) => setKeyword(e.target.value)} className="!border-white/10 !bg-white/6 !text-white" />
                        <Input aria-label="Location" placeholder="City or location" icon={<MapPin className="h-4 w-4" />} value={location} onChange={(e) => setLocation(e.target.value)} className="!border-white/10 !bg-white/6 !text-white" />
                        <Button type="submit">Search</Button>
                    </form>
                </div>
                <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr]">
                    <aside className="h-fit rounded-2xl border border-ink-100 bg-white p-5 lg:sticky lg:top-24">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Filters</h2>
                            {activeCount > 0 && <button type="button" onClick={clearAll} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Clear all ({activeCount})</button>}
                        </div>
                        <div className="mt-4 space-y-5 text-sm">
                            <div>
                                <p className="mb-2 font-semibold text-ink-700">Work mode</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {[["", "All"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]].map(([value, label]) => (
                                        <button key={label} type="button" onClick={() => setParam("workplaceMode", value)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${get("workplaceMode") === value ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}>{label}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="mb-2 font-semibold text-ink-700">Job type</p>
                                <Select aria-label="Job type" value={get("jobType")} onChange={(e) => setParam("jobType", e.target.value)} options={[{ value: "", label: "Any type" }, { value: "Full-Time", label: "Full-time" }, { value: "Part-Time", label: "Part-time" }, { value: "Internship", label: "Internship" }, { value: "Contract", label: "Contract" }, { value: "Remote", label: "Remote" }]} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="mb-2 font-semibold text-ink-700">Min salary/yr (₹)</p>
                                    <Input aria-label="Minimum salary per year" type="number" min="0" step="100000" placeholder="e.g. 800000" value={get("minSalary")} onChange={(e) => setParam("minSalary", e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-2 font-semibold text-ink-700">Max salary/yr (₹)</p>
                                    <Input aria-label="Maximum salary per year" type="number" min="0" step="100000" placeholder="e.g. 2000000" value={get("maxSalary")} onChange={(e) => setParam("maxSalary", e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="mb-2 font-semibold text-ink-700">My max exp (yrs)</p>
                                    <Input aria-label="Maximum experience in years" type="number" min="0" max="40" placeholder="e.g. 3" value={get("maxExp")} onChange={(e) => setParam("maxExp", e.target.value)} />
                                </div>
                                <div>
                                    <p className="mb-2 font-semibold text-ink-700">Min exp wanted</p>
                                    <Input aria-label="Minimum experience in years" type="number" min="0" max="40" placeholder="e.g. 4" value={get("minExp")} onChange={(e) => setParam("minExp", e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <p className="mb-2 font-semibold text-ink-700">Skills</p>
                                <Input aria-label="Skills, comma separated" placeholder="React, Node.js" value={get("skills")} onChange={(e) => setParam("skills", e.target.value)} />
                            </div>
                            <div>
                                <p className="mb-2 font-semibold text-ink-700">Industry</p>
                                <Input aria-label="Industry" placeholder="e.g. Software" value={get("industry")} onChange={(e) => setParam("industry", e.target.value)} />
                            </div>
                            <div>
                                <p className="mb-2 font-semibold text-ink-700">Date posted</p>
                                <Select aria-label="Date posted" value={get("postedWithin")} onChange={(e) => setParam("postedWithin", e.target.value)} options={[{ value: "", label: "Any time" }, { value: "d", label: "Past 24 hours" }, { value: "w", label: "Past week" }, { value: "m", label: "Past month" }]} />
                            </div>
                        </div>
                    </aside>
                    <section>
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="eyebrow">Results</p>
                                <h2 className="mt-1 text-xl font-bold">{items.length || "…"} opportunity{items.length === 1 ? "" : "ies"}</h2>
                            </div>
                            <Select aria-label="Sort by" value={get("sort") || "date"} onChange={(e) => setParam("sort", e.target.value === "date" ? "" : e.target.value)} options={[{ value: "date", label: "Newest first" }, { value: "salary", label: "Salary: high to low" }, { value: "relevance", label: "Relevance" }]} className="w-44" />
                        </div>
                        <div className="mt-4 grid gap-4">
                            {q.isLoading && items.length === 0 ? <div className="grid gap-4 sm:grid-cols-2"><SkeletonList count={6} /></div> : q.error ? <ErrorState error={q.error} /> : items.length ? items.map((job) => <PublicJobCard key={job.id} job={job} />) : !q.isLoading ? <EmptyState title="No matching jobs" description="Try removing a filter or broadening your location." /> : null}
                        </div>
                        {q.hasNextPage && (
                            <div className="mt-6 text-center">
                                <Button variant="secondary" onClick={() => q.fetchNextPage()} isLoading={q.isFetchingNextPage}>Load more jobs</Button>
                            </div>
                        )}
                    </section>
                </div>
            </main>
            <Footer />
        </>
    );
};

/* ----------------------------- job detail ----------------------------- */

export const PublicJobDetailPage = () => {
    const { jobId } = useParams();
    const auth = useAuth();
    const q = useQuery({ queryKey: ["job", "public", jobId], queryFn: () => jobsApi.get(jobId) });
    const related = useQuery({ queryKey: ["job-related", jobId], queryFn: () => jobsApi.related(jobId) });
    const job = q.data?.data;
    const isCandidate = auth?.role === "candidate";
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const toggleSave = async () => {
        setSaving(true);
        try {
            if (saved) { await jobsApi.unsave(jobId); setSaved(false); } else { await jobsApi.save(jobId); setSaved(true); }
        } finally { setSaving(false); }
    };
    const jsonLd = job ? {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: job.title,
        description: job.description?.slice(0, 3000),
        datePosted: job.publishedAt || job.createdAt,
        validThrough: job.closesAt || new Date(new Date(job.createdAt).getTime() + 60 * 24 * 3600 * 1000).toISOString(),
        employmentType: job.jobType,
        hiringOrganization: { "@type": "Organization", name: job.company },
        jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" } },
        baseSalary: job.compensation && (job.compensation.min || job.compensation.max) ? { "@type": "MonetaryAmount", currency: job.compensation.currency || "INR", value: { min: job.compensation.min || 0, max: job.compensation.max || job.compensation.min || 0, unitText: job.compensation.period === "month" ? "MONTH" : job.compensation.period === "hour" ? "HOUR" : "YEAR" } } : undefined,
    } : null;
    usePageMeta({ title: job ? `${job.title} at ${job.company} — HireSmart AI` : "Job — HireSmart AI", description: job ? `${job.title} in ${job.location}. ${job.description?.slice(0, 150)}…` : undefined, jsonLd });
    const company = job ? (job.organization?.name || job.company) : "";
    const salary = job ? salaryText(job) : null;
    return (
        <>
            <Navbar />
            <main className="page-wrap max-w-5xl">
                {q.isLoading ? <LoadingState /> : q.error ? <ErrorState error={q.error} /> : (
                    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                        <article className="panel p-7">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="eyebrow">Open role</p>
                                    <h1 className="mt-2 text-3xl font-bold">{job.title}</h1>
                                    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-ink-500">
                                        {job.organization?.slug ? <Link to={`/companies/${job.organization.slug}`} className="font-medium text-ink-800 hover:text-brand-600">{company}</Link> : <span className="font-medium text-ink-800">{company}</span>}
                                        <span>·</span><span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>
                                        {job.createdAt && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{formatRelativeTime(job.createdAt)}</span>}
                                    </p>
                                </div>
                                {isCandidate && (
                                    <button type="button" onClick={toggleSave} disabled={saving} className="rounded-xl border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-600 transition hover:border-brand-300 hover:text-brand-700">
                                        {saved ? "Saved ✓" : "Save job"}
                                    </button>
                                )}
                            </div>
                            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                {salary && <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs font-semibold uppercase text-ink-400">Salary / year</p><p className="mt-1 font-bold">{salary}</p></div>}
                                <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs font-semibold uppercase text-ink-400">Experience</p><p className="mt-1 font-bold">{job.minExpYears ? `${job.minExpYears}${job.maxExpYears ? `–${job.maxExpYears}` : "+"} years` : job.experience || "Any"}</p></div>
                                <div className="rounded-xl bg-ink-50 p-4"><p className="text-xs font-semibold uppercase text-ink-400">Type</p><p className="mt-1 font-bold">{job.jobType}{job.workplaceMode && job.workplaceMode !== "unspecified" ? ` · ${job.workplaceMode}` : ""}</p></div>
                            </div>
                            {job.educationRequired && <p className="mt-4 flex items-center gap-2 text-sm text-ink-600"><GraduationCap className="h-4 w-4 text-ink-400" />Education: {job.educationRequired}</p>}
                            <h2 className="mt-7 text-lg font-bold">About the role</h2>
                            <div className="mt-3 whitespace-pre-wrap leading-7 text-ink-700">{job.description}</div>
                            {(job.requiredSkills?.length || job.preferredSkills?.length) > 0 && (
                                <>
                                    <h2 className="mt-7 text-lg font-bold">Skills</h2>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {(job.requiredSkills || []).map((skill) => <span key={skill} className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{skill}</span>)}
                                        {(job.preferredSkills || []).map((skill) => <span key={skill} className="rounded-md bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500">{skill} (nice to have)</span>)}
                                    </div>
                                </>
                            )}
                            {job.benefits?.length > 0 && (
                                <>
                                    <h2 className="mt-7 text-lg font-bold">Benefits</h2>
                                    <ul className="mt-3 space-y-2">
                                        {job.benefits.map((benefit) => <li key={benefit} className="flex items-center gap-2 text-sm text-ink-600"><CheckCircle2 className="h-4 w-4 text-success-500" />{benefit}</li>)}
                                    </ul>
                                </>
                            )}
                        </article>
                        <aside className="space-y-4">
                            <div className="panel p-5">
                                {isCandidate ? (
                                    <>
                                        <h2 className="font-bold">See your evidence-backed fit</h2>
                                        <p className="mt-2 text-sm text-ink-500">Sign in to choose a processed resume version, inspect skill gaps and apply.</p>
                                        <Button as={Link} to={`/app/candidate/jobs/${job.id}`} fullWidth className="mt-4">Check fit &amp; apply</Button>
                                    </>
                                ) : auth?.isAuthenticated ? (
                                    <>
                                        <h2 className="font-bold">For candidates</h2>
                                        <p className="mt-2 text-sm text-ink-500">You're signed in as {auth.role}. Applying needs a candidate account.</p>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="font-bold">See your evidence-backed fit</h2>
                                        <p className="mt-2 text-sm text-ink-500">Sign in to choose a processed resume version, inspect skill gaps and apply.</p>
                                        <Button as={Link} to={`/auth/login?next=/jobs/${job.id}`} fullWidth className="mt-4">Sign in to apply</Button>
                                    </>
                                )}
                            </div>
                            <div className="panel p-5 text-sm">
                                <h2 className="font-bold">Details</h2>
                                <dl className="mt-3 space-y-2 text-ink-600">
                                    <div className="flex justify-between"><dt className="text-ink-400">Location</dt><dd className="font-medium">{job.location}</dd></div>
                                    <div className="flex justify-between"><dt className="text-ink-400">Work mode</dt><dd className="font-medium capitalize">{job.workplaceMode || "Not specified"}</dd></div>
                                    <div className="flex justify-between"><dt className="text-ink-400">Type</dt><dd className="font-medium">{job.jobType}</dd></div>
                                    {job.industry && <div className="flex justify-between"><dt className="text-ink-400">Industry</dt><dd className="font-medium">{job.industry}</dd></div>}
                                    <div className="flex justify-between"><dt className="text-ink-400">Closes</dt><dd className="font-medium">{job.closesAt ? formatRelativeTime(job.closesAt) : "Rolling"}</dd></div>
                                </dl>
                            </div>
                        </aside>
                    </div>
                )}
                {related.data?.data?.length > 0 && (
                    <section className="mt-10">
                        <h2 className="text-xl font-bold">Related roles</h2>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            {related.data.data.map((job) => <PublicJobCard key={job.id} job={job} />)}
                        </div>
                    </section>
                )}
            </main>
            <Footer />
        </>
    );
};

/* ----------------------------- companies ----------------------------- */

export const CompaniesPage = () => {
    const q = useQuery({ queryKey: ["companies-all"], queryFn: () => companiesApi.list() });
    usePageMeta({ title: "Companies hiring — HireSmart AI", description: "Browse companies hiring on HireSmart and see their open roles." });
    return (
        <>
            <Navbar />
            <main className="page-wrap">
                <p className="eyebrow">Companies</p>
                <h1 className="mt-1 text-3xl font-bold">Who's hiring</h1>
                {q.isLoading ? <div className="mt-8"><SkeletonList count={6} /></div> : q.error ? <div className="mt-8"><ErrorState error={q.error} /></div> : (
                    <>
                        <p className="mt-2 text-sm text-ink-500">Companies with the most open roles, updated live.</p>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {q.data.data.map((c) => (
                                <Link key={c.id} to={`/companies/${c.slug}`} className="panel p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                                    <div className="flex items-center gap-4">
                                        {c.logo ? <img src={c.logo} alt="" className="h-12 w-12 rounded-xl object-contain" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-950 text-base font-bold text-white">{(c.name || "?").slice(0, 2).toUpperCase()}</span>}
                                        <div>
                                            <h2 className="font-bold">{c.name}</h2>
                                            <p className="text-xs text-ink-500">{[c.industry, c.size && `${c.size} people`].filter(Boolean).join(" · ") || "Company"}</p>
                                        </div>
                                    </div>
                                    <p className="mt-4 text-sm font-semibold text-brand-600">{c.openRoles} open {c.openRoles === 1 ? "role" : "roles"} →</p>
                                </Link>
                            ))}
                        </div>
                        {!q.data.data.length && <div className="mt-8"><EmptyState title="No companies yet" description="Employers appear here once they publish jobs." /></div>}
                    </>
                )}
            </main>
            <Footer />
        </>
    );
};

export const CompanyPage = () => {
    const { slug } = useParams();
    const company = useQuery({ queryKey: ["company", slug], queryFn: () => companiesApi.get(slug) });
    const jobs = useQuery({ queryKey: ["company-jobs", slug], queryFn: () => companiesApi.jobs(slug, { limit: 12 }) });
    const c = company.data?.data;
    usePageMeta({ title: c ? `${c.name} — open roles on HireSmart AI` : "Company — HireSmart AI", description: c ? `${c.about?.slice(0, 150)} or see ${c.openRoles} open roles.` : undefined });
    return (
        <>
            <Navbar />
            <main className="page-wrap">
                {company.isLoading ? <LoadingState /> : company.error ? <ErrorState error={company.error} /> : (
                    <>
                        <header className="panel flex flex-col gap-5 p-7 sm:flex-row sm:items-center">
                            {c.logo ? <img src={c.logo} alt="" className="h-20 w-20 rounded-2xl object-contain" /> : <span className="grid h-20 w-20 place-items-center rounded-2xl bg-ink-950 text-2xl font-bold text-white">{(c.name || "?").slice(0, 2).toUpperCase()}</span>}
                            <div className="flex-1">
                                <h1 className="text-3xl font-bold">{c.name}</h1>
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
                                    <span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{[c.industry, c.size && `${c.size} people`].filter(Boolean).join(" · ") || "Company"}</span>
                                    {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:text-brand-700">{c.website.replace(/^https?:\/\//, "")}</a>}
                                </p>
                                {c.about && <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">{c.about}</p>}
                            </div>
                            <div className="rounded-2xl bg-ink-50 px-6 py-4 text-center">
                                <p className="text-3xl font-bold">{c.openRoles}</p>
                                <p className="text-xs font-semibold uppercase text-ink-400">open {c.openRoles === 1 ? "role" : "roles"}</p>
                            </div>
                        </header>
                        <section className="mt-8">
                            <h2 className="text-xl font-bold">Open roles</h2>
                            <div className="mt-4 grid gap-4">
                                {jobs.isLoading ? <div className="grid gap-4 sm:grid-cols-2"><SkeletonList count={4} /></div> : jobs.data?.data?.length ? jobs.data.data.map((job) => <PublicJobCard key={job.id} job={job} />) : <EmptyState title="No open roles right now" description="Check back soon — or set an alert from the jobs page." />}
                            </div>
                        </section>
                    </>
                )}
            </main>
            <Footer />
        </>
    );
};
