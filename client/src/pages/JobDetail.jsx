/**
 * JobDetail.jsx
 * -----------------------------------------------------------------------------
 * A single job posting, plus the actions available for it.
 *
 * The interesting part is the "Check my fit" panel: a signed-in candidate can
 * run the AI against this specific job before applying, see their score and the
 * exact keywords they are missing, and fix their resume first. That turns a
 * blind application into an informed one.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft,
    Bookmark,
    BookmarkCheck,
    Briefcase,
    Building2,
    Clock,
    IndianRupee,
    MapPin,
    Send,
    Sparkles,
    Undo2,
} from "lucide-react";

import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import MatchBreakdown from "../components/ai/MatchBreakdown";
import Modal from "../components/ui/Modal";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/States";
import { aiApi, jobApi } from "../lib/api";
import { formatDate, formatRelativeTime, formatSalary, statusClasses } from "../lib/utils";
import { useAuth } from "../context/useAuth";
import { useFetch, useMutation } from "../hooks/useApi";
import { useToast } from "../components/ui/useToast";

const JobDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { isAuthenticated, role } = useAuth();

    const isCandidate = isAuthenticated && role === "candidate";
    const [showWithdraw, setShowWithdraw] = useState(false);

    const { data, isLoading, error, refetch } = useFetch(() => jobApi.get(id), [id]);

    // Whether this candidate has already applied to / saved this job.
    const { data: statusData, refetch: refetchStatus } = useFetch(
        () => jobApi.jobStatus(id),
        [id, isCandidate],
        { enabled: isCandidate }
    );

    const {
        mutate: runFitCheck,
        data: fitData,
        isLoading: isChecking,
        error: fitError,
    } = useMutation(() => aiApi.jobFit(id));

    const { mutate: apply, isLoading: isApplying } = useMutation(() => jobApi.apply(id));
    const { mutate: withdraw, isLoading: isWithdrawing } = useMutation(() => jobApi.withdraw(id));
    const { mutate: toggleSave, isLoading: isSaving } = useMutation((isSaved) =>
        isSaved ? jobApi.unsave(id) : jobApi.save(id)
    );

    const job = data?.job || data?.data;
    const hasApplied = statusData?.status?.hasApplied ?? statusData?.hasApplied ?? false;
    const isSaved = statusData?.status?.isSaved ?? statusData?.isSaved ?? false;
    const applicationStatus =
        statusData?.status?.applicationStatus ?? statusData?.applicationStatus ?? null;

    const handleApply = async () => {
        try {
            await apply();
            toast.success("Application submitted");
            refetchStatus();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleWithdraw = async () => {
        try {
            await withdraw();
            toast.success("Application withdrawn");
            setShowWithdraw(false);
            refetchStatus();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleToggleSave = async () => {
        try {
            await toggleSave(isSaved);
            toast.success(isSaved ? "Removed from saved jobs" : "Job saved");
            refetchStatus();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleFitCheck = async () => {
        try {
            await runFitCheck();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    if (isLoading) return <LoadingState message="Loading job..." />;

    if (error) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <ErrorState error={error} onRetry={refetch} />
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            <Button
                variant="ghost"
                size="sm"
                className="mb-4"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => navigate(-1)}
            >
                Back
            </Button>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ================= Main column ================= */}
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h1 className="text-2xl font-bold tracking-tight text-ink-900">
                                        {job.title}
                                    </h1>

                                    <p className="mt-1 flex items-center gap-1.5 text-ink-600">
                                        <Building2 className="h-4 w-4" aria-hidden="true" />
                                        {job.company}
                                    </p>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                    <Badge variant="brand">{job.jobType}</Badge>

                                    {applicationStatus && (
                                        <span
                                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                                                applicationStatus
                                            )}`}
                                        >
                                            {applicationStatus}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Key facts */}
                            <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-ink-100 py-4 sm:grid-cols-4">
                                {[
                                    { icon: MapPin, label: "Location", value: job.location },
                                    {
                                        icon: IndianRupee,
                                        label: "Salary",
                                        value: formatSalary(job.salary),
                                    },
                                    { icon: Briefcase, label: "Experience", value: job.experience },
                                    {
                                        icon: Clock,
                                        label: "Posted",
                                        value: formatRelativeTime(job.createdAt),
                                    },
                                ].map((fact) => {
                                    const Icon = fact.icon;

                                    return (
                                        <div key={fact.label}>
                                            <dt className="flex items-center gap-1 text-xs text-ink-400">
                                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                                {fact.label}
                                            </dt>
                                            <dd className="mt-0.5 text-sm font-medium text-ink-900">
                                                {fact.value}
                                            </dd>
                                        </div>
                                    );
                                })}
                            </dl>

                            {/* Description - whitespace-pre-line preserves the
                                recruiter's line breaks without allowing HTML. */}
                            <div className="mt-5">
                                <h2 className="mb-2 text-base font-semibold text-ink-900">
                                    About this role
                                </h2>

                                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">
                                    {job.description}
                                </p>
                            </div>

                            {job.skills?.length > 0 && (
                                <div className="mt-5">
                                    <h2 className="mb-2 text-base font-semibold text-ink-900">
                                        Required skills
                                    </h2>

                                    <div className="flex flex-wrap gap-1.5">
                                        {job.skills.map((skill) => (
                                            <Badge key={skill} variant="default">
                                                {skill}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {job.closesAt && (
                                <p className="mt-5 text-xs text-ink-400">
                                    Applications close on {formatDate(job.closesAt)}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* AI fit result */}
                    {fitData?.data?.match && (
                        <div className="animate-[fade-up_0.4s_ease-out_both] space-y-4">
                            <MatchBreakdown
                                match={fitData.data.match}
                                title="Your fit for this role"
                            />

                            {fitData.data.tailoringTips?.length > 0 && (
                                <Card className="border-warning-500/30">
                                    <CardHeader>
                                        <CardTitle>Before you apply</CardTitle>
                                        <p className="text-sm text-ink-500">
                                            Adding evidence for these would raise your score.
                                        </p>
                                    </CardHeader>

                                    <CardContent className="space-y-2">
                                        {fitData.data.tailoringTips.map((tip) => (
                                            <div
                                                key={tip.title}
                                                className="rounded-lg bg-warning-50 p-3"
                                            >
                                                <p className="text-sm font-semibold text-ink-900">
                                                    {tip.title}
                                                </p>
                                                <p className="mt-0.5 text-sm text-ink-600">
                                                    {tip.detail}
                                                </p>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </div>

                {/* ================= Action sidebar ================= */}
                <aside className="space-y-4">
                    <Card className="lg:sticky lg:top-20">
                        <CardContent className="space-y-3 p-5">
                            {!isAuthenticated ? (
                                <>
                                    <p className="text-sm text-ink-600">
                                        Sign in as a candidate to apply and to check how well your
                                        resume matches this role.
                                    </p>

                                    <Button as={Link} to="/login" fullWidth>
                                        Sign in to apply
                                    </Button>

                                    <Button
                                        as={Link}
                                        to="/register"
                                        variant="secondary"
                                        fullWidth
                                    >
                                        Create an account
                                    </Button>
                                </>
                            ) : !isCandidate ? (
                                <p className="text-sm text-ink-500">
                                    You are signed in as a {role}. Only candidate accounts can
                                    apply to jobs.
                                </p>
                            ) : (
                                <>
                                    {hasApplied ? (
                                        <>
                                            <div className="rounded-lg bg-success-50 p-3 text-center">
                                                <p className="text-sm font-medium text-success-700">
                                                    You applied to this job
                                                </p>
                                                {applicationStatus && (
                                                    <p className="mt-0.5 text-xs text-success-700/80">
                                                        Current status: {applicationStatus}
                                                    </p>
                                                )}
                                            </div>

                                            <Button
                                                variant="secondary"
                                                fullWidth
                                                leftIcon={<Undo2 className="h-4 w-4" />}
                                                onClick={() => setShowWithdraw(true)}
                                            >
                                                Withdraw application
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            fullWidth
                                            isLoading={isApplying}
                                            leftIcon={<Send className="h-4 w-4" />}
                                            onClick={handleApply}
                                        >
                                            Apply with my resume
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        fullWidth
                                        isLoading={isChecking}
                                        leftIcon={<Sparkles className="h-4 w-4" />}
                                        onClick={handleFitCheck}
                                    >
                                        {fitData ? "Re-check my fit" : "Check my fit with AI"}
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        fullWidth
                                        isLoading={isSaving}
                                        onClick={handleToggleSave}
                                        leftIcon={
                                            isSaved ? (
                                                <BookmarkCheck className="h-4 w-4 text-brand-600" />
                                            ) : (
                                                <Bookmark className="h-4 w-4" />
                                            )
                                        }
                                    >
                                        {isSaved ? "Saved" : "Save for later"}
                                    </Button>

                                    {fitError && (
                                        <p className="text-xs text-danger-700">
                                            {fitError.message}
                                        </p>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>

            {/* Withdrawing is destructive, so it needs an explicit confirmation. */}
            <Modal
                isOpen={showWithdraw}
                onClose={() => setShowWithdraw(false)}
                title="Withdraw your application?"
                description="The recruiter will no longer see you as an active applicant. You can apply again later if the job is still open."
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowWithdraw(false)}>
                            Keep it
                        </Button>

                        <Button
                            variant="danger"
                            isLoading={isWithdrawing}
                            onClick={handleWithdraw}
                        >
                            Yes, withdraw
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-ink-600">
                    You are about to withdraw your application for{" "}
                    <strong>{job.title}</strong> at <strong>{job.company}</strong>.
                </p>
            </Modal>
        </div>
    );
};

export default JobDetail;
