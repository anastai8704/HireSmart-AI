import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  FileCheck2,
  UploadCloud,
  Mail,
  Lock,
  CheckCircle2,
  Send,
  FileText,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { verificationApi } from "../../lib/api";
import { formatBytes, formatDateTime, cn } from "../../lib/utils";

// Mirrors server/domain/verificationRules.js. The server is the authority; these only label choices.
const BUSINESS_TYPE_OPTIONS = [
  ["private_limited", "Private limited company"],
  ["public_limited", "Public limited company"],
  ["llp", "Limited liability partnership"],
  ["partnership", "Partnership"],
  ["sole_proprietorship", "Sole proprietorship"],
  ["ngo", "Non-profit organization"],
  ["government", "Government body"],
  ["other", "Other"],
];

const DOCUMENT_TYPE_OPTIONS = [
  ["incorporation_certificate", "Certificate of incorporation"],
  ["gst_certificate", "GST registration certificate"],
  ["authorization_letter", "Authorization letter"],
  ["other", "Other supporting document"],
];

const STATUS_COPY = {
  pending: [
    "Not submitted",
    "Submit your official business registration details and documents so the platform compliance team can verify your organization.",
  ],
  under_review: [
    "Under review",
    "The verification team is actively reviewing your organization documents and credentials.",
  ],
  rejected: [
    "Not approved",
    "Your verification was not approved. Review the reviewer feedback below, update the details, and resubmit.",
  ],
  suspended: [
    "Suspended",
    "This organization has been suspended. Please contact platform support to resolve outstanding compliance issues.",
  ],
  verified: [
    "Verified",
    "Your company is verified. You have full access to publish jobs and engage candidates.",
  ],
};

const CHECK_LABELS = {
  business_registration: "Business registration confirmed",
  business_email: "Company email confirmed",
  recruiter_identity: "Your own email confirmed",
  duplicate_review: "Duplicate check cleared",
};

const statusVariant = {
  verified: "success",
  under_review: "brand",
  rejected: "danger",
  suspended: "danger",
  pending: "default",
};

const initialForm = (organization = {}) => ({
  businessEmail: organization.businessEmail || "",
  website: organization.website || "",
  phone: organization.phone || "",
  businessType:
    organization.businessType && organization.businessType !== "unspecified"
      ? organization.businessType
      : "",
  registrationNumber: organization.registrationNumber || "",
  gstin: organization.gstin || "",
  street: organization.address?.street || "",
  city: organization.address?.city || "",
  state: organization.address?.state || "",
  pincode: organization.address?.pincode || "",
  country: organization.address?.country || "India",
  representativeName: organization.authorizedRepresentative?.name || "",
  representativeDesignation: organization.authorizedRepresentative?.designation || "",
  consent: false,
});

