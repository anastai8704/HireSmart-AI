import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { verificationApi } from "../../lib/api";

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
  pending: ["Not submitted", "Submit your company details so the platform can verify your company."],
  under_review: ["Under review", "The verification team is reviewing your company."],
  rejected: ["Not approved", "Your verification was not approved. Update the details and resubmit."],
  suspended: ["Suspended", "This company is suspended. Contact platform support to find out what is needed."],
  verified: ["Verified", "Your company is verified. You can publish jobs."],
};
const CHECK_LABELS = {
  business_registration: "Business registration confirmed",
  business_email: "Company email confirmed",
  recruiter_identity: "Your own email confirmed",
  duplicate_review: "Duplicate check cleared",
};
const statusVariant = { verified: "success", under_review: "brand", rejected: "danger", suspended: "danger", pending: "default" };

const initialForm = (organization = {}) => ({
  businessEmail: organization.businessEmail || "",
  website: organization.website || "",
  phone: organization.phone || "",
  businessType: organization.businessType && organization.businessType !== "unspecified" ? organization.businessType : "",
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

export const CompanyVerificationCard = ({ orgId }) => {
  const auth = useAuth(),
    toast = useToast(),
    qc = useQueryClient(),
    canManage = ["owner", "admin"].includes(auth.membership?.role),
    query = useQuery({
      queryKey: ["verification", orgId],
      queryFn: () => verificationApi.get(orgId),
      enabled: Boolean(orgId && canManage),
    }),
    [form, setForm] = useState(null),
    [code, setCode] = useState(""),
    [documentType, setDocumentType] = useState("incorporation_certificate"),
    [file, setFile] = useState(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["verification", orgId] });
  const onError = (error) => toast.error(error.message);

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
      refresh();
      toast.success("Document uploaded");
    },
    onError,
  });

  if (!canManage || !query.data?.data) return null;
  const { organization, businessEmailVerified, documents = [], case: current } = query.data.data;
  const status = organization.verificationStatus || "pending";
  const [title, copy] = STATUS_COPY[status] || STATUS_COPY.pending;
  const editable = ["pending", "rejected"].includes(status) || current?.changeRequest;
  const draft = form ?? initialForm(organization);
  const set = (key) => (e) => setForm({ ...draft, [key]: e.target.value });
  const pendingLabels = (current?.pendingChecks || [])
    .filter((type) => CHECK_LABELS[type])
    .map((type) => CHECK_LABELS[type]);

  return (
    <section className="panel mt-8 p-6" aria-labelledby="verification-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="verification-heading" className="font-bold">
            Company verification
          </h2>
          <p className="mt-1 text-sm text-ink-500">{copy}</p>
        </div>
        <Badge variant={statusVariant[status] || "default"}>{title}</Badge>
      </div>

      {current?.changeRequest?.items?.length ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">The verification team needs more information:</p>
          <ul className="mt-2 list-disc pl-5">
            {current.changeRequest.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {current?.decisionReason ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
          <p className="font-semibold">Reason given</p>
          <p className="mt-1">{current.decisionReason}</p>
        </div>
      ) : null}

      {status === "under_review" && pendingLabels.length ? (
        <p className="mt-4 text-sm text-ink-600">Still needed: {pendingLabels.join("; ")}.</p>
      ) : null}

      {editable ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate(toRequestBody(draft));
          }}
        >
          <Input
            label="Company email (on your company's domain)"
            type="email"
            value={draft.businessEmail}
            onChange={set("businessEmail")}
            required
          />
          <Input label="Website" placeholder="https://" value={draft.website} onChange={set("website")} />
          <SearchableSelect
            label="Business type"
            value={draft.businessType}
            onChange={set("businessType")}
            options={[{ value: "", label: "Choose a business type" }, ...BUSINESS_TYPE_OPTIONS.map(([value, label]) => ({ value, label }))]}
            required
          />
          <Input label="Phone (optional)" value={draft.phone} onChange={set("phone")} />
          <Input
            label="Registration number (CIN / LLPIN)"
            value={draft.registrationNumber}
            onChange={set("registrationNumber")}
          />
          <Input label="GSTIN (optional)" value={draft.gstin} onChange={set("gstin")} />
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
          />
          <Input
            label="Representative's designation"
            value={draft.representativeDesignation}
            onChange={set("representativeDesignation")}
            required
          />
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.consent}
              onChange={(e) => setForm({ ...draft, consent: e.target.checked })}
              className="mt-1"
              required
            />
            <span>
              I confirm these details are accurate and I am authorized to act for this company. The platform
              uses them only to verify the company.
            </span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={submit.isPending} disabled={!draft.consent}>
              {status === "pending" ? "Submit for verification" : "Resubmit for review"}
            </Button>
          </div>
        </form>
      ) : null}

      {status !== "verified" && status !== "suspended" && organization.businessEmail && current ? (
        <div className="mt-6 border-t border-ink-100 pt-4">
          <p className="font-semibold">Company email confirmation</p>
          {businessEmailVerified ? (
            <p className="mt-1 text-sm text-emerald-700">Confirmed.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <Button variant="secondary" onClick={() => sendCode.mutate()} isLoading={sendCode.isPending}>
                Send code to {organization.businessEmail}
              </Button>
              <div className="min-w-56">
                <Input label="Code from the email" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Button onClick={() => confirmCode.mutate()} disabled={!code.trim()} isLoading={confirmCode.isPending}>
                Confirm
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-6 border-t border-ink-100 pt-4">
        <p className="font-semibold">Supporting documents</p>
        <p className="mt-1 text-sm text-ink-500">
          PDF, JPEG or PNG, up to 5 MB. Documents are visible only to the verification team.
        </p>
        {documents.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {documents.map((doc) => (
              <li key={doc.id}>
                {doc.fileName} <span className="text-ink-500">({doc.type.replaceAll("_", " ")})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-500">No documents uploaded yet.</p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <SearchableSelect
              label="Document type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              options={DOCUMENT_TYPE_OPTIONS.map(([value, label]) => ({ value, label }))}
            />
          </div>
          <label className="text-sm">
            <span className="block font-medium">File</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1"
            />
          </label>
          <Button variant="secondary" onClick={() => upload.mutate()} disabled={!file} isLoading={upload.isPending}>
            Upload
          </Button>
        </div>
      </div>
    </section>
  );
};
export default CompanyVerificationCard;
