// Range-aware admin analytics (Phase 5): KPI cards with drill-downs, charts with data tables.
// All numbers come from /admin/analytics/overview. Nothing is computed from raw records in the browser.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Kpi from "../../components/ui/Kpi";
import { EmptyState } from "../../components/ui/States";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { RANGE_PRESETS } from "../../lib/analyticsRange";
import { SearchableSelect } from "../../components/ui/SearchableSelect";

const fmtInt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN"));
const fmtInr = (n) =>
  n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n}%`);
const shortDate = (d) => {
  const [, m, day] = String(d).split("-");
  return m && day ? `${day}/${m}` : d;
};

const PERIOD_NOTE = {
  range: "In selected dates",
  as_of_now: "Current total",
  all_time: "All time",
};

const KPI_SECTIONS = [
  {
    title: "People and companies",
    cards: [
      { key: "candidatesTotal", label: "Registered candidates", fmt: fmtInt, sub: (k) => `${fmtInt(k.candidatesNew)} new in range`, to: "/app/admin/users" },
      { key: "recruitersTotal", label: "Registered recruiters", fmt: fmtInt, sub: (k) => `${fmtInt(k.recruitersNew)} new in range`, to: "/app/admin/users" },
      { key: "companiesTotal", label: "Total companies", fmt: fmtInt, to: "/app/admin/organizations" },
      { key: "companiesVerified", label: "Verified companies", fmt: fmtInt, to: "/app/admin/organizations" },
      { key: "companiesAwaitingVerification", label: "Awaiting verification", fmt: fmtInt, to: "/app/admin/verification" },
      { key: "fraudReviewQueue", label: "Fraud-risk review queue", fmt: fmtInt, to: "/app/admin/verification" },
      { key: "suspendedAccounts", label: "Suspended accounts", fmt: fmtInt, to: "/app/admin/users" },
    ],
  },
  {
    title: "Jobs",
    cards: [
      { key: "activeJobs", label: "Active job listings", fmt: fmtInt, to: "/app/admin/moderation" },
      { key: "pendingJobApprovals", label: "Pending job approvals", fmt: fmtInt, to: "/app/admin/moderation" },
      { key: "jobPostings", label: "Job postings in range", fmt: fmtInt, to: "/app/admin/moderation" },
    ],
  },
  {
    title: "Hiring",
    cards: [
      { key: "applications", label: "Applications", fmt: fmtInt },
      { key: "interviewsScheduled", label: "Interviews created", fmt: fmtInt },
      { key: "offersIssued", label: "Offers issued", fmt: fmtInt },
      { key: "candidatesHired", label: "Candidates marked hired", fmt: fmtInt },
      { key: "confirmedEmployment", label: "Confirmed employment", fmt: fmtInt, sub: () => "Platform-verified only" },
      { key: "verifiedPlacements", label: "Verified placements", fmt: fmtInt, sub: () => "Platform-verified, current total", to: "/app/admin/placements" },
      { key: "upcomingInterviews", label: "Upcoming interviews", fmt: fmtInt, sub: () => "Scheduled from now" },
      { key: "hiringConversion", label: "Hiring conversion", fmt: fmtPct, sub: () => "Hired ÷ eligible applications" },
    ],
  },
  {
    title: "Payments and subscriptions",
    cards: [
      { key: "activePaidSubscriptions", label: "Active paid subscriptions", fmt: fmtInt, to: "/app/admin/subscriptions" },
      { key: "subscriptionConversion", label: "Subscription conversion", fmt: fmtPct, sub: () => "Paid organizations ÷ companies", to: "/app/admin/subscriptions" },
      { key: "successfulPayments", label: "Successful payments", fmt: fmtInt, to: "/app/admin/revenue" },
      { key: "testRevenue", label: "Net revenue, test mode", fmt: fmtInr, sub: () => "Razorpay test payments", to: "/app/admin/revenue" },
      { key: "liveRevenue", label: "Net revenue, live", fmt: fmtInr, sub: () => "Not offered in this release", to: "/app/admin/revenue" },
      { key: "revenue", label: "Net revenue, all modes (INR)", fmt: fmtInr, sub: () => "Captured less refunds", to: "/app/admin/revenue" },
      { key: "refunds", label: "Refunds", fmt: fmtInt, to: "/app/admin/revenue" },
      { key: "failedPayments", label: "Failed payments", fmt: fmtInt, to: "/app/admin/revenue" },
    ],
  },
];

const KpiCard = ({ card, kpis, definitions }) => {
  const def = definitions?.[card.key];
  const value = card.fmt(kpis[card.key]);
  const detail = card.sub ? card.sub(kpis) : PERIOD_NOTE[def?.period] || "";
  const body = (
    <Kpi label={card.label} value={value} detail={detail} tone={card.to ? "brand" : "ink"} className="h-full" />
  );
  return (
    <div title={def?.definition || undefined} data-testid={`kpi-${card.key}`}>
      {card.to ? (
        <Link to={card.to} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500" aria-label={`${card.label}: ${value}. View records`}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
};

const ChartCard = ({ title, rows, valueKey = "value", labelKey = "label", color = "#4f46e5", height = 220, layout = "horizontal", emptyText = "No activity in this range.", to, toLabel = "Open records" }) => {
  const total = rows.reduce((acc, r) => acc + (Number(r[valueKey]) || 0), 0);
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        {to && (
          <Link to={to} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">
            {toLabel} →
          </Link>
        )}
      </div>
      {total === 0 ? (
        <EmptyState title="No data" description={emptyText} />
      ) : (
        <>
          <div style={{ width: "100%", height }} role="img" aria-label={`${title}: total ${fmtInt(total)}`}>
            <ResponsiveContainer>
              <BarChart data={rows} layout={layout === "vertical" ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                {layout === "vertical" ? (
                  <>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey={labelKey} width={120} tick={{ fontSize: 11 }} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  </>
                )}
                <Tooltip />
                <Bar dataKey={valueKey} fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs text-ink-500">
            <summary className="cursor-pointer">View data table</summary>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr>
                  <th className="pr-4 font-semibold">{labelKey === "date" ? "Day (IST)" : "Category"}</th>
                  <th className="font-semibold">Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r[labelKey]}>
                    <td className="pr-4">{r[labelKey]}</td>
                    <td>{fmtInt(r[valueKey])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
};

const RevenueChart = ({ gross = [], refunds = [] }) => {
  const rows = gross.map((g, i) => ({
    date: shortDate(g.date),
    gross: Number(g.amount) || 0,
    refunds: Number(refunds[i]?.amount) || 0,
  }));
  const total = rows.reduce((acc, r) => acc + r.gross + r.refunds, 0);
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-4" aria-label="Revenue trend">
      <h3 className="text-sm font-bold text-ink-900">Revenue trend (INR)</h3>
      {total === 0 ? (
        <EmptyState title="No revenue in this range" description="Only captured payments and processed refunds are shown." />
      ) : (
        <div style={{ width: "100%", height: 220 }} role="img" aria-label="Captured payments and refunds per day, INR">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtInr(v)} />
              <Legend />
              <Bar dataKey="gross" name="Captured" fill="#16a34a" />
              <Bar dataKey="refunds" name="Refunds" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};

const HiringOutcomesPie = ({ rows }) => {
  const data = rows.filter((r) => r.count > 0);
  const colors = ["#16a34a", "#dc2626", "#9ca3af"];
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-4" aria-label="Hiring outcomes">
      <h3 className="text-sm font-bold text-ink-900">Hiring outcomes (applications in range)</h3>
      {data.length === 0 ? (
        <EmptyState title="No outcomes yet" description="Outcomes appear once applications in this range reach a decision." />
      ) : (
        <>
          <div style={{ width: "100%", height: 220 }} role="img" aria-label={`Hiring outcomes: ${data.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="label" outerRadius={80}>
                  {data.map((d, i) => (
                    <Cell key={d.key} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-xs text-ink-500">
            <summary className="cursor-pointer">View data table</summary>
            <ul className="mt-2 space-y-1">
              {data.map((d) => (
                <li key={d.key}>
                  {d.label}: {fmtInt(d.count)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
};

// Platform reports that can be exported as CSV. Labels match the server report catalogue (services/reportService.js).
const EXPORT_REPORTS = [
  { value: "revenue", label: "Revenue (daily, cash basis)" },
  { value: "candidate_registrations", label: "Candidate registrations (daily)" },
  { value: "company_verification", label: "Company verification" },
  { value: "job_moderation", label: "Job moderation" },
  { value: "job_postings", label: "Job postings" },
  { value: "applications", label: "Applications" },
  { value: "hiring_pipeline", label: "Hiring pipeline" },
  { value: "employment_records", label: "Employment records" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "payments", label: "Payments" },
  { value: "platform_activity", label: "Platform activity (daily)" },
];

export const AdminAnalyticsPanel = ({ analytics, range, onRangeChange, customError, onExportReport }) => {
  const [exportType, setExportType] = useState("revenue");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const kpis = analytics?.kpis || {};
  const series = analytics?.series || {};
  const breakdowns = analytics?.breakdowns || {};
  const definitions = analytics?.definitions || {};
  const preset = range?.preset || "30d";

  return (
    <section className="space-y-6" aria-label="Analytics">
      {onExportReport && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-ink-100 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink-800">
            Report
            <SearchableSelect
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
            >
              {EXPORT_REPORTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SearchableSelect>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              setExportError("");
              try {
                await onExportReport(exportType);
              } catch (error) {
                setExportError(error?.response?.data?.error?.message || "Export failed. Narrow the date range and try again.");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          {exportError && <p role="alert" className="w-full text-sm text-red-700">{exportError}</p>}
        </div>
      )}
      <div className="flex flex-col gap-3 rounded-xl border border-ink-100 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={preset === p.value ? "primary" : "outline"}
              aria-pressed={preset === p.value}
              onClick={() => onRangeChange({ ...range, preset: p.value })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="From (IST)"
              type="date"
              value={range.from || ""}
              onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
            />
            <Input
              label="To (IST)"
              type="date"
              value={range.to || ""}
              onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
            />
          </div>
        )}
        <p className="text-xs text-ink-500">
          {analytics?.range
            ? `${analytics.range.from} to ${analytics.range.to} (${analytics.range.days} days, ${analytics.range.timezone}). Totals marked “current” do not depend on the dates.`
            : "Dates are Indian Standard Time (Asia/Kolkata)."}
        </p>
      </div>
      {customError && <p role="alert" className="text-sm text-danger-600">{customError}</p>}

      {KPI_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">{section.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.cards.map((card) => (
              <KpiCard key={card.key} card={card} kpis={kpis} definitions={definitions} />
            ))}
          </div>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Candidate registrations over time" to="/app/admin/users" rows={(series.candidateRegistrations || []).map((p) => ({ date: shortDate(p.date), count: p.count }))} labelKey="date" valueKey="count" />
        <ChartCard title="Job posting trends" to="/app/admin/moderation" rows={(series.jobPostings || []).map((p) => ({ date: shortDate(p.date), count: p.count }))} labelKey="date" valueKey="count" color="#0ea5e9" />
        <ChartCard title="Application funnel (candidates reaching each stage)" rows={(breakdowns.funnel || []).map((s) => ({ label: s.stage, count: s.count }))} labelKey="label" valueKey="count" layout="vertical" color="#7c3aed" />
        <ChartCard title="Recruitment stage distribution (current)" rows={(breakdowns.stageDistribution || []).map((s) => ({ label: s.label, count: s.count }))} labelKey="label" valueKey="count" layout="vertical" color="#0891b2" />
        <ChartCard title="Company verification status (current)" to="/app/admin/verification" rows={(breakdowns.companyVerification || []).map((s) => ({ label: s.label, count: s.count }))} labelKey="label" valueKey="count" color="#d97706" />
        <ChartCard title="Job approval status (current)" to="/app/admin/moderation" rows={(breakdowns.jobApproval || []).map((s) => ({ label: s.label, count: s.count }))} labelKey="label" valueKey="count" color="#65a30d" />
        <ChartCard title="Subscription growth (new paid plans)" to="/app/admin/subscriptions" rows={(series.paidSubscriptionsStarted || []).map((p) => ({ date: shortDate(p.date), count: p.count }))} labelKey="date" valueKey="count" color="#4f46e5" />
        <RevenueChart gross={series.grossCapturedRevenue || []} refunds={series.refundsRevenue || []} />
        <ChartCard title="Failed payment trend" to="/app/admin/revenue?status=failed" toLabel="View failed payments" rows={(series.failedPayments || []).map((p) => ({ date: shortDate(p.date), count: p.count }))} labelKey="date" valueKey="count" color="#dc2626" />
        <HiringOutcomesPie rows={breakdowns.hiringOutcomes || []} />
      </div>
    </section>
  );
};

export default AdminAnalyticsPanel;
