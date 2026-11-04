import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "../../components/ui/Button";
import Input, { Select, Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import { useToast } from "../../components/ui/useToast";
import { downloadBlob, verificationApi } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";

// Admin review of company verification cases (Phase 2). The server enforces every rule; this screen
// only presents evidence and sends decisions. Risk indicators are shown as explanations, never as proof.
const STATUS_FILTERS = [
  ["under_review", "Under review"],
  ["pending", "Pending"],
  ["rejected", "Rejected"],
  ["suspended", "Suspended"],
  ["verified", "Verified"],
  ["all", "All"],
];
const CHECK_TYPE_LABELS = {
  business_registration: "Business registration",
  business_identity: "Business identity",
  recruiter_identity: "Recruiter identity",
  business_email: "Business email",
  website_consistency: "Website consistency",
  address_consistency: "Address consistency",
  duplicate_review: "Duplicate review",
  job_policy_review: "Job policy review",
  enforcement_history: "Enforcement history",
  document_review: "Document review",
};
const RESULT_VARIANT = { match: "success", mismatch: "danger", concern: "warning", unavailable: "outline", not_checked: "default" };

const AdminVerificationQueue = () => {
  const navigate = useNavigate(),
    [status, setStatus] = useState("under_review"),
    [elevated, setElevated] = useState(false),
    [duplicates, setDuplicates] = useState(false),
    [missing, setMissing] = useState(false),
    queue = useQuery({
      queryKey: ["verification-queue", status, elevated, duplicates, missing],
      queryFn: () =>
        verificationApi.adminQueue({
          status,
          risk: elevated ? "elevated" : undefined,
          duplicateReview: duplicates ? "true" : undefined,
          missingEvidence: missing ? "true" : undefined,
          limit: 50,
        }),
    });

  return (
    <section>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_FILTERS.map(([value, label]) => ({ value, label }))} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={elevated} onChange={(e) => setElevated(e.target.checked)} />Elevated risk only</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={duplicates} onChange={(e) => setDuplicates(e.target.checked)} />Possible duplicates</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />Missing evidence</label>
      </div>
      {queue.isLoading ? <p className="mt-4 text-sm text-ink-500">Loading cases…</p> : null}
      {queue.error ? <p className="mt-4 text-sm text-danger-700">{queue.error.message}</p> : null}
      <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
        {(queue.data?.data || []).map((item) => (
          <li key={item.id}>
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-50" onClick={() => navigate(`/app/admin/verification/${item.id}`)}>
              <span>
                <span className="font-semibold">{item.organization?.name || "Company"}</span>
                <span className="ml-2 text-xs text-ink-500">opened {formatDateTime(item.submittedAt)}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                <Badge variant={item.risk.requiresManualReview ? "warning" : "default"}>Risk: {item.risk.level}</Badge>
                {item.missing.length ? <Badge variant="outline">{item.missing.length} check(s) missing</Badge> : null}
                {item.duplicateCount ? <Badge variant="warning">Possible duplicate</Badge> : null}
                {item.changeRequestActive ? <Badge variant="brand">Changes requested</Badge> : null}
              </span>
            </button>
          </li>
        ))}
        {!queue.isLoading && !(queue.data?.data || []).length ? <li className="px-4 py-6 text-sm text-ink-500">No cases match these filters.</li> : null}
      </ul>
    </section>
  );
};

