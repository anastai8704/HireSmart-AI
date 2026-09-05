import { useRef, useState } from "react";
import { newId } from "../../lib/id";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  Check,
  FileSearch,
  FileText,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, SkeletonList } from "../../components/ui/States";
import {
  AIProvenance,
  ErrorCallout,
  HybridMatch,
  JobTile,
  Metric,
  PageHeader,
  StatusPill,
} from "../../components/Product";
import {
  alertsApi,
  aiApi,
  candidateApi,
  downloadBlob,
  interviewApi,
  jobsApi,
  resumeApi,
} from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { formatDate, formatRelativeTime } from "../../lib/utils";
import { useDebouncedValue } from "../../hooks/useApi";
const getVersions = (response) => response?.meta?.versions || [];
const useResumes = () => useQuery({ queryKey: ["resumes"], queryFn: resumeApi.list });
const CANDIDATE_SUGGESTIONS = [
  "How should I tailor my resume for a senior role?",
  "Which skills should I highlight for my target jobs?",
  "What should I prepare before my interview?",
  "Summarize my strongest job matches.",
];
export const CandidateDashboard = () => {
  const profile = useQuery({ queryKey: ["candidate-profile"], queryFn: candidateApi.profile }),
    resumes = useResumes(),
    apps = useQuery({
      queryKey: ["applications-candidate", {}],
      queryFn: () => candidateApi.applications({ limit: 20 }),
    }),
    recs = useQuery({
      queryKey: ["recommendations", 5],
      queryFn: () => candidateApi.recommendations(5),
      enabled: getVersions(resumes.data).some((v) => v.processingStatus === "ready"),
    }),
    latestReadyId = getVersions(resumes.data).find((v) => v.processingStatus === "ready")?.id,
    resumeDetail = useQuery({
      queryKey: ["resume-version", latestReadyId],
      queryFn: () => resumeApi.detail(latestReadyId),
      enabled: Boolean(latestReadyId),
    });
  if (profile.isLoading || resumes.isLoading) return <LoadingState />;
  const versions = getVersions(resumes.data),
    ready = versions.find((v) => v.processingStatus === "ready"),
    applications = apps.data?.data || [],
    next = !ready
      ? {
          title: "Upload your first resume",
          copy: "We’ll validate, parse and analyze it privately.",
          to: "/app/candidate/resumes",
          icon: Upload,
        }
      : !profile.data?.data?.user?.onboardingCompleted
        ? {
            title: "Complete your profile",
            copy: "Add the context employers need to evaluate your experience.",
            to: "/app/candidate/onboarding",
            icon: FileSearch,
          }
        : applications.some((a) => a.status === "interview")
          ? {
              title: "Prepare for your interview",
              copy: "Practice against the role’s actual requirements.",
              to: "/app/candidate/interviews",
              icon: Video,
            }
          : {
              title: "Review your best job fits",
              copy: "Start with roles backed by evidence from your latest resume.",
              to: "/app/candidate/recommendations",
              icon: Sparkles,
            };
  const Icon = next.icon;
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Candidate workspace"
        title={`Good to see you, ${profile.data?.data?.user?.displayName?.split(" ")[0] || "there"}.`}
        description="Focus on the next action that moves your search forward."
      />
      <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl bg-ink-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
            Next best action
          </p>
          <Icon className="mt-8 h-8 w-8 text-cyan-300" />
          <h2 className="mt-4 text-2xl font-bold">{next.title}</h2>
          <p className="mt-2 text-ink-300">{next.copy}</p>
          <Button as={Link} to={next.to} className="mt-6" variant="secondary">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="panel grid grid-cols-2 gap-5 p-6">
          <Metric label="Resume versions" value={versions.length} />
          <Metric
            label="Ready"
            value={versions.filter((v) => v.processingStatus === "ready").length}
            tone="success"
          />
          <Metric label="Applications" value={applications.length} />
          <Metric
            label="Interviews"
            value={applications.filter((a) => a.status === "interview").length}
            tone="brand"
          />
        </div>
      </section>
      {ready && (
        <section className="panel mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Metric
            label="Resume readiness"
            value={resumeDetail.data?.data?.parsedResume?.analysis?.atsScore ?? "—"}
            detail="Latest processed version"
            tone="brand"
          />
          <div className="sm:border-l sm:pl-6">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-400">
              Priority skill gaps
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(recs.data?.data?.[0]?.match?.missingRequiredSkills || [])
                .slice(0, 6)
                .map((skill) => (
                  <Badge key={skill} variant="warning">
                    {skill}
                  </Badge>
                ))}
              {!recs.data?.data?.[0]?.match?.missingRequiredSkills?.length && (
                <span className="text-sm text-ink-500">
                  Run a job fit to identify role-specific gaps.
                </span>
              )}
            </div>
          </div>
        </section>
      )}
      <section className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow">Recommended for you</p>
            <h2 className="mt-1 text-xl font-bold">Opportunities matched to you</h2>
          </div>
          <Link
            className="text-sm font-semibold text-brand-600"
            to="/app/candidate/recommendations"
          >
            View all
          </Link>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {recs.isLoading ? (
            <SkeletonList />
          ) : (
            (recs.data?.data || [])
              .slice(0, 4)
              .map((x) => <JobTile key={x.job.id} job={x.job} match={x.match} />)
          )}
        </div>
      </section>
    </div>
  );
};
export const OnboardingPage = () => {
  const auth = useAuth(),
    navigate = useNavigate(),
    q = useQuery({ queryKey: ["candidate-profile"], queryFn: candidateApi.profile }),
    toast = useToast(),
    [serverError, setServerError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({
    values: q.data
      ? {
          name: q.data.data.user.displayName || "",
          headline: q.data.data.user.headline || "",
          location: q.data.data.user.location || "",
          bio: q.data.data.user.bio || "",
          skills: (q.data.data.user.skills || []).join(", "),
        }
      : undefined,
  });
  if (q.isLoading) return <LoadingState />;
  return (
    <div className="page-wrap max-w-3xl">
      <PageHeader
        eyebrow="Profile"
        title="Tell your professional story"
        description="This context improves recommendations. Sensitive attributes are not used for ranking."
      />
      <form
        className="panel space-y-5 p-6"
        onSubmit={handleSubmit(async (v) => {
          setServerError(null);
          try {
            await candidateApi.updateProfile({
              ...v,
              skills: v.skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              onboardingCompleted: true,
            });
            toast.success("Profile saved");
            await auth.refresh();
            navigate("/app/candidate");
          } catch (error) {
            setServerError(error);
          }
        })}
      >
        {serverError && <ErrorCallout error={serverError} />}
        <Input label="Full name" required {...register("name")} />
        <Input
          label="Professional headline"
          placeholder="Backend engineer focused on reliable systems"
          {...register("headline")}
        />
        <Input label="Location" {...register("location")} />
        <Textarea label="Professional summary" rows={5} {...register("bio")} />
        <Input
          label="Skills"
          hint="Comma-separated; use skills you can evidence."
          {...register("skills")}
        />
        <div className="flex justify-end">
          <Button type="submit" isLoading={isSubmitting}>
            Save profile
          </Button>
        </div>
      </form>
    </div>
  );
};
export const ResumeManager = () => {
  const q = useResumes(),
    qc = useQueryClient(),
    toast = useToast(),
    input = useRef(),
    [drag, setDrag] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(null);
  const upload = useMutation({
    mutationFn: (file) =>
      resumeApi.upload(file, (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100))),
    onSuccess: (r) => {
      toast.success(r.data.duplicate ? "Existing version found" : "Resume uploaded and queued");
      qc.invalidateQueries({ queryKey: ["resumes"] });
      setProgress(0);
    },
    onError: (e) => {
      setError(e);
      setProgress(0);
    },
  });
  const handle = (file) => {
    setError(null);
    if (!file) return;
    if (
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError(new Error("Choose a PDF or DOCX no larger than 10 MB."));
      return;
    }
    upload.mutate(file);
  };
  if (q.isLoading) return <LoadingState />;
  const versions = getVersions(q.data);
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Resume"
        title="Your resumes"
        description="Every application keeps the exact version you submitted."
        action={
          <Button onClick={() => input.current?.click()} leftIcon={<Upload className="h-4 w-4" />}>
            Upload version
          </Button>
        }
      />
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => handle(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`mb-7 w-full rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-300"}`}
      >
        <Upload className="mx-auto h-7 w-7 text-brand-600" />
        <p className="mt-3 font-semibold">Drop a PDF or DOCX, or browse</p>
        <p className="mt-1 text-sm text-ink-500">
          Private upload · content verified · 10 MB maximum
        </p>
        {upload.isPending && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="h-2 rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs">Uploading {progress}%</p>
          </div>
        )}
      </button>
      {error && <ErrorCallout error={error} />}
      <div className="grid gap-3">
        {versions.length ? (
          versions.map((v) => (
            <Link
              to={`/app/candidate/resumes/${v.id}`}
              key={v.id}
              className="panel flex flex-col gap-4 p-5 transition hover:border-brand-300 sm:flex-row sm:items-center"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.originalName}</p>
                <p className="text-xs text-ink-500">
                  Version {v.version} · {formatDate(v.createdAt)}
                </p>
              </div>
              <StatusPill status={v.processingStatus} />
              <ArrowRight className="h-4 w-4 text-ink-400" />
            </Link>
          ))
        ) : (
          <EmptyState title="No resume versions yet" description="Upload a PDF or DOCX to begin." />
        )}
      </div>
    </div>
  );
};
export const ResumeDetail = () => {
  const { versionId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    navigate = useNavigate(),
    [analysis, setAnalysis] = useState(null),
    [jobId, setJobId] = useState(""),
    [tailoring, setTailoring] = useState(null),
    [rewriteText, setRewriteText] = useState(""),
    [rewrite, setRewrite] = useState(null),
    [deleteOpen, setDeleteOpen] = useState(false),
    [dismissed, setDismissed] = useState([]);
  const q = useQuery({
    queryKey: ["resume-version", versionId],
    queryFn: () => resumeApi.detail(versionId),
    refetchInterval: (data) =>
      ["queued", "processing"].includes(data?.state?.data?.data?.resumeVersion?.processingStatus)
        ? 2000
        : false,
  });
  const analyse = useMutation({
      mutationFn: () => resumeApi.analysis(versionId),
      onSuccess: (r) => setAnalysis(r.data),
    }),
    retry = useMutation({
      mutationFn: () => resumeApi.retry(versionId),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["resume-version", versionId] }),
    }),
    tailor = useMutation({
      mutationFn: () => resumeApi.tailor(versionId, jobId),
      onSuccess: (r) => setTailoring(r.data),
    }),
    removeVersion = useMutation({
      mutationFn: () => resumeApi.remove(versionId),
      onSuccess: () => {
        toast.success("Resume version deleted");
        qc.invalidateQueries({ queryKey: ["resumes"] });
        navigate("/app/candidate/resumes");
      },
    }),
    rewriteMutation = useMutation({
      mutationFn: () =>
        aiApi.run(
          "resume_rewrite",
          { text: rewriteText, mode: "evidence_preserving" },
          { subjectType: "resume_version", subjectId: versionId },
        ),
      onSuccess: (r) => setRewrite(r.data),
    });
  if (q.isLoading) return <LoadingState message="Loading resume version…" />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );
  const { resumeVersion: v, parsedResume: p } = q.data.data;
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`Resume version ${v.version}`}
        title={v.originalName}
        description="Review processing, extraction and AI guidance before using this version."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={v.processingStatus} />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () =>
                downloadBlob(await resumeApi.download(versionId), v.originalName)
              }
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="danger"
              isLoading={removeVersion.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>
        }
      />
      {["queued", "processing"].includes(v.processingStatus) && (
        <div className="panel p-6">
          <p className="font-semibold">Processing your resume</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-brand-500" />
          </div>
          <p className="mt-2 text-sm text-ink-500">
            {v.processingStage} · this page updates automatically.
          </p>
        </div>
      )}
      {["failed", "rejected"].includes(v.processingStatus) && (
        <div className="space-y-4">
          <ErrorCallout error={new Error(v.failure?.message || "Resume processing failed")} />
          <Button
            onClick={() => retry.mutate()}
            isLoading={retry.isPending}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Retry processing
          </Button>
        </div>
      )}
      {v.processingStatus === "ready" && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <section className="panel p-6">
              <h2 className="text-lg font-bold">Details we extracted</h2>
              <p className="mt-1 text-sm text-ink-500">
                Confidence {Math.round((p?.confidence || 0) * 100)}%. Verify before relying on it.
              </p>
              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Skills</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p?.skills?.map((s) => (
                    <Badge key={s.normalized}>
                      {s.name} · {Math.round(s.confidence * 100)}%
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Metric
                  label="Experience"
                  value={p?.experienceYears ?? "Uncertain"}
                  detail={p?.experienceYears != null ? "years detected" : "Review manually"}
                />
                <Metric
                  label="Readiness"
                  value={p?.analysis?.atsScore ?? "—"}
                  detail={p?.analysis?.grade ? `Grade ${p.analysis.grade}` : "Analysis available"}
                />
              </div>
              {p?.warnings?.length > 0 && (
                <ul className="mt-5 text-sm text-warning-700">
                  {p.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className="ai-panel p-6">
              <p className="eyebrow !text-cyan-300">AI resume analysis</p>
              <h2 className="mt-2 text-xl font-bold">Turn evidence into clearer impact.</h2>
              <p className="mt-2 text-sm leading-6 text-ink-300">
                Generate validated recommendations for this exact version. Nothing is overwritten.
              </p>
              <Button
                className="mt-5"
                variant="secondary"
                onClick={() => analyse.mutate()}
                isLoading={analyse.isPending}
                leftIcon={<WandSparkles className="h-4 w-4" />}
              >
                Analyze version
              </Button>
              {analyse.error && (
                <div className="mt-4">
                  <ErrorCallout error={analyse.error} />
                </div>
              )}
            </section>
          </div>
          {analysis && (
            <section className="ai-panel mt-6 p-6">
              <AIProvenance
                metadata={analysis.metadata}
                confidence={analysis.confidence}
                limitations={analysis.uncertainties}
              />
              <h3 className="mt-6 text-lg font-bold">Prioritized improvements</h3>
              <div className="mt-3 space-y-3">
                {analysis.suggestions
                  ?.filter((_, index) => !dismissed.includes(index))
                  .map((s, i) => (
                    <article key={`${s.title}-${i}`} className="rounded-xl bg-white/6 p-4">
                      <div className="flex justify-between gap-3">
                        <p className="font-semibold">{s.title}</p>
                        <Badge
                          variant={
                            s.severity === "critical"
                              ? "danger"
                              : s.severity === "high"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {s.severity}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink-300">{s.detail}</p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            toast.info(
                              "Suggestion copied for your review. The uploaded file was not changed.",
                            )
                          }
                        >
                          Approve as note
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDismissed((items) => [...items, i])}
                        >
                          Reject
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          )}
          <section className="panel mt-6 p-6">
            <h2 className="text-lg font-bold">Rewrite lab</h2>
            <p className="mt-1 text-sm text-ink-500">
              Paste one bullet, summary, or skills paragraph. Review before and after; your uploaded
              resume is never overwritten.
            </p>
            <Textarea
              className="mt-4"
              label="Text to improve"
              value={rewriteText}
              onChange={(e) => setRewriteText(e.target.value)}
            />
            <Button
              className="mt-3"
              disabled={rewriteText.length < 10}
              isLoading={rewriteMutation.isPending}
              onClick={() => rewriteMutation.mutate()}
            >
              Generate evidence-preserving rewrite
            </Button>
            {rewriteMutation.error && (
              <div className="mt-3">
                <ErrorCallout error={rewriteMutation.error} />
              </div>
            )}
            {rewrite && (
              <div className="mt-5">
                <p className="mb-3 text-xs text-ink-500">
                  AI Assistant suggestion · {Math.round((rewrite.confidence || 0) * 100)}%
                  confidence
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-ink-50 p-4">
                    <p className="text-xs font-bold uppercase text-ink-400">Before</p>
                    <p className="mt-2 text-sm leading-6">{rewrite.before}</p>
                  </div>
                  <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                    <p className="text-xs font-bold uppercase text-brand-700">Proposed</p>
                    <p className="mt-2 text-sm leading-6">{rewrite.after}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(rewrite.after);
                          toast.success("Rewrite copied. Your resume file was not changed.");
                        }}
                      >
                        Approve & copy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRewrite(null)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
          <section className="panel mt-6 p-6">
            <h2 className="text-lg font-bold">Tailor to a published job</h2>
            <p className="mt-1 text-sm text-ink-500">
              Enter a job ID from a job detail page. Suggestions cannot invent experience and never
              modify your file.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Job ID"
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
              <Button
                disabled={jobId.length !== 24}
                isLoading={tailor.isPending}
                onClick={() => tailor.mutate()}
              >
                Generate tailoring plan
              </Button>
            </div>
            {tailor.error && (
              <div className="mt-4">
                <ErrorCallout error={tailor.error} />
              </div>
            )}
            {tailoring && (
              <div className="mt-6">
                <HybridMatch match={tailoring.fit} />
                <div className="mt-5 space-y-3">
                  {tailoring.improvement?.suggestions?.map((s) => (
                    <div key={s.title} className="rounded-xl bg-ink-50 p-4">
                      <p className="font-semibold">{s.title}</p>
                      <p className="mt-1 text-sm text-ink-600">{s.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this resume version?"
        description="Applications that reference it retain a private copy according to policy."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={removeVersion.isPending}
              onClick={() => removeVersion.mutate()}
            >
              Delete version
            </Button>
          </>
        }
      >
        This removes the version from your resume manager. It cannot be undone.
      </Modal>
    </div>
  );
};
export const CandidateJobs = ({ recommendations = false }) => {
  const saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("query") || ""),
    qc = useQueryClient(),
    toast = useToast();
  const debouncedSearch = useDebouncedValue(search, 350);
  const q = useQuery({
    queryKey: [recommendations ? "recommendations" : "jobs-public", debouncedSearch],
    queryFn: ({ signal }) =>
      recommendations
        ? candidateApi.recommendations(30)
        : jobsApi.list({ query: debouncedSearch, limit: 40 }, { signal }),
  });
  const save = useMutation({
    mutationFn: async (id) => {
      const exists = (saved.data?.data || []).some((j) => (j.id || j._id) === id);
      return exists ? jobsApi.unsave(id) : jobsApi.save(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      toast.success("Saved jobs updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = q.data?.data || [];
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={recommendations ? "AI recommendations" : "Job Discovery"}
        title={recommendations ? "Roles ranked for you" : "Jobs matched to you"}
        description={
          recommendations
            ? "Matches use your latest ready resume, with limitations shown for transparency."
            : "Search open roles, then check how well you match with the resume version you choose."
        }
      />
      {!recommendations && (
        <div className="panel mb-6 flex gap-3 p-4">
          <Input
            aria-label="Search jobs"
            placeholder="Role, skill or keyword"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setParams({ query: e.target.value });
            }}
          />
          <Button onClick={() => setParams({ query: search })}>Search</Button>
        </div>
      )}
      {q.isLoading ? (
        <SkeletonList count={6} />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : rows.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((item) => {
            const job = item.job || item,
              match = item.match;
            const jobId = job.id || job._id;
            return (
              <JobTile
                key={jobId}
                job={job}
                match={match}
                saved={(saved.data?.data || []).some((j) => (j.id || j._id) === jobId)}
                onSave={(id) => save.mutate(id)}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState title="No jobs found" />
      )}
    </div>
  );
};
export const CandidateJobDetail = () => {
  const { jobId } = useParams(),
    resumes = useResumes(),
    toast = useToast(),
    navigate = useNavigate(),
    [versionId, setVersionId] = useState(""),
    [fit, setFit] = useState(null),
    [applyOpen, setApplyOpen] = useState(false),
    [tailorPlan, setTailorPlan] = useState(null),
    [applicationKey] = useState(() => newId()),
    selectedVersionId =
      versionId || getVersions(resumes.data).find((v) => v.processingStatus === "ready")?.id || "";
  const q = useQuery({ queryKey: ["job", "public", jobId], queryFn: () => jobsApi.get(jobId) });
  const fitMutation = useMutation({
      mutationFn: () => jobsApi.fit(jobId, selectedVersionId),
      onSuccess: (r) => setFit(r.data),
    }),
    tailorMutation = useMutation({
      mutationFn: () => resumeApi.tailor(selectedVersionId, jobId),
      onSuccess: (r) => setTailorPlan(r.data),
    }),
    apply = useMutation({
      mutationFn: () =>
        jobsApi.apply(
          jobId,
          { resumeVersionId: selectedVersionId, source: "direct" },
          applicationKey,
        ),
      onSuccess: (r) => {
        toast.success("Application submitted");
        navigate(`/app/candidate/applications/${r.data.id}`);
      },
    });
  if (q.isLoading) return <LoadingState />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );
  const job = q.data.data,
    versions = getVersions(resumes.data).filter((v) => v.processingStatus === "ready");
  return (
    <div className="page-wrap">
      <Link to="/app/candidate/jobs" className="text-sm font-semibold text-brand-600">
        ← Back to jobs
      </Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <article className="panel p-6 sm:p-8">
          <p className="eyebrow">{job.workplaceMode || job.jobType}</p>
          <h1 className="mt-2 text-3xl font-bold">{job.title}</h1>
          <p className="mt-2 text-ink-500">
            {job.company} · {job.location}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {job.requiredSkills?.map((s) => (
              <Badge key={s}>{s} · required</Badge>
            ))}
            {job.preferredSkills?.map((s) => (
              <Badge key={s} variant="outline">
                {s} · preferred
              </Badge>
            ))}
          </div>
          <div className="mt-8 whitespace-pre-wrap leading-7 text-ink-700">{job.description}</div>
        </article>
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="font-bold">See how you match</h2>
            {versions.length ? (
              <>
                <label className="mt-4 block text-sm font-medium" htmlFor="resume-version">
                  Resume version
                </label>
                <select
                  id="resume-version"
                  className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                  value={selectedVersionId}
                  onChange={(e) => setVersionId(e.target.value)}
                >
                  {versions.map((v) => (
                    <option value={v.id} key={v.id}>
                      v{v.version} · {v.originalName}
                    </option>
                  ))}
                </select>
                <Button
                  fullWidth
                  className="mt-4"
                  onClick={() => fitMutation.mutate()}
                  isLoading={fitMutation.isPending}
                >
                  Check My Match
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-500">A ready resume is required.</p>
                <Button as={Link} to="/app/candidate/resumes" className="mt-4" variant="secondary">
                  Upload resume
                </Button>
              </>
            )}
            {fitMutation.error && (
              <div className="mt-3">
                <ErrorCallout error={fitMutation.error} />
              </div>
            )}
          </div>
          {fit && (
            <>
              <Button fullWidth onClick={() => setApplyOpen(true)}>
                Apply for this Job
              </Button>
              <Button
                fullWidth
                variant="secondary"
                isLoading={tailorMutation.isPending}
                onClick={() => tailorMutation.mutate()}
              >
                Get Tailoring Suggestions
              </Button>
            </>
          )}
        </aside>
      </div>
      {fit && (
        <section className="panel mt-6 p-6">
          <HybridMatch match={fit} />
        </section>
      )}
      {tailorPlan && (
        <section className="ai-panel mt-6 p-6">
          <AIProvenance
            metadata={tailorPlan.improvement?.metadata}
            confidence={tailorPlan.improvement?.confidence}
            limitations={tailorPlan.improvement?.uncertainties}
          />
          <h2 className="mt-5 text-lg font-bold">Tailoring suggestions for this job</h2>
          <div className="mt-3 space-y-3">
            {tailorPlan.improvement?.suggestions?.map((s) => (
              <div className="rounded-xl bg-white/6 p-4" key={s.title}>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-ink-300">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <Modal
        isOpen={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Submit this application?"
        description="HireSmart will preserve the exact selected resume and job version."
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => apply.mutate()} isLoading={apply.isPending}>
              Submit Application
            </Button>
          </>
        }
      >
        {apply.error && <ErrorCallout error={apply.error} />}
        <p className="text-sm text-ink-600">
          You are applying to <strong>{job.title}</strong> with resume version{" "}
          {versions.find((v) => v.id === selectedVersionId)?.version}.
        </p>
      </Modal>
    </div>
  );
};
export const ApplicationsPage = () => {
  const [status, setStatus] = useState(""),
    q = useQuery({
      queryKey: ["applications-candidate", status],
      queryFn: () => candidateApi.applications({ status, limit: 50 }),
    }),
    saved = useQuery({ queryKey: ["saved-jobs"], queryFn: jobsApi.saved }),
    qc = useQueryClient(),
    toast = useToast(),
    unsave = useMutation({
      mutationFn: (id) => jobsApi.unsave(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["saved-jobs"] });
        toast.success("Removed from saved jobs");
      },
      onError: (error) => toast.error(error.message),
    });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="My Applications"
        title="Track your applications"
        description="Follow every application — each one is tied to the exact resume and job version you submitted."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          "",
          "submitted",
          "under_review",
          "shortlisted",
          "interview",
          "offer",
          "hired",
          "rejected",
        ].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s ? "bg-ink-950 text-white" : "bg-white text-ink-600"}`}
          >
            {s ? s.replaceAll("_", " ") : "all"}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.data?.length ? (
        <div className="space-y-3">
          {q.data.data.map((a) => (
            <Link
              key={a._id}
              to={`/app/candidate/applications/${a._id}`}
              className="panel group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold transition-colors group-hover:text-brand-700">
                  {a.job?.title || a.jobSnapshot?.title}
                </h2>
                <p className="truncate text-sm text-ink-500">
                  {a.job?.company || a.jobSnapshot?.company} · Applied{" "}
                  {formatRelativeTime(a.appliedAt)}
                </p>
              </div>
              <StatusPill status={a.status} />
              <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No applications in this stage" />
      )}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Saved jobs</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {saved.data?.data?.map((j) => (
            <JobTile key={j.id} job={j} saved onSave={(id) => unsave.mutate(id)} />
          ))}
        </div>
      </section>
    </div>
  );
};
export const ApplicationDetail = () => {
  const { applicationId } = useParams(),
    qc = useQueryClient(),
    toast = useToast(),
    [reason, setReason] = useState("");
  const q = useQuery({
      queryKey: ["application", "candidate", applicationId],
      queryFn: () => candidateApi.application(applicationId),
    }),
    withdraw = useMutation({
      mutationFn: () => candidateApi.withdraw(applicationId, reason),
      onSuccess: () => {
        toast.success("Application withdrawn");
        qc.invalidateQueries({ queryKey: ["application", "candidate", applicationId] });
      },
    });
  if (q.isLoading) return <LoadingState />;
  if (q.error)
    return (
      <div className="page-wrap">
        <ErrorState error={q.error} />
      </div>
    );
  const a = q.data.data;
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Application"
        title={a.job?.title || a.jobSnapshot?.title || "Application detail"}
        description={`${a.job?.company || a.jobSnapshot?.company || ""} · submitted ${formatDate(a.appliedAt)}`}
        action={<StatusPill status={a.status} />}
      />
      <section className="panel p-6">
        <h2 className="font-bold">Application History</h2>
        <ol className="mt-6 space-y-0">
          {(a.statusHistory || []).map((h, i) => (
            <li key={`${h.status}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
              <span className="relative z-10 mt-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-brand-50" />
              {i < a.statusHistory.length - 1 && (
                <span className="absolute left-[5px] top-4 h-full w-px bg-ink-200" />
              )}
              <div>
                <p className="font-semibold capitalize">{h.status.replaceAll("_", " ")}</p>
                <p className="text-xs text-ink-500">{formatDate(h.changedAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {!["hired", "rejected", "withdrawn", "closed"].includes(a.status) && (
        <section className="panel mt-6 p-6">
          <h2 className="font-bold">Withdraw application</h2>
          <p className="mt-1 text-sm text-ink-500">
            This keeps the audit history and cannot be undone here.
          </p>
          <Textarea
            className="mt-4"
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            className="mt-3"
            variant="danger"
            onClick={() => withdraw.mutate()}
            isLoading={withdraw.isPending}
          >
            Withdraw
          </Button>
          {withdraw.error && (
            <div className="mt-3">
              <ErrorCallout error={withdraw.error} />
            </div>
          )}
        </section>
      )}
    </div>
  );
};
export const CandidateInterviews = () => {
  const q = useQuery({ queryKey: ["candidate-interviews"], queryFn: candidateApi.interviews });
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Interviews"
        title="Your upcoming interviews"
        description="See your schedule and build a focused prep plan for each interview."
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.data.map((i) => (
            <Link
              className="panel group p-5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
              key={i._id}
              to={`/app/candidate/interviews/${i._id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Video className="h-5 w-5" />
                </span>
                <StatusPill status={i.status} />
              </div>
              <h2 className="mt-4 font-bold transition-colors group-hover:text-brand-700">
                {i.title}
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {i.application?.job?.title} ·{" "}
                {i.scheduledStart ? formatDate(i.scheduledStart) : "Schedule pending"}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No interviews scheduled" />
      )}
    </div>
  );
};
export const InterviewPrep = () => {
  const { interviewId } = useParams(),
    [result, setResult] = useState(null),
    prep = useMutation({
      mutationFn: () => interviewApi.prep(interviewId),
      onSuccess: (r) => setResult(r.data),
    }),
    confirm = useMutation({ mutationFn: () => interviewApi.confirm(interviewId) });
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Interview preparation"
        title="Prepare for your interview"
        description="Practice with questions grounded in the real job requirements. Prep aids only — never a prediction of the actual interview."
      />
      <div className="ai-panel p-6">
        <h2 className="text-xl font-bold">Build My Preparation Plan</h2>
        <p className="mt-2 text-sm text-ink-300">
          HireSmart uses the job requirements from your application. It never infers personality or
          protected traits.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => prep.mutate()} isLoading={prep.isPending}>
            Generate Prep Plan
          </Button>
          <Button variant="ghost" onClick={() => confirm.mutate()} isLoading={confirm.isPending}>
            Confirm Interview
          </Button>
        </div>
        {prep.error && (
          <div className="mt-4">
            <ErrorCallout error={prep.error} />
          </div>
        )}
      </div>
      {result && (
        <div className="mt-6 grid gap-6">
          <AIProvenance
            tone="light"
            metadata={result.metadata}
            confidence={result.confidence}
            limitations={result.limitations}
          />
          <section className="panel p-6">
            <h2 className="font-bold">Focus areas</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.focusAreas?.map((x) => (
                <Badge key={x}>{x}</Badge>
              ))}
            </div>
            <h2 className="mt-6 font-bold">Practice questions</h2>
            <ol className="mt-3 space-y-3">
              {result.practiceQuestions?.map((x, i) => (
                <li key={x} className="rounded-xl bg-ink-50 p-4 text-sm">
                  <span className="mr-2 font-bold text-brand-600">{i + 1}.</span>
                  {x}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
};
export const CareerCopilot = () => {
  const [question, setQuestion] = useState(""),
    [result, setResult] = useState(null),
    run = useMutation({
      mutationFn: () => aiApi.run("career_copilot", { text: question }),
      onSuccess: (r) => setResult(r.data),
    });
  return (
    <div className="page-wrap max-w-5xl">
      <PageHeader
        eyebrow="Career Assistant"
        title="Ask your career assistant"
        description="Get guidance grounded in your real profile and job matches. AI advice is a starting point, not a promise."
      />
      <div className="ai-panel p-6 sm:p-8">
        <Textarea
          label="What would you like help with?"
          className="!border-white/15 !bg-white/8 !text-white"
          placeholder="How can I make my backend experience more specific for senior roles?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={question.length < 10}
            isLoading={run.isPending}
            onClick={() => run.mutate()}
          >
            Ask Assistant
          </Button>
          {CANDIDATE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-brand-400 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
        {run.error && (
          <div className="mt-4">
            <ErrorCallout error={run.error} />
          </div>
        )}
        {result && (
          <div className="mt-7 border-t border-white/10 pt-6">
            <AIProvenance
              metadata={result.metadata}
              confidence={result.confidence}
              limitations={result.limitations}
            />
            <p className="mt-5 whitespace-pre-wrap leading-7 text-ink-100">{result.answer}</p>
            <ul className="mt-5 space-y-2 text-sm text-ink-300">
              {result.recommendations?.map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 text-cyan-300" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
export const AlertsPage = () => {
  const toast = useToast(),
    qc = useQueryClient(),
    q = useQuery({ queryKey: ["alerts"], queryFn: alertsApi.list }),
    remove = useMutation({
      mutationFn: (id) => alertsApi.remove(id),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["alerts"] });
        toast.success("Alert deleted");
      },
      onError: (error) => toast.error(error.message),
    }),
    toggle = useMutation({
      mutationFn: ({ id, active }) => alertsApi.update(id, { active }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
      onError: (error) => toast.error(error.message),
    });
  return (
    <div className="page-wrap max-w-4xl">
      <PageHeader
        eyebrow="Job alerts"
        title="Your saved searches"
        description="We email you when new published jobs match. Weekly by default — switch to daily for fast-moving roles."
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="space-y-3">
          {q.data.data.map((a) => (
            <div key={a.id} className="panel flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-52 flex-1">
                <p className="font-bold">{a.name}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {[
                    a.query,
                    a.location,
                    a.workplaceMode,
                    a.jobType,
                    a.skills?.length && a.skills.join(", "),
                    a.minSalary && `₹${a.minSalary.toLocaleString("en-IN")}+`,
                    a.industry,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Matches all open jobs"}{" "}
                  · {a.cadence}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {a.lastRunAt
                    ? `Last checked ${formatRelativeTime(a.lastRunAt)}`
                    : "Not checked yet"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                isLoading={toggle.isPending && toggle.variables?.id === a.id}
                onClick={() => toggle.mutate({ id: a.id, active: !a.active })}
              >
                {a.active ? "Active" : "Paused"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                isLoading={remove.isPending && remove.variables === a.id}
                onClick={() => remove.mutate(a.id)}
              >
                Delete
              </Button>
            </div>
          ))}
          {!q.data.data.length && (
            <EmptyState
              title="No alerts yet"
              description='Open the public job search, refine your filters and press "Create alert".'
            />
          )}
        </div>
      )}
    </div>
  );
};
