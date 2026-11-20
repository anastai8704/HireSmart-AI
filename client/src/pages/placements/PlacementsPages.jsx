// Employment tracking for candidates and companies (Requirement 9).
// Every action calls an existing server route, which enforces who may act and which transitions are valid.
// Reported facts are labelled as reported. Platform verification is shown separately and is never implied.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import DatePicker from "../../components/ui/DatePicker";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { useToast } from "../../components/ui/useToast";
import { placementApi } from "../../lib/api";
import { EMPLOYMENT_STATUS_LABELS, fmtIst, PLACEMENT_STATUS_LABELS, SOURCE_LABELS } from "../../lib/revenueFormat";

// Canonical employment (Requirement 9). A report moves to a pending state and waits for verification.
const JOINABLE = ["offer_accepted", "pending_joining"];
const PENDING = ["joined_pending_verification", "employment_end_pending_verification"];
const employmentOf = (placement) => placement.employment?.status || "";

const errorMessage = (err, fallback) => err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

const VerifiedBadge = ({ placement }) =>
  placement.verification?.isVerified ? (
    <Badge variant="success" className="whitespace-nowrap font-medium">Platform verified{placement.verification?.verifiedAt ? ` ${fmtIst(placement.verification.verifiedAt)}` : ""}</Badge>
  ) : (
    <Badge variant="warning" className="whitespace-nowrap font-medium">Not yet verified by the platform</Badge>
  );

/* ---------- Candidate ---------- */

