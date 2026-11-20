// Admin Reports & Analytics Dashboard (Phase 4H)
// Authorised platform reports and CSV exports with formula-injection protection and financial mode separation.
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  BarChart3,
  Users,
  Building,
  Briefcase,
  Layers,
  Award,
  CreditCard,
  DollarSign,
  Sparkles,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "../../components/Product";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Kpi from "../../components/ui/Kpi";
import { EmptyState, SkeletonList } from "../../components/ui/States";
import { adminApi } from "../../lib/api";
import { downloadBlob, formatDateTime } from "../../lib/utils";
import * as toastModule from "../../components/ui/useToast";

const getSafeToast = () => {
  try {
    const fn = toastModule.useToast || toastModule.default;
    if (typeof fn === "function") return fn() || { success: () => {}, error: () => {} };
  } catch {
    // fallback
  }
  return { success: () => {}, error: () => {} };
};

// 8 Dedicated Report Categories for complete governance & analytics
const REPORT_CATEGORIES = [
  {
    category: "1. Users & Candidates",
    reports: [
      { id: "user_growth", label: "User Growth", icon: Users, desc: "New candidates vs recruiters" },
      { id: "candidate_registrations", label: "Candidate Registrations", icon: Users, desc: "Daily new candidate signups" },
    ],
  },
  {
    category: "2. Organizations & Verification",
    reports: [
      { id: "company_verification", label: "Company Verification", icon: Building, desc: "Organization audit & verification status" },
    ],
  },
  {
    category: "3. Jobs & Moderation",
    reports: [
      { id: "job_postings", label: "Job Postings", icon: Briefcase, desc: "Created and published requisitions" },
      { id: "job_moderation", label: "Job Moderation", icon: ShieldAlert, desc: "Moderation review outcomes & turnaround" },
    ],
  },
  {
    category: "4. Applications & Hiring",
    reports: [
      { id: "applications", label: "Applications", icon: Layers, desc: "Candidate submission records & stages" },
      { id: "hiring_pipeline", label: "Hiring Funnel", icon: Layers, desc: "Candidate distribution across hiring stages" },
    ],
  },
  {
    category: "5. Placements & Employment",
    reports: [
      { id: "employment_records", label: "Placements & Outcomes", icon: Award, desc: "Verified employment records & outcomes" },
    ],
  },
  {
    category: "6. Subscriptions & Revenue",
    reports: [
      { id: "subscriptions", label: "Active Subscriptions", icon: CreditCard, desc: "Subscriber plans and quota cycles" },
      { id: "revenue", label: "Cash Revenue (Daily)", icon: DollarSign, desc: "Gross captured, refunds, and net revenue" },
      { id: "payments", label: "Transaction Ledger", icon: CreditCard, desc: "Payment transactions & environment mode" },
    ],
  },
  {
    category: "7. AI Usage",
    reports: [
      { id: "ai_usage", label: "AI & Token Telemetry", icon: Sparkles, desc: "Model usage, tokens, and estimated cost" },
    ],
  },
  {
    category: "8. Security & Audit",
    reports: [
      { id: "security_events", label: "Security & Risk Signals", icon: ShieldAlert, desc: "Security anomalies and fraud detections" },
      { id: "platform_activity", label: "Audit Activity", icon: BarChart3, desc: "Platform operations by action domain" },
    ],
  },
];

const PRESETS = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "12m", label: "Last 12 Months" },
  { id: "custom", label: "Custom Range" },
];

