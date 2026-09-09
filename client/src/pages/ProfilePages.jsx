import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  FolderGit2,
  GraduationCap,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Avatar from "../components/ui/Avatar";
import { ErrorCallout, PageHeader } from "../components/Product";
import { SkeletonList } from "../components/ui/States";
import { candidateApi, userApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/useToast";

import { ROLE_PROFILES, profileRoleFor } from "../lib/profileConfig";

const formFrom = (u) =>
  u
    ? {
        name: u.displayName || "",
        phone: u.phone || "",
        headline: u.headline || "",
        location: u.location || "",
        bio: u.bio || "",
        skills: (u.skills || []).join(", "),
        hiringSpecializations: (u.hiringSpecializations || []).join(", "),
        companyName: u.companyName || "",
        department: u.department || "",
        companyWebsite: u.companyWebsite || "",
        linkedin: u.socialLinks?.linkedin || "",
        github: u.socialLinks?.github || "",
        portfolio: u.socialLinks?.portfolio || "",
      }
    : null;

const parseTags = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const buildPayload = (form, role) => {
  const payload = {
    name: form.name,
    phone: form.phone,
    headline: form.headline,
    location: form.location,
    bio: form.bio,
    socialLinks: {
      linkedin: form.linkedin,
      github: form.github,
      portfolio: form.portfolio,
    },
  };
  if (role === "candidate") payload.skills = parseTags(form.skills);
  if (role === "recruiter")
    Object.assign(payload, {
      skills: parseTags(form.skills),
      hiringSpecializations: parseTags(form.hiringSpecializations),
      companyName: form.companyName,
      department: form.department,
      companyWebsite: form.companyWebsite,
    });
  return payload;
};

const roleLabel = (auth) =>
  auth.role === "admin"
    ? "Platform admin"
    : auth.role === "candidate"
      ? "Candidate"
      : auth.membership?.role
        ? `${auth.membership.role.replace("_", " ")} · ${auth.organization?.name || "Hiring team"}`
        : "Recruiter";

export const ProfilePage = () => {
  const auth = useAuth(),
    toast = useToast(),
    role = profileRoleFor(auth),
    config = ROLE_PROFILES[role],
    [form, setForm] = useState(() => formFrom(auth.user)),
    [photo, setPhoto] = useState(null),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState(null);
  const save = useMutation({
    mutationFn: () => userApi.updateProfile(buildPayload(form, role)),
    onSuccess: async () => {
      toast.success("Profile saved");
      await auth.refresh();
    },
    onError: (e) => setError(e),
  });
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await userApi.uploadAvatar(file);
      toast.success("Photo updated");
      setPhoto(Date.now());
      await auth.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    setError(null);
    try {
      await userApi.removeAvatar();
      toast.success("Photo removed");
      setPhoto(Date.now());
      await auth.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setPhotoBusy(false);
    }
  };
  if (!form) return <div className="page-wrap max-w-5xl"><SkeletonList rows={4} /></div>;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Profile"
        title="My Profile"
        description={config.description}
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="panel p-6 text-center">
            <div className="mx-auto w-fit">
              <Avatar
                user={auth.user}
                key={photo || "current"}
                sizeClass="h-28 w-28"
                textClass="text-3xl"
              />
            </div>
            <p className="mt-4 text-base font-bold">{auth.user?.displayName}</p>
            <p className="mt-0.5 text-sm text-ink-500">{auth.user?.email}</p>
            <Badge className="mt-3">{roleLabel(auth)}</Badge>
            <div className="mt-5 border-t border-ink-100 pt-4">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={uploadPhoto}
                  disabled={photoBusy}
                />
                <ImagePlus className="h-4 w-4" />
                {photoBusy ? "Working…" : "Upload photo"}
              </label>
              {auth.user?.profileImage && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={photoBusy}
                  className="mt-2 block w-full text-xs font-semibold text-danger-600 hover:underline disabled:opacity-50"
                >
                  Remove photo
                </button>
              )}
              <p className="mt-2 text-[11px] text-ink-400">JPG, PNG or WebP · up to 2 MB</p>
            </div>
          </section>
          <section className="panel p-4 text-sm">
            <p className="font-semibold text-ink-700">How this is used</p>
            <p className="mt-1.5 text-ink-500">
              {role === "candidate"
                ? "Your profile appears on applications and in recruiter searches. Sensitive attributes are not used for ranking."
                : role === "recruiter"
                  ? "Candidates see your name, headline and photo when you interact with their applications."
                  : "Your name and photo appear next to moderation and platform decisions."}
            </p>
          </section>
        </aside>
        <form
          className="panel space-y-8 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {config.sections.map((section) => (
            <fieldset key={section.title}>
              <legend className="mb-3 text-[11px] font-bold uppercase tracking-widest text-ink-400">
                {section.title}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.fields.map((f) =>
                  f.type === "textarea" ? (
                    <div key={f.key} className="sm:col-span-2">
                      <Textarea
                        label={f.label}
                        value={form[f.key]}
                        onChange={set(f.key)}
                        rows={f.rows || 3}
                        placeholder={f.placeholder}
                      />
                    </div>
                  ) : (
                    <Input
                      key={f.key}
                      label={f.label}
                      type={f.type === "url" ? "url" : f.type === "phone" ? "tel" : "text"}
                      value={form[f.key]}
                      onChange={set(f.key)}
                      placeholder={f.placeholder}
                      hint={f.hint}
                    />
                  ),
                )}
              </div>
            </fieldset>
          ))}
          {error && <ErrorCallout error={error} />}
          <div className="flex items-center gap-3 border-t border-ink-100 pt-5">
            <Button type="submit" isLoading={save.isPending}>
              Save profile
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(formFrom(auth.user));
                setError(null);
              }}
            >
              Reset
            </Button>
            {save.isSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success-600">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </p>
            )}
          </div>
        </form>
      </div>
      {config.details && <CandidateDetailsPanel auth={auth} />}
    </div>
  );
};

