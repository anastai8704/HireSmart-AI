/**
 * admin/Dashboard.jsx
 * -----------------------------------------------------------------------------
 * Platform-wide overview for administrators: how many users of each role, how
 * many jobs, and the global application pipeline.
 */

import { Link } from "react-router-dom";
import {
    Briefcase,
    FileText,
    ShieldCheck,
    UserCheck,
    Users,
} from "lucide-react";

import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { userApi } from "../../lib/api";
import { statusClasses } from "../../lib/utils";
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

const AdminDashboard = () => {
    const { data, isLoading, error, refetch } = useFetch(() => userApi.adminOverview(), []);

    if (isLoading) return <LoadingState message="Loading platform data..." />;

    if (error) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <ErrorState error={error} onRetry={refetch} />
            </div>
        );
    }

    const overview = data?.dashboard || data?.data || {};
    const userCounts = overview.users || overview.userCounts || {};
    const statusCounts = overview.applications || overview.statusCounts || {};

    const totalUsers =
        overview.totalUsers ??
        Object.values(userCounts).reduce((sum, count) => sum + count, 0);

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8">
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-ink-900">
                    <ShieldCheck className="h-7 w-7 text-brand-500" aria-hidden="true" />
                    Platform overview
                </h1>

                <p className="mt-1.5 text-ink-500">
                    Everything happening across HireSmart AI.
                </p>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Users} label="Total users" value={totalUsers} />

                <StatCard
                    icon={UserCheck}
                    label="Candidates"
                    value={userCounts.candidate ?? 0}
                    tone="success"
                />

                <StatCard
                    icon={Briefcase}
                    label="Recruiters"
                    value={userCounts.recruiter ?? 0}
                    tone="warning"
                />

                <StatCard
                    icon={FileText}
                    label="Jobs posted"
                    value={overview.totalJobs ?? 0}
                    tone="ink"
                />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Application pipeline</CardTitle>
                        <p className="text-sm text-ink-500">
                            Every application on the platform, by status.
                        </p>
                    </CardHeader>

                    <CardContent className="space-y-2">
                        {Object.keys(statusCounts).length === 0 ? (
                            <p className="text-sm text-ink-400">No applications yet.</p>
                        ) : (
                            Object.entries(statusCounts).map(([status, count]) => (
                                <div key={status} className="flex items-center justify-between">
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

                <Card>
                    <CardHeader>
                        <CardTitle>Administration</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2">
                        <Button
                            as={Link}
                            to="/admin/users"
                            variant="secondary"
                            fullWidth
                            leftIcon={<Users className="h-4 w-4" />}
                        >
                            Manage users
                        </Button>

                        <Button
                            as={Link}
                            to="/jobs"
                            variant="ghost"
                            fullWidth
                            leftIcon={<Briefcase className="h-4 w-4" />}
                        >
                            Browse all jobs
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AdminDashboard;
