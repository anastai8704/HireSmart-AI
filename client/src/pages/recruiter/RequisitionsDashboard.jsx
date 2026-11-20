import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileEdit,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Building2,
  ArrowRight,
  X,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { PageHeader, StatusPill } from "../../components/Product";
import { EmptyState, SkeletonList, ErrorState } from "../../components/ui/States";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import * as api from "../../lib/api";
import { formatDate, cn } from "../../lib/utils";

const getJobsApi = () => {
  try {
    return api.jobsApi || {};
  } catch {
    return {};
  }
};
const getAnalyticsApi = () => {
  try {
    return api.analyticsApi || {};
  } catch {
    return {};
  }
};
const getSubscriptionApi = () => {
  try {
    return api.subscriptionApi || null;
  } catch {
    return null;
  }
};

const formatSalary = (comp, salary) => {
  if (comp && (comp.min || comp.max)) {
    const minStr = comp.min ? `₹${(comp.min / 100000).toFixed(1)}L` : "";
    const maxStr = comp.max ? `₹${(comp.max / 100000).toFixed(1)}L` : "";
    if (minStr && maxStr && minStr !== maxStr) {
      return `${minStr} - ${maxStr} / yr`;
    }
    return `${maxStr || minStr} / yr`;
  }
  if (salary) {
    return `₹${(salary / 100000).toFixed(1)}L / yr`;
  }
  return "Competitive";
};

