import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  Gift,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  XCircle,
  ExternalLink,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input, { Textarea } from "../../components/ui/Input";
import DatePicker from "../../components/ui/DatePicker";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../components/ui/useToast";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { PageHeader, StatusPill, ErrorCallout } from "../../components/Product";
import { useAuth } from "../../context/useAuth";
import { recruitmentApi, jobsApi } from "../../lib/api";
import { formatDate, initials } from "../../lib/utils";

const idOf = (v) => v?.id || v?._id || "";

const formatCurrency = (amount, currency = "INR", frequency = "annual") => {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = Number(amount);
  if (Number.isNaN(num)) return "—";
  const formatted =
    currency === "INR"
      ? `₹${num.toLocaleString("en-IN")}`
      : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(num);
  const freqLabel = frequency === "monthly" ? "/ mo" : frequency === "hourly" ? "/ hr" : "/ yr";
  return `${formatted} ${freqLabel}`;
};

const formatEmploymentType = (type) => {
  const map = {
    full_time: "Full-time",
    part_time: "Part-time",
    contract: "Contract",
    internship: "Internship",
  };
  return map[type] || type || "Full-time";
};

const useOrg = () => {
  const { organizationId } = useParams();
  const auth = useAuth();
  return organizationId || auth.organizationId;
};

// Offer Status Pill Component
const OfferStatusBadge = ({ status }) => {
  if (status === "expired") {
    return (
      <Badge variant="warning" className="text-xs">
        <Clock className="mr-1 h-3 w-3" />
        Expired
      </Badge>
    );
  }

  switch (status) {
    case "draft":
      return (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-xs">
          Draft
        </Badge>
      );
    case "issued":
    case "viewed":
      return (
        <Badge variant="brand" className="text-xs">
          <Send className="mr-1 h-3 w-3" />
          Awaiting Response
        </Badge>
      );
    case "accepted":
      return (
        <Badge variant="success" className="text-xs">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Accepted
        </Badge>
      );
    case "declined":
      return (
        <Badge variant="danger" className="text-xs">
          <XCircle className="mr-1 h-3 w-3" />
          Declined
        </Badge>
      );
    case "withdrawn":
      return (
        <Badge variant="outline" className="text-ink-500 text-xs">
          Withdrawn
        </Badge>
      );
    default:
      return <Badge variant="outline">{status || "None"}</Badge>;
  }
};

