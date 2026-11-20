/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import {
  Users,
  Search,
  LayoutGrid,
  List,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  BriefcaseBusiness,
  Sparkles,
  Layers,
  Award,
  Eye,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";
import SearchableSelect from "../../components/ui/SearchableSelect";
import { StatusPill, PageHeader } from "../../components/Product";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import { formatDate, formatRelativeTime, initials, cn } from "../../lib/utils";
import * as api from "../../lib/api";
import {
  Candidate360Drawer,
  PERMITTED_TRANSITIONS,
  STAGE_LABELS,
} from "./Candidate360Drawer";

const getRecruitmentApi = () => {
  try {
    return api.recruitmentApi || {};
  } catch {
    return {};
  }
};

const getJobsApi = () => {
  try {
    return api.jobsApi || {};
  } catch {
    return {};
  }
};

export const PIPELINE_STAGES = [
  {
    id: "submitted",
    label: "Submitted",
    color: "border-blue-200 bg-blue-50/60 text-blue-800",
    badge: "bg-blue-100 text-blue-800",
    dot: "bg-blue-500",
    icon: Inbox,
    aliases: ["applied", "submitted"],
  },
  {
    id: "under_review",
    label: "Under Review",
    color: "border-purple-200 bg-purple-50/60 text-purple-800",
    badge: "bg-purple-100 text-purple-800",
    dot: "bg-purple-500",
    icon: Clock,
    aliases: ["under_review"],
  },
  {
    id: "shortlisted",
    label: "Shortlisted",
    color: "border-amber-200 bg-amber-50/60 text-amber-800",
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    icon: Sparkles,
    aliases: ["shortlisted"],
  },
  {
    id: "interview",
    label: "Interview",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    badge: "bg-indigo-100 text-indigo-800",
    dot: "bg-indigo-500",
    icon: BriefcaseBusiness,
    aliases: ["interview"],
  },
  {
    id: "offer",
    label: "Offer",
    color: "border-teal-200 bg-teal-50/60 text-teal-800",
    badge: "bg-teal-100 text-teal-800",
    dot: "bg-teal-500",
    icon: Award,
    aliases: ["offer"],
  },
  {
    id: "hired",
    label: "Hired",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    badge: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    aliases: ["hired", "selected"],
  },
  {
    id: "rejected",
    label: "Rejected",
    color: "border-rose-200 bg-rose-50/60 text-rose-800",
    badge: "bg-rose-100 text-rose-800",
    dot: "bg-rose-500",
    icon: XCircle,
    aliases: ["rejected", "withdrawn", "closed"],
  },
];

export const normalizeStage = (status) => {
  if (!status) return "submitted";
  const s = String(status).toLowerCase();
  for (const stage of PIPELINE_STAGES) {
    if (stage.aliases.includes(s)) return stage.id;
  }
  return "submitted";
};

export const ApplicationsPipelinePage = () => {
  const { organizationId, jobId: routeJobId } = useParams();
  const auth = useAuth();
  const orgId = organizationId || auth.organizationId;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  // State
  const [selectedJobId, setSelectedJobId] = useState(routeJobId || "");
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" | "table"
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sort, setSort] = useState("newest"); // "newest" | "oldest" | "fit"
  const [selectedAppIds, setSelectedAppIds] = useState([]);
  const [selectedCandidateAppId, setSelectedCandidateAppId] = useState(null);

  // Modals
  const [singleTransitionModal, setSingleTransitionModal] = useState(null); // { app, toStatus, note }
  const [bulkActionModal, setBulkActionModal] = useState(null); // { action: "shortlist"|"under_review"|"reject", note: "" }
  const [downloadingResumeId, setDownloadingResumeId] = useState(null);

  // Jobs query for dropdown
  const jobsQuery = useQuery({
    queryKey: ["recruiter-jobs-dropdown", orgId],
    queryFn: () => {
      const jApi = getJobsApi();
      return jApi.orgList ? jApi.orgList(orgId, { limit: 100 }) : Promise.resolve({ data: [] });
    },
    enabled: Boolean(orgId),
  });

  const jobsList = useMemo(() => jobsQuery.data?.data || [], [jobsQuery.data]);
  const selectedJob = useMemo(
    () => jobsList.find((j) => (j._id || j.id) === selectedJobId),
    [jobsList, selectedJobId],
  );

  // Applications infinite query
  const appsQuery = useInfiniteQuery({
    queryKey: ["recruiter-applications", orgId, selectedJobId, stageFilter],
    queryFn: ({ pageParam }) => {
      const rApi = getRecruitmentApi();
      const statusParam = stageFilter !== "all" ? stageFilter : undefined;
      return rApi.applications(orgId, selectedJobId || undefined, {
        status: statusParam,
        limit: 50,
        after: pageParam,
      });
    },
    initialPageParam: null,
    getNextPageParam: (last) => last?.meta?.nextCursor || undefined,
    enabled: Boolean(orgId),
  });

  const rawApplications = useMemo(
    () => appsQuery.data?.pages?.flatMap((page) => page?.data || []) || [],
    [appsQuery.data],
  );

  // Batch AI match queries for first 30 apps for responsive fit ranking
  const matchQueries = useQueries({
    queries: rawApplications.slice(0, 30).map((app) => ({
      queryKey: ["application-match", orgId, app._id],
      queryFn: () => getRecruitmentApi().match(orgId, app._id),
      enabled: Boolean(orgId && app._id),
      staleTime: 300000,
    })),
  });

  const matchMap = useMemo(() => {
    const map = new Map();
    matchQueries.forEach((mq, idx) => {
      const app = rawApplications[idx];
      if (app && mq.data?.data) {
        map.set(app._id, mq.data.data.overallScore ?? mq.data.data.score);
      }
    });
    return map;
  }, [matchQueries, rawApplications]);

  // Filtered & Sorted applications
  const filteredApplications = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawApplications
      .filter((app) => {
        // Search filter
        if (q) {
          const candidateName = app.candidate?.name?.toLowerCase() || "";
          const candidateEmail = app.candidate?.email?.toLowerCase() || "";
          const candidateHeadline = app.candidate?.headline?.toLowerCase() || "";
          const jobTitle = app.job?.title?.toLowerCase() || "";
          const skills = (app.candidate?.skills || []).map((s) => String(s).toLowerCase());
          const matches =
            candidateName.includes(q) ||
            candidateEmail.includes(q) ||
            candidateHeadline.includes(q) ||
            jobTitle.includes(q) ||
            skills.some((s) => s.includes(q));
          if (!matches) return false;
        }

        // Job filter (if not already filtered by query param)
        if (selectedJobId && (app.job?._id || app.job) !== selectedJobId) {
          return false;
        }

        // Stage filter
        if (stageFilter !== "all") {
          const normalized = normalizeStage(app.status);
          if (normalized !== stageFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sort === "fit") {
          const scoreA = matchMap.get(a._id) ?? a.matchScore ?? -1;
          const scoreB = matchMap.get(b._id) ?? b.matchScore ?? -1;
          return scoreB - scoreA;
        }
        const dateA = new Date(a.appliedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.appliedAt || b.createdAt || 0).getTime();
        return sort === "oldest" ? dateA - dateB : dateB - dateA;
      });
  }, [rawApplications, search, selectedJobId, stageFilter, sort, matchMap]);

  // Stage grouped applications for Kanban
  const stageGroups = useMemo(() => {
    const groups = {};
    for (const stage of PIPELINE_STAGES) {
      groups[stage.id] = [];
    }
    for (const app of filteredApplications) {
      const stage = normalizeStage(app.status);
      if (groups[stage]) {
        groups[stage].push(app);
      } else {
        groups.submitted.push(app);
      }
    }
    return groups;
  }, [filteredApplications]);

  // Metrics summary (8 KPIs)
  const metrics = useMemo(() => {
    const counts = {
      total: rawApplications.length,
      submitted: 0,
      under_review: 0,
      shortlisted: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    for (const app of rawApplications) {
      const stage = normalizeStage(app.status);
      if (counts[stage] !== undefined) {
        counts[stage]++;
      }
    }
    return counts;
  }, [rawApplications]);

  // Single stage transition mutation
  const transitionMutation = useMutation({
    mutationFn: async ({ appId, toStatus, note }) => {
      const rApi = getRecruitmentApi();
      return rApi.transition(orgId, appId, {
        toStatus,
        note: note || `Moved to ${STAGE_LABELS[toStatus] || toStatus}`,
      });
    },
    onSuccess: (data, vars) => {
      toast.success(`Candidate moved to ${STAGE_LABELS[vars.toStatus] || vars.toStatus}`);
      setSingleTransitionModal(null);
      qc.invalidateQueries({ queryKey: ["recruiter-applications", orgId] });
      qc.invalidateQueries({ queryKey: ["application-detail", orgId, vars.appId] });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update candidate stage");
    },
  });

  // Bulk stage transitions using Promise.allSettled
  const executeBulkAction = async (rawTargetStatus, note) => {
    const actionToStage = {
      shortlist: "shortlisted",
      shortlisted: "shortlisted",
      under_review: "under_review",
      review: "under_review",
      reject: "rejected",
      rejected: "rejected",
    };
    const targetStatus = actionToStage[rawTargetStatus] || rawTargetStatus;
    const selectedApps = rawApplications.filter((a) => selectedAppIds.includes(a._id));
    if (!selectedApps.length) return;

    // Filter eligible applications
    const eligibleApps = [];
    const ineligibleApps = [];

    for (const app of selectedApps) {
      const currStatus = app.status || "submitted";
      const allowed = PERMITTED_TRANSITIONS[currStatus] || [];
      if (allowed.includes(targetStatus)) {
        eligibleApps.push(app);
      } else {
        ineligibleApps.push({
          app,
          reason: `Cannot move from ${STAGE_LABELS[currStatus] || currStatus} to ${STAGE_LABELS[targetStatus] || targetStatus}`,
        });
      }
    }

    if (eligibleApps.length === 0) {
      toast.error(
        `None of the ${selectedApps.length} selected candidates can be moved to ${STAGE_LABELS[targetStatus] || targetStatus}.`,
      );
      setBulkActionModal(null);
      return;
    }

    const rApi = getRecruitmentApi();
    const results = await Promise.allSettled(
      eligibleApps.map((app) =>
        rApi.transition(orgId, app._id, {
          toStatus: targetStatus,
          note: note || `Bulk updated to ${STAGE_LABELS[targetStatus] || targetStatus}`,
        }),
      ),
    );

    let successCount = 0;
    let failCount = 0;
    results.forEach((r) => {
      if (r.status === "fulfilled") successCount++;
      else failCount++;
    });

    if (failCount === 0 && ineligibleApps.length === 0) {
      toast.success(`Successfully moved all ${successCount} candidates to ${STAGE_LABELS[targetStatus] || targetStatus}.`);
    } else {
      const totalIssues = failCount + ineligibleApps.length;
      toast.warning(
        `Updated ${successCount} candidates. ${totalIssues} skipped or failed.`,
      );
    }

    setSelectedAppIds([]);
    setBulkActionModal(null);
    qc.invalidateQueries({ queryKey: ["recruiter-applications", orgId] });
  };

  // Resume download handler
  const handleDownloadResume = async (app) => {
    setDownloadingResumeId(app._id);
    try {
      const rApi = getRecruitmentApi();
      const res = await rApi.resume(orgId, app._id);
      const blob = res instanceof Blob ? res : (res?.data || res);
      if (!blob || !(blob instanceof Blob)) {
        throw new Error("Candidate resume file is unavailable");
      }
      if (api.downloadBlob) {
        const candidateName = app.candidate?.name || "candidate";
        const filename = `${candidateName.replace(/\s+/g, "_")}_resume.pdf`;
        api.downloadBlob(blob, filename);
      }
      toast.success("Resume downloaded successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to download candidate resume");
    } finally {
      setDownloadingResumeId(null);
    }
  };

  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedAppIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (selectedAppIds.length === filteredApplications.length) {
      setSelectedAppIds([]);
    } else {
      setSelectedAppIds(filteredApplications.map((a) => a._id));
    }
  };

  // Quick transition trigger
  const handleInitiateTransition = (app, toStatus) => {
    if (toStatus === "offer") {
      // Offers must be issued with formal details via Candidate 360 drawer
      setSelectedCandidateAppId(app._id);
      toast.info("Formal offer details must be issued via candidate profile");
      return;
    }
    if (toStatus === "hired" || toStatus === "rejected") {
      setSingleTransitionModal({
        app,
        toStatus,
        note: "",
      });
      return;
    }
    // Direct transition for other allowed stages
    transitionMutation.mutate({ appId: app._id, toStatus, note: "" });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Back Action / Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          to={`/app/o/${orgId}/jobs`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600 hover:text-ink-950 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Requisitions</span>
        </Link>
        {selectedJob && (
          <>
            <span className="text-ink-300">/</span>
            <span className="text-xs font-bold text-ink-900 truncate max-w-sm">{selectedJob.title}</span>
          </>
        )}
      </div>

      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-ink-100 pb-5">
        <div>
          <PageHeader
            eyebrow="Recruitment Management"
            title="Applications & Candidate Pipeline"
            description="Manage inbound applicants, track pipeline stages, evaluate candidate fit, and make hiring decisions."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Job / Requisition Selector */}
          <div className="w-64">
            <SearchableSelect
              options={[
                { value: "", label: "All Requisitions" },
                ...jobsList.map((j) => ({
                  value: j._id || j.id,
                  label: `${j.title} (${j.status || "active"})`,
                })),
              ]}
              value={selectedJobId}
              onChange={(val) => {
                setSelectedJobId(val);
                if (val) {
                  navigate(`/app/o/${orgId}/jobs/${val}/applications`, { replace: true });
                } else {
                  navigate(`/app/o/${orgId}/applications`, { replace: true });
                }
              }}
              placeholder="Filter by Requisition..."
            />
          </div>

          {/* Refresh Action */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => appsQuery.refetch()}
            disabled={appsQuery.isFetching}
            title="Refresh applications"
          >
            <RotateCcw className={cn("h-4 w-4", appsQuery.isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "kanban"
                  ? "bg-white text-ink-950 shadow-xs"
                  : "text-ink-600 hover:text-ink-950",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Pipeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "table"
                  ? "bg-white text-ink-950 shadow-xs"
                  : "text-ink-600 hover:text-ink-950",
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* 8 KPI Status Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <button
          type="button"
          data-testid="kpi-total"
          onClick={() => setStageFilter("all")}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all hover:border-brand-300",
            stageFilter === "all"
              ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500"
              : "border-ink-100 bg-white",
          )}
        >
          <span className="text-xs font-medium text-ink-500">Total</span>
          <span className="mt-1 text-2xl font-bold text-ink-900">{metrics.total}</span>
          <span className="mt-1 text-[11px] text-ink-400">All applicants</span>
        </button>

        {PIPELINE_STAGES.map((stage) => {
          const count = metrics[stage.id] || 0;
          const isSelected = stageFilter === stage.id;
          const StageIcon = stage.icon;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setStageFilter(isSelected ? "all" : stage.id)}
              className={cn(
                "flex flex-col rounded-xl border p-3 text-left transition-all hover:border-ink-300",
                isSelected
                  ? "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500"
                  : "border-ink-100 bg-white",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-600 truncate">{stage.label}</span>
                <span className={cn("h-2 w-2 rounded-full", stage.dot)} />
              </div>
              <span className="mt-1 text-2xl font-bold text-ink-900">{count}</span>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-400">
                <StageIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{Math.round((count / (metrics.total || 1)) * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by candidate name, email, skills, job..."
              className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-3 text-sm text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-400 hover:text-ink-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Stage Filter Dropdown */}
          <div className="w-44">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All Stages</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="w-44">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="newest">Newest Applied</option>
              <option value="oldest">Oldest Applied</option>
              <option value="fit">AI Fit Score</option>
            </select>
          </div>

          {(search || stageFilter !== "all" || selectedJobId) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStageFilter("all");
                setSelectedJobId("");
                navigate(`/app/o/${orgId}/applications`, { replace: true });
              }}
              className="text-xs text-ink-500 hover:text-ink-950"
            >
              Reset Filters
            </Button>
          )}
        </div>

        {/* Selected Counter & Selection Toggle */}
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-ink-500 border-t sm:border-t-0 pt-2 sm:pt-0">
          <span>
            Showing <strong className="text-ink-900">{filteredApplications.length}</strong> of {rawApplications.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="text-xs"
          >
            {selectedAppIds.length === filteredApplications.length && filteredApplications.length > 0
              ? "Deselect All"
              : "Select All"}
          </Button>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedAppIds.length > 0 && (
        <div data-testid="bulk-toolbar" className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {selectedAppIds.length}
            </span>
            <span className="text-sm font-semibold text-brand-900">
              candidates selected for bulk actions
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="bulk-compare-btn"
              disabled={selectedAppIds.length < 2}
              onClick={() =>
                navigate(`/app/o/${orgId}/compare?applicationIds=${selectedAppIds.join(",")}`)
              }
              title={
                selectedAppIds.length < 2
                  ? "Select at least 2 candidates to compare"
                  : "Compare selected candidates side by side"
              }
              leftIcon={<Users className="h-3.5 w-3.5" />}
            >
              <span>Compare Selected ({selectedAppIds.length})</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="bulk-review-btn"
              onClick={() => setBulkActionModal({ action: "under_review", note: "" })}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Review</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="bulk-shortlist-btn"
              onClick={() => setBulkActionModal({ action: "shortlist", note: "" })}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Shortlist</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="bulk-reject-btn"
              className="text-rose-700 hover:bg-rose-50 border-rose-200"
              onClick={() => setBulkActionModal({ action: "reject", note: "" })}
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="bulk-cancel-btn"
              onClick={() => setSelectedAppIds([])}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {appsQuery.isLoading ? (
        <LoadingState message="Loading applications and pipeline data..." />
      ) : appsQuery.isError ? (
        <ErrorState
          title="Failed to load applications"
          description={appsQuery.error?.message || "There was an error loading recruitment data."}
          onRetry={() => appsQuery.refetch()}
        />
      ) : filteredApplications.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || stageFilter !== "all" ? "No matching applicants" : "No applications yet"}
          description={
            search || stageFilter !== "all"
              ? "Try adjusting your search query or stage filters to find applicants."
              : selectedJob
                ? `No candidates have applied to "${selectedJob.title}" yet.`
                : "When candidates apply to your job requisitions, they will appear here."
          }
          action={
            (search || stageFilter !== "all" || selectedJobId) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStageFilter("all");
                  setSelectedJobId("");
                  navigate(`/app/o/${orgId}/applications`, { replace: true });
                }}
              >
                Clear All Filters
              </Button>
            )
          }
        />
      ) : viewMode === "kanban" ? (
        /* Kanban Pipeline View */
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-w-full">
          {PIPELINE_STAGES.map((stage) => {
            const appsInStage = stageGroups[stage.id] || [];
            const StageIcon = stage.icon;
            return (
              <div
                key={stage.id}
                className="flex flex-col rounded-xl border border-ink-200/80 bg-ink-50/60 p-3 w-[290px] min-w-[290px] shrink-0"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-ink-200/60 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", stage.dot)} />
                    <StageIcon className="h-3.5 w-3.5 text-ink-500" />
                    <h3 className="text-xs font-bold text-ink-900 tracking-wide uppercase">
                      {stage.label}
                    </h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-700 shadow-2xs border border-ink-200/60">
                    {appsInStage.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="flex flex-col gap-3 flex-1 min-h-[120px]">
                  {appsInStage.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-ink-200 py-8 text-center">
                      <span className="text-xs text-ink-400">No candidates</span>
                    </div>
                  ) : (
                    appsInStage.map((app) => {
                      const candidate = app.candidate || {};
                      const job = app.job || {};
                      const isSelected = selectedAppIds.includes(app._id);
                      const currentStatus = app.status || "submitted";
                      const allowedTransitions = PERMITTED_TRANSITIONS[currentStatus] || [];
                      const fitScore = matchMap.get(app._id) ?? app.matchScore;

                      return (
                        <div
                          key={app._id}
                          className={cn(
                            "group relative flex flex-col rounded-lg border bg-white p-3.5 shadow-xs transition-all hover:border-brand-400 hover:shadow-md",
                            isSelected ? "border-brand-500 ring-1 ring-brand-500" : "border-ink-200/80",
                          )}
                        >
                          {/* Card Top Row: Checkbox, Name, Fit */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelect(app._id);
                                }}
                                className="mt-1 h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                              />
                              <div
                                className="cursor-pointer min-w-0"
                                onClick={() => setSelectedCandidateAppId(app._id)}
                                data-testid={`card-candidate-name-${app._id}`}
                              >
                                <h4 className="text-sm font-bold text-ink-950 group-hover:text-brand-600 truncate">
                                  {candidate.name || "Candidate"}
                                </h4>
                                <p className="text-xs text-ink-500 truncate">
                                  {candidate.headline || candidate.email || "Applicant"}
                                </p>
                              </div>
                            </div>

                            {fitScore !== undefined && fitScore !== null && (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  fitScore >= 80
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : fitScore >= 60
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-ink-100 text-ink-700",
                                )}
                                title={`AI Fit Score: ${fitScore}%`}
                              >
                                {fitScore}%
                              </span>
                            )}
                          </div>

                          {/* Requisition Title & Applied Date */}
                          <div
                            className="mt-2.5 flex items-center justify-between text-[11px] text-ink-500 cursor-pointer"
                            onClick={() => setSelectedCandidateAppId(app._id)}
                          >
                            <span className="truncate max-w-[140px] font-medium text-ink-700">
                              {job.title || "Job"}
                            </span>
                            <span>{formatRelativeTime(app.appliedAt || app.createdAt)}</span>
                          </div>

                          {/* Skills Pills */}
                          {candidate.skills && candidate.skills.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1">
                              {candidate.skills.slice(0, 3).map((skill, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-600"
                                >
                                  {skill}
                                </span>
                              ))}
                              {candidate.skills.length > 3 && (
                                <span className="text-[10px] text-ink-400">
                                  +{candidate.skills.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Card Footer: Quick Move & Details */}
                          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2.5 gap-2">
                            {/* Resume button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadResume(app);
                              }}
                              disabled={downloadingResumeId === app._id}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-600 hover:text-brand-600 shrink-0"
                              title="Download Resume"
                            >
                              <Download className="h-3 w-3" />
                              <span>Resume</span>
                            </button>

                            {/* Move Stage Selector */}
                            {allowedTransitions.length > 0 ? (
                              <div className="relative min-w-0">
                                <select
                                  value=""
                                  data-testid={`move-select-${app._id}`}
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleInitiateTransition(app, e.target.value);
                                    }
                                  }}
                                  className="max-w-[145px] truncate rounded border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-brand-400 focus:outline-none"
                                >
                                  <option value="">Move Stage...</option>
                                  {allowedTransitions.map((next) => (
                                    <option key={next} value={next}>
                                      → {STAGE_LABELS[next] || next}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <span className="text-[10px] text-ink-400 font-medium shrink-0">Terminal</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/75 text-xs font-semibold text-ink-700">
                  <th className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={
                        selectedAppIds.length === filteredApplications.length &&
                        filteredApplications.length > 0
                      }
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3.5">Candidate</th>
                  <th className="px-4 py-3.5">Requisition</th>
                  <th className="px-4 py-3.5">Stage</th>
                  <th className="px-4 py-3.5">Fit Score</th>
                  <th className="px-4 py-3.5">Applied Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm">
                {filteredApplications.map((app) => {
                  const candidate = app.candidate || {};
                  const job = app.job || {};
                  const isSelected = selectedAppIds.includes(app._id);
                  const currentStatus = app.status || "submitted";
                  const allowedTransitions = PERMITTED_TRANSITIONS[currentStatus] || [];
                  const fitScore = matchMap.get(app._id) ?? app.matchScore;

                  return (
                    <tr
                      key={app._id}
                      className={cn(
                        "hover:bg-ink-50/50 transition-colors",
                        isSelected && "bg-brand-50/30",
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(app._id)}
                          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>

                      {/* Candidate Column */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                            {initials(candidate.name || "Candidate")}
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedCandidateAppId(app._id)}
                              className="font-bold text-ink-950 hover:text-brand-600 truncate block text-left"
                            >
                              {candidate.name || "Candidate"}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-ink-500">
                              <span className="truncate">{candidate.headline || candidate.email}</span>
                              {candidate.location && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{candidate.location}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Job Column */}
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-ink-800">{job.title || "—"}</span>
                      </td>

                      {/* Stage Column */}
                      <td className="px-4 py-3.5">
                        <StatusPill status={currentStatus} />
                      </td>

                      {/* Fit Score */}
                      <td className="px-4 py-3.5">
                        {fitScore !== undefined && fitScore !== null ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
                              fitScore >= 80
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : fitScore >= 60
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-ink-100 text-ink-700",
                            )}
                          >
                            {fitScore}%
                          </span>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>

                      {/* Applied Date */}
                      <td className="px-4 py-3.5 text-xs text-ink-500">
                        {formatDate(app.appliedAt || app.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Resume Download */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadResume(app)}
                            disabled={downloadingResumeId === app._id}
                            title="Download Resume"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>

                          {/* Quick Stage Move Dropdown */}
                          {allowedTransitions.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleInitiateTransition(app, e.target.value);
                                }
                              }}
                              className="rounded border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 focus:outline-none"
                            >
                              <option value="">Move...</option>
                              {allowedTransitions.map((next) => (
                                <option key={next} value={next}>
                                  → {STAGE_LABELS[next] || next}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Candidate 360 Drawer Trigger */}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedCandidateAppId(app._id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>360 Profile</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Infinite Scroll / Load More */}
      {appsQuery.hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="secondary"
            onClick={() => appsQuery.fetchNextPage()}
            isLoading={appsQuery.isFetchingNextPage}
          >
            Load More Applicants
          </Button>
        </div>
      )}

      {/* Candidate 360 Drawer Component */}
      {selectedCandidateAppId && (
        <Candidate360Drawer
          applicationId={selectedCandidateAppId}
          orgId={orgId}
          onClose={() => setSelectedCandidateAppId(null)}
          onStatusChange={() => {
            appsQuery.refetch();
          }}
        />
      )}

      {/* Single Transition Confirmation Modal (for Hired / Rejected) */}
      {singleTransitionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-ink-100 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  singleTransitionModal.toStatus === "rejected"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-emerald-100 text-emerald-600",
                )}
              >
                {singleTransitionModal.toStatus === "rejected" ? (
                  <XCircle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-950">
                  Confirm Stage Move: {STAGE_LABELS[singleTransitionModal.toStatus]}
                </h3>
                <p className="mt-1 text-xs text-ink-500">
                  Moving candidate{" "}
                  <strong>{singleTransitionModal.app.candidate?.name || "Candidate"}</strong> to{" "}
                  <strong>{STAGE_LABELS[singleTransitionModal.toStatus]}</strong>.
                </p>
              </div>
            </div>

            {singleTransitionModal.toStatus === "rejected" && (
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Rejection Reason / Note (Optional)
                </label>
                <Textarea
                  rows={3}
                  value={singleTransitionModal.note}
                  onChange={(e) =>
                    setSingleTransitionModal((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="e.g. Candidate lacked required experience with distributed systems."
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSingleTransitionModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant={singleTransitionModal.toStatus === "rejected" ? "danger" : "primary"}
                size="sm"
                isLoading={transitionMutation.isPending}
                onClick={() =>
                  transitionMutation.mutate({
                    appId: singleTransitionModal.app._id,
                    toStatus: singleTransitionModal.toStatus,
                    note: singleTransitionModal.note,
                  })
                }
              >
                Confirm Move
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {bulkActionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-ink-100 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  bulkActionModal.action === "reject"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-brand-100 text-brand-600",
                )}
              >
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-950">
                  Bulk {STAGE_LABELS[bulkActionModal.action] || bulkActionModal.action} (
                  {selectedAppIds.length} Candidates)
                </h3>
                <p className="mt-1 text-xs text-ink-500">
                  You are about to move eligible candidates from your selection to the{" "}
                  <strong>{STAGE_LABELS[bulkActionModal.action] || bulkActionModal.action}</strong>{" "}
                  stage. Candidates with invalid transition states will be skipped safely.
                </p>
              </div>
            </div>

            {bulkActionModal.action === "reject" && (
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Rejection Reason / Note (Optional)
                </label>
                <Textarea
                  rows={3}
                  value={bulkActionModal.note}
                  onChange={(e) =>
                    setBulkActionModal((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Reason for rejecting selected applicants..."
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkActionModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant={bulkActionModal.action === "reject" ? "danger" : "primary"}
                size="sm"
                data-testid="bulk-confirm-btn"
                onClick={() =>
                  executeBulkAction(bulkActionModal.action, bulkActionModal.note)
                }
              >
                Execute Bulk Action
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
