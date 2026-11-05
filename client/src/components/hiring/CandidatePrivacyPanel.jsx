import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "../ui/Button";
import Input, { Select } from "../ui/Input";
import { useToast } from "../ui/useToast";
import { candidateApi } from "../../lib/api";

/*
 * Candidate-controlled privacy and employment details (Phase 4). Everything here is closed by
 * default: recruiters see a phone number or current employment only after the candidate turns
 * the matching switch on. Employment details are candidate-reported; the platform never infers them.
 */
export const CandidatePrivacyPanel = ({ profile }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    employmentStatus: profile?.employmentStatus || "unspecified",
    disclosed: Boolean(profile?.currentEmployment?.disclosed),
    employer: profile?.currentEmployment?.employer || "",
    designation: profile?.currentEmployment?.designation || "",
    sharePhoneWithRecruiters: Boolean(profile?.privacy?.sharePhoneWithRecruiters),
    shareCurrentEmployment: Boolean(profile?.privacy?.shareCurrentEmployment),
  }));
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  const save = useMutation({
    mutationFn: () =>
      candidateApi.updateProfile({
        employmentStatus: form.employmentStatus,
        currentEmployment: {
          disclosed: form.disclosed,
          employer: form.employer.trim(),
          designation: form.designation.trim(),
        },
        privacy: {
          sharePhoneWithRecruiters: form.sharePhoneWithRecruiters,
          shareCurrentEmployment: form.shareCurrentEmployment,
        },
      }),
    onSuccess: () => {
      toast.success("Privacy settings saved");
      qc.invalidateQueries({ queryKey: ["candidate-profile"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section aria-label="Privacy and employment" className="panel space-y-5 p-6 sm:p-8">
      <div>
        <h2 className="font-bold">Privacy and employment</h2>
        <p className="mt-1 text-sm text-ink-500">
          Nothing here is shown to recruiters unless you turn it on. Employers see your application, resume and
          the details you choose to share. Employment details are what you report; the platform does not verify
          them unless a separate check is recorded.
        </p>
      </div>
      <Select label="Employment status" value={form.employmentStatus} onChange={set("employmentStatus")}>
        <option value="unspecified">Prefer not to say</option>
        <option value="employed">Employed</option>
        <option value="unemployed">Not currently employed</option>
        <option value="student">Student</option>
        <option value="freelancer">Freelancer</option>
        <option value="other">Other</option>
      </Select>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Current employment (optional)</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.disclosed} onChange={set("disclosed")} />
          I want to share my current employment details
        </label>
        <Input label="Employer" value={form.employer} onChange={set("employer")} disabled={!form.disclosed} />
        <Input label="Designation" value={form.designation} onChange={set("designation")} disabled={!form.disclosed} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.shareCurrentEmployment}
            onChange={set("shareCurrentEmployment")}
            disabled={!form.disclosed}
          />
          Show these details to recruiters where I have applied
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.sharePhoneWithRecruiters} onChange={set("sharePhoneWithRecruiters")} />
        Show my phone number to recruiters where I have applied
      </label>
      <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
        Save privacy settings
      </Button>
    </section>
  );
};

export default CandidatePrivacyPanel;
