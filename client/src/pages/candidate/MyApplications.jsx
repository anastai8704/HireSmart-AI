/**
 * candidate/MyApplications.jsx
 * -----------------------------------------------------------------------------
 * Tracks every application and saved job in one place.
 *
 * Two tabs rather than two pages: they are the same mental task ("what am I
 * doing about jobs right now"), so splitting them across routes would just add
 * navigation for no benefit.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Building2, Calendar, Search, Send } from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import JobCard from "../../components/jobs/JobCard";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { jobApi } from "../../lib/api";
import { cn, formatDate, formatRelativeTime, statusClasses } from "../../lib/utils";
import { useFetch, useMutation } from "../../hooks/useApi";
import { useToast } from "../../components/ui/useToast";

const TABS = [
    { id: "applied", label: "Applications", icon: Send },
    { id: "saved", label: "Saved jobs", icon: Bookmark },
];

/** One row in the applications list. */
const ApplicationRow = ({ application }) => {
    const job = application.job || {};

    return (
        <Card hoverable className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <Link
                        to={`/jobs/${job._id}`}
                        className="text-base font-semibold text-ink-900 transition-colors hover:text-brand-600"
                    >
                        {job.title || "Job no longer available"}
                    </Link>

                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-600">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {job.company}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
                        <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                            Applied {formatDate(application.appliedAt)}
                        </span>

                        <span>{formatRelativeTime(application.appliedAt)}</span>
                    </div>
                </div>

                <span
                    className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium",
                        statusClasses(application.status)
                    )}
                >
                    {application.status}
                </span>
            </div>

            {/* The most recent recruiter note, when one exists. */}
            {application.statusHistory?.length > 0 &&
                application.statusHistory.at(-1)?.note && (
                    <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                        <span className="font-medium">Recruiter update: </span>
                        {application.statusHistory.at(-1).note}
                    </p>
                )}
        </Card>
    );
};

const MyApplications = () => {
    const [activeTab, setActiveTab] = useState("applied");
    const [page, setPage] = useState(1);
    const toast = useToast();

    const {
        data: appliedData,
        isLoading: isLoadingApplied,
        error: appliedError,
        refetch: refetchApplied,
    } = useFetch(() => jobApi.appliedJobs({ page, limit: 10 }), [page]);

    const {
        data: savedData,
        isLoading: isLoadingSaved,
        error: savedError,
        refetch: refetchSaved,
    } = useFetch(() => jobApi.savedJobs(), [activeTab], {
        enabled: activeTab === "saved",
    });

    const { mutate: unsave, isLoading: isUnsaving } = useMutation(jobApi.unsave);

    const handleUnsave = async (jobId) => {
        try {
            await unsave(jobId);
            toast.success("Removed from saved jobs");
            refetchSaved();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const applications = appliedData?.applications || appliedData?.jobs || [];
    const pagination = appliedData?.pagination;
    const savedJobs = savedData?.jobs || savedData?.savedJobs || [];

    return (
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                    My applications
                </h1>
                <p className="mt-1.5 text-ink-500">
                    Track where every application stands and revisit the jobs you saved.
                </p>
            </header>

            {/* ---------- Tabs ---------- */}
            <div
                className="mb-6 flex gap-1 border-b border-ink-200"
                role="tablist"
                aria-label="Application views"
            >
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "border-brand-600 text-brand-700"
                                    : "border-transparent text-ink-500 hover:text-ink-800"
                            )}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {tab.label}

                            {tab.id === "applied" && pagination && (
                                <Badge size="sm" variant="default">
                                    {pagination.total}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ---------- Applications ---------- */}
            {activeTab === "applied" && (
                <section role="tabpanel">
                    {isLoadingApplied ? (
                        <SkeletonList count={3} />
                    ) : appliedError ? (
                        <ErrorState error={appliedError} onRetry={refetchApplied} />
                    ) : applications.length === 0 ? (
                        <EmptyState
                            icon={Send}
                            title="No applications yet"
                            description="When you apply to a job it will appear here so you can track its progress."
                            action={
                                <Button
                                    as={Link}
                                    to="/jobs"
                                    leftIcon={<Search className="h-4 w-4" />}
                                >
                                    Find jobs to apply to
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className="grid gap-4">
                                {applications.map((application) => (
                                    <ApplicationRow
                                        key={application._id}
                                        application={application}
                                    />
                                ))}
                            </div>

                            {pagination && pagination.totalPages > 1 && (
                                <nav
                                    className="mt-6 flex items-center justify-center gap-2"
                                    aria-label="Pagination"
                                >
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage((current) => current - 1)}
                                    >
                                        Previous
                                    </Button>

                                    <span className="px-3 text-sm text-ink-600">
                                        Page {pagination.page} of {pagination.totalPages}
                                    </span>

                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page >= pagination.totalPages}
                                        onClick={() => setPage((current) => current + 1)}
                                    >
                                        Next
                                    </Button>
                                </nav>
                            )}
                        </>
                    )}
                </section>
            )}

            {/* ---------- Saved jobs ---------- */}
            {activeTab === "saved" && (
                <section role="tabpanel">
                    {isLoadingSaved ? (
                        <SkeletonList count={2} />
                    ) : savedError ? (
                        <ErrorState error={savedError} onRetry={refetchSaved} />
                    ) : savedJobs.length === 0 ? (
                        <EmptyState
                            icon={Bookmark}
                            title="No saved jobs"
                            description="Save interesting roles while you browse and come back to them here."
                            action={
                                <Button as={Link} to="/jobs" variant="secondary">
                                    Browse jobs
                                </Button>
                            }
                        />
                    ) : (
                        <div className="grid gap-4">
                            {savedJobs.map((job) => (
                                <JobCard
                                    key={job._id}
                                    job={job}
                                    showSaveButton
                                    isSaved
                                    isSaving={isUnsaving}
                                    onToggleSave={handleUnsave}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default MyApplications;