/* ------------------------- candidate professional details ------------------------- */

const DETAIL_SECTIONS = [
  {
    key: "education",
    icon: GraduationCap,
    title: "Education",
    empty: "Add your degrees or courses.",
    itemFields: [
      { key: "institution", label: "Institution", required: true },
      { key: "degree", label: "Degree", required: true },
      { key: "fieldOfStudy", label: "Field of study" },
      { key: "startYear", label: "Start year", type: "year" },
      { key: "endYear", label: "End year", type: "year" },
    ],
  },
  {
    key: "experience",
    icon: BriefcaseBusiness,
    title: "Experience",
    empty: "Add your work history.",
    itemFields: [
      { key: "company", label: "Company", required: true },
      { key: "position", label: "Position", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "endDate", label: "End date", type: "date" },
      { key: "currentlyWorking", label: "Currently working here", type: "checkbox" },
    ],
  },
  {
    key: "projects",
    icon: FolderGit2,
    title: "Projects",
    empty: "Add projects that show your work.",
    itemFields: [
      { key: "title", label: "Title", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "technologies", label: "Technologies", hint: "Separate with commas" },
      { key: "githubUrl", label: "GitHub link", type: "url" },
      { key: "liveUrl", label: "Live link", type: "url" },
    ],
  },
  {
    key: "certifications",
    icon: Award,
    title: "Certifications",
    empty: "Add professional certifications.",
    itemFields: [
      { key: "name", label: "Certification", required: true },
      { key: "issuer", label: "Issuer" },
      { key: "issueDate", label: "Issue date", type: "date" },
    ],
  },
];

const blankItem = (fields) => {
  const item = {};
  for (const f of fields) item[f.key] = f.type === "checkbox" ? false : "";
  return item;
};

const normalizeItem = (item, fields) => {
  const out = {};
  for (const f of fields) {
    const value = item[f.key];
    if (value === undefined) continue;
    if (f.type === "year") {
      if (value !== "" && value !== null) out[f.key] = Number(value);
    } else if (f.type === "date") {
      if (value) out[f.key] = value;
    } else if (f.type === "checkbox") {
      if (value) out[f.key] = true;
    } else if (f.type === "tags" || f.key === "technologies") {
      if (String(value).trim())
        out[f.key] = parseTags(value).slice(0, 50);
    } else if (String(value).trim()) {
      out[f.key] = String(value).trim();
    }
  }
  return out;
};

