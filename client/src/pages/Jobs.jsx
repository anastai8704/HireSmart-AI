/**
 * Jobs.jsx
 * -----------------------------------------------------------------------------
 * The public job board: search, filter, sort and paginate.
 *
 * FILTER STATE LIVES IN THE URL, NOT IN useState ALONE.
 * Using ?keyword=react&page=2 means the browser back button works, the page can
 * be refreshed without losing filters, and a filtered search can be shared as a
 * link. This is a small change that makes the app feel properly built.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Search, X } from "lucide-react";

import Button from "../components/ui/Button";
import Input, { Select } from "../components/ui/Input";
import JobCard from "../components/jobs/JobCard";
import { Card, CardContent } from "../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList } from "../components/ui/States";
import { jobApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useDebouncedValue, useFetch, useMutation } from "../hooks/useApi";
import { useToast } from "../components/ui/Toast";

const JOB_TYPES = ["Full-Time", "Part-Time", "Internship", "Contract", "Remote"];

const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "salary_high", label: "Highest salary" },
    { value: "salary_low", label: "Lowest salary" },
];

const Jobs = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { isAuthenticated, role } = useAuth();
    const toast = useToast();

    // The URL is the single source of truth for every filter.
    const page = Number(searchParams.get("page") || 1);
    const keyword = searchParams.get("keyword") || "";
    const location = searchParams.get("location") || "";
    const jobType = searchParams.get("jobType") || "";
    const sort = searchParams.get("sort") || "newest";

    // Text inputs are held locally so typing feels instant, then debounced into
    // the URL so we fire one request instead of one per keystroke.
    const [keywordInput, setKeywordInput] = useState(keyword);
    const [locationInput, setLocationInput] = useState(location);

    const debouncedKeyword = useDebouncedValue(keywordInput, 400);
    const debouncedLocation = useDebouncedValue(locationInput, 400);

    /** Writes a filter change to the URL, resetting to page 1. */
    const updateParams = (updates, { resetPage = true } = {}) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);

            for (const [key, value] of Object.entries(updates)) {
                if (value) {
                    next.set(key, value);
                } else {
                    next.delete(key);
                }
            }

            if (resetPage) next.delete("page");

            return next;
        });
    };

    useEffect(() => {
        if (debouncedKeyword !== keyword) {
            updateParams({ keyword: debouncedKeyword });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedKeyword]);

    useEffect(() => {
        if (debouncedLocation !== location) {
            updateParams({ location: debouncedLocation });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedLocation]);

    const { data, isLoading, error, refetch } = useFetch(
        () => jobApi.list({ page, limit: 12, keyword, location, jobType, sort }),
        [page, keyword, location, jobType, sort]
    );

    // Saved jobs are only relevant for signed-in candidates.
    const isCandidate = isAuthenticated && role === "candidate";

    const { data: savedData, refetch: refetchSaved } = useFetch(
        () => jobApi.savedJobs(),
        [isCandidate],
        { enabled: isCandidate }
    );

    const savedIds = new Set(
        (savedData?.jobs || savedData?.savedJobs || []).map((job) => job._id || job)
    );

    const { mutate: toggleSave, isLoading: isSaving } = useMutation(
        async (jobId, isSaved) => (isSaved ? jobApi.unsave(jobId) : jobApi.save(jobId))
    );

    const handleToggleSave = async (jobId, isSaved) => {
        try {
            await toggleSave(jobId, isSaved);
            toast.success(isSaved ? "Removed from saved jobs" : "Job saved");
            refetchSaved();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const jobs = data?.jobs || [];
    const pagination = data?.pagination;
    const hasFilters = Boolean(keyword || location || jobType);

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                    Open positions
                </h1>
                <p className="mt-1.5 text-ink-500">
                    {pagination
                        ? `${pagination.total} ${pagination.total === 1 ? "role" : "roles"} available`
                        : "Find your next role"}
                </p>
            </header>

            {/* ---------- Filters ---------- */}
            <Card className="mb-6">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                        placeholder="Job title or skill"
                        aria-label="Search by job title or skill"
                        icon={<Search className="h-4 w-4" />}
                        value={keywordInput}
                        onChange={(event) => setKeywordInput(event.target.value)}
                    />

                    <Input
                        placeholder="Location"
                        aria-label="Filter by location"
                        value={locationInput}
                        onChange={(event) => setLocationInput(event.target.value)}
                    />

                    <Select
                        aria-label="Filter by job type"
                        placeholder="All job types"
                        options={JOB_TYPES}
                        value={jobType}
                        onChange={(event) => updateParams({ jobType: event.target.value })}
                    />

                    <Select
                        aria-label="Sort results"
                        options={SORT_OPTIONS}
                        value={sort}
                        onChange={(event) => updateParams({ sort: event.target.value })}
                    />
                </CardContent>

                {hasFilters && (
                    <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                            Filters applied
                        </span>

                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<X className="h-3.5 w-3.5" />}
                            onClick={() => {
                                setKeywordInput("");
                                setLocationInput("");
                                setSearchParams({});
                            }}
                        >
                            Clear all
                        </Button>
                    </div>
                )}
            </Card>

            {/* ---------- Results ---------- */}
            {isLoading ? (
                <SkeletonList count={4} />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : jobs.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="No jobs match your search"
                    description={
                        hasFilters
                            ? "Try removing a filter or searching for a broader term."
                            : "There are no published jobs right now. Please check back soon."
                    }
                    action={
                        hasFilters && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setKeywordInput("");
                                    setLocationInput("");
                                    setSearchParams({});
                                }}
                            >
                                Clear filters
                            </Button>
                        )
                    }
                />
            ) : (
                <>
                    <div className="grid gap-4">
                        {jobs.map((job) => (
                            <JobCard
                                key={job._id}
                                job={job}
                                showSaveButton={isCandidate}
                                isSaved={savedIds.has(job._id)}
                                isSaving={isSaving}
                                onToggleSave={handleToggleSave}
                            />
                        ))}
                    </div>

                    {/* ---------- Pagination ---------- */}
                    {pagination && pagination.totalPages > 1 && (
                        <nav
                            className="mt-8 flex items-center justify-center gap-2"
                            aria-label="Pagination"
                        >
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() =>
                                    updateParams({ page: String(page - 1) }, { resetPage: false })
                                }
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
                                onClick={() =>
                                    updateParams({ page: String(page + 1) }, { resetPage: false })
                                }
                            >
                                Next
                            </Button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
};

export default Jobs;