const CandidateActions = ({ placement, onDone }) => {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // "join" | "start" | "leave"
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const submit = useMutation({
    mutationFn: () => {
      if (dialog === "join") {
        return placementApi.confirmJoining(placement._id, {
          actualJoiningDate: date ? new Date(date).toISOString() : undefined,
          candidateNotes: note.trim() || undefined,
        });
      }
      if (dialog === "start") {
        return placementApi.updateEmploymentStatus(placement._id, {
          status: "joined_pending_verification",
          startDate: date ? new Date(date).toISOString() : undefined,
        });
      }
      return placementApi.updateEmploymentStatus(placement._id, {
        status: "employment_end_pending_verification",
        endDate: date ? new Date(date).toISOString() : undefined,
        exitReason: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Thanks. Your update was recorded and shared with the company.");
      setDialog(null);
      setDate("");
      setNote("");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, "We could not record that update.")),
  });

  const employment = employmentOf(placement);
  if (PENDING.includes(employment)) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        Update pending verification
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {JOINABLE.includes(employment) && (
        <Button size="sm" variant="secondary" onClick={() => setDialog("join")}>
          Confirm joining date
        </Button>
      )}
      {JOINABLE.includes(employment) && (
        <Button size="sm" variant="secondary" onClick={() => setDialog("start")}>
          I have started working here
        </Button>
      )}
      {employment === "active_verified" && (
        <Button size="sm" variant="danger" onClick={() => setDialog("leave")}>
          I have left this company
        </Button>
      )}
      {dialog && (
        <ConfirmModal
          isOpen
          title={
            dialog === "join"
              ? "Confirm your joining date"
              : dialog === "start"
                ? "Record your start date"
                : "Record that you have left"
          }
          confirmLabel="Save update"
          onClose={() => setDialog(null)}
          onConfirm={() => submit.mutate()}
          isLoading={submit.isPending}
          tone="brand"
          children={
            <div className="space-y-3 text-left">
              <div>
                <DatePicker
                  label={dialog === "leave" ? "Last working day" : "Date"}
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <label className="block text-xs font-semibold text-ink-600">
                {dialog === "leave" ? "Reason (optional)" : "Note (optional)"}
                <textarea
                  maxLength={2000}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                />
              </label>
              <p className="text-xs text-ink-500">
                This is your report. The platform verifies placements separately, and both are kept in your history.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};

export const CandidatePlacements = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-placements"],
    queryFn: () => placementApi.myPlacements({ limit: 50 }),
  });
  const rows = data?.data || [];

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Employment"
        title="My placements"
        description="Record when you join, start and leave a company. Your reports are kept as history and never overwritten."
      />
      {isLoading && <LoadingState message="Loading your placements…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && rows.length === 0 && (
        <EmptyState title="No placements yet" description="A placement appears here after a company marks your application as hired." />
      )}
      <div className="grid gap-5">
        {rows.map((p) => (
          <article
            key={p._id}
            aria-label={`Placement at ${p.organization?.name || "company"}`}
            className="rounded-2xl border border-ink-100 bg-white p-6 shadow-xs transition hover:border-ink-200 hover:shadow-sm"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-bold text-ink-950">
                    {p.organization?.name || "Company"}
                  </h2>
                  <VerifiedBadge placement={p} />
                </div>
                <p className="text-sm font-medium text-ink-600">
                  {p.offerDetails?.designation || p.job?.title || "Role"}
                </p>
              </div>

              <div className="shrink-0">
                <CandidateActions
                  placement={p}
                  onDone={() => queryClient.invalidateQueries({ queryKey: ["my-placements"] })}
                />
              </div>
            </div>

            {/* Employment Details Grid */}
            <div className="mt-4 grid gap-3 rounded-xl bg-ink-50/60 p-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="font-semibold text-ink-500">Employment status</span>
                <p className="mt-0.5 text-sm font-bold text-ink-900">
                  {EMPLOYMENT_STATUS_LABELS[employmentOf(p)] || "Not recorded yet"}
                </p>
                {p.employmentStatusSource && (
                  <p className="mt-0.5 text-ink-400">Source: {SOURCE_LABELS[p.employmentStatusSource]}</p>
                )}
              </div>

              <div>
                <span className="font-semibold text-ink-500">Start date</span>
                <p className="mt-0.5 text-sm font-semibold text-ink-800">
                  {p.employmentPeriod?.startDate ? fmtIst(p.employmentPeriod.startDate) : "Not recorded"}
                </p>
              </div>

              <div>
                <span className="font-semibold text-ink-500">End date / Duration</span>
                <p className="mt-0.5 text-sm font-semibold text-ink-800">
                  {p.employmentPeriod?.endDate
                    ? fmtIst(p.employmentPeriod.endDate)
                    : p.employmentPeriod?.startDate
                      ? "Currently employed"
                      : "—"}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/* ---------- Company (organization members with application.manage) ---------- */

const CompanyActions = ({ placement, organizationId, onDone }) => {
  const toast = useToast();
  const [confirm, setConfirm] = useState(null); // "joined" | "ended" | "reject"
  const [reason, setReason] = useState("");
  const update = useMutation({
    mutationFn: (body) => placementApi.updateEmploymentStatus(placement._id, body),
    onSuccess: () => {
      toast.success("Employment information recorded and waiting for verification.");
      setConfirm(null);
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, "We could not record that update.")),
  });
  const verify = useMutation({
    mutationFn: () => placementApi.verifyEmployment(placement._id, {}),
    onSuccess: () => {
      toast.success("Employment change verified.");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, "We could not verify this change.")),
  });
  const reject = useMutation({
    mutationFn: () => placementApi.rejectEmployment(placement._id, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success("Change rejected. The last verified status is kept.");
      setConfirm(null);
      setReason("");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, "We could not reject this change.")),
  });

  const employment = employmentOf(placement);
  const pending = PENDING.includes(employment);
  return (
    <div className="flex flex-wrap items-center gap-2" data-org={organizationId}>
      {JOINABLE.includes(employment) && (
        <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => setConfirm("joined")}>
          Record as working here
        </Button>
      )}
      {employment === "active_verified" && (
        <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => setConfirm("ended")}>
          Record employment ended
        </Button>
      )}
      {pending && (
        <>
          <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => verify.mutate()} isLoading={verify.isPending}>
            Verify this change
          </Button>
          <Button size="sm" variant="danger" className="whitespace-nowrap" onClick={() => setConfirm("reject")}>
            Reject this change
          </Button>
        </>
      )}
      {confirm === "reject" && (
        <ConfirmModal
          isOpen
          title="Reject this employment change?"
          children={
            <label className="block text-left text-xs font-semibold text-ink-600">
              Reason (required)
              <textarea
                maxLength={2000}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              />
            </label>
          }
          confirmLabel="Reject change"
          tone="brand"
          onClose={() => setConfirm(null)}
          isLoading={reject.isPending}
          onConfirm={() => reject.mutate()}
        />
      )}
      {(confirm === "joined" || confirm === "ended") && (
        <ConfirmModal
          isOpen
          title={confirm === "joined" ? "Record this hire as working here?" : "Record that employment has ended?"}
          children={
            <p className="text-left text-sm text-ink-700">
              This is recorded as a company report. The earlier entry stays in the history, and the platform still verifies placements separately.
            </p>
          }
          confirmLabel="Record"
          tone="brand"
          onClose={() => setConfirm(null)}
          isLoading={update.isPending}
          onConfirm={() =>
            update.mutate(
              confirm === "joined"
                ? { status: "joined_pending_verification" }
                : { status: "employment_end_pending_verification" },
            )
          }
        />
      )}
    </div>
  );
};