export const AdminReports = () => {
  const toast = getSafeToast();

  const [selectedReport, setSelectedReport] = useState("user_growth");
  const [rangePreset, setRangePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [financialMode, setFinancialMode] = useState("all");
  const [search, setSearch] = useState("");

  const isFinancialReport = selectedReport === "revenue" || selectedReport === "payments";

  const reportParams = useMemo(() => {
    const p = { range: rangePreset };
    if (rangePreset === "custom") {
      if (customFrom) p.from = customFrom;
      if (customTo) p.to = customTo;
    }
    if (isFinancialReport && financialMode !== "all") {
      p.mode = financialMode;
    }
    return p;
  }, [rangePreset, customFrom, customTo, isFinancialReport, financialMode]);

  // Query report data
  const reportQuery = useQuery({
    queryKey: ["admin-report", selectedReport, reportParams],
    queryFn: () => adminApi.report(selectedReport, reportParams),
  });

  const reportData = reportQuery.data?.data;
  const columns = reportData?.columns || [];
  const rows = useMemo(() => reportData?.rows || [], [reportData?.rows]);

  // Filter rows locally if search is entered
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((val) => String(val || "").toLowerCase().includes(term))
    );
  }, [rows, search]);

  // Table pagination state
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = useMemo(() => {
    return filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // CSV Export Mutation
  const exportMutation = useMutation({
    mutationFn: () => adminApi.reportExportCsv(selectedReport, reportParams),
    onSuccess: (blob) => {
      const fromStr = reportData?.range?.from || "start";
      const toStr = reportData?.range?.to || "end";
      const filename = `hiresmart-${selectedReport}-${fromStr}-to-${toStr}.csv`;
      downloadBlob(blob, filename);
      toast.success(`Exported ${filename} successfully`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to export report CSV");
    },
  });

  // Calculate quick summary metrics for current report
  const summaryMetrics = useMemo(() => {
    const totalCount = rows.length;
    let primarySum = 0;
    if (selectedReport === "revenue") {
      const totalRow = rows.find((r) => r.date === "TOTAL");
      primarySum = totalRow?.netRevenue ?? rows.reduce((acc, r) => acc + (r.netRevenue || 0), 0);
    } else if (selectedReport === "payments") {
      primarySum = rows.reduce((acc, r) => acc + (r.amount || 0), 0);
    } else if (selectedReport === "user_growth") {
      primarySum = rows.reduce((acc, r) => acc + (r.total || 0), 0);
    } else if (selectedReport === "ai_usage") {
      primarySum = rows.reduce((acc, r) => acc + (r.runs || 0), 0);
    }
    return { totalCount, primarySum };
  }, [rows, selectedReport]);

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Platform Governance"
        title="Reports & Data Exports"
        description="Run official platform reports, analyze growth metrics across tenants, and export audit-ready CSV records."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => reportQuery.refetch()}
              loading={reportQuery.isFetching}
            >
              Refresh Data
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Download}
              onClick={() => exportMutation.mutate()}
              loading={exportMutation.isPending}
              disabled={rows.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Report Categories Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_CATEGORIES.map((cat) => (
          <div key={cat.category} className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
              {cat.category}
            </h3>
            <div className="space-y-1">
              {cat.reports.map((rep) => {
                const Icon = rep.icon;
                const isSelected = selectedReport === rep.id;
                return (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => {
                      setSelectedReport(rep.id);
                      setSearch("");
                      setPage(1);
                    }}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition ${
                      isSelected
                        ? "bg-brand-50 text-brand-700 font-bold"
                        : "text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-brand-600" : "text-ink-400"}`} />
                      <span className="truncate">{rep.label}</span>
                    </div>
                    {isSelected && <Badge tone="brand">Active</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* KPI & Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Report Name"
          value={reportData?.label || selectedReport}
          detail={`Timezone: ${reportData?.timezone || "Asia/Kolkata"}`}
          tone="ink"
          icon={FileSpreadsheet}
        />
        <Kpi
          label="Records in Range"
          value={summaryMetrics.totalCount}
          detail={`From ${reportData?.range?.from || "start"} to ${reportData?.range?.to || "end"}`}
          tone="brand"
          icon={BarChart3}
        />
        <Kpi
          label={
            selectedReport === "revenue"
              ? "Net Revenue (INR)"
              : selectedReport === "payments"
              ? "Captured Volume (INR)"
              : selectedReport === "user_growth"
              ? "New Registrations"
              : selectedReport === "ai_usage"
              ? "Total AI Runs"
              : "Report Status"
          }
          value={
            selectedReport === "revenue" || selectedReport === "payments"
              ? `₹${summaryMetrics.primarySum.toLocaleString("en-IN")}`
              : selectedReport === "user_growth" || selectedReport === "ai_usage"
              ? summaryMetrics.primarySum.toLocaleString()
              : "Ready"
          }
          detail={
            isFinancialReport && financialMode !== "all"
              ? `Filtered by: ${financialMode.toUpperCase()} mode`
              : "Audit-certified data"
          }
          tone="success"
          icon={selectedReport === "revenue" ? DollarSign : Award}
        />
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-100 bg-white p-4">
        {/* Preset Range Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Calendar className="h-4 w-4 text-ink-400 mr-1" />
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setRangePreset(p.id);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                rangePreset === p.id
                  ? "bg-ink-950 text-white"
                  : "bg-ink-50 text-ink-600 hover:bg-ink-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers if 'custom' selected */}
        {rangePreset === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-ink-500 font-medium">From:</label>
            <input
              type="date"
              className="rounded-lg border border-ink-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPage(1);
              }}
            />
            <label className="text-ink-500 font-medium">To:</label>
            <input
              type="date"
              className="rounded-lg border border-ink-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        )}

        {/* Financial Test / Live Toggle for Financial Reports */}
        {isFinancialReport && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-500 font-medium">Environment:</span>
            <div className="inline-flex rounded-lg border border-ink-200 p-0.5 bg-ink-50">
              {["all", "test", "live"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setFinancialMode(m);
                    setPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 font-semibold uppercase text-[11px] transition ${
                    financialMode === m ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Local Search Input */}
        <div className="relative">
          <input
            type="search"
            aria-label="Filter current report rows"
            placeholder="Search within report…"
            className="w-48 sm:w-64 rounded-lg border border-ink-200 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Report Data Table */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink-900">
              {reportData?.label || selectedReport}
            </h2>
            <Badge tone="neutral">
              Showing {filteredRows.length} of {rows.length} rows
            </Badge>
          </div>
          <div className="text-xs text-ink-400">
            Generated {reportData?.generatedAt ? formatDateTime(reportData.generatedAt) : "just now"}
          </div>
        </div>

        {reportQuery.isLoading ? (
          <SkeletonList />
        ) : reportQuery.isError ? (
          <div className="rounded-xl border border-danger-100 bg-danger-50 p-6 text-center text-xs text-danger-700">
            Failed to load report data: {reportQuery.error?.message || "Internal server error"}
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No records found in selected range"
            description="Adjust the date range presets or filters to view historical platform activity."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 font-semibold text-ink-700">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pagedRows.map((row, idx) => {
                  const isTotalRow = row.date === "TOTAL";
                  return (
                    <tr
                      key={idx}
                      className={
                        isTotalRow
                          ? "bg-ink-100/70 font-bold text-ink-950"
                          : "hover:bg-ink-50/60 transition-colors"
                      }
                    >
                      {columns.map((col) => {
                        const val = row[col.key];
                        const isNumber = typeof val === "number";
                        const isDate = (col.key.endsWith("At") || col.key.endsWith("_at")) && typeof val === "string";

                        return (
                          <td key={col.key} className="px-4 py-2.5 text-ink-800 font-mono text-[11px]">
                            {val === null || val === undefined || val === "" ? (
                              <span className="text-ink-300">—</span>
                            ) : typeof val === "boolean" ? (
                              <Badge tone={val ? "success" : "neutral"}>
                                {val ? "YES" : "NO"}
                              </Badge>
                            ) : col.key === "mode" ? (
                              <Badge tone={val === "live" ? "success" : val === "test" ? "brand" : "neutral"}>
                                {String(val).toUpperCase()}
                              </Badge>
                            ) : col.key === "status" || col.key === "moderationStatus" || col.key === "verificationStatus" ? (
                              <Badge
                                tone={
                                  val === "active" || val === "verified" || val === "approved" || val === "captured"
                                    ? "success"
                                    : val === "pending" || val === "under_review" || val === "open"
                                    ? "warning"
                                    : val === "rejected" || val === "failed" || val === "suspended"
                                    ? "danger"
                                    : "neutral"
                                }
                              >
                                {String(val)}
                              </Badge>
                            ) : isNumber ? (
                              val.toLocaleString()
                            ) : isDate ? (
                              formatDateTime(val)
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredRows.length > pageSize && (
          <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-600">
            <div>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of{" "}
              {filteredRows.length} rows (Page {page} of {totalPages})
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReports;