// Create / Edit Offer Modal Component
const OfferFormModal = ({ isOpen, onClose, orgId, editApp = null, onOfferSaved }) => {
  const toast = useToast();
  const qc = useQueryClient();

  const [selectedJobId, setSelectedJobId] = useState(() => idOf(editApp?.job) || "");
  const [selectedAppId, setSelectedAppId] = useState(() => String(editApp?._id || ""));
  const [designation, setDesignation] = useState(() => editApp?.offer?.designation || editApp?.job?.title || "");
  const [employmentType, setEmploymentType] = useState(() => editApp?.offer?.employmentType || "full_time");
  const [currency, setCurrency] = useState(() => editApp?.offer?.currency || "INR");
  const [payFrequency, setPayFrequency] = useState(() => editApp?.offer?.payFrequency || "annual");
  const [ctc, setCtc] = useState(() => (editApp?.offer?.ctc !== null && editApp?.offer?.ctc !== undefined ? String(editApp.offer.ctc) : ""));
  const [baseSalary, setBaseSalary] = useState(() => (editApp?.offer?.baseSalary !== null && editApp?.offer?.baseSalary !== undefined ? String(editApp.offer.baseSalary) : ""));
  const [bonus, setBonus] = useState(() => (editApp?.offer?.bonus !== null && editApp?.offer?.bonus !== undefined ? String(editApp.offer.bonus) : ""));
  const [joiningDate, setJoiningDate] = useState(() => (editApp?.offer?.joiningDate ? new Date(editApp.offer.joiningDate).toISOString().slice(0, 10) : ""));
  const [expiresAt, setExpiresAt] = useState(() => (editApp?.offer?.expiresAt ? new Date(editApp.offer.expiresAt).toISOString().slice(0, 10) : ""));
  const [notes, setNotes] = useState(() => editApp?.offer?.notes || "");
  const [errors, setErrors] = useState({});

  // Query jobs
  const jobsQuery = useQuery({
    queryKey: ["jobs-org", orgId, "offers-form"],
    queryFn: () => jobsApi.orgList(orgId, { limit: 100 }),
    enabled: isOpen && Boolean(orgId),
  });

  const jobsList = useMemo(() => jobsQuery.data?.data || [], [jobsQuery.data?.data]);

  // Query applications for the selected job
  const appsQuery = useQuery({
    queryKey: ["applications-job-eligible", orgId, selectedJobId],
    queryFn: () => recruitmentApi.orgApplications(orgId, { jobId: selectedJobId, limit: 100 }),
    enabled: isOpen && Boolean(orgId) && Boolean(selectedJobId),
  });

  const appsList = useMemo(() => {
    return (appsQuery.data?.data || []).filter((a) => {
      // Eligible if in interview, offer, or shortlisted stage
      if (editApp && String(a._id) === String(editApp._id)) return true;
      return ["interview", "offer", "shortlisted"].includes(a.status);
    });
  }, [appsQuery.data?.data, editApp]);

  // Selected application entity
  const currentApp = useMemo(() => {
    if (editApp && (!selectedAppId || String(editApp._id) === String(selectedAppId))) return editApp;
    return appsList.find((a) => String(a._id) === String(selectedAppId)) || null;
  }, [editApp, selectedAppId, appsList]);

  // When job changes and not in edit mode, auto set designation to job title
  const handleJobChange = (jId) => {
    setSelectedJobId(jId);
    setSelectedAppId("");
    const job = jobsList.find((j) => String(idOf(j)) === String(jId));
    if (job) {
      setDesignation(job.title || "");
    }
  };

  const validateForm = (isDraft = false) => {
    const errs = {};
    if (!selectedAppId && !editApp) errs.application = "Please select a candidate application";
    if (!editApp && currentApp?.offer?.status === "issued") {
      errs.application = "An active offer has already been issued for this candidate. Withdraw or edit the existing offer.";
    }
    if (!designation.trim()) errs.designation = "Designation is required";
    if (!isDraft) {
      if (!ctc || Number(ctc) <= 0) errs.ctc = "Enter a valid positive compensation amount";
      if (!joiningDate) errs.joiningDate = "Proposed joining date is required";
      if (expiresAt && joiningDate && new Date(expiresAt) > new Date(joiningDate)) {
        errs.expiresAt = "Offer expiry must be before proposed joining date";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const mutation = useMutation({
    mutationFn: ({ appId, payload }) => recruitmentApi.issueOffer(orgId, appId, payload),
    onSuccess: (_, variables) => {
      const isDraft = variables.payload.isDraft;
      toast.success(isDraft ? "Offer saved as draft" : "Offer sent to candidate successfully!");
      qc.invalidateQueries({ queryKey: ["offers", orgId] });
      qc.invalidateQueries({ queryKey: ["applications", orgId] });
      onOfferSaved && onOfferSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to process offer");
    },
  });

  const handleSubmit = (isDraft = false) => {
    if (!validateForm(isDraft)) return;
    const appId = selectedAppId || editApp?._id;
    if (!appId) return;

    const payload = {
      isDraft,
      designation: designation.trim(),
      employmentType,
      currency,
      payFrequency,
      ctc: ctc !== "" && !isNaN(Number(ctc)) ? Number(ctc) : null,
      baseSalary: baseSalary !== "" && !isNaN(Number(baseSalary)) ? Number(baseSalary) : null,
      bonus: bonus !== "" && !isNaN(Number(bonus)) ? Number(bonus) : null,
      joiningDate: joiningDate ? new Date(joiningDate).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      notes: notes.trim(),
    };

    mutation.mutate({ appId, payload });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editApp ? "Edit Offer Proposal" : "Create Offer Proposal"}
      description="Draft or extend a formal employment offer to an eligible candidate."
      size="3xl"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Form Fields */}
        <div className="space-y-4 lg:col-span-7">
          {/* Step 1: Requisition and Candidate selection */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchableSelect
              label="Job Requisition"
              value={selectedJobId}
              onChange={(e) => handleJobChange(e.target.value)}
              disabled={Boolean(editApp)}
              error={errors.job}
              options={[
                { value: "", label: "Select a job requisition..." },
                ...jobsList.map((j) => ({ value: idOf(j), label: j.title })),
              ]}
            />

            <SearchableSelect
              label="Eligible Candidate"
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              disabled={Boolean(editApp) || !selectedJobId}
              error={errors.application}
              options={[
                { value: "", label: selectedJobId ? "Select candidate..." : "Choose job first" },
                ...appsList.map((a) => ({
                  value: String(a._id),
                  label: `${a.candidate?.name || "Candidate"} (${a.candidate?.email || "No email"}) · ${a.status}`,
                })),
              ]}
            />
          </div>

          {/* Candidate Context Pill if selected */}
          {currentApp && (
            <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-xs text-brand-950">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white font-bold text-xs">
                  {initials(currentApp.candidate?.name || "Candidate")}
                </span>
                <div>
                  <span className="font-bold text-ink-900">{currentApp.candidate?.name}</span>
                  <span className="text-ink-500"> ({currentApp.candidate?.email})</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ink-600">Stage:</span>
                <StatusPill status={currentApp.status} />
              </div>
            </div>
          )}

          {/* Step 2: Role and Employment terms */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Offered Designation"
              placeholder="e.g. Senior Software Engineer"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              error={errors.designation}
              required
            />

            <SearchableSelect
              label="Employment Type"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              options={[
                { value: "full_time", label: "Full-time" },
                { value: "part_time", label: "Part-time" },
                { value: "contract", label: "Contract" },
                { value: "internship", label: "Internship" },
              ]}
            />
          </div>

          {/* Step 3: Compensation Package */}
          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">Compensation Package</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <SearchableSelect
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: "INR", label: "INR (₹)" },
                  { value: "USD", label: "USD ($)" },
                  { value: "EUR", label: "EUR (€)" },
                  { value: "GBP", label: "GBP (£)" },
                ]}
              />
              <SearchableSelect
                label="Pay Frequency"
                value={payFrequency}
                onChange={(e) => setPayFrequency(e.target.value)}
                options={[
                  { value: "annual", label: "Annual (per year)" },
                  { value: "monthly", label: "Monthly (per month)" },
                  { value: "hourly", label: "Hourly (per hour)" },
                ]}
              />
              <Input
                label="Total CTC / Year"
                type="number"
                min="0"
                placeholder="e.g. 1800000"
                value={ctc}
                onChange={(e) => setCtc(e.target.value)}
                error={errors.ctc}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Base Salary (optional)"
                type="number"
                min="0"
                placeholder="e.g. 1500000"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
              />
              <Input
                label="Bonus / Variable (optional)"
                type="number"
                min="0"
                placeholder="e.g. 300000"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </div>
          </div>

          {/* Step 4: Dates & Timeline */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-700">Proposed Joining Date</label>
              <DatePicker
                placeholder="Select joining date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                error={errors.joiningDate}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-700">Offer Expiry Date (optional)</label>
              <DatePicker
                placeholder="Select expiry date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                error={errors.expiresAt}
              />
            </div>
          </div>

          {/* Step 5: Terms, Notes, and Instructions */}
          <Textarea
            label="Terms & Special Conditions (shown on offer)"
            placeholder="e.g. Subject to background verification and reference checks. 30-day notice period."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {mutation.error && <ErrorCallout error={mutation.error} />}
        </div>

        {/* Right Column: Sticky Live Offer Preview & Guidance */}
        <div className="lg:col-span-5">
          <div className="sticky top-2 rounded-2xl border border-brand-200 bg-brand-50/30 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-brand-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-ink-900">Live Offer Preview</span>
              </div>
              <Badge variant="brand" className="text-[11px] capitalize">
                {formatEmploymentType(employmentType)}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Candidate</p>
                <p className="font-semibold text-ink-900 text-sm">
                  {currentApp?.candidate?.name || <span className="text-ink-400 italic font-normal">Choose candidate...</span>}
                </p>
                {currentApp?.candidate?.email && (
                  <p className="text-xs text-ink-500">{currentApp.candidate.email}</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Designation / Role</p>
                <p className="font-bold text-ink-900 text-base">
                  {designation || <span className="text-ink-400 italic font-normal">Enter designation...</span>}
                </p>
              </div>

              {/* Compensation card */}
              <div className="rounded-xl border border-ink-100 bg-white p-3.5 space-y-2 shadow-2xs">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Total Compensation (CTC)</p>
                <p className="text-xl font-black text-ink-900">
                  {ctc ? formatCurrency(ctc, currency, payFrequency) : <span className="text-ink-400 text-sm font-normal">Enter CTC...</span>}
                </p>
                {(baseSalary || bonus) ? (
                  <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2 text-xs">
                    <div>
                      <span className="text-ink-500 block text-[10px] uppercase">Base Salary</span>
                      <span className="font-medium text-ink-800">{baseSalary ? formatCurrency(baseSalary, currency, payFrequency) : "—"}</span>
                    </div>
                    <div>
                      <span className="text-ink-500 block text-[10px] uppercase">Bonus / Variable</span>
                      <span className="font-medium text-ink-800">{bonus ? formatCurrency(bonus, currency, payFrequency) : "—"}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Dates & Timeline */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-white border border-ink-100 p-2.5">
                  <span className="text-ink-500 block text-[10px] uppercase">Proposed Joining</span>
                  <span className="font-semibold text-ink-800">
                    {joiningDate ? formatDate(joiningDate) : <span className="text-ink-400 font-normal">Not set</span>}
                  </span>
                </div>
                <div className="rounded-lg bg-white border border-ink-100 p-2.5">
                  <span className="text-ink-500 block text-[10px] uppercase">Offer Valid Until</span>
                  <span className="font-semibold text-amber-700">
                    {expiresAt ? formatDate(expiresAt) : <span className="text-ink-400 font-normal">No expiry</span>}
                  </span>
                </div>
              </div>

              {/* Terms snippet */}
              {notes && (
                <div className="rounded-lg bg-white border border-ink-100 p-2.5 text-xs text-ink-700">
                  <span className="text-ink-500 block text-[10px] uppercase font-semibold mb-1">Key Terms</span>
                  <p className="line-clamp-3 text-ink-600">{notes}</p>
                </div>
              )}
            </div>

            {/* Quick Helper */}
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-900">
              <p className="font-semibold">Offer extension options:</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px] text-brand-700">
                <li><strong>Save as Draft:</strong> Keeps proposal internal for adjustments.</li>
                <li><strong>Send Offer:</strong> Immediately notifies candidate and opens acceptance portal.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls - Spanning full width */}
        <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 mt-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleSubmit(true)}
              isLoading={mutation.isPending && mutation.variables?.payload?.isDraft}
            >
              Save as Draft
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmit(false)}
              isLoading={mutation.isPending && !mutation.variables?.payload?.isDraft}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Send Offer to Candidate
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// Offer Detail Drawer Component
const OfferDetailDrawer = ({ isOpen, onClose, orgId, application, onEdit, onRefresh }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [hireModalOpen, setHireModalOpen] = useState(false);

  // Withdraw mutation
  const withdrawMutation = useMutation({
    mutationFn: () => recruitmentApi.withdrawOffer(orgId, application?._id, withdrawReason.trim() || undefined),
    onSuccess: () => {
      toast.success("Offer successfully withdrawn");
      setWithdrawModalOpen(false);
      setWithdrawReason("");
      qc.invalidateQueries({ queryKey: ["offers", orgId] });
      onRefresh && onRefresh();
    },
    onError: (err) => toast.error(err.message || "Failed to withdraw offer"),
  });

  // Hire mutation (transitions application to 'hired' using verified candidate acceptance)
  const hireMutation = useMutation({
    mutationFn: () => recruitmentApi.transition(orgId, application?._id, { toStatus: "hired" }),
    onSuccess: () => {
      toast.success(`${application?.candidate?.name || "Candidate"} has been officially marked as Hired! Placement record created.`);
      setHireModalOpen(false);
      qc.invalidateQueries({ queryKey: ["offers", orgId] });
      qc.invalidateQueries({ queryKey: ["applications", orgId] });
      onRefresh && onRefresh();
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to finalize hire"),
  });

  // Direct send draft mutation
  const sendDraftMutation = useMutation({
    mutationFn: () => {
      const off = application?.offer || {};
      return recruitmentApi.issueOffer(orgId, application?._id, {
        isDraft: false,
        designation: off.designation || undefined,
        ctc: off.ctc != null && !isNaN(Number(off.ctc)) ? Number(off.ctc) : null,
        currency: off.currency || "INR",
        payFrequency: off.payFrequency || "annual",
        baseSalary: off.baseSalary != null && !isNaN(Number(off.baseSalary)) ? Number(off.baseSalary) : null,
        bonus: off.bonus != null && !isNaN(Number(off.bonus)) ? Number(off.bonus) : null,
        joiningDate: off.joiningDate ? new Date(off.joiningDate).toISOString() : undefined,
        expiresAt: off.expiresAt ? new Date(off.expiresAt).toISOString() : undefined,
        employmentType: off.employmentType || "full_time",
        notes: off.notes || "",
      });
    },
    onSuccess: () => {
      toast.success("Draft offer has been sent to the candidate!");
      qc.invalidateQueries({ queryKey: ["offers", orgId] });
      onRefresh && onRefresh();
    },
    onError: (err) => toast.error(err.message || "Failed to send offer"),
  });

  if (!application) return null;

  const offer = application.offer || {};
  const candidate = application.candidate || {};
  const job = application.job || {};
  const isAccepted = offer.status === "accepted";
  const isDraft = offer.status === "draft";
  const isIssued = offer.status === "issued" || offer.status === "viewed";
  const isDeclined = offer.status === "declined";
  const isWithdrawn = offer.status === "withdrawn";
  const isExpired = offer.status === "expired";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Offer & Hiring Workspace" size="2xl">
      <div className="space-y-5">
        {/* Header Candidate & Status Banner */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-base font-bold text-brand-700">
              {initials(candidate.name || "Candidate")}
            </span>
            <div>
              <h3 className="text-lg font-bold text-ink-950">{candidate.name || "Candidate"}</h3>
              <p className="text-xs text-ink-600">
                {candidate.email} {candidate.phone && `· ${candidate.phone}`}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Application: <span className="font-semibold text-ink-900">{job.title || "Job"}</span>
                {" · "}Stage: <Badge variant="outline">{application.status}</Badge>
              </p>
            </div>
          </div>
          <OfferStatusBadge status={offer.status} expiresAt={offer.expiresAt} />
        </div>

        {/* Contextual Status Alerts */}
        {isAccepted && (
          <div className="rounded-xl border border-success-200 bg-success-50 p-4 text-xs text-success-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-success-900">
              <CheckCircle2 className="h-4 w-4 text-success-600" />
              <span>Offer Accepted by Candidate</span>
            </div>
            <p className="text-success-800">
              Candidate confirmed acceptance on {formatDate(offer.respondedAt)}.
              {offer.responseNote && ` Candidate message: "${offer.responseNote}"`}
            </p>
            {application.status !== "hired" ? (
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setHireModalOpen(true)}
                  leftIcon={<UserCheck className="h-4 w-4" />}
                  className="font-semibold px-4 py-2"
                >
                  Finalize Hire &amp; Create Placement
                </Button>
              </div>
            ) : (
              <Badge variant="success">Hired &amp; Placement Active</Badge>
            )}
          </div>
        )}

        {isIssued && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5 text-xs text-brand-950 flex items-center justify-between">
            <div>
              <p className="font-bold">Awaiting Candidate Decision</p>
              <p className="mt-0.5 text-ink-600">
                Sent on {formatDate(offer.issuedAt)}.
                {offer.expiresAt && ` Valid until ${formatDate(offer.expiresAt)}.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => setWithdrawModalOpen(true)}
            >
              Withdraw Offer
            </Button>
          </div>
        )}

        {isDraft && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold">Draft Proposal</p>
              <p className="mt-0.5 text-amber-800">
                Saved on {formatDate(offer.draftSavedAt || application.updatedAt)}. The candidate cannot view this draft until it is sent.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => onEdit(application)}>
                Edit Draft
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => sendDraftMutation.mutate()}
                isLoading={sendDraftMutation.isPending}
                leftIcon={<Send className="h-3.5 w-3.5" />}
              >
                Send to Candidate
              </Button>
            </div>
          </div>
        )}

        {isDeclined && (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3.5 text-xs text-danger-950 space-y-1">
            <div className="flex items-center gap-2 font-bold text-danger-900">
              <XCircle className="h-4 w-4 text-danger-600" />
              <span>Offer Declined</span>
            </div>
            <p className="text-danger-800">
              Declined on {formatDate(offer.respondedAt)}.
              {offer.responseNote && ` Reason provided: "${offer.responseNote}"`}
            </p>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => onEdit(application)}>
                Issue Revised Offer
              </Button>
            </div>
          </div>
        )}

        {isWithdrawn && (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-3.5 text-xs text-ink-800 space-y-1">
            <p className="font-bold text-ink-950">Offer Withdrawn</p>
            <p className="text-ink-600">
              Withdrawn on {formatDate(offer.withdrawnAt)}. {offer.withdrawnReason && `Reason: "${offer.withdrawnReason}"`}
            </p>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => onEdit(application)}>
                Create New Offer
              </Button>
            </div>
          </div>
        )}

        {isExpired && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-xs text-warning-950 space-y-1">
            <p className="font-bold text-warning-900">Offer Expired</p>
            <p className="text-warning-800">
              The response window expired on {formatDate(offer.expiresAt)}. The candidate can no longer accept this offer.
            </p>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={() => onEdit(application)}>
                Re-issue Offer
              </Button>
            </div>
          </div>
        )}

        {/* Compensation & Offer Breakdown */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">Compensation &amp; Terms</h4>
          <dl className="grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <dt className="text-ink-500 font-semibold">Offered Designation</dt>
              <dd className="text-sm font-bold text-ink-950">{offer.designation || job.title || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-500 font-semibold">Employment Type</dt>
              <dd className="text-sm font-medium text-ink-900">{formatEmploymentType(offer.employmentType)}</dd>
            </div>
            <div>
              <dt className="text-ink-500 font-semibold">Total Compensation</dt>
              <dd className="text-base font-extrabold text-brand-700">
                {formatCurrency(offer.ctc, offer.currency, offer.payFrequency)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500 font-semibold">Base / Fixed Salary</dt>
              <dd className="text-sm font-medium text-ink-900">
                {formatCurrency(offer.baseSalary, offer.currency, offer.payFrequency)}
              </dd>
            </div>
            {offer.bonus !== null && offer.bonus !== undefined && (
              <div>
                <dt className="text-ink-500 font-semibold">Performance Bonus</dt>
                <dd className="text-sm font-medium text-ink-900">
                  {formatCurrency(offer.bonus, offer.currency, offer.payFrequency)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-ink-500 font-semibold">Proposed Joining Date</dt>
              <dd className="text-sm font-medium text-ink-900">
                {offer.joiningDate ? formatDate(offer.joiningDate) : "To be mutually agreed"}
              </dd>
            </div>
          </dl>

          {offer.notes && (
            <div className="border-t border-ink-100 pt-3 text-xs text-ink-700">
              <span className="font-semibold text-ink-900">Special Terms &amp; Conditions:</span>
              <p className="mt-1 whitespace-pre-line text-ink-600 bg-ink-50/50 p-2.5 rounded-lg border border-ink-100">
                {offer.notes}
              </p>
            </div>
          )}
        </div>

        {/* Audit & Timeline Log */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">Timeline &amp; Audit Trail</h4>
          <ul className="space-y-2 text-xs text-ink-600">
            {offer.draftSavedAt && (
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span>Draft saved on {formatDate(offer.draftSavedAt)}</span>
              </li>
            )}
            {offer.issuedAt && (
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                <span>Offer issued by hiring team on {formatDate(offer.issuedAt)}</span>
              </li>
            )}
            {offer.respondedAt && (
              <li className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isAccepted ? "bg-success-500" : "bg-danger-500"
                  }`}
                />
                <span>
                  Candidate {isAccepted ? "accepted" : "declined"} on {formatDate(offer.respondedAt)}
                </span>
              </li>
            )}
            {offer.withdrawnAt && (
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                <span>Offer withdrawn on {formatDate(offer.withdrawnAt)}</span>
              </li>
            )}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            as={Link}
            to={`/app/o/${orgId}/applications/${application._id}`}
            size="sm"
            rightIcon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            Full Candidate 360
          </Button>
        </div>
      </div>

      {/* Withdraw Modal */}
      <Modal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        title="Withdraw Offer Proposal"
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Are you sure you want to withdraw the offer sent to <strong>{candidate.name}</strong>?
            The candidate will be notified that the offer was retracted.
          </p>
          <Textarea
            label="Reason for withdrawal"
            placeholder="e.g. Headcount freeze, requirement revised..."
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setWithdrawModalOpen(false)}>
              Keep Offer
            </Button>
            <Button
              variant="danger"
              onClick={() => withdrawMutation.mutate()}
              isLoading={withdrawMutation.isPending}
            >
              Confirm Withdrawal
            </Button>
          </div>
        </div>
      </Modal>

      {/* Finalize Hire Modal */}
      <ConfirmModal
        isOpen={hireModalOpen}
        onClose={() => setHireModalOpen(false)}
        onConfirm={() => hireMutation.mutate()}
        title="Confirm Candidate Hire"
        description={`This converts the accepted offer for ${candidate.name} into an official Placement, updates the application stage to 'Hired', and prepares onboarding records.`}
        confirmLabel="Confirm Hire &amp; Placement"
        tone="success"
        isLoading={hireMutation.isPending}
      />
    </Modal>
  );
};

// Main Recruiter Offers Dashboard
const OffersDashboard = () => {
  const orgId = useOrg();

  const [search, setSearch] = useState("");
  const [jobId, setJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [sortOrder, setSortOrder] = useState("date_desc");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [tableHireTarget, setTableHireTarget] = useState(null);

  const qc = useQueryClient();
  const toast = useToast();

  // Direct finalize hire mutation from table action
  const directHireMutation = useMutation({
    mutationFn: (targetApp) =>
      recruitmentApi.transition(orgId, targetApp._id, {
        toStatus: "hired",
        note: `Hire finalized for ${targetApp.candidate?.name || "candidate"} from Accepted offer`,
      }),
    onSuccess: () => {
      toast.success("Candidate successfully hired! Placement record created.");
      qc.invalidateQueries({ queryKey: ["offers", orgId] });
      qc.invalidateQueries({ queryKey: ["recruiter-applications", orgId] });
      setTableHireTarget(null);
    },
    onError: (err) => toast.error(err.message || "Failed to finalize hire"),
  });

  // Load organization jobs
  const jobs = useQuery({
    queryKey: ["jobs-org", orgId, "offers-page"],
    queryFn: () => jobsApi.orgList(orgId, { limit: 100 }),
    enabled: Boolean(orgId),
  });

  // Load offers
  const offersQuery = useQuery({
    queryKey: ["offers", orgId, { jobId, status: statusFilter }],
    queryFn: () =>
      recruitmentApi.offers(orgId, {
        limit: 100,
        ...(jobId ? { jobId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    enabled: Boolean(orgId),
  });

  const allOffers = useMemo(() => offersQuery.data?.data || [], [offersQuery.data?.data]);
  const metaCounts = offersQuery.data?.meta?.counts || null;

  // 6 KPI Status Metrics
  const kpis = useMemo(() => {
    if (metaCounts) {
      return {
        total: metaCounts.total ?? allOffers.length,
        drafts: metaCounts.drafts ?? allOffers.filter((a) => a.offer?.status === "draft").length,
        awaitingResponse:
          metaCounts.awaitingResponse ??
          allOffers.filter((a) => ["issued", "viewed"].includes(a.offer?.status)).length,
        accepted: metaCounts.accepted ?? allOffers.filter((a) => a.offer?.status === "accepted").length,
        declined: metaCounts.declined ?? allOffers.filter((a) => a.offer?.status === "declined").length,
        expired:
          metaCounts.expired ??
          allOffers.filter((a) => ["expired", "withdrawn"].includes(a.offer?.status)).length,
      };
    }
    return {
      total: allOffers.length,
      drafts: allOffers.filter((a) => a.offer?.status === "draft").length,
      awaitingResponse: allOffers.filter((a) => ["issued", "viewed"].includes(a.offer?.status)).length,
      accepted: allOffers.filter((a) => a.offer?.status === "accepted").length,
      declined: allOffers.filter((a) => a.offer?.status === "declined").length,
      expired: allOffers.filter((a) => ["expired", "withdrawn"].includes(a.offer?.status)).length,
    };
  }, [allOffers, metaCounts]);

  const visibleOffers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = new Date();

    const isDateInRange = (dateStr, range) => {
      if (range === "all" || !dateStr) return true;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return false;
      const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      if (range === "today") return itemDay === todayDay;
      if (range === "7d") return itemDay >= todayDay - 7 * 86400000;
      if (range === "this_month") {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (range === "past") return d.getTime() < now.getTime();
      return true;
    };

    let list = allOffers.filter((app) => {
      const o = app.offer || {};
      const cand = app.candidate || {};
      const j = app.job || {};

      if (term) {
        const match = [cand.name, cand.email, j.title, o.designation].some((v) =>
          (v || "").toLowerCase().includes(term)
        );
        if (!match) return false;
      }

      if (statusFilter) {
        if (statusFilter === "awaiting_response") {
          if (!["issued", "viewed"].includes(o.status)) return false;
        } else if (statusFilter === "expired") {
          const isExp = o.status === "expired" || o.status === "withdrawn";
          if (!isExp) return false;
        } else if (o.status !== statusFilter) {
          return false;
        }
      }

      const relevantDate = o.issuedAt || o.draftSavedAt || app.updatedAt;
      if (!isDateInRange(relevantDate, dateRange)) return false;

      return true;
    });

    return [...list].sort((a, b) => {
      const aO = a.offer || {};
      const bO = b.offer || {};
      if (sortOrder === "date_desc") {
        const aD = new Date(aO.issuedAt || aO.draftSavedAt || a.updatedAt).getTime();
        const bD = new Date(bO.issuedAt || bO.draftSavedAt || b.updatedAt).getTime();
        return bD - aD;
      }
      if (sortOrder === "date_asc") {
        const aD = new Date(aO.issuedAt || aO.draftSavedAt || a.updatedAt).getTime();
        const bD = new Date(bO.issuedAt || bO.draftSavedAt || b.updatedAt).getTime();
        return aD - bD;
      }
      if (sortOrder === "comp_desc") {
        return (bO.ctc || 0) - (aO.ctc || 0);
      }
      if (sortOrder === "candidate_asc") {
        return (a.candidate?.name || "").localeCompare(b.candidate?.name || "");
      }
      return 0;
    });
  }, [allOffers, search, statusFilter, dateRange, sortOrder]);

  return (
    <div className="page-wrap max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Offers &amp; Hiring"
        title="Offer management"
        description="Issue formal compensation proposals, track candidate acceptances, manage deadlines, and finalize candidate hires."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<RefreshCw className={`h-4 w-4 ${offersQuery.isFetching ? "animate-spin" : ""}`} />}
              onClick={() => offersQuery.refetch()}
              disabled={offersQuery.isFetching}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingApp(null);
                setCreateModalOpen(true);
              }}
            >
              Create Offer
            </Button>
          </div>
        }
      />

      {/* 6 KPI Status Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          data-testid="kpi-total-offers"
          onClick={() => setStatusFilter("")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Offers</span>
            <Gift className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-950">{kpis.total}</div>
          <span className="mt-1 text-[11px] text-ink-500">All proposals</span>
        </button>

        <button
          type="button"
          data-testid="kpi-drafts"
          onClick={() => setStatusFilter("draft")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Drafts</span>
            <FileText className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{kpis.drafts}</div>
          <span className="mt-1 text-[11px] text-ink-500">Unsent proposals</span>
        </button>

        <button
          type="button"
          data-testid="kpi-awaiting-response"
          onClick={() => setStatusFilter("awaiting_response")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-brand-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Resp.</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-brand-700">{kpis.awaitingResponse}</div>
          <span className="mt-1 text-[11px] text-ink-500">With candidates</span>
        </button>

        <button
          type="button"
          data-testid="kpi-accepted"
          onClick={() => setStatusFilter("accepted")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-success-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-success-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Accepted</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-success-700">{kpis.accepted}</div>
          <span className="mt-1 text-[11px] text-ink-500">Ready to hire</span>
        </button>

        <button
          type="button"
          data-testid="kpi-declined"
          onClick={() => setStatusFilter("declined")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-danger-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-danger-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Declined</span>
            <XCircle className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-danger-700">{kpis.declined}</div>
          <span className="mt-1 text-[11px] text-ink-500">Candidate passed</span>
        </button>

        <button
          type="button"
          data-testid="kpi-expired"
          onClick={() => setStatusFilter("expired")}
          className="panel flex flex-col justify-between p-4 text-left transition hover:border-warning-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center justify-between text-warning-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Expired / Wdn</span>
            <CalendarCheck className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-warning-700">{kpis.expired}</div>
          <span className="mt-1 text-[11px] text-ink-500">Expired &amp; withdrawn</span>
        </button>
      </div>

      {/* Filter and Control Bar */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Search"
            placeholder="Candidate, job or designation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchableSelect
            label="Job / Requisition"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            options={[
              { value: "", label: "All jobs" },
              ...(jobs.data?.data || []).map((job) => ({ value: idOf(job), label: job.title })),
            ]}
          />
          <SearchableSelect
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "", label: "All statuses" },
              { value: "draft", label: "Drafts" },
              { value: "awaiting_response", label: "Awaiting Response (Sent)" },
              { value: "accepted", label: "Accepted" },
              { value: "declined", label: "Declined" },
              { value: "expired", label: "Expired & Withdrawn" },
            ]}
          />
          <SearchableSelect
            label="Date range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={[
              { value: "all", label: "All dates" },
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "this_month", label: "This month" },
              { value: "past", label: "Past dates" },
            ]}
          />
          <SearchableSelect
            label="Sort by"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            options={[
              { value: "date_desc", label: "Date (latest first)" },
              { value: "date_asc", label: "Date (earliest first)" },
              { value: "comp_desc", label: "Compensation (highest first)" },
              { value: "candidate_asc", label: "Candidate (A-Z)" },
            ]}
          />
        </div>

        {statusFilter && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-600">
              Filtered by: <strong className="text-ink-900">{statusFilter.replaceAll("_", " ")}</strong>
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className="font-semibold text-brand-600 hover:underline"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {/* Offers Table / View */}
      {offersQuery.isLoading ? (
        <SkeletonList rows={4} />
      ) : offersQuery.error ? (
        <ErrorState error={offersQuery.error} onRetry={() => offersQuery.refetch()} />
      ) : visibleOffers.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={search || statusFilter ? "No offers match those filters" : "No offers created yet"}
          description={
            search || statusFilter
              ? "Try resetting your search query or selecting a different status filter."
              : "Generate and send formal compensation proposals to candidates who have cleared the interview stage."
          }
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditingApp(null);
                setCreateModalOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create Offer Proposal
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden border border-ink-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold text-ink-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Candidate
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Job / Requisition
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Compensation
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Proposed Joining
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {visibleOffers.map((app) => {
                  const o = app.offer || {};
                  const cand = app.candidate || {};
                  const j = app.job || {};

                  return (
                    <tr
                      key={app._id}
                      className="hover:bg-ink-50/50 transition cursor-pointer"
                      onClick={() => setSelectedApp(app)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
                            {initials(cand.name || "Candidate")}
                          </span>
                          <div>
                            <div className="font-bold text-ink-950">{cand.name || "Candidate"}</div>
                            <div className="text-xs text-ink-500">{cand.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-ink-900">{j.title || "Job"}</div>
                        <div className="text-xs text-ink-500">
                          {o.designation && o.designation !== j.title ? o.designation : j.company || "Role"}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-ink-900">
                          {formatCurrency(o.ctc, o.currency, o.payFrequency)}
                        </div>
                        <div className="text-[11px] text-ink-500">
                          {formatEmploymentType(o.employmentType)}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-ink-700">
                        {o.joiningDate ? formatDate(o.joiningDate) : "—"}
                        {o.expiresAt && (
                          <div className="text-[11px] text-ink-400">Exp: {formatDate(o.expiresAt)}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <OfferStatusBadge status={o.status} expiresAt={o.expiresAt} />
                      </td>

                      <td className="px-4 py-3.5 text-right w-64 min-w-[240px]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {o.status === "accepted" && app.status !== "hired" && (
                            <Button
                              size="sm"
                              variant="primary"
                              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-3 py-1.5 text-xs shadow-xs focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                              onClick={() => setTableHireTarget(app)}
                              disabled={directHireMutation.isPending}
                              leftIcon={<UserCheck className="h-3.5 w-3.5" />}
                            >
                              Finalize Hire
                            </Button>
                          )}
                          {o.status === "draft" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="px-3 py-1.5 text-xs font-semibold"
                              onClick={() => {
                                setEditingApp(app);
                                setCreateModalOpen(true);
                              }}
                            >
                              Edit Draft
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            className="px-3 py-1.5 text-xs font-semibold text-ink-700 bg-white hover:bg-ink-50 border border-ink-200 shadow-2xs focus:ring-2 focus:ring-brand-500 focus:ring-offset-1"
                            onClick={() => setSelectedApp(app)}
                          >
                            Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Offer Modal */}
      {createModalOpen && (
        <OfferFormModal
          key={editingApp?._id || "new"}
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setEditingApp(null);
          }}
          orgId={orgId}
          editApp={editingApp}
          onOfferSaved={() => {
            offersQuery.refetch();
          }}
        />
      )}

      {/* Offer Detail Workspace Drawer */}
      <OfferDetailDrawer
        isOpen={Boolean(selectedApp)}
        onClose={() => setSelectedApp(null)}
        orgId={orgId}
        application={selectedApp}
        onEdit={(app) => {
          setSelectedApp(null);
          setEditingApp(app);
          setCreateModalOpen(true);
        }}
        onRefresh={() => {
          offersQuery.refetch();
        }}
      />

      {/* Direct Finalize Hire Confirmation Modal from Table */}
      <ConfirmModal
        isOpen={Boolean(tableHireTarget)}
        onClose={() => setTableHireTarget(null)}
        onConfirm={() => tableHireTarget && directHireMutation.mutate(tableHireTarget)}
        title="Finalize Candidate Hire"
        description={`This converts the accepted offer for ${tableHireTarget?.candidate?.name || "the candidate"} into an active Placement record and advances application status to 'Hired'.`}
        confirmLabel="Finalize Hire"
        tone="success"
        isLoading={directHireMutation.isPending}
      />
    </div>
  );
};

export default OffersDashboard;