export const RequisitionsDashboard = ({ assigned = false }) => {
  const { organizationId: routeOrgId } = useParams();
  const auth = useAuth();
  const orgId = routeOrgId || auth.organizationId;
  const toast = useToast();
  const qc = useQueryClient();

  // Filters & Controls State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [closeTarget, setCloseTarget] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Permissions
  const canManageJobs = ["owner", "admin", "recruiter"].includes(auth.membership?.role);

  // Queries
  const jobsQuery = useQuery({
    queryKey: [assigned ? "assigned-jobs" : "jobs-org", orgId],
    queryFn: () => (assigned ? getJobsApi().assigned(orgId) : getJobsApi().orgList(orgId, { limit: 100 })),
    enabled: Boolean(orgId),
  });

  const analyticsQuery = useQuery({
    queryKey: ["recruiter-analytics-jobs", orgId],
    queryFn: () => {
      const aApi = getAnalyticsApi();
      return aApi?.recruitment ? aApi.recruitment(orgId) : Promise.resolve({ data: {} });
    },
    enabled: Boolean(orgId && !assigned),
  });

  const subQuery = useQuery({
    queryKey: ["recruiter-subscription-jobs", orgId],
    queryFn: () => {
      const subApi = getSubscriptionApi();
      if (subApi?.current) return subApi.current(orgId);
      if (subApi?.overview) return subApi.overview(orgId);
      return Promise.resolve({ data: {} });
    },
    enabled: Boolean(orgId && !assigned),
  });

  // Mutations
  const closeJob = useMutation({
    mutationFn: (jobId) => getJobsApi().close(orgId, jobId),
    onSuccess: () => {
      setCloseTarget(null);
      qc.invalidateQueries({ queryKey: [assigned ? "assigned-jobs" : "jobs-org", orgId] });
      qc.invalidateQueries({ queryKey: ["recruiter-analytics-jobs", orgId] });
      toast.success("Job closed — it no longer accepts new applications");
    },
    onError: (error) => toast.error(error.message || "Failed to close job"),
  });

  const allJobs = useMemo(() => jobsQuery.data?.data || [], [jobsQuery.data?.data]);

  // Performance metrics map by Job ID
  const jobPerformanceMap = useMemo(() => {
    const list = analyticsQuery.data?.data?.jobPerformance || [];
    const map = new Map();
    list.forEach((p) => {
      const key = p._id || p.job || (typeof p.job === "object" ? p.job?._id || p.job?.id : null);
      if (key) map.set(String(key), p);
    });
    return map;
  }, [analyticsQuery.data?.data?.jobPerformance]);

  // Backend Supported Lifecycle Counts
  const now = useMemo(() => new Date(), []);
  const counts = useMemo(() => {
    let published = 0;
    let draft = 0;
    let pendingApproval = 0;
    let rejected = 0;
    let closed = 0;

    allJobs.forEach((j) => {
      const isClosedOrExpired =
        j.status === "closed" || (j.status === "published" && j.closesAt && new Date(j.closesAt) < now);

      if (isClosedOrExpired) {
        closed++;
      } else if (j.status === "draft") {
        draft++;
      } else if (
        (j.status === "published" && j.moderation?.status === "pending") ||
        j.pendingChanges?.status === "pending"
      ) {
        pendingApproval++;
      } else if (
        j.moderation?.status === "rejected" ||
        j.pendingChanges?.status === "rejected"
      ) {
        rejected++;
      } else if (
        j.status === "published" &&
        ["approved", "none"].includes(j.moderation?.status)
      ) {
        published++;
      }
    });

    return {
      total: allJobs.length,
      published,
      draft,
      pendingApproval,
      rejected,
      closed,
    };
  }, [allJobs, now]);

  // Subscription Job Posting Limit
  const subData = subQuery.data?.data || {};
  const entitlement = subData.entitlement || null;
  const planActiveJobsLimit =
    entitlement?.limits?.activeJobs ??
    subData.entitlements?.activeJobs ??
    subData.plan?.limits?.activeJobs;
  const hasJobLimit = typeof planActiveJobsLimit === "number";
  const planTier =
    entitlement?.tier ||
    entitlement?.plan ||
    subData.plan?.id ||
    subData.subscription?.plan ||
    "free";
  const planName = planTier.replace(/_/g, " ");
  const isEnterprise =
    planTier.includes("enterprise") ||
    entitlement?.limits?.activeJobs === 100 ||
    !hasJobLimit;
  const isJobLimitReached =
    !isEnterprise && hasJobLimit && counts.published >= planActiveJobsLimit;
  const remainingActiveJobSlots = isEnterprise
    ? "Unlimited"
    : hasJobLimit
      ? Math.max(0, planActiveJobsLimit - counts.published)
      : "Unlimited";

  // Unique Locations for Filter
  const availableLocations = useMemo(() => {
    const locs = new Set();
    allJobs.forEach((j) => {
      if (j.location) locs.add(j.location.trim());
    });
    return Array.from(locs).sort();
  }, [allJobs]);

  // Filter and Sort Jobs
  const filteredJobs = useMemo(() => {
    return allJobs
      .filter((j) => {
        const titleMatch = (j.title || "").toLowerCase().includes(searchQuery.toLowerCase().trim());
        const locationMatch = (j.location || "").toLowerCase().includes(searchQuery.toLowerCase().trim());
        const companyMatch = (j.company || "").toLowerCase().includes(searchQuery.toLowerCase().trim());
        const skillsMatch = (j.requiredSkills || []).some((s) =>
          s.toLowerCase().includes(searchQuery.toLowerCase().trim()),
        );
        const matchesSearch = !searchQuery.trim() || titleMatch || locationMatch || companyMatch || skillsMatch;

        // Status matching
        let matchesStatus = true;
        if (statusFilter === "published") {
          matchesStatus =
            j.status === "published" &&
            ["approved", "none"].includes(j.moderation?.status) &&
            (!j.closesAt || new Date(j.closesAt) >= now);
        } else if (statusFilter === "draft") {
          matchesStatus = j.status === "draft";
        } else if (statusFilter === "pending") {
          matchesStatus =
            (j.status === "published" && j.moderation?.status === "pending") ||
            j.pendingChanges?.status === "pending";
        } else if (statusFilter === "rejected") {
          matchesStatus =
            j.moderation?.status === "rejected" || j.pendingChanges?.status === "rejected";
        } else if (statusFilter === "closed") {
          matchesStatus =
            j.status === "closed" || (j.status === "published" && j.closesAt && new Date(j.closesAt) < now);
        }

        const matchesWorkplace =
          workplaceFilter === "all" || j.workplaceMode === workplaceFilter;
        const matchesLocation =
          locationFilter === "all" || j.location?.trim() === locationFilter;

        return matchesSearch && matchesStatus && matchesWorkplace && matchesLocation;
      })
      .sort((a, b) => {
        if (sortBy === "newest") {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
        if (sortBy === "oldest") {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (sortBy === "title_asc") {
          return (a.title || "").localeCompare(b.title || "");
        }
        if (sortBy === "title_desc") {
          return (b.title || "").localeCompare(a.title || "");
        }
        return 0;
      });
  }, [allJobs, searchQuery, statusFilter, workplaceFilter, locationFilter, sortBy, now]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, page, pageSize]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      jobsQuery.refetch(),
      analyticsQuery.refetch(),
      subQuery.refetch(),
    ]);
    setIsRefreshing(false);
    toast.success("Requisitions refreshed");
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setWorkplaceFilter("all");
    setLocationFilter("all");
    setSortBy("newest");
    setPage(1);
  };

  return (
    <div className="page-wrap space-y-6" data-testid="requisitions-dashboard">
      <PageHeader
        eyebrow={assigned ? "Hiring Manager" : "Requisitions & Jobs"}
        title={assigned ? "Your Assigned Jobs" : "Manage Requisitions"}
        description={
          assigned
            ? "Review candidate pipelines and interviews for requisitions assigned to you."
            : "Create, publish, and track open roles and requisition lifecycles across your company."
        }
        action={
          !assigned &&
          canManageJobs && (
            <div className="flex items-center gap-2">
              <Button
                as={Link}
                to={`/app/o/${orgId}/jobs/new`}
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={isJobLimitReached}
                title={
                  isJobLimitReached
                    ? "Active job posting limit reached for your plan"
                    : "Create a new job posting"
                }
              >
                Create Requisition
              </Button>
            </div>
          )
        }
      />

      {/* Subscription Limit Warning Banner */}
      {!assigned && isJobLimitReached && (
        <div className="panel border-amber-300 bg-amber-50/70 p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-ink-950">Active job posting limit reached</p>
                <p className="text-xs text-ink-600 mt-0.5">
                  Your {planName} plan includes {planActiveJobsLimit} active job posting
                  {planActiveJobsLimit === 1 ? "" : "s"}. Close an existing posting or upgrade your
                  plan to publish additional requisitions.
                </p>
              </div>
            </div>
            <Link to={`/app/o/${orgId}/billing`}>
              <Button size="sm" variant="secondary" className="border-amber-300 text-amber-900 hover:bg-amber-100">
                Upgrade Plan
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 6 Requisition Lifecycle KPI Metric Cards */}
      {!assigned && (
        <section aria-label="Requisition metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="panel p-4 flex flex-col justify-between shadow-2xs">
            <p className="text-xs font-medium text-ink-500">Total Jobs</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-ink-900" data-testid="kpi-total-jobs">{counts.total}</p>
              <BriefcaseBusiness className="h-4 w-4 text-ink-400" />
            </div>
          </div>

          <div className="panel p-4 flex flex-col justify-between shadow-2xs border-emerald-100 bg-emerald-50/20">
            <p className="text-xs font-medium text-emerald-800">Published / Active</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-emerald-700" data-testid="kpi-published-jobs">{counts.published}</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">
              {isEnterprise
                ? "Unlimited capacity"
                : hasJobLimit
                  ? `${remainingActiveJobSlots} slots left`
                  : "Active"}
            </p>
          </div>

          <div className="panel p-4 flex flex-col justify-between shadow-2xs">
            <p className="text-xs font-medium text-ink-500">Drafts</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-ink-900" data-testid="kpi-draft-jobs">{counts.draft}</p>
              <FileEdit className="h-4 w-4 text-ink-400" />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Unpublished</p>
          </div>

          <div className="panel p-4 flex flex-col justify-between shadow-2xs border-warning-200 bg-warning-50/20">
            <p className="text-xs font-medium text-warning-800">Pending Approval</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-warning-700" data-testid="kpi-pending-jobs">{counts.pendingApproval}</p>
              <Clock className="h-4 w-4 text-warning-600" />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">In review</p>
          </div>

          <div className="panel p-4 flex flex-col justify-between shadow-2xs border-danger-100 bg-danger-50/20">
            <p className="text-xs font-medium text-danger-800">Rejected</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-danger-700" data-testid="kpi-rejected-jobs">{counts.rejected}</p>
              <XCircle className="h-4 w-4 text-danger-600" />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Action required</p>
          </div>

          <div className="panel p-4 flex flex-col justify-between shadow-2xs">
            <p className="text-xs font-medium text-ink-500">Closed / Expired</p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-ink-700" data-testid="kpi-closed-jobs">{counts.closed}</p>
              <X className="h-4 w-4 text-ink-400" />
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Archived</p>
          </div>
        </section>
      )}

      {/* Search & Filter Toolbar */}
      <div className="panel p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px] sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by title, location, or skills..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-8 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="w-52 min-w-[190px]">
              <SearchableSelect
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "published", label: "Published / Active" },
                  { value: "draft", label: "Draft" },
                  { value: "pending", label: "Pending Approval" },
                  { value: "rejected", label: "Rejected" },
                  { value: "closed", label: "Closed / Expired" },
                ]}
              />
            </div>

            {/* Workplace Filter */}
            <div className="w-44 min-w-[160px]">
              <SearchableSelect
                aria-label="Filter by workplace"
                value={workplaceFilter}
                onChange={(e) => {
                  setWorkplaceFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All Workplaces" },
                  { value: "onsite", label: "On-site" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "remote", label: "Remote" },
                ]}
              />
            </div>

            {/* Location Filter */}
            {availableLocations.length > 0 && (
              <div className="w-48 min-w-[170px]">
                <SearchableSelect
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={(e) => {
                    setLocationFilter(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: "all", label: "All Locations" },
                    ...availableLocations.map((loc) => ({ value: loc, label: loc })),
                  ]}
                />
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="w-44 min-w-[160px]">
              <SearchableSelect
                aria-label="Sort requisitions"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "title_asc", label: "Title (A-Z)" },
                  { value: "title_desc", label: "Title (Z-A)" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(searchQuery || statusFilter !== "all" || workplaceFilter !== "all" || locationFilter !== "all" || sortBy !== "newest") && (
              <Button size="md" variant="ghost" onClick={handleResetFilters} className="h-10">
                Reset
              </Button>
            )}
            <Button
              size="md"
              variant="secondary"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-10"
              leftIcon={<RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Jobs Listing */}
      {jobsQuery.isLoading ? (
        <SkeletonList count={4} />
      ) : jobsQuery.error ? (
        <ErrorState error={jobsQuery.error} />
      ) : paginatedJobs.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
              Requisitions ({filteredJobs.length})
            </h2>
            <span className="text-xs text-ink-400">
              Showing {(page - 1) * pageSize + 1} -{" "}
              {Math.min(page * pageSize, filteredJobs.length)} of {filteredJobs.length}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {paginatedJobs.map((job) => {
              const perf = jobPerformanceMap.get(String(job.id)) || jobPerformanceMap.get(String(job._id));
              const appsCount = perf?.applications || 0;
              const shortlistedCount = perf?.shortlisted || 0;
              const interviewsCount = perf?.interviews || 0;
              const hiresCount = perf?.hires || 0;

              const isModerationPending = job.moderation?.status === "pending";
              const isModerationRejected = job.moderation?.status === "rejected";
              const isChangesPending = job.pendingChanges?.status === "pending";
              const isChangesRejected = job.pendingChanges?.status === "rejected";

              return (
                <article
                  key={job.id || job._id}
                  data-testid={`job-card-${job.id || job._id}`}
                  className="panel p-5 flex flex-col justify-between shadow-2xs transition-all duration-200 hover:border-brand-300 hover:shadow-xs"
                >
                  <div>
                    {/* Header Row: Status Pills & Moderation Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={job.status} />
                        {isModerationPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-800 border border-warning-200">
                            <Clock className="h-3 w-3" />
                            Awaiting approval
                          </span>
                        )}
                        {isModerationRejected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-700 border border-danger-200">
                            <XCircle className="h-3 w-3" />
                            Not approved
                          </span>
                        )}
                        {isChangesPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                            <Clock className="h-3 w-3" />
                            Changes pending review
                          </span>
                        )}
                        {isChangesRejected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-semibold text-danger-700 border border-danger-200">
                            <XCircle className="h-3 w-3" />
                            Changes rejected
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge variant="neutral" className="text-[11px] capitalize">
                          {job.jobType || "Full-Time"}
                        </Badge>
                        <Badge variant="brand" className="text-[11px] capitalize">
                          {job.workplaceMode || "Hybrid"}
                        </Badge>
                      </div>
                    </div>

                    {/* Rejection / Moderation Reason Callout */}
                    {(isModerationRejected || isChangesRejected) && (
                      <div className="mt-3 rounded-lg border border-danger-200 bg-danger-50/70 p-3 text-xs text-danger-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-danger-600 mt-0.5" />
                          <div>
                            <p className="font-semibold">Review feedback:</p>
                            <p className="mt-0.5">
                              {job.moderation?.reason ||
                                job.pendingChanges?.reason ||
                                "Job does not meet platform guidelines. Edit and resubmit."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Job Title & Meta */}
                    <div className="mt-3">
                      <h3 className="text-base font-bold text-ink-950 truncate">{job.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-ink-400" />
                          {job.company}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-ink-400" />
                          {job.location}
                        </span>
                        <span>·</span>
                        <span className="font-semibold text-ink-700">
                          {formatSalary(job.compensation, job.salary)}
                        </span>
                      </div>
                    </div>

                    {/* Required Skills Chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(job.requiredSkills || []).slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-md bg-ink-100/70 px-2 py-0.5 text-xs font-medium text-ink-700"
                        >
                          {skill}
                        </span>
                      ))}
                      {(job.requiredSkills || []).length > 5 && (
                        <span className="rounded-md bg-ink-50 px-1.5 py-0.5 text-xs text-ink-500">
                          +{job.requiredSkills.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Performance Pipeline Metrics Strip */}
                  <div className="mt-4 border-t border-ink-100 pt-3">
                    <div className="grid grid-cols-4 gap-2 text-center rounded-lg bg-ink-50/50 p-2 mb-3">
                      <div>
                        <p className="text-[11px] text-ink-400 font-medium">Applied</p>
                        <p className="text-xs font-bold text-ink-900">{appsCount}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-ink-400 font-medium">Shortlisted</p>
                        <p className="text-xs font-bold text-ink-900">{shortlistedCount}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-ink-400 font-medium">Interviews</p>
                        <p className="text-xs font-bold text-ink-900">{interviewsCount}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-ink-400 font-medium">Hired</p>
                        <p className="text-xs font-bold text-emerald-700">{hiresCount}</p>
                      </div>
                    </div>

                    {/* Action Buttons Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {canManageJobs && !assigned && (
                          <Button
                            as={Link}
                            size="sm"
                            variant="secondary"
                            to={`/app/o/${orgId}/jobs/${job.id}/edit`}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          as={Link}
                          size="sm"
                          variant="secondary"
                          to={`/app/o/${orgId}/jobs/${job.id}/applications`}
                          rightIcon={<ArrowRight className="h-3 w-3" />}
                        >
                          Pipeline
                        </Button>
                        {canManageJobs && !assigned && job.status === "published" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-ink-600 hover:text-danger-700 hover:bg-danger-50"
                            data-action="close-job"
                            onClick={() => setCloseTarget(job)}
                          >
                            Close
                          </Button>
                        )}
                      </div>

                      <span className="text-[11px] text-ink-400">
                        {job.createdAt ? `Posted ${formatDate(job.createdAt)}` : ""}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-100 pt-4">
              <p className="text-xs text-ink-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : allJobs.length > 0 ? (
        <EmptyState
          title="No requisitions match your filters"
          description="Try adjusting your search query, status, or workplace filters."
          action={
            <Button variant="secondary" size="sm" onClick={handleResetFilters}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={BriefcaseBusiness}
          title={assigned ? "No assigned jobs yet" : "No job requisitions yet"}
          description={
            assigned
              ? "You will see requisitions here once you are assigned to a hiring team."
              : "Create your first job requisition to start finding and hiring top candidates."
          }
          action={
            !assigned &&
            canManageJobs && (
              <Button
                as={Link}
                to={`/app/o/${orgId}/jobs/new`}
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={isJobLimitReached}
              >
                Create Requisition
              </Button>
            )
          }
        />
      )}

      {/* Confirm Close Modal */}
      <ConfirmModal
        isOpen={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        onConfirm={() => closeTarget && closeJob.mutate(closeTarget.id)}
        title="Close this job requisition?"
        description={`“${closeTarget?.title || "This job"}” will stop accepting new candidate applications. Existing applications and interview pipeline remain preserved.`}
        confirmLabel="Close Job"
        tone="warning"
        isLoading={closeJob.isPending}
      />
    </div>
  );
};

export default RequisitionsDashboard;