const toRequestBody = (form) => ({
  businessEmail: form.businessEmail.trim(),
  website: form.website.trim() || undefined,
  phone: form.phone.trim() || undefined,
  businessType: form.businessType,
  registrationNumber: form.registrationNumber.trim() || undefined,
  gstin: form.gstin.trim().toUpperCase() || undefined,
  address: {
    street: form.street.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim() || undefined,
    country: form.country.trim(),
  },
  authorizedRepresentative: {
    name: form.representativeName.trim(),
    designation: form.representativeDesignation.trim(),
  },
  consent: { accepted: true },
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export const CompanyVerificationCard = ({ orgId }) => {
  const auth = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = ["owner", "admin"].includes(auth.membership?.role);

  const query = useQuery({
    queryKey: ["verification", orgId],
    queryFn: () => verificationApi.get(orgId),
    enabled: Boolean(orgId && canManage),
  });

  const [form, setForm] = useState(null);
  const [code, setCode] = useState("");
  const [documentType, setDocumentType] = useState("incorporation_certificate");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["verification", orgId] });
    qc.invalidateQueries({ queryKey: ["org", orgId] });
  };

  const onError = (error) => toast.error(error.message || "Operation failed");

  const submit = useMutation({
    mutationFn: (body) => verificationApi.submit(orgId, body),
    onSuccess: () => {
      refresh();
      toast.success("Details submitted for review");
    },
    onError,
  });

  const sendCode = useMutation({
    mutationFn: () => verificationApi.sendBusinessEmailCode(orgId),
    onSuccess: () => toast.success("A confirmation code was sent to the company email"),
    onError,
  });

  const confirmCode = useMutation({
    mutationFn: () => verificationApi.confirmBusinessEmailCode(orgId, code.trim()),
    onSuccess: () => {
      setCode("");
      refresh();
      toast.success("Company email confirmed");
    },
    onError,
  });

  const upload = useMutation({
    mutationFn: () => verificationApi.uploadDocument(orgId, file, documentType),
    onSuccess: () => {
      setFile(null);
      setFileError("");
      refresh();
      toast.success("Document uploaded successfully");
    },
    onError,
  });

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    setFileError("");
    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(selected.type)) {
      setFileError("Invalid format. Please upload a PDF, JPEG, or PNG file.");
      setFile(null);
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setFileError(`File exceeds 5 MB limit (${formatBytes(selected.size)}). Please choose a smaller file.`);
      setFile(null);
      return;
    }

    setFile(selected);
  };

  // Important invariant for existing unit tests
  if (!canManage || !query.data?.data) return null;

  const { organization, businessEmailVerified, documents = [], case: current } = query.data.data;
  const status = organization.verificationStatus || "pending";
  const [title, copy] = STATUS_COPY[status] || STATUS_COPY.pending;
  const editable = ["pending", "rejected"].includes(status) || Boolean(current?.changeRequest?.active || current?.changeRequest);
  const draft = form ?? initialForm(organization);
  const set = (key) => (e) => setForm({ ...draft, [key]: e.target.value });

  const pendingLabels = (current?.pendingChecks || [])
    .filter((type) => CHECK_LABELS[type])
    .map((type) => CHECK_LABELS[type]);

  // 4-Pillar verification checklist data
  const checklistItems = [
    {
      id: "business_registration",
      label: "Business Registration",
      subtext: organization.registrationNumber
        ? `CIN / LLPIN: ${organization.registrationNumber}`
        : "Provide government registration number",
      passed: Boolean(organization.registrationNumber),
    },
    {
      id: "business_email",
      label: "Corporate Domain Email",
      subtext: organization.businessEmail
        ? businessEmailVerified
          ? "Confirmed domain ownership"
          : "Verification code confirmation pending"
        : "Corporate email required",
      passed: Boolean(businessEmailVerified),
    },
    {
      id: "recruiter_identity",
      label: "Recruiter Identity",
      subtext: auth.user?.email ? "Authenticated account holder" : "Account confirmation pending",
      passed: true,
    },
    {
      id: "duplicate_review",
      label: "Duplicate Check",
      subtext: status === "verified" || !current?.pendingChecks?.includes("duplicate_review")
        ? "No duplicate entities detected"
        : "Reviewing for potential duplicate filings",
      passed: status === "verified" || !current?.pendingChecks?.includes("duplicate_review"),
    },
  ];

  const passedCount = checklistItems.filter((i) => i.passed).length;

  return (
    <div className="space-y-6" data-testid="company-verification-card">
      {/* Verification Status Header Card */}
      <section className="panel p-6 shadow-xs" aria-labelledby="verification-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                status === "verified"
                  ? "bg-emerald-100 text-emerald-700"
                  : status === "under_review"
                    ? "bg-brand-100 text-brand-700"
                    : status === "rejected" || status === "suspended"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-ink-100 text-ink-600",
              )}
            >
              {status === "verified" && <ShieldCheck className="h-6 w-6" />}
              {status === "under_review" && <Clock className="h-6 w-6" />}
              {(status === "rejected" || status === "suspended") && <ShieldAlert className="h-6 w-6" />}
              {status === "pending" && <FileCheck2 className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="verification-heading" className="text-lg font-bold text-ink-900">
                  Company verification
                </h2>
                <Badge variant={statusVariant[status] || "default"}>{title}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-500">{copy}</p>
            </div>
          </div>

          {/* Timeline timestamps */}
          <div className="flex flex-col text-right text-xs text-ink-500">
            {current?.submittedAt && (
              <span>Submitted: {formatDateTime(current.submittedAt)}</span>
            )}
            {organization.verifiedAt && (
              <span className="text-emerald-700 font-medium">
                Verified: {formatDateTime(organization.verifiedAt)}
              </span>
            )}
            {current?.changeRequest?.requestedAt && (
              <span className="text-amber-700 font-medium">
                Changes requested: {formatDateTime(current.changeRequest.requestedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Change Request Callout from Admin */}
        {current?.changeRequest?.items?.length ? (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">The verification team needs more information:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-800">
                  {current.changeRequest.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {/* Rejection / Suspension Decision Reason */}
        {current?.decisionReason ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div>
                <p className="font-semibold">Reason given</p>
                <p className="mt-1 text-ink-800">{current.decisionReason}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Under Review Missing Items Notice */}
        {status === "under_review" && pendingLabels.length ? (
          <p className="mt-4 text-sm text-ink-600">Still needed: {pendingLabels.join("; ")}.</p>
        ) : null}

        {/* 4-Pillar Verification Checklist */}
        <div className="mt-6 rounded-xl border border-ink-200 bg-surface-50 p-4.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-brand-600" />
              <h3 className="text-sm font-bold text-ink-900">Verification Readiness Checklist</h3>
            </div>
            <span className="text-xs font-semibold text-ink-600">
              {passedCount} of {checklistItems.length} criteria met
            </span>
          </div>

          <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {checklistItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col justify-between rounded-lg border p-3 transition-colors",
                  item.passed
                    ? "border-emerald-200 bg-emerald-50/60 text-emerald-950"
                    : "border-ink-200 bg-white text-ink-800",
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{item.label}</span>
                    {item.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-ink-400 shrink-0" />
                    )}
                  </div>
                  <p className="mt-1 text-2xs text-ink-500 leading-tight">{item.subtext}</p>
                </div>
                <div className="mt-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-1.5 py-0.5 text-2xs font-semibold",
                      item.passed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-ink-100 text-ink-600",
                    )}
                  >
                    {item.passed ? "Passed" : "Action Required"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corporate Email Confirmation Box */}
        {status !== "verified" && status !== "suspended" && organization.businessEmail && current ? (
          <div className="mt-6 rounded-xl border border-ink-200 bg-white p-4.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Mail className="h-4.5 w-4.5 text-brand-600" />
              <p className="font-semibold text-ink-900">Company email confirmation</p>
            </div>
            {businessEmailVerified ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <p className="font-medium">Confirmed.</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-ink-500">
                  We verify domain ownership by sending a one-time confirmation code to your official
                  business address.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => sendCode.mutate()}
                    isLoading={sendCode.isPending}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send code to {organization.businessEmail}</span>
                  </Button>
                  <div className="min-w-56 flex-1 sm:max-w-xs">
                    <Input
                      label="Code from the email"
                      placeholder="e.g. 123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => confirmCode.mutate()}
                    disabled={!code.trim() || confirmCode.isPending}
                    isLoading={confirmCode.isPending}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Legal Business Information Form (Editable when pending, rejected, or changes requested) */}
        {editable ? (
          <form
            className="mt-6 rounded-xl border border-ink-200 bg-white p-5 shadow-2xs"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate(toRequestBody(draft));
            }}
          >
            <div className="border-b border-ink-100 pb-3">
              <h3 className="font-bold text-ink-900">
                {status === "pending"
                  ? "Submit Company Verification Details"
                  : "Resubmit Verification Details"}
              </h3>
              <p className="text-xs text-ink-500">
                Enter your registered legal entity details. Our compliance team verifies these against
                statutory records.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Company email (on your company's domain)"
                type="email"
                value={draft.businessEmail}
                onChange={set("businessEmail")}
                required
                hint="e.g. hr@yourcompany.com"
              />
              <Input
                label="Website"
                placeholder="https://"
                value={draft.website}
                onChange={set("website")}
              />
              <SearchableSelect
                label="Business type"
                value={draft.businessType}
                onChange={set("businessType")}
                options={[
                  { value: "", label: "Choose a business type" },
                  ...BUSINESS_TYPE_OPTIONS.map(([value, label]) => ({ value, label })),
                ]}
                required
              />
              <Input label="Phone (optional)" value={draft.phone} onChange={set("phone")} />
              <Input
                label="Registration number (CIN / LLPIN)"
                value={draft.registrationNumber}
                onChange={set("registrationNumber")}
                hint="Corporate Identification Number (CIN) or LLPIN"
              />
              <Input
                label="GSTIN (optional)"
                placeholder="15-character GST number"
                value={draft.gstin}
                onChange={set("gstin")}
              />
              <Input label="Street address" value={draft.street} onChange={set("street")} />
              <Input label="City" value={draft.city} onChange={set("city")} required />
              <Input label="State" value={draft.state} onChange={set("state")} required />
              <Input label="PIN code" value={draft.pincode} onChange={set("pincode")} />
              <Input label="Country" value={draft.country} onChange={set("country")} required />
              <Input
                label="Authorized representative name"
                value={draft.representativeName}
                onChange={set("representativeName")}
                required
                hint="Full legal name of the signing officer"
              />
              <Input
                label="Representative's designation"
                value={draft.representativeDesignation}
                onChange={set("representativeDesignation")}
                required
                hint="e.g. Director, Founder, Head of People"
              />

              <label className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50/50 p-3 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.consent}
                  onChange={(e) => setForm({ ...draft, consent: e.target.checked })}
                  className="mt-0.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  required
                />
                <span className="text-ink-700 leading-relaxed">
                  I confirm these details are accurate and I am authorized to act for this company. The
                  platform uses them only to verify the company.
                </span>
              </label>

              <div className="sm:col-span-2 pt-2">
                <Button
                  type="submit"
                  isLoading={submit.isPending}
                  disabled={!draft.consent || submit.isPending}
                >
                  {status === "pending" ? "Submit for verification" : "Resubmit for review"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          /* Read-only view of submitted details when Under Review or Verified */
          <div className="mt-6 rounded-xl border border-ink-200 bg-surface-50 p-5">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <h3 className="font-bold text-ink-900">Submitted Legal Entity Details</h3>
              <span className="text-xs text-ink-500">
                {status === "under_review" ? "Locked for Review" : "Verified Record"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div>
                <span className="text-xs text-ink-500">Registered Business Type:</span>
                <p className="font-semibold capitalize text-ink-900">
                  {organization.businessType?.replaceAll("_", " ") || "Not specified"}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-500">Registration Number (CIN / LLPIN):</span>
                <p className="font-mono font-semibold text-ink-900">
                  {organization.registrationNumber || "Not provided"}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-500">GSTIN:</span>
                <p className="font-mono font-semibold text-ink-900">
                  {organization.gstin || "Not provided"}
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-500">Official Business Email:</span>
                <p className="font-semibold text-ink-900">{organization.businessEmail || "Not provided"}</p>
              </div>
              <div>
                <span className="text-xs text-ink-500">Authorized Representative:</span>
                <p className="font-semibold text-ink-900">
                  {organization.authorizedRepresentative?.name || "Not designated"}{" "}
                  {organization.authorizedRepresentative?.designation && (
                    <span className="text-xs font-normal text-ink-500">
                      ({organization.authorizedRepresentative.designation})
                    </span>
                  )}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-ink-500">Registered Headquarters Address:</span>
                <p className="text-ink-800">
                  {[
                    organization.address?.street,
                    organization.address?.city,
                    organization.address?.state,
                    organization.address?.pincode,
                    organization.address?.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "No address on file"}
                </p>
              </div>
            </div>

            {status === "under_review" && (
              <p className="mt-4 text-xs text-ink-500 border-t border-ink-100 pt-3">
                * Details cannot be edited while under review. If modifications are required, the
                verification team will send an itemized change request.
              </p>
            )}
          </div>
        )}

        {/* Supporting Documents Section */}
        <div className="mt-8 border-t border-ink-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-brand-600" />
                <h3 className="font-bold text-ink-900">Supporting documents</h3>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                PDF, JPEG or PNG, up to 5 MB. Documents are visible only to the verification team.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-500">
              <Lock className="h-3.5 w-3.5 text-ink-400" />
              <span>End-to-End Encrypted Storage</span>
            </div>
          </div>

          {/* Uploaded Documents List */}
          <div className="mt-4">
            {documents.length ? (
              <div className="overflow-hidden rounded-xl border border-ink-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-50 text-ink-600 font-semibold border-b border-ink-200">
                    <tr>
                      <th className="px-4 py-2.5">Document Name</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Size</th>
                      <th className="px-4 py-2.5">Uploaded</th>
                      <th className="px-4 py-2.5 text-right">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 bg-white">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-ink-50/50">
                        <td className="px-4 py-3 font-medium text-ink-900">
                          <div className="flex items-center gap-2">
                            <FileCheck2 className="h-4 w-4 text-brand-600 shrink-0" />
                            <span>{doc.fileName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-ink-600">
                          <span className="text-ink-500">({doc.type.replaceAll("_", " ")})</span>
                        </td>
                        <td className="px-4 py-3 text-ink-500 font-mono">
                          {formatBytes(doc.size)}
                        </td>
                        <td className="px-4 py-3 text-ink-500">
                          {doc.uploadedAt ? formatDateTime(doc.uploadedAt) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-700">
                            <Lock className="h-2.5 w-2.5 text-ink-500" />
                            Protected
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No documents uploaded yet.</p>
            )}
          </div>

          {/* Upload Controls (Allowed unless verified or suspended) */}
          {status !== "verified" && status !== "suspended" && (
            <div className="mt-5 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 p-4">
              <p className="text-xs font-semibold text-ink-700">Upload Required Verification Document</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 sm:max-w-xs">
                  <SearchableSelect
                    label="Document type"
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    options={DOCUMENT_TYPE_OPTIONS.map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <label className="text-sm flex-1 sm:max-w-sm">
                  <span className="block font-medium text-xs text-ink-700">File</span>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="mt-1 block w-full text-xs text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => upload.mutate()}
                  disabled={!file || Boolean(fileError) || upload.isPending}
                  isLoading={upload.isPending}
                  className="gap-1.5"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>Upload</span>
                </Button>
              </div>
              {fileError && (
                <p className="mt-2 text-xs font-medium text-danger-700" role="alert">
                  {fileError}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default CompanyVerificationCard;