const CaseDetail = ({ caseId }) => {
  const toast = useToast(),
    qc = useQueryClient(),
    detail = useQuery({ queryKey: ["verification-case", caseId], queryFn: () => verificationApi.adminCase(caseId) }),
    [note, setNote] = useState(""),
    [checkType, setCheckType] = useState("business_registration"),
    [checkResult, setCheckResult] = useState("match"),
    [reason, setReason] = useState(""),
    [changes, setChanges] = useState(""),
    [approvalNotes, setApprovalNotes] = useState("");

  const act = useMutation({
    mutationFn: ({ run }) => run(),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["verification-case", caseId] });
      qc.invalidateQueries({ queryKey: ["verification-queue"] });
      toast.success(variables.message);
    },
    onError: (error) => toast.error(error.message),
  });
  const run = (run, message) => act.mutate({ run, message });

  const download = async (doc) => {
    try {
      // The API client returns the blob body directly.
      downloadBlob(await verificationApi.downloadDocument(doc.id), doc.fileName);
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (detail.isLoading) return <p className="text-sm text-ink-500">Loading case…</p>;
  if (detail.error) return <p className="text-sm text-danger-700">{detail.error.message}</p>;
  const data = detail.data?.data;
  if (!data) return null;
  const c = data.case;
  const org = data.organization;
  const isOpen = ["pending", "under_review"].includes(c.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app/admin/verification" className="text-sm text-brand-600 hover:underline">← All cases</Link>
          <h2 className="mt-1 text-xl font-bold">{org.name}</h2>
          <p className="text-sm text-ink-500">Case status: {c.status.replaceAll("_", " ")} · Assessment: {c.assessment.replaceAll("_", " ")}</p>
        </div>
        <Badge variant={c.risk.requiresManualReview ? "warning" : "default"}>Risk: {c.risk.level}</Badge>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
        <p className="font-semibold">Recommended next step</p>
        <p className="mt-1">{c.recommendedNextAction}</p>
        <p className="mt-2 text-xs text-ink-600">{c.riskDisclaimer}</p>
      </div>

      <section>
        <h3 className="font-semibold">Company details</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-ink-500">Business email</dt><dd>{org.businessEmail || "—"}</dd>
          <dt className="text-ink-500">Website</dt><dd>{org.website || "—"}</dd>
          <dt className="text-ink-500">Registration number</dt><dd>{org.registrationNumber || "—"}</dd>
          <dt className="text-ink-500">GSTIN</dt><dd>{org.gstin || "—"}</dd>
          <dt className="text-ink-500">Business type</dt><dd>{org.businessType || "—"}</dd>
          <dt className="text-ink-500">Address</dt><dd>{[org.address?.street, org.address?.city, org.address?.state, org.address?.pincode, org.address?.country].filter(Boolean).join(", ") || "—"}</dd>
          <dt className="text-ink-500">Authorized representative</dt><dd>{org.authorizedRepresentative?.name ? `${org.authorizedRepresentative.name} (${org.authorizedRepresentative.designation})` : "—"}</dd>
        </dl>
      </section>

      <section>
        <h3 className="font-semibold">Documents</h3>
        {data.documents.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {data.documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3">
                <span>{doc.fileName}</span>
                <span className="text-ink-500">({doc.type.replaceAll("_", " ")}, {Math.round(doc.size / 1024)} KB)</span>
                <Button size="sm" variant="secondary" onClick={() => download(doc)}>Download</Button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-500">No documents uploaded.</p>}
      </section>

      <section>
        <h3 className="font-semibold">Risk indicators</h3>
        <p className="mt-1 text-xs text-ink-500">Each indicator explains why it was raised. None is proof of fraud.</p>
        {c.riskIndicators.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {c.riskIndicators.map((item) => (
              <li key={item.code} className="rounded-lg border border-ink-100 p-3">
                <span className="font-mono text-xs">{item.code}</span> <Badge variant="outline">{item.severity}</Badge>
                <p className="mt-1">{item.explanation}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-500">No risk indicators were raised.</p>}
      </section>

      {c.duplicateCandidates.length ? (
        <section>
          <h3 className="font-semibold">Possible duplicates</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {c.duplicateCandidates.map((item) => (
              <li key={item.organization.id}>{item.organization.name || "Another company"} <span className="text-ink-500">({item.reasons.join(", ")}; {item.organization.verificationStatus || "unknown"})</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="font-semibold">Checks</h3>
        {c.evidence.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {c.evidence.map((item) => (
              <li key={item._id || `${item.type}-${item.recordedAt}`} className="rounded-lg border border-ink-100 p-3">
                <span className="font-medium">{CHECK_TYPE_LABELS[item.type] || item.type}</span>{" "}
                <Badge variant={RESULT_VARIANT[item.result] || "default"}>{item.result.replaceAll("_", " ")}</Badge>{" "}
                <span className="text-xs text-ink-500">{item.method.replaceAll("_", " ")} · {formatDateTime(item.recordedAt)}</span>
                {item.note ? <p className="mt-1 text-ink-700">{item.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-500">No checks recorded yet.</p>}
        {isOpen ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select label="Check" value={checkType} onChange={(e) => setCheckType(e.target.value)} options={Object.entries(CHECK_TYPE_LABELS).filter(([v]) => v !== "business_email").map(([value, label]) => ({ value, label }))} />
            <Select label="Result" value={checkResult} onChange={(e) => setCheckResult(e.target.value)} options={["match", "mismatch", "concern", "unavailable"].map((v) => ({ value: v, label: v }))} />
            <div className="sm:col-span-2">
              <Textarea label="What you checked (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button variant="secondary" disabled={note.trim().length < 10} onClick={() => run(() => verificationApi.adminRecordCheck(caseId, { type: checkType, result: checkResult, note: note.trim() }), "Check recorded")}>Record manual check</Button>
              <Button variant="secondary" onClick={() => run(() => verificationApi.adminRegistryCheck(caseId), "Registry check finished")}>Run registry check</Button>
            </div>
          </div>
        ) : null}
      </section>

      {isOpen ? (
        <section className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-semibold">Request changes</h3>
            <Textarea label="One change per line" value={changes} onChange={(e) => setChanges(e.target.value)} />
            <Button variant="secondary" disabled={!changes.trim()} onClick={() => run(() => verificationApi.adminRequestChanges(caseId, changes.split("\n").map((s) => s.trim()).filter(Boolean)), "Changes requested")}>Request changes</Button>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Approve</h3>
            <Textarea label="Review notes" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} />
            <Button onClick={() => run(() => verificationApi.adminApprove(caseId, approvalNotes), "Company verified")}>Approve company</Button>
            <p className="text-xs text-ink-500">Approval is refused while required checks are missing or blocking.</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <h3 className="font-semibold">Reject</h3>
            <Textarea label="Reason shown to the company (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => run(() => verificationApi.adminReject(caseId, reason.trim()), "Company rejected")}>Reject company</Button>
          </div>
        </section>
      ) : null}

      {c.status === "verified" ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Suspend</h3>
          <p className="text-xs text-ink-500">Suspension closes the company's live listings. Each closure is recorded.</p>
          <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => run(() => verificationApi.adminSuspend(caseId, reason.trim()), "Company suspended")}>Suspend company</Button>
        </section>
      ) : null}

      {c.status === "suspended" ? (
        <section className="space-y-2">
          <h3 className="font-semibold">Restore</h3>
          <p className="text-xs text-ink-500">Restoring re-checks every required item. Closed listings are not reopened automatically.</p>
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={() => run(() => verificationApi.adminRestore(caseId, reason.trim()), "Company restored")}>Restore company</Button>
        </section>
      ) : null}

      <section>
        <h3 className="font-semibold">History</h3>
        <ol className="mt-2 space-y-1 text-sm">
          {(c.statusHistory || []).map((entry, index) => (
            <li key={index}>
              {formatDateTime(entry.at)} · {entry.from} → {entry.to} <span className="text-ink-500">({entry.action})</span>
              {entry.reason ? <span> — {entry.reason}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

export const AdminVerificationReview = () => {
  const { caseId } = useParams();
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Company verification</h1>
      {caseId ? <CaseDetail caseId={caseId} /> : <AdminVerificationQueue />}
    </div>
  );
};

export default AdminVerificationReview;
