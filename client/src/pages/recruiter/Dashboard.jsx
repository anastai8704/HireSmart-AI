/**
 * recruiter/Dashboard.jsx
 * -----------------------------------------------------------------------------
 * The recruiter's overview: pipeline health and what needs attention today.
 */

import { Link } from "react-router-dom";
import {
    ArrowRight,
    Briefcase,
    CheckCircle2,
    Plus,
    TrendingUp,
    Users,
} from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList, SkeletonStats } from "../../components/ui/States";
import { jobApi } from "../../lib/api";
import { formatRelativeTime, statusClasses } from "../../lib/utils";
import { useAuth } from "../../context/useAuth";
import { useFetch } from "../../hooks/useApi";

const StatCard = ({ icon: Icon, label, value, tone = "brand" }) => {
    const tones = {
        brand: "bg-brand-100 text-brand-700",
        success: "bg-success-50 text-success-700",
        warning: "bg-warning-50 text-warning-700",
        ink: "bg-ink-100 text-ink-700",
    };

    return (
        <Card className="p-5">
            <div className="flex items-center gap-3">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
                >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>

                <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                        {label}
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-ink-900">{value}</p>
                </div>
            </div>
        </Card>
    );
};

const RecruiterDashboard = () => {
    const { user } = useAuth();

    const { data, isLoading, error, refetch } = useFetch(() => jobApi.recruiterDashboard(), []);
    const { data: jobsData, isLoading: isLoadingJobs } = useFetch(
        () => jobApi.myJobs({ page: 1, limit: 5 }),
        []
    );

    const dashboard = data?.dashboard || data?.data || {};
    const jobs = jobsData?.jobs || [];
    const statusCounts = dashboard.statusCounts || {};

    const firstName = user?.name?.split(" ")[0] || "there";

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                        Welcome back, {firstName}
                    </h1>
                    <p className="mt-1.5 text-ink-500">
                        {user?.companyName
                            ? `Hiring for ${user.companyName}`
                            : "Here is your hiring pipeline."}
                    </p>
                </div>

                <Button
                    as={Link}
                    to="/recruiter/jobs"
                    leftIcon={<Plus className="h-4 w-4" />}
                >
                    Post a job
                </Button>
            </header>

            {isLoading ? (
                <SkeletonStats />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={Briefcase}
                        label="Active jobs"
                        value={dashboard.activeJobs ?? dashboard.totalJobs ?? 0}
                    />

                    <StatCard
                        icon={Users}
                        label="Total applicants"
                        value={dashboard.totalApplications ?? dashboard.totalApplicants ?? 0}
                        tone="ink"
                    />

                    <StatCard
                        icon={TrendingUp}
                        label="Shortlisted"
                        value={statusCounts.Shortlisted ?? 0}
                        tone="warning"
                    />

                    <StatCard
                        icon={CheckCircle2}
                        label="Selected"
                        value={statusCounts.Selected ?? 0}
                        tone="success"
                    />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
                {/* ---------- Recent jobs ---------- */}
                <section className="lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-ink-900">Your recent jobs</h2>

                        <Button
                            as={Link}
                            to="/recruiter/jobs"
                            variant="ghost"
                            size="sm"
                            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                        >
                            Manage all
                        </Button>
                    </div>

                    {isLoadingJobs ? (
                        <SkeletonList count={3} />
                    ) : jobs.length === 0 ? (
                        <EmptyState
                            icon={Briefcase}
                            title="No jobs posted yet"
                            description="Post your first role and applicants will be scored and ranked automatically."
                            action={
                                <Button as={Link} to="/recruiter/jobs" size="sm">
                                    Post a job
                                </Button>
                            }
                        />
                    ) : (
                        <div className="grid gap-3">
                            {jobs.map((job) => (
                                <Card key={job._id} hoverable className="p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-ink-900">
                                                    {job.title}
                                                </p>

                                                <Badge
                                                    size="sm"
                                                    variant={
                                                        job.status === "published"
                                                            ? "success"
                                                            : job.status === "draft"
                                                            ? "warning"
                                                            : "default"
                                                    }
                                                >
                                                    {job.status}
                                                </Badge>
                                            </div>

                                            <p className="mt-0.5 text-xs text-ink-400">
                                                {job.location} - posted{" "}
                                                {formatRelativeTime(job.createdAt)}
                                            </p>
                                        </div>

                                        <Button
                                            as={Link}
                                            to={`/recruiter/jobs/${job._id}/applicants`}
                                            size="sm"
                                            variant="secondary"
                                            leftIcon={<Users className="h-3.5 w-3.5" />}
                                        >
                                            {job.applicationCount ?? job.applicantCount ?? 0}
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>

                {/* ---------- Pipeline ---------- */}
                <aside>
                    <Card>
                        <CardHeader>
                            <CardTitle>Candidate pipeline</CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-2">
                            {Object.keys(statusCounts).length === 0 ? (
                                <p className="text-sm text-ink-400">
                                    No applications yet.
                                </p>
                            ) : (
                                Object.entries(statusCounts).map(([status, count]) => (
                                    <div
                                        key={status}
                                        className="flex items-center justify-between"
                                    >
                                        <span
                                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                                                status
                                            )}`}
                                        >
                                            {status}
                                        </span>

                                        <span className="text-sm font-semibold tabular-nums text-ink-900">
                                            {count}
                                        </span>
                                    </div>
                                ))
                            )}

                            <Button
                                as={Link}
                                to="/recruiter/analytics"
                                variant="secondary"
                                fullWidth
                                className="mt-3"
                            >
                                View full analytics
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
};

export default RecruiterDashboard;
