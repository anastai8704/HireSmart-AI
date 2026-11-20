// Admin Fraud & Risk Management Dashboard (Phase 4G)
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  RefreshCw,
  Eye,
  Building,
  User,
  ExternalLink,
  MessageSquare,
  Flag,
  FileCheck,
} from "lucide-react";
import Kpi from "../../components/ui/Kpi";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import * as toastModule from "../../components/ui/useToast";
import { adminApi } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";

const getSafeToast = () => {
  try {
    const fn = toastModule.useToast || toastModule.default;
    if (typeof fn === "function") return fn() || { success: () => {}, error: () => {} };
  } catch {
    // fallback
  }
  return { success: () => {}, error: () => {} };
};

const SEVERITY_TONES = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "brand",
  info: "neutral",
};

const STATUS_TONES = {
  open: "warning",
  investigating: "brand",
  resolved: "success",
  dismissed: "neutral",
};

export const AdminSecurity = () => {
  const queryClient = useQueryClient();

  // Tab: "security" or "audit"
  const [tab, setTab] = useState("security");

  // Security filters
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  // Selected event for investigation modal
  const [selectedEventId, setSelectedEventId] = useState(null);

  // 1. Overview Metrics Query
  const overviewQuery = useQuery({
    queryKey: ["admin-security-overview"],
    queryFn: () => (typeof adminApi.securityOverview === "function" ? adminApi.securityOverview() : Promise.resolve({ data: {} })),
  });

  const overview = overviewQuery.data?.data || {};
  const metrics = overview.metrics || {};

  // 2. Security Events Query
  const eventsParams = useMemo(
    () => ({
      ...(search.trim() ? { search: search.trim(), q: search.trim() } : {}),
      severity: severityFilter,
      status: statusFilter,
      sort,
      page,
      limit: 20,
    }),
    [search, severityFilter, statusFilter, sort, page],
  );

  const eventsQuery = useQuery({
    queryKey: ["admin-security-events", eventsParams],
    queryFn: () => (typeof adminApi.securityEvents === "function" ? adminApi.securityEvents(eventsParams) : adminApi.security(eventsParams)),
    enabled: tab === "security",
  });

  // 3. Audit Log Query (for audit tab)
  const auditQuery = useQuery({
    queryKey: ["admin-audit-log", search],
    queryFn: () => adminApi.audit({ search: search.trim() || undefined, limit: 50 }),
    enabled: tab === "audit",
  });

  const eventsData = eventsQuery.data?.data || [];
  const eventsMeta = eventsQuery.data?.meta || { page: 1, pages: 1, total: 0, counts: {} };
  const counts = eventsMeta.counts || {};

  const auditData = auditQuery.data?.data || [];

  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Security & Governance"
        title="Security & Audit"
        description="Monitor platform security incidents, fraud risk signals, credential misuse, fake job detection, and tenant investigations."
        action={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                overviewQuery.refetch();
                if (tab === "security") eventsQuery.refetch();
                else auditQuery.refetch();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 shadow-sm hover:bg-ink-50"
            >
              <RefreshCw className="h-3.5 w-3.5 text-ink-500" />
              Refresh Events
            </button>
          </div>
        }
      />

      {/* Top Security & Risk Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total Security Events"
          value={metrics.totalEvents ?? counts.total ?? 0}
          detail="All logged security incidents"
          tone="ink"
          icon={ShieldAlert}
        />
        <Kpi
          label="High-Risk & Critical"
          value={metrics.highRiskEvents ?? (counts.critical || 0) + (counts.high || 0)}
          detail={`${counts.critical ?? 0} Critical · ${counts.high ?? 0} High`}
          tone="danger"
          icon={AlertTriangle}
        />
        <Kpi
          label="Open Investigations"
          value={metrics.openInvestigations ?? counts.open ?? 0}
          detail="Pending admin review or action"
          tone="brand"
          icon={Clock}
        />
        <Kpi
          label="Resolved Cases"
          value={metrics.resolvedInvestigations ?? counts.resolved ?? 0}
          detail="Dismissed or resolved incidents"
          tone="success"
          icon={CheckCircle}
        />
      </div>

      {/* Tenant Risk & Anomaly Signals Strip */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500">Flagged Users</span>
            <User className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{metrics.flaggedUsers ?? 0}</div>
          <p className="mt-1 text-[11px] text-ink-400">Suspicious recruiter or candidate accounts</p>
        </div>

        <div className="rounded-xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500">Suspicious Organizations</span>
            <Building className="h-4 w-4 text-danger-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-danger-900">{metrics.suspiciousOrganizations ?? 0}</div>
          <p className="mt-1 text-[11px] text-danger-700">High risk score (&gt;25) or suspended companies</p>
        </div>

        <div className="rounded-xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500">Job Risk Alerts</span>
            <FileCheck className="h-4 w-4 text-brand-600" />
          </div>
          <div className="mt-1 text-2xl font-bold text-ink-900">{metrics.jobRiskAlerts ?? 0}</div>
          <p className="mt-1 text-[11px] text-ink-400">Rejected moderation or payment keyword hits</p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex gap-2 border-b border-ink-100 pb-2">
        <button
          type="button"
          onClick={() => setTab("security")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            tab === "security" ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
          }`}
        >
          Security Events
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            tab === "audit" ? "bg-ink-950 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
          }`}
        >
          Audit Log
        </button>
      </div>

      {/* Security Events View */}
      {tab === "security" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="search"
                aria-label="Search security events"
                placeholder="Search event type, user, organization, or ID…"
                className="w-full rounded-lg border border-ink-200 pl-9 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              />
            </div>

            <label className="flex flex-col text-xs font-semibold text-ink-600">
              Severity
              <select
                aria-label="Filter by severity"
                className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
                value={severityFilter}
                onChange={(e) => handleFilterChange(setSeverityFilter, e.target.value)}
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </label>

            <label className="flex flex-col text-xs font-semibold text-ink-600">
              Investigation Status
              <select
                aria-label="Filter by status"
                className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
                value={statusFilter}
                onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </label>

            <label className="flex flex-col text-xs font-semibold text-ink-600">
              Sort
              <select
                aria-label="Sort events"
                className="mt-1 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-900"
                value={sort}
                onChange={(e) => handleFilterChange(setSort, e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="severity">Highest severity</option>
              </select>
            </label>
          </div>

          {/* Events Table */}
          {eventsQuery.isLoading && <LoadingState message="Loading security events…" />}
          {eventsQuery.isError && (
            <ErrorState error={eventsQuery.error} onRetry={() => eventsQuery.refetch()} />
          )}

          {eventsQuery.isSuccess && eventsData.length === 0 && (
            <EmptyState
              title="No security events match this view"
              description="No security incidents found for the selected criteria."
            />
          )}

          {eventsQuery.isSuccess && eventsData.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label="Security events list">
                  <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">Event Type</th>
                      <th scope="col" className="px-6 py-3.5">Severity</th>
                      <th scope="col" className="px-6 py-3.5">User / Candidate</th>
                      <th scope="col" className="px-6 py-3.5">Organization</th>
                      <th scope="col" className="px-6 py-3.5">Status</th>
                      <th scope="col" className="px-6 py-3.5">Timestamp</th>
                      <th scope="col" className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 text-ink-800">
                    {eventsData.map((ev) => (
                      <tr key={ev.id || ev._id} className="hover:bg-ink-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-mono text-xs font-bold text-ink-900">{ev.type}</div>
                          {ev.ipHashPreview && (
                            <div className="text-[10px] text-ink-400 font-mono">IP: {ev.ipHashPreview}</div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <Badge tone={SEVERITY_TONES[ev.severity] || "neutral"}>
                            {ev.severity?.toUpperCase()}
                          </Badge>
                        </td>

                        <td className="px-6 py-4 text-xs">
                          {ev.user ? (
                            <div>
                              <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                                {ev.user.name}
                                {ev.user.isFlagged && (
                                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded font-bold">
                                    Flagged
                                  </span>
                                )}
                              </div>
                              <div className="text-ink-400">{ev.user.email}</div>
                            </div>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-xs">
                          {ev.organization ? (
                            <div>
                              <div className="font-semibold text-ink-900">{ev.organization.name}</div>
                              {ev.organization.riskScore > 0 && (
                                <div className="text-[11px] text-amber-700">
                                  Risk Score: {ev.organization.riskScore}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <Badge tone={STATUS_TONES[ev.status] || "neutral"}>
                            {ev.status?.replace("_", " ")}
                          </Badge>
                          {ev.investigationNotesCount > 0 && (
                            <div className="mt-1 text-[11px] text-ink-500 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {ev.investigationNotesCount} notes
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-xs text-ink-500 whitespace-nowrap">
                          {formatDateTime(ev.createdAt)}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Eye}
                            onClick={() => setSelectedEventId(ev.id || ev._id)}
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 text-xs text-ink-600">
                <div>
                  Page {eventsMeta.page} of {eventsMeta.pages} · {eventsMeta.total} events
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={eventsMeta.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={eventsMeta.page >= eventsMeta.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit Log View (Maintained for complete compatibility) */}
      {tab === "audit" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <input
              type="search"
              aria-label="Search audit logs"
              placeholder="Filter audit actions..."
              className="w-full sm:max-w-xs rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {auditQuery.isLoading ? (
            <SkeletonList />
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label="Audit log records">
                  <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Event / Action</th>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Organization</th>
                      <th className="px-5 py-3">Outcome / Severity</th>
                      <th className="px-5 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 text-ink-800">
                    {auditData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-ink-400">
                          No audit records found.
                        </td>
                      </tr>
                    ) : (
                      auditData.map((row) => (
                        <tr key={row._id} className="hover:bg-ink-50/60">
                          <td className="px-5 py-4 font-mono text-xs font-semibold">{row.action || row.type}</td>
                          <td className="px-5 py-4 text-xs">{row.actor?.name || row.user?.name || "System"}</td>
                          <td className="px-5 py-4 text-xs">{row.organization?.name || "—"}</td>
                          <td className="px-5 py-4">
                            <Badge tone={row.outcome === "failure" ? "danger" : "brand"}>
                              {row.outcome || "success"}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-xs text-ink-500">{formatDateTime(row.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Event Investigation Modal */}
      {selectedEventId && (
        <SecurityEventDetailModal
          eventId={selectedEventId}
          onClose={() => setSelectedEventId(null)}
          onEventUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-security-events"] });
            queryClient.invalidateQueries({ queryKey: ["admin-security-overview"] });
          }}
        />
      )}
    </div>
  );
};

/**
 * Detailed Security Incident Investigation Modal
 */
const SecurityEventDetailModal = ({ eventId, onClose, onEventUpdated }) => {
  const toast = getSafeToast();
  const queryClient = useQueryClient();

  const [newNote, setNewNote] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolutionChoice, setResolutionChoice] = useState("resolved");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [showFlagForm, setShowFlagForm] = useState(false);

  const query = useQuery({
    queryKey: ["admin-security-event-detail", eventId],
    queryFn: () => adminApi.securityEventDetails(eventId),
    enabled: Boolean(eventId),
  });

  const noteMutation = useMutation({
    mutationFn: (note) => adminApi.addSecurityEventNote(eventId, { note }),
    onSuccess: () => {
      toast.success("Investigation note recorded");
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-security-event-detail", eventId] });
      onEventUpdated?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record note");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (body) => adminApi.resolveSecurityEvent(eventId, body),
    onSuccess: (res) => {
      toast.success(res.message || "Security event status updated");
      setShowResolveForm(false);
      queryClient.invalidateQueries({ queryKey: ["admin-security-event-detail", eventId] });
      onEventUpdated?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to resolve event");
    },
  });

  const flagMutation = useMutation({
    mutationFn: (body) => adminApi.flagSecurityEntity(eventId, body),
    onSuccess: (res) => {
      toast.success(res.message || "Target entity flagged for review");
      setShowFlagForm(false);
      setFlagReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-security-event-detail", eventId] });
      onEventUpdated?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to flag entity");
    },
  });

  const data = query.data?.data;
  const ev = data?.event;
  const relatedHistory = data?.relatedHistory || [];
  const riskSignals = data?.riskSignals || [];
  const auditTrail = data?.auditTrail || [];

  const handleAddNote = (e) => {
    e.preventDefault();
    if (!newNote || newNote.trim().length < 3) {
      toast.error("Please enter a note of at least 3 characters");
      return;
    }
    noteMutation.mutate(newNote.trim());
  };

  const handleResolveSubmit = (e) => {
    e.preventDefault();
    if (!resolutionReason || resolutionReason.trim().length < 3) {
      toast.error("Please provide a valid resolution reason of at least 3 characters");
      return;
    }
    resolveMutation.mutate({ resolution: resolutionChoice, reason: resolutionReason.trim() });
  };

  const handleFlagSubmit = (targetType) => {
    if (!flagReason || flagReason.trim().length < 3) {
      toast.error("Please specify a reason for flagging");
      return;
    }
    flagMutation.mutate({ targetType, reason: flagReason.trim() });
  };

  return (
    <Modal
      open={Boolean(eventId)}
      onClose={onClose}
      title="Security Event Investigation"
      size="xl"
    >
      {query.isLoading && <LoadingState message="Loading event details & risk signals…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {query.isSuccess && ev && (
        <div className="space-y-6">
          {/* Incident Banner */}
          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono uppercase text-ink-500">Security Incident</span>
                <h3 className="text-lg font-bold font-mono text-ink-900">{ev.type}</h3>
                <p className="text-xs text-ink-500">Recorded: {formatDateTime(ev.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={SEVERITY_TONES[ev.severity] || "neutral"}>
                  {ev.severity?.toUpperCase()}
                </Badge>
                <Badge tone={STATUS_TONES[ev.status] || "neutral"}>
                  {ev.status?.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Involved Entities */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* User Account */}
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-500 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Associated User
                </span>
                {ev.user && (
                  <Link
                    to={`/app/admin/users?q=${encodeURIComponent(ev.user.email)}`}
                    className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
                  >
                    View User <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {ev.user ? (
                <div>
                  <div className="font-semibold text-ink-900 flex items-center gap-2">
                    {ev.user.name}
                    {ev.user.isFlagged && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded font-bold">
                        Flagged
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500">{ev.user.email}</div>
                  <div className="mt-1 text-[11px] text-ink-400 capitalize">Role: {ev.user.role}</div>
                </div>
              ) : (
                <div className="text-xs text-ink-400">No specific user associated with this event.</div>
              )}
            </div>

            {/* Organization Account */}
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-500 flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" /> Associated Organization
                </span>
                {ev.organization && (
                  <Link
                    to={`/app/admin/organizations/${ev.organization.id}`}
                    className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1"
                  >
                    View Org <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {ev.organization ? (
                <div>
                  <div className="font-semibold text-ink-900">{ev.organization.name}</div>
                  <div className="text-xs text-ink-500">{ev.organization.businessEmail || "No business email"}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="text-ink-500 capitalize">Status: {ev.organization.verificationStatus}</span>
                    {ev.organization.riskScore > 0 && (
                      <span className="text-amber-700 font-semibold bg-amber-50 px-1 py-0.5 rounded">
                        Risk Score: {ev.organization.riskScore}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-400">No organization linked.</div>
              )}
            </div>
          </div>

          {/* Technical Evidence & Masked Diagnostics */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Technical Evidence</h4>
            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="rounded bg-ink-50 p-2.5">
                <div className="text-ink-500">Request ID</div>
                <div className="font-mono text-ink-900">{ev.requestId || "—"}</div>
              </div>
              <div className="rounded bg-ink-50 p-2.5">
                <div className="text-ink-500">Client IP (Hashed &amp; Masked)</div>
                <div className="font-mono text-ink-900">{ev.ipHashPreview || "—"}</div>
              </div>
            </div>

            {/* Details JSON */}
            {ev.details && Object.keys(ev.details).length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-ink-600 mb-1">Payload Details:</div>
                <pre className="rounded-lg bg-ink-900 p-3 text-xs text-ink-100 font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(ev.details, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Real Detected Fraud & Risk Signals */}
          {riskSignals.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Detected Fraud &amp; Risk Signals ({riskSignals.length})
              </div>
              <div className="space-y-2">
                {riskSignals.map((sig, i) => (
                  <div key={i} className="rounded-lg bg-white border border-amber-200 p-2.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-amber-950">
                      <span>{sig.code || sig.type || "RISK_SIGNAL"}</span>
                      <Badge tone={SEVERITY_TONES[sig.severity] || "warning"}>
                        {sig.severity || "medium"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-ink-600">{sig.message || sig.explanation || JSON.stringify(sig)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historical Incidents for Same Tenant */}
          {relatedHistory.length > 0 && (
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                Related Historical Incidents ({relatedHistory.length})
              </h4>
              <div className="space-y-2">
                {relatedHistory.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded bg-ink-50 p-2 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-ink-900">{h.type}</span>
                      <span className="ml-2 text-ink-400">{formatDateTime(h.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONES[h.severity] || "neutral"}>{h.severity}</Badge>
                      <Badge tone={STATUS_TONES[h.status] || "neutral"}>{h.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Investigation Notes Trail */}
          <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wider">
              Investigation Notes ({ev.investigationNotes?.length || 0})
            </h4>

            {ev.investigationNotes?.length > 0 ? (
              <div className="space-y-2">
                {ev.investigationNotes.map((n, i) => (
                  <div key={i} className="rounded-lg bg-ink-50 p-2.5 text-xs">
                    <p className="text-ink-900 font-medium">{n.note}</p>
                    <div className="mt-1 text-[11px] text-ink-400">
                      By {n.authorName || "Platform Admin"} · {formatDateTime(n.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400">No notes recorded yet.</p>
            )}

            {/* Add Note Form */}
            <form onSubmit={handleAddNote} className="pt-2 flex gap-2">
              <input
                type="text"
                placeholder="Add investigation observation or note…"
                className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <Button size="sm" type="submit" loading={noteMutation.isPending}>
                Add Note
              </Button>
            </form>
          </div>

          {/* Audit Trail */}
          {auditTrail.length > 0 && (
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">
                Audit Trail ({auditTrail.length})
              </h4>
              <div className="space-y-1.5">
                {auditTrail.map((a) => (
                  <div key={a.id} className="text-xs text-ink-600 flex items-center justify-between py-1 border-b border-ink-50">
                    <span>{a.action}</span>
                    <span className="text-ink-400">{formatDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions Bar */}
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {ev.status !== "resolved" && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setShowResolveForm(!showResolveForm)}
                  >
                    {showResolveForm ? "Close Resolution" : "Resolve / Dismiss Event"}
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  icon={Flag}
                  onClick={() => setShowFlagForm(!showFlagForm)}
                >
                  {showFlagForm ? "Close Flagging" : "Flag For Elevated Review"}
                </Button>
              </div>

              {ev.status === "resolved" && (
                <div className="text-xs text-success-800 font-medium flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-success-600" />
                  Resolved on {formatDateTime(ev.resolvedAt)}: {ev.resolutionReason}
                </div>
              )}
            </div>

            {/* Resolve Form */}
            {showResolveForm && (
              <form onSubmit={handleResolveSubmit} className="space-y-3 pt-3 border-t border-ink-200">
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="resolutionChoice"
                      value="resolved"
                      checked={resolutionChoice === "resolved"}
                      onChange={() => setResolutionChoice("resolved")}
                    />
                    Mark as Resolved (Incident mitigated)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="resolutionChoice"
                      value="dismissed"
                      checked={resolutionChoice === "dismissed"}
                      onChange={() => setResolutionChoice("dismissed")}
                    />
                    Dismiss (False positive / benign)
                  </label>
                </div>

                <textarea
                  required
                  rows={2}
                  placeholder="Enter detailed reason for closing or resolving this security event…"
                  className="w-full rounded-lg border border-ink-300 p-2 text-xs focus:border-brand-500 focus:outline-none"
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                />

                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => setShowResolveForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" type="submit" loading={resolveMutation.isPending}>
                    Confirm Resolution
                  </Button>
                </div>
              </form>
            )}

            {/* Flag Form */}
            {showFlagForm && (
              <div className="space-y-3 pt-3 border-t border-ink-200">
                <p className="text-xs text-ink-600">
                  Elevate security review for accounts linked to this incident. Requires mandatory justification.
                </p>

                <textarea
                  required
                  rows={2}
                  placeholder="Justification for flagging (e.g. repeated anomalous login behavior, fraudulent posting)…"
                  className="w-full rounded-lg border border-ink-300 p-2 text-xs focus:border-brand-500 focus:outline-none"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                />

                <div className="flex justify-end gap-2">
                  {ev.user && (
                    <Button
                      size="sm"
                      variant="danger"
                      type="button"
                      loading={flagMutation.isPending}
                      onClick={() => handleFlagSubmit("user")}
                    >
                      Flag User Account
                    </Button>
                  )}
                  {ev.organization && (
                    <Button
                      size="sm"
                      variant="danger"
                      type="button"
                      loading={flagMutation.isPending}
                      onClick={() => handleFlagSubmit("organization")}
                    >
                      Flag Organization
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AdminSecurity;
