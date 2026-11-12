// Employment tracking for candidates and companies (Requirement 9).
// Every action calls an existing server route, which enforces who may act and which transitions are valid.
// Reported facts are labelled as reported. Platform verification is shown separately and is never implied.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { useToast } from "../../components/ui/useToast";
import { placementApi } from "../../lib/api";
import { fmtIst, PLACEMENT_STATUS_LABELS, SOURCE_LABELS } from "../../lib/revenueFormat";

// Statuses before employment began, and the one in which the candidate or company can record leaving.
const BEFORE_EMPLOYMENT = ["selected", "hired", "joining_confirmed", "placement_verified"];
const EMPLOYED = "currently_working";

const errorMessage = (err, fallback) => err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

const VerifiedBadge = ({ placement }) =>
  placement.verification?.isVerified ? (
    <Badge variant="success">Platform verified{placement.verification?.verifiedAt ? ` ${fmtIst(placement.verification.verifiedAt)}` : ""}</Badge>
  ) : (
    <Badge variant="warning">Not yet verified by the platform</Badge>
  );

const StatusLine = ({ placement }) => (
  <div className="space-y-1 text-sm">
    <div>
      <span className="text-ink-500">Reported status: </span>
      <strong className="text-ink-900">{PLACEMENT_STATUS_LABELS[placement.status] || placement.status}</strong>
      {placement.employmentStatusSource ? (
        <span className="text-ink-500"> · {SOURCE_LABELS[placement.employmentStatusSource]}</span>
      ) : null}
    </div>
    <VerifiedBadge placement={placement} />
  </div>
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
          status: EMPLOYED,
          startDate: date ? new Date(date).toISOString() : undefined,
        });
      }
      return placementApi.updateEmploymentStatus(placement._id, {
        status: "employment_ended",
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

  const status = placement.status;
  return (
    <div className="flex flex-wrap gap-2">
      {BEFORE_EMPLOYMENT.includes(status) && status !== "joining_confirmed" && (
        <Button size="sm" variant="secondary" onClick={() => setDialog("join")}>
          Confirm joining date
        </Button>
      )}
      {BEFORE_EMPLOYMENT.includes(status) && (
        <Button size="sm" variant="secondary" onClick={() => setDialog("start")}>
          I have started working here
        </Button>
      )}
      {status === EMPLOYED && (
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
              <label className="block text-xs font-semibold text-ink-600">
                {dialog === "leave" ? "Last working day" : "Date"}
                <input
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                />
              </label>
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
      <div className="grid gap-4">
        {rows.map((p) => (
          <article key={p._id} aria-label={`Placement at ${p.organization?.name || "company"}`} className="space-y-3 rounded-xl border border-ink-100 bg-white p-5">
            <header>
              <h2 className="text-base font-bold text-ink-900">{p.organization?.name || "Company"}</h2>
              <p className="text-sm text-ink-600">{p.offerDetails?.designation || p.job?.title || "Role"}</p>
            </header>
            <StatusLine placement={p} />
            {p.employmentPeriod?.startDate && (
              <p className="text-xs text-ink-500">Started {fmtIst(p.employmentPeriod.startDate)}</p>
            )}
            {p.employmentPeriod?.endDate && <p className="text-xs text-ink-500">Left {fmtIst(p.employmentPeriod.endDate)}</p>}
            <CandidateActions placement={p} onDone={() => queryClient.invalidateQueries({ queryKey: ["my-placements"] })} />
          </article>
        ))}
      </div>
    </div>
  );
};

/* ---------- Company (organization members with application.manage) ---------- */

const CompanyActions = ({ placement, organizationId, onDone }) => {
  const toast = useToast();
  const [confirm, setConfirm] = useState(null); // "employed" | "ended"
  const update = useMutation({
    mutationFn: (body) => placementApi.updateEmploymentStatus(placement._id, body),
    onSuccess: () => {
      toast.success("Employment information recorded.");
      setConfirm(null);
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, "We could not record that update.")),
  });

  const status = placement.status;
  return (
    <div className="flex flex-wrap gap-2" data-org={organizationId}>
      {BEFORE_EMPLOYMENT.includes(status) && (
        <Button size="sm" variant="secondary" onClick={() => setConfirm("employed")}>
          Confirm currently working
        </Button>
      )}
      {status === EMPLOYED && (
        <Button size="sm" variant="secondary" onClick={() => setConfirm("ended")}>
          Record employment ended
        </Button>
      )}
      {confirm && (
        <ConfirmModal
          isOpen
          title={confirm === "employed" ? "Confirm this hire is working here?" : "Record that employment has ended?"}
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
            update.mutate(confirm === "employed" ? { status: EMPLOYED } : { status: "employment_ended" })
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
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm" aria-label="Company placements">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-3 py-2">Candidate</th>
                <th scope="col" className="px-3 py-2">Hired for</th>
                <th scope="col" className="px-3 py-2">Reported status</th>
                <th scope="col" className="px-3 py-2">Verification</th>
                <th scope="col" className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((p) => (
                <tr key={p._id}>
                  <td className="px-3 py-2 font-medium text-ink-900">{p.candidate?.name || "Candidate"}</td>
                  <td className="px-3 py-2">{p.job?.title || "Job removed"}</td>
                  <td className="px-3 py-2">
                    {PLACEMENT_STATUS_LABELS[p.status] || p.status}
                    {p.employmentStatusSource ? <div className="text-xs text-ink-500">{SOURCE_LABELS[p.employmentStatusSource]}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <VerifiedBadge placement={p} />
                  </td>
                  <td className="px-3 py-2">
                    <CompanyActions
                      placement={p}
                      organizationId={organizationId}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ["org-placements", organizationId] })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CandidatePlacements;
