/**
 * recruiter/Analytics.jsx
 * -----------------------------------------------------------------------------
 * Hiring funnel analytics.
 *
 * WHY A FUNNEL RATHER THAN JUST TOTALS
 * "142 applications" tells a recruiter nothing actionable. "142 applied, 30
 * shortlisted, 4 interviewed, 1 selected" immediately shows where candidates
 * are lost - and a conversion rate makes two different roles comparable.
 *
 * Charts come from Recharts, which renders real SVG (so it stays sharp,
 * accessible and printable) and is responsive by default.
 */

import {
    Bar,
    BarChart,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { BarChart3, Target, TrendingUp, Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { jobApi } from "../../lib/api";
import { useFetch } from "../../hooks/useApi";

/** Fixed colours per stage so the funnel and pie always agree. */
const STAGE_COLORS = {
    Applied: "#94a3b8",
    Shortlisted: "#6366f1",
    Interview: "#f59e0b",
    Selected: "#10b981",
    Rejected: "#ef4444",
    Withdrawn: "#cbd5e1",
};

const FUNNEL_ORDER = ["Applied", "Shortlisted", "Interview", "Selected"];

const RecruiterAnalytics = () => {
    const { data, isLoading, error, refetch } = useFetch(() => jobApi.analytics(), []);

    if (isLoading) return <LoadingState message="Crunching your numbers..." />;

    if (error) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <ErrorState error={error} onRetry={refetch} />
            </div>
        );
    }

    const analytics = data?.analytics || data?.data || {};
    const statusCounts = analytics.statusCounts || {};
    const topJob = analytics.topJob;

    const totalApplications = Object.values(statusCounts).reduce(
        (sum, count) => sum + count,
        0
    );

    // The funnel is cumulative: someone selected also passed every earlier stage.
    const funnelData = FUNNEL_ORDER.map((stage) => ({
        stage,
        count: statusCounts[stage] ?? 0,
        fill: STAGE_COLORS[stage],
    }));

    const distributionData = Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
            name: status,
            value: count,
            fill: STAGE_COLORS[status] || "#cbd5e1",
        }));

    // Selected / applied, the single number that summarises hiring efficiency.
    const conversionRate =
        totalApplications > 0
            ? (((statusCounts.Selected ?? 0) / totalApplications) * 100).toFixed(1)
            : "0.0";

    const shortlistRate =
        totalApplications > 0
            ? (((statusCounts.Shortlisted ?? 0) / totalApplications) * 100).toFixed(1)
            : "0.0";

    return (
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8">
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-ink-900">
                    <BarChart3 className="h-7 w-7 text-brand-500" aria-hidden="true" />
                    Hiring analytics
                </h1>

                <p className="mt-1.5 text-ink-500">
                    Where candidates progress, and where they drop out.
                </p>
            </header>

            {totalApplications === 0 ? (
                <EmptyState
                    icon={BarChart3}
                    title="No data to analyse yet"
                    description="Once candidates start applying to your jobs, their progress through the pipeline will be charted here."
                />
            ) : (
                <>
                    {/* ---------- Headline numbers ---------- */}
                    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                icon: TrendingUp,
                                label: "Total applications",
                                value: totalApplications,
                                tone: "bg-brand-100 text-brand-700",
                            },
                            {
                                icon: Target,
                                label: "Shortlist rate",
                                value: `${shortlistRate}%`,
                                tone: "bg-warning-50 text-warning-700",
                            },
                            {
                                icon: Trophy,
                                label: "Offer rate",
                                value: `${conversionRate}%`,
                                tone: "bg-success-50 text-success-700",
                            },
                            {
                                icon: BarChart3,
                                label: "Active jobs",
                                value: analytics.totalJobs ?? analytics.activeJobs ?? 0,
                                tone: "bg-ink-100 text-ink-700",
                            },
                        ].map((stat) => {
                            const Icon = stat.icon;

                            return (
                                <Card key={stat.label} className="p-5">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.tone}`}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                        </span>

                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                                                {stat.label}
                                            </p>
                                            <p className="text-2xl font-bold tabular-nums text-ink-900">
                                                {stat.value}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* ---------- Funnel ---------- */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Hiring funnel</CardTitle>
                                <p className="text-sm text-ink-500">
                                    How many candidates reached each stage.
                                </p>
                            </CardHeader>

                            <CardContent>
                                {/* ResponsiveContainer needs a parent with a real
                                    height, hence the fixed wrapper below. */}
                                <div style={{ width: "100%", height: 280 }}>
                                    <ResponsiveContainer>
                                        <BarChart
                                            data={funnelData}
                                            layout="vertical"
                                            margin={{ left: 10, right: 20 }}
                                        >
                                            <XAxis
                                                type="number"
                                                allowDecimals={false}
                                                stroke="#94a3b8"
                                                fontSize={12}
                                            />

                                            <YAxis
                                                type="category"
                                                dataKey="stage"
                                                width={90}
                                                stroke="#94a3b8"
                                                fontSize={12}
                                            />

                                            <Tooltip
                                                cursor={{ fill: "#f1f5f9" }}
                                                contentStyle={{
                                                    borderRadius: 8,
                                                    border: "1px solid #e2e8f0",
                                                    fontSize: 13,
                                                }}
                                            />

                                            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                                                {funnelData.map((entry) => (
                                                    <Cell key={entry.stage} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ---------- Distribution ---------- */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Status distribution</CardTitle>
                                <p className="text-sm text-ink-500">
                                    Where every applicant currently sits.
                                </p>
                            </CardHeader>

                            <CardContent>
                                <div style={{ width: "100%", height: 280 }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={distributionData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={60}
                                                outerRadius={95}
                                                paddingAngle={2}
                                                label={({ name, value }) => `${name}: ${value}`}
                                                labelLine={false}
                                                fontSize={11}
                                            >
                                                {distributionData.map((entry) => (
                                                    <Cell key={entry.name} fill={entry.fill} />
                                                ))}
                                            </Pie>

                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: 8,
                                                    border: "1px solid #e2e8f0",
                                                    fontSize: 13,
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ---------- Top job ---------- */}
                    {topJob && (
                        <Card className="mt-6 border-brand-200 bg-brand-50">
                            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                                        Most popular role
                                    </p>

                                    <h3 className="mt-1 text-lg font-bold text-ink-900">
                                        {topJob.title}
                                    </h3>

                                    <p className="text-sm text-ink-600">{topJob.company}</p>
                                </div>

                                <div className="text-right">
                                    <p className="text-3xl font-bold tabular-nums text-brand-700">
                                        {topJob.applicationCount ?? topJob.count ?? 0}
                                    </p>
                                    <p className="text-xs text-ink-500">applications</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
};

export default RecruiterAnalytics;
