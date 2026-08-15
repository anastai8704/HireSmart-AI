/**
 * recruiter/JobApplicants.jsx
 * -----------------------------------------------------------------------------
 * The recruiter's most valuable screen: every applicant for a job, ranked by
 * AI match score, with the pipeline controls attached.
 *
 * WHY RANKING MATTERS HERE
 * A popular role can attract hundreds of applications. Reading them in arrival
 * order means the best candidate might be number 187. Sorting by an explainable
 * match score puts the strongest fits first while still showing WHY, so the
 * recruiter stays in control rather than blindly trusting a number.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    Download,
    Mail,
    MapPin,
    Save,
    Sparkles,
    Users,
} from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import MatchBreakdown from "../../components/ai/MatchBreakdown";
import Modal from "../../components/ui/Modal";
import { Card, CardContent } from "../../components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { Select, Textarea } from "../../components/ui/Input";
import { aiApi, jobApi } from "../../lib/api";
import { cn, downloadBlob, formatRelativeTime, initials, scoreClasses, statusClasses } from "../../lib/utils";
import { useFetch, useMutation } from "../../hooks/useApi";
import { useToast } from "../../components/ui/useToast";

const STATUSES = ["Applied", "Shortlisted", "Interview", "Selected", "Rejected"];

const JobApplicants = () => {
    const { jobId } = useParams();
    const toast = useToast();

    const [expandedId, setExpandedId] = useState(null);
    const [statusTarget, setStatusTarget] = useState(null);
    const [statusForm, setStatusForm] = useState({ status: "Shortlisted", note: "" });
    const [notesTarget, setNotesTarget] = useState(null);
    const [notesDraft, setNotesDraft] = useState("");

    // The ranking endpoint returns the applicants already scored and sorted.
    const { data, isLoading, error, refetch } = useFetch(() => aiApi.ranking(jobId), [jobId]);

    const { mutate: setStatus, isLoading: isSettingStatus } = useMutation(
        ({ candidateId, status, note }) =>
            jobApi.setApplicantStatus(jobId, candidateId, { status, note })
    );

    const { mutate: saveNotes, isLoading: isSavingNotes } = useMutation(
        ({ candidateId, recruiterNotes }) =>
            jobApi.setApplicantNotes(jobId, candidateId, recruiterNotes)
    );

    const handleStatusSubmit = async () => {
        try {
            await setStatus({
                candidateId: statusTarget.candidate.id,
                status: statusForm.status,
                note: statusForm.note,
            });

            toast.success(`Moved to ${statusForm.status}`);
            setStatusTarget(null);
            setStatusForm({ status: "Shortlisted", note: "" });
            refetch();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleNotesSubmit = async () => {
        try {
            await saveNotes({
                candidateId: notesTarget.candidate.id,
                recruiterNotes: notesDraft,
            });

            toast.success("Notes saved");
            setNotesTarget(null);
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleDownloadResume = async (candidateId, name) => {
        try {
            const blob = await jobApi.downloadApplicantResume(candidateId, jobId);
            downloadBlob(blob, `${name.replace(/\s+/g, "-").toLowerCase()}-resume.pdf`);
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    if (isLoading) return <LoadingState message="Scoring applicants..." />;

    if (error) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <ErrorState error={error} onRetry={refetch} />
            </div>
        );
    }

    const { job, applicants = [], totalApplicants = 0, averageScore = 0 } = data?.data || {};

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            <Button
                as={Link}
                to="/recruiter/jobs"
                variant="ghost"
                size="sm"
                className="mb-4"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
                Back to my jobs
            </Button>

            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-ink-900">
                    Applicants for {job?.title}
                </h1>

                <p className="mt-1 text-ink-500">
                    {job?.company} - ranked by AI match score, strongest first.
                </p>
            </header>

            {/* Summary */}
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {[
                    { label: "Total applicants", value: totalApplicants, icon: Users },
                    { label: "Average match", value: `${averageScore}%`, icon: Sparkles },
                    {
                        label: "Strong matches",
                        value: applicants.filter((a) => a.match.matchScore >= 65).length,
                        icon: Sparkles,
                    },
                ].map((stat) => {
                    const Icon = stat.icon;

                    return (
                        <Card key={stat.label} className="p-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>

                                <div>
                                    <p className="text-xs uppercase tracking-wide text-ink-400">
                                        {stat.label}
                                    </p>
                                    <p className="text-xl font-bold tabular-nums text-ink-900">
                                        {stat.value}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Applicant list */}
            {applicants.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No applicants yet"
                    description="Once candidates apply they will appear here, automatically scored against this job."
                />
            ) : (
                <div className="grid gap-4">
                    {applicants.map((applicant, index) => {
                        const isExpanded = expandedId === applicant.applicationId;

                        return (
                            <Card key={applicant.applicationId} className="overflow-hidden">
                                <CardContent className="p-5">
                                    <div className="flex flex-wrap items-start gap-4">
                                        {/* Rank + avatar */}
                                        <div className="flex items-center gap-3">
                                            <span className="w-6 text-center text-sm font-bold text-ink-300">
                                                #{index + 1}
                                            </span>

                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                                                {initials(applicant.candidate.name)}
                                            </span>
                                        </div>

                                        {/* Identity */}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-ink-900">
                                                {applicant.candidate.name}
                                            </p>

                                            {applicant.candidate.headline && (
                                                <p className="text-sm text-ink-600">
                                                    {applicant.candidate.headline}
                                                </p>
                                            )}

                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
                                                <span className="inline-flex items-center gap-1">
                                                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {applicant.candidate.email}
                                                </span>

                                                {applicant.candidate.location && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                                        {applicant.candidate.location}
                                                    </span>
                                                )}

                                                <span>Applied {formatRelativeTime(applicant.appliedAt)}</span>
                                            </div>
                                        </div>

                                        {/* Score + status */}
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span
                                                className={cn(
                                                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                                                    statusClasses(applicant.status)
                                                )}
                                            >
                                                {applicant.status}
                                            </span>

                                            <div
                                                className={cn(
                                                    "flex flex-col items-center rounded-xl border px-3 py-1.5",
                                                    scoreClasses(applicant.match.matchScore)
                                                )}
                                            >
                                                <span className="text-lg font-bold leading-none tabular-nums">
                                                    {applicant.match.matchScore}
                                                </span>
                                                <span className="text-[10px] font-semibold uppercase opacity-75">
                                                    match
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Matched / missing skills at a glance */}
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {applicant.match.matchedSkills.slice(0, 6).map((skill) => (
                                            <Badge key={skill} variant="success" size="sm">
                                                {skill}
                                            </Badge>
                                        ))}

                                        {applicant.match.missingSkills.slice(0, 4).map((skill) => (
                                            <Badge key={skill} variant="danger" size="sm">
                                                {skill}
                                            </Badge>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-3.5">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() =>
                                                setExpandedId(isExpanded ? null : applicant.applicationId)
                                            }
                                            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                                        >
                                            {isExpanded ? "Hide analysis" : "Why this score?"}
                                        </Button>

                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setStatusTarget(applicant);
                                                setStatusForm({
                                                    status: applicant.status || "Shortlisted",
                                                    note: "",
                                                });
                                            }}
                                        >
                                            Change status
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setNotesTarget(applicant);
                                                setNotesDraft("");
                                            }}
                                        >
                                            Add notes
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            leftIcon={<Download className="h-3.5 w-3.5" />}
                                            onClick={() =>
                                                handleDownloadResume(
                                                    applicant.candidate.id,
                                                    applicant.candidate.name
                                                )
                                            }
                                        >
                                            Resume
                                        </Button>
                                    </div>

                                    {/* Full explainable breakdown */}
                                    {isExpanded && (
                                        <div className="mt-4 animate-[fade-up_0.3s_ease-out_both]">
                                            <MatchBreakdown
                                                match={applicant.match}
                                                title="Why this candidate scored this way"
                                                compact
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ---------- Status modal ---------- */}
            <Modal
                isOpen={Boolean(statusTarget)}
                onClose={() => setStatusTarget(null)}
                title={`Update ${statusTarget?.candidate?.name || "candidate"}`}
                description="The candidate sees the status. The note is included with it."
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setStatusTarget(null)}>
                            Cancel
                        </Button>

                        <Button isLoading={isSettingStatus} onClick={handleStatusSubmit}>
                            Update status
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Select
                        label="New status"
                        options={STATUSES}
                        value={statusForm.status}
                        onChange={(event) =>
                            setStatusForm((current) => ({ ...current, status: event.target.value }))
                        }
                    />

                    <Textarea
                        label="Note (optional)"
                        rows={3}
                        placeholder="Great match on the backend stack - scheduling a first round."
                        value={statusForm.note}
                        onChange={(event) =>
                            setStatusForm((current) => ({ ...current, note: event.target.value }))
                        }
                    />
                </div>
            </Modal>

            {/* ---------- Private notes modal ---------- */}
            <Modal
                isOpen={Boolean(notesTarget)}
                onClose={() => setNotesTarget(null)}
                title="Private recruiter notes"
                description="Only you and your team can see these. The candidate never does."
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setNotesTarget(null)}>
                            Cancel
                        </Button>

                        <Button
                            isLoading={isSavingNotes}
                            onClick={handleNotesSubmit}
                            leftIcon={<Save className="h-4 w-4" />}
                        >
                            Save notes
                        </Button>
                    </>
                }
            >
                <Textarea
                    label={`Notes on ${notesTarget?.candidate?.name || "this candidate"}`}
                    rows={5}
                    placeholder="Strong system design answers. Follow up on the Kubernetes gap."
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                />
            </Modal>
        </div>
    );
};

export default JobApplicants;
