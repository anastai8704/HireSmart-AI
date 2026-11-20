import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  FolderGit2,
  GraduationCap,
  ImagePlus,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Avatar from "../components/ui/Avatar";
import CompletionRing from "../components/ui/CompletionRing";
import { ErrorCallout, PageHeader } from "../components/Product";
import { SkeletonList } from "../components/ui/States";
import { candidateApi, resumeApi, userApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useToast } from "../components/ui/useToast";
import { cn, formatDate } from "../lib/utils";

import { ROLE_PROFILES, profileRoleFor } from "../lib/profileConfig";
import { CandidatePrivacyPanel } from "../components/hiring/CandidatePrivacyPanel";
import { PlanBadge } from "../components/billing/PlanBadge";

const formFrom = (u) =>
  u
    ? {
        name: u.displayName || u.name || "",
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

  const candidateProfileQuery = useQuery({
    queryKey: ["candidate-profile"],
    queryFn: candidateApi.profile,
    enabled: role === "candidate",
    staleTime: 60_000,
  });

  const resumesQuery = useQuery({
    queryKey: ["resumes"],
    queryFn: () => (resumeApi?.list ? resumeApi.list() : Promise.resolve({ data: [] })),
    enabled: role === "candidate",
    staleTime: 60_000,
  });

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

  if (!form)
    return (
      <div className="page-wrap max-w-6xl">
        <SkeletonList rows={4} />
      </div>
    );

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Profile completion — computed strictly from real fields saved on the profile
  const candidateProfile = candidateProfileQuery.data?.data?.profile || {};
  const checklist = [
    ["Full name", Boolean(auth.user?.displayName || auth.user?.name)],
    ["Professional headline", Boolean(auth.user?.headline)],
    ["Location", Boolean(auth.user?.location)],
    ["Summary / Bio", Boolean(auth.user?.bio)],
    ["Skills", (auth.user?.skills || []).length > 0],
    ["Education", (candidateProfile.education || []).length > 0],
    ["Experience", (candidateProfile.experience || []).length > 0],
  ];
  const doneCount = checklist.filter(([, done]) => done).length;
  const completion = Math.round((doneCount / checklist.length) * 100);

  const versions = resumesQuery.data?.data || [];
  const readyResume = versions.find((v) => v.processingStatus === "ready") || versions[0];

  return (
    <div className="page-wrap max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Profile"
        title="My Profile"
        description={config.description}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              as={Link}
              to="/app/settings"
              variant="secondary"
              size="sm"
              leftIcon={<Settings className="h-4 w-4 text-ink-500" />}
            >
              Account Settings
            </Button>
            <PlanBadge
              billingHref={
                auth.role === "candidate"
                  ? "/app/candidate/plans"
                  : auth.organizationId
                    ? `/app/o/${auth.organizationId}/billing`
                    : undefined
              }
            />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
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
            <p className="mt-4 text-base font-bold">{auth.user?.displayName || auth.user?.name}</p>
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

          {role === "candidate" && (
            <section className="panel p-5">
              <div className="flex items-center justify-between gap-2 border-b border-ink-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-ink-900">Profile completeness</h3>
                  <p className="text-xs text-ink-500">
                    {doneCount} of {checklist.length} items complete
                  </p>
                </div>
                <span
                  data-testid="profile-completion-pct"
                  className={cn(
                    "text-sm font-extrabold",
                    completion === 100
                      ? "text-success-600"
                      : completion >= 60
                        ? "text-brand-600"
                        : "text-warning-600",
                  )}
                >
                  {completion}%
                </span>
              </div>
              <div className="flex justify-center py-4">
                <CompletionRing
                  value={completion}
                  size={96}
                  strokeWidth={8}
                  tone={completion === 100 ? "success" : completion >= 60 ? "brand" : "warning"}
                />
              </div>
              <div className="space-y-2 border-t border-ink-100 pt-3 text-xs">
                {checklist.map(([label, done]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className={done ? "font-medium text-ink-700" : "text-ink-400"}>
                      {label}
                    </span>
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
                    ) : (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-ink-200" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {role === "candidate" && (
            <section className="panel p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <FileText className="h-4 w-4 text-brand-600" />
                  Primary Resume
                </h3>
                <Link
                  to="/app/candidate/resumes"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Manage
                </Link>
              </div>
              {readyResume ? (
                <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 font-semibold text-ink-900">
                    <span
                      className="truncate"
                      title={readyResume.fileName || readyResume.originalName}
                    >
                      {readyResume.fileName || readyResume.originalName || "Primary Resume"}
                    </span>
                    <Badge
                      variant={readyResume.processingStatus === "ready" ? "success" : "default"}
                      size="sm"
                    >
                      v{readyResume.versionNumber || 1}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-ink-500">
                    <span>
                      {readyResume.atsScore ? `${readyResume.atsScore}% ATS score` : "ATS Ready"}
                    </span>
                    <span>{formatDate(readyResume.createdAt)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-ink-200 p-3 text-center text-xs">
                  <p className="text-ink-500">No resume associated yet.</p>
                  <Link
                    to="/app/candidate/resumes"
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
                  >
                    Upload in Resume Manager <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </section>
          )}

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
                    <div key={f.key} className={f.type === "tags" ? "sm:col-span-2" : undefined}>
                      <Input
                        label={f.label}
                        type={f.type === "url" ? "url" : f.type === "phone" ? "tel" : "text"}
                        value={form[f.key]}
                        onChange={set(f.key)}
                        placeholder={f.placeholder}
                        hint={f.hint}
                      />
                      {f.type === "tags" && parseTags(form[f.key]).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {parseTags(form[f.key]).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-md border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
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
    empty: "Add your degrees, certifications or academic courses.",
    itemFields: [
      { key: "institution", label: "Institution", required: true, placeholder: "e.g. Stanford University" },
      { key: "degree", label: "Degree", required: true, placeholder: "e.g. Bachelor of Science" },
      { key: "fieldOfStudy", label: "Field of study", placeholder: "e.g. Computer Science" },
      { key: "startYear", label: "Start year", type: "year", placeholder: "2018" },
      { key: "endYear", label: "End year", type: "year", placeholder: "2022" },
    ],
  },
  {
    key: "experience",
    icon: BriefcaseBusiness,
    title: "Experience",
    empty: "Add your previous and current roles.",
    itemFields: [
      { key: "company", label: "Company", required: true, placeholder: "e.g. Acme Corp" },
      { key: "position", label: "Position", required: true, placeholder: "e.g. Senior Software Engineer" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Responsibilities, technical stack and achievements" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "endDate", label: "End date", type: "date" },
      { key: "currentlyWorking", label: "Currently working here", type: "checkbox" },
    ],
  },
  {
    key: "projects",
    icon: FolderGit2,
    title: "Projects",
    empty: "Add projects that demonstrate your capabilities.",
    itemFields: [
      { key: "title", label: "Title", required: true, placeholder: "e.g. Distributed Task Queue" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Key features and architectural overview" },
      { key: "technologies", label: "Technologies", hint: "Separate with commas", placeholder: "Node.js, Redis, Docker" },
      { key: "githubUrl", label: "GitHub link", type: "url", placeholder: "https://github.com/..." },
      { key: "liveUrl", label: "Live link", type: "url", placeholder: "https://project-demo.com" },
    ],
  },
  {
    key: "certifications",
    icon: Award,
    title: "Certifications",
    empty: "Add professional credentials and verified certifications.",
    itemFields: [
      { key: "name", label: "Certification", required: true, placeholder: "e.g. AWS Certified Solutions Architect" },
      { key: "issuer", label: "Issuer", placeholder: "e.g. Amazon Web Services" },
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
      if (value) out[f.key] = typeof value === "string" && value.includes("T") ? value.split("T")[0] : value;
    } else if (f.type === "checkbox") {
      out[f.key] = Boolean(value);
    } else if (f.type === "tags" || f.key === "technologies") {
      if (Array.isArray(value)) out[f.key] = value;
      else if (String(value).trim()) out[f.key] = parseTags(value).slice(0, 50);
    } else if (String(value).trim()) {
      out[f.key] = String(value).trim();
    }
  }
  return out;
};

const toDateInputString = (val) => {
  if (!val) return "";
  if (typeof val === "string" && val.includes("T")) return val.split("T")[0];
  return String(val).slice(0, 10);
};

const DetailSection = ({ def, items, onChange }) => {
  const Icon = def.icon;
  const update = (index, key, value) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-bold text-ink-950">
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
          Add {def.title === "Education" ? "degree" : def.title === "Experience" ? "role" : def.title === "Projects" ? "project" : "certification"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">{def.empty}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-ink-100 bg-ink-50/50 p-4 transition-all"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {def.itemFields.map((f) => {
                  if (f.type === "textarea") {
                    return (
                      <div key={f.key} className="sm:col-span-2">
                        <Textarea
                          label={f.label}
                          value={item[f.key] || ""}
                          rows={2}
                          placeholder={f.placeholder}
                          onChange={(e) => update(index, f.key, e.target.value)}
                        />
                      </div>
                    );
                  }
                  if (f.type === "checkbox") {
                    return (
                      <label
                        key={f.key}
                        className="flex items-center gap-2.5 pt-1 text-sm font-medium text-ink-700 sm:col-span-2"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(item[f.key])}
                          onChange={(e) => update(index, f.key, e.target.checked)}
                          className="h-4.5 w-4.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        {f.label}
                      </label>
                    );
                  }
                  const isEndDateDisabled = f.key === "endDate" && Boolean(item.currentlyWorking);
                  const displayVal =
                    f.key === "technologies" && Array.isArray(item[f.key])
                      ? item[f.key].join(", ")
                      : f.type === "date"
                        ? toDateInputString(item[f.key])
                        : (item[f.key] ?? "");
                  return (
                    <Input
                      key={f.key}
                      label={f.label}
                      type={f.type === "date" ? "date" : f.type === "year" ? "number" : f.type === "url" ? "url" : "text"}
                      inputMode={f.type === "year" ? "numeric" : undefined}
                      value={isEndDateDisabled ? "" : displayVal}
                      placeholder={f.placeholder}
                      hint={isEndDateDisabled ? "Present (currently working here)" : f.hint}
                      disabled={isEndDateDisabled}
                      onChange={(e) => update(index, f.key, e.target.value)}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
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
      setDraft(null);
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
    <>
      <section className="mt-8">
        <div className="panel p-6">
          <div className="flex flex-col gap-3 border-b border-ink-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Professional details
              </p>
              <h2 className="mt-1 text-xl font-bold text-ink-950">Your experience & credentials</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                Education, work history, projects and certifications back up your skills and improve matching.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {draft !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                >
                  Reset
                </Button>
              )}
              <Button onClick={() => save.mutate()} isLoading={save.isPending}>
                Save details
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-4">
              <ErrorCallout error={error} />
            </div>
          )}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-bold text-ink-900">Location & Languages</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="City"
                placeholder="e.g. Bengaluru"
                value={items.city}
                onChange={(e) => setDraft((d) => ({ ...(d || items), city: e.target.value }))}
              />
              <Input
                label="State / Province"
                placeholder="e.g. Karnataka"
                value={items.state}
                onChange={(e) => setDraft((d) => ({ ...(d || items), state: e.target.value }))}
              />
              <Input
                label="Country"
                placeholder="e.g. India"
                value={items.country}
                onChange={(e) => setDraft((d) => ({ ...(d || items), country: e.target.value }))}
              />
            </div>
            <div className="mt-4">
              <Input
                label="Languages"
                value={items.languages}
                placeholder="English, Hindi, Kannada"
                hint="Separate with commas"
                onChange={(e) => setDraft((d) => ({ ...(d || items), languages: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-8 space-y-6">
            {DETAIL_SECTIONS.map((def) => (
              <DetailSection
                key={def.key}
                def={def}
                items={items[def.key] || []}
                onChange={setItems(def.key)}
              />
            ))}
          </div>
        </div>
      </section>
      {q.data && (
        <div className="mt-8">
          <CandidatePrivacyPanel profile={profile} />
        </div>
      )}
    </>
  );
};

export default ProfilePage;