const DetailSection = ({ def, items, onChange }) => {
  const Icon = def.icon;
  const update = (index, key, value) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Icon className="h-4.5 w-4.5" />
          </span>
          {def.title}
          {items.length > 0 && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-500">
              {items.length}
            </span>
          )}
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...items, blankItem(def.itemFields)])}
        >
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">{def.empty}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-ink-100 bg-ink-50/50 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {def.itemFields.map((f) =>
                  f.type === "textarea" ? (
                    <div key={f.key} className="sm:col-span-2">
                      <Textarea
                        label={f.label}
                        value={item[f.key] || ""}
                        rows={2}
                        onChange={(e) => update(index, f.key, e.target.value)}
                      />
                    </div>
                  ) : f.type === "checkbox" ? (
                    <label
                      key={f.key}
                      className="flex items-center gap-2.5 text-sm font-medium text-ink-700"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(item[f.key])}
                        onChange={(e) => update(index, f.key, e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-ink-300"
                      />
                      {f.label}
                    </label>
                  ) : (
                    <Input
                      key={f.key}
                      label={f.label}
                      type={f.type === "date" ? "date" : f.type === "year" ? "number" : "text"}
                      inputMode={f.type === "year" ? "numeric" : undefined}
                      value={item[f.key] ?? ""}
                      hint={f.hint}
                      onChange={(e) => update(index, f.key, e.target.value)}
                    />
                  ),
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CandidateDetailsPanel = ({ auth }) => {
  const toast = useToast(),
    qc = useQueryClient(),
    q = useQuery({ queryKey: ["candidate-profile"], queryFn: candidateApi.profile, staleTime: 60_000 }),
    profile = q.data?.data?.profile || {},
    [draft, setDraft] = useState(null),
    [error, setError] = useState(null);
  const items = draft || {
    education: profile.education || [],
    experience: profile.experience || [],
    projects: profile.projects || [],
    certifications: profile.certifications || [],
    languages: (profile.languages || []).join(", "),
    city: profile.city || "",
    state: profile.state || "",
    country: profile.country || "",
  };
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        languages: parseTags(items.languages),
        city: items.city,
        state: items.state,
        country: items.country,
      };
      for (const def of DETAIL_SECTIONS)
        payload[def.key] = (items[def.key] || [])
          .map((item) => normalizeItem(item, def.itemFields))
          .filter((item) => Object.keys(item).length > 0);
      await candidateApi.updateProfile(payload);
    },
    onSuccess: async () => {
      toast.success("Professional details saved");
      qc.invalidateQueries({ queryKey: ["candidate-profile"] });
      await auth.refresh();
    },
    onError: (e) => setError(e),
  });
  if (q.isLoading)
    return (
      <div className="mt-6">
        <SkeletonList rows={3} />
      </div>
    );
  if (q.error) return null;
  const setItems = (key) => (value) => setDraft((d) => ({ ...(d || items), [key]: value }));
  return (
    <section className="mt-8">
      <PageHeader
        eyebrow="Professional details"
        title="Your experience"
        description="Education, work history and projects back up your skills and improve matching. Everything here is optional."
        action={
          <Button
            onClick={() => save.mutate()}
            isLoading={save.isPending}
            disabled={save.isSuccess}
          >
            Save details
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorCallout error={error} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="City"
          value={items.city}
          onChange={(e) => setDraft((d) => ({ ...(d || items), city: e.target.value }))}
        />
        <Input
          label="State"
          value={items.state}
          onChange={(e) => setDraft((d) => ({ ...(d || items), state: e.target.value }))}
        />
        <Input
          label="Country"
          value={items.country}
          onChange={(e) => setDraft((d) => ({ ...(d || items), country: e.target.value }))}
        />
      </div>
      <div className="mt-4">
        <Input
          label="Languages"
          value={items.languages}
          hint="Separate with commas"
          onChange={(e) => setDraft((d) => ({ ...(d || items), languages: e.target.value }))}
        />
      </div>
      <div className="mt-6 space-y-6">
        {DETAIL_SECTIONS.map((def) => (
          <DetailSection
            key={def.key}
            def={def}
            items={items[def.key] || []}
            onChange={setItems(def.key)}
          />
        ))}
      </div>
    </section>
  );
};

export default ProfilePage;