export const OrganizationPlacements = () => {
  const { organizationId } = useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["org-placements", organizationId],
    queryFn: () => placementApi.orgPlacements(organizationId, { limit: 50 }),
    enabled: Boolean(organizationId),
  });
  const rows = data?.data || [];

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        eyebrow="Hiring"
        title="Placements"
        description="Hires for your company, the job each one was hired for, and their employment status."
      />
      {isLoading && <LoadingState message="Loading placements…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && rows.length === 0 && <EmptyState title="No placements yet" description="Hires appear here when an application is marked hired." />}
      {rows.length > 0 && (
        <div className="rounded-xl border border-ink-200 bg-white shadow-xs overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-left text-sm" aria-label="Company placements">
            <thead className="bg-ink-50/80 text-xs font-semibold uppercase tracking-wider text-ink-500 border-b border-ink-100">
              <tr>
                <th scope="col" className="px-4 py-3.5 w-[22%]">Candidate</th>
                <th scope="col" className="px-4 py-3.5 w-[22%]">Hired for</th>
                <th scope="col" className="px-4 py-3.5 w-[22%]">Reported status</th>
                <th scope="col" className="px-4 py-3.5 w-[18%]">Verification</th>
                <th scope="col" className="px-4 py-3.5 w-[16%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((p) => {
                const candidateInitials = p.candidate?.name
                  ? p.candidate.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                  : "C";
                const employmentStatus = employmentOf(p);
                const statusLabel = EMPLOYMENT_STATUS_LABELS[employmentStatus] || "Not recorded yet";
                const statusVariant =
                  employmentStatus === "active_verified"
                    ? "success"
                    : employmentStatus.includes("pending")
                      ? "brand"
                      : "default";

                return (
                  <tr key={p._id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                          {candidateInitials}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-950 truncate">{p.candidate?.name || "Candidate"}</p>
                          <p className="text-xs text-ink-500 truncate">
                            {p.candidate?.email || (p.candidate?._id ? `ID: ${p.candidate._id.slice(-6)}` : "Hired candidate")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-medium text-ink-900">{p.job?.title || "Job removed"}</p>
                      <p className="text-xs text-ink-500">
                        {p.offerDetails?.designation || p.job?.department || "General Hiring"}
                        {p.organization?.name ? ` · ${p.organization.name}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="space-y-1">
                        <div>
                          <Badge variant={statusVariant} size="sm" className="whitespace-nowrap">
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-500">
                          Pipeline: <span className="font-medium text-ink-700">{PLACEMENT_STATUS_LABELS[p.status] || p.status}</span>
                        </p>
                        {p.employmentStatusSource ? (
                          <p className="text-[11px] text-ink-400">
                            Source: {SOURCE_LABELS[p.employmentStatusSource] || p.employmentStatusSource}
                          </p>
                        ) : null}
                        {(p.employmentPeriod?.startDate || p.offerDetails?.joiningDate) ? (
                          <p className="text-[11px] text-ink-500">
                            Start: {fmtIst(p.employmentPeriod?.startDate || p.offerDetails?.joiningDate)}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <VerifiedBadge placement={p} />
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <CompanyActions
                        placement={p}
                        organizationId={organizationId}
                        onDone={() => queryClient.invalidateQueries({ queryKey: ["org-placements", organizationId] })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CandidatePlacements;
