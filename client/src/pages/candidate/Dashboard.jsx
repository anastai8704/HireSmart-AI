/**
 * candidate/Dashboard.jsx
 * -----------------------------------------------------------------------------
 * The candidate's home screen: where they stand, and what to do next.
 *
 * DESIGN INTENT
 * A dashboard that only shows numbers is a report, not a tool. This one leads
 * with the single most valuable action for the person looking at it - upload a
 * resume if there is none, otherwise view the roles that match it.
 */

import { Link } from "react-router-dom";
import {
    ArrowRight,
    Bookmark,
    FileText,
    Send,
    Sparkles,
    TrendingUp,
    Upload,
} from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import JobCard from "../../components/jobs/JobCard";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList, SkeletonStats } from "../../components/ui/States";
import { aiApi, jobApi } from "../../lib/api";
import { formatRelativeTime, statusClasses } from "../../lib/utils";
import { useAuth } from "../../context/useAuth";
import { useFetch } from "../../hooks/useApi";

/** One headline metric. */
const StatCard = ({ icon: Icon, label, value, tone = "brand", to }) => {
    const tones = {
        brand: "bg-brand-100 text-brand-700",
        success: "bg-success-50 text-success-700",
        warning: "bg-warning-50 text-warning-700",
        ink: "bg-ink-100 text-ink-700",
    };

    const content = (
        <Card hoverable={Boolean(to)} className="p-5">
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

    return to ? <Link to={to}>{content}</Link> : content;
};

const CandidateDashboard = () => {
    const { user } = useAuth();

    const { data, isLoading, error, refetch } = useFetch(() => jobApi.candidateDashboard(), []);

    const hasResume = Boolean(user?.resume);

    // Recommendations need a resume, so we only request them when one exists.
    const { data: recommendationData, isLoading: isLoadingRecommendations } = useFetch(
        () => aiApi.recommendations(3),
        [hasResume],
        { enabled: hasResume }
    );

    const dashboard = data?.dashboard || data?.data;
    const statusCounts = dashboard?.statusCounts || {};
    const recommendations = recommendationData?.data?.recommendations || [];

    const firstName = user?.name?.split(" ")[0] || "there";

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                    Welcome back, {firstName}
                </h1>
                <p className="mt-1.5 text-ink-500">
                    Here is where your job search stands today.
                </p>
            </header>

            {/* ---------- No resume: this is the one thing that matters ---------- */}
            {!hasResume && (
                <Card className="mb-6 border-brand-200 bg-brand-50">
                    <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                            <Upload className="h-6 w-6" aria-hidden="true" />
                        </span>

                        <div className="flex-1">
                            <h2 className="text-base font-semibold text-ink-900">
                                Upload your resume to unlock the AI
                            </h2>

                            <p className="mt-1 text-sm text-ink-600">
                                Once we can read your resume you will get an ATS score, personalised
                                job matches, and one-click applications.
                            </p>
                        </div>

                        <Button as={Link} to="/my-resume" className="shrink-0">
                            Upload resume
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* ---------- Metrics ---------- */}
            {isLoading ? (
                <SkeletonStats />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        icon={Send}
                        label="Applications"
                        value={dashboard?.totalAppliedJobs ?? 0}
                        to="/my-applications"
                    />

                    <StatCard
                        icon={TrendingUp}
                        label="Shortlisted"
                        value={statusCounts.Shortlisted ?? 0}
                        tone="success"
                    />

                    <StatCard
                        icon={Sparkles}
                        label="In interview"
                        value={statusCounts.Interview ?? 0}
                        tone="warning"
                    />

                    <StatCard
                        icon={Bookmark}
                        label="Saved jobs"
                        value={dashboard?.totalSavedJobs ?? 0}
                        tone="ink"
                    />
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
                {/* ---------- Recommendations ---------- */}
                <section className="lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-ink-900">
                            Recommended for you
                        </h2>

                        {hasResume && recommendations.length > 0 && (
                            <Button
                                as={Link}
                                to="/recommendations"
                                variant="ghost"
                                size="sm"
                                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                            >
                                See all
                            </Button>
                        )}
                    </div>

                    {!hasResume ? (
                        <EmptyState
                            icon={Sparkles}
                            title="Recommendations need a resume"
                            description="Upload your resume and we will rank every open job by how well it fits you."
                            action={
                                <Button as={Link} to="/my-resume" size="sm">
                                    Upload resume
                                </Button>
                            }
                        />
                    ) : isLoadingRecommendations ? (
                        <SkeletonList count={2} />
                    ) : recommendations.length === 0 ? (
                        <EmptyState
                            icon={Sparkles}
                            title="No strong matches yet"
                            description="We could not find jobs that closely match your resume right now. Try browsing all open roles."
                            action={
                                <Button as={Link} to="/jobs" size="sm" variant="secondary">
                                    Browse all jobs
                                </Button>
                            }
                        />
                    ) : (
                        <div className="grid gap-4">
                            {recommendations.map((item) => (
                                <JobCard
                                    key={item.job._id}
                                    job={item.job}
                                    match={item.match}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* ---------- Recent activity ---------- */}
                <aside className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Application pipeline</CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-2">
                            {Object.entries(statusCounts).length === 0 ? (
                                <p className="text-sm text-ink-400">No applications yet.</p>
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
                        </CardContent>
                    </Card>

                    {dashboard?.latestApplication && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Latest application</CardTitle>
                            </CardHeader>

                            <CardContent>
                                <Link
                                    to={`/jobs/${dashboard.latestApplication.job?._id}`}
                                    className="text-sm font-semibold text-ink-900 hover:text-brand-600"
                                >
                                    {dashboard.latestApplication.job?.title}
                                </Link>

                                <p className="text-sm text-ink-500">
                                    {dashboard.latestApplication.job?.company}
                                </p>

                                <div className="mt-2 flex items-center gap-2">
                                    <Badge size="sm">{dashboard.latestApplication.status}</Badge>

                                    <span className="text-xs text-ink-400">
                                        {formatRelativeTime(
                                            dashboard.latestApplication.appliedAt
                                        )}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Quick actions</CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-2">
                            <Button
                                as={Link}
                                to="/my-resume"
                                variant="secondary"
                                fullWidth
                                leftIcon={<FileText className="h-4 w-4" />}
                            >
                                {hasResume ? "Review my resume score" : "Upload my resume"}
                            </Button>

                            <Button
                                as={Link}
                                to="/jobs"
                                variant="ghost"
                                fullWidth
                                leftIcon={<Send className="h-4 w-4" />}
                            >
                                Browse all jobs
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
};

export default CandidateDashboard;
