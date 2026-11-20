import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import {
  Save,
  Send,
  Eye,
  ArrowLeft,
  Sparkles,
  WandSparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  XCircle,
  ChevronRight,
  Users,
  MapPin,
  IndianRupee,
  Check,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input, { Textarea } from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import DatePicker from "../../components/ui/DatePicker";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { PageHeader, StatusPill, ErrorCallout, AIProvenance } from "../../components/Product";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { formatDate, cn } from "../../lib/utils";
import * as api from "../../lib/api";

const getJobsApi = () => {
  try {
    return api.jobsApi || {};
  } catch {
    return {};
  }
};
const getAiApi = () => {
  try {
    return api.aiApi || {};
  } catch {
    return {};
  }
};
const getOrganizationApi = () => {
  try {
    return api.organizationApi || {};
  } catch {
    return {};
  }
};
const getSubscriptionApi = () => {
  try {
    return api.subscriptionApi || null;
  } catch {
    return null;
  }
};

// Digits-only salary field that re-formats with Indian grouping (4,00,000) as you type
const MoneyField = ({ control, name, label, placeholder, hint, error }) => (
  <Controller
    name={name}
    control={control}
    render={({ field }) => (
      <Input
        label={label}
        placeholder={placeholder}
        hint={hint}
        error={error}
        inputMode="numeric"
        icon={<IndianRupee className="h-4 w-4 text-ink-400" />}
        value={field.value || ""}
        onChange={(event) => {
          const digits = String(event.target.value).replace(/\D/g, "").slice(0, 9);
          field.onChange(digits ? Number(digits).toLocaleString("en-IN") : "");
        }}
      />
    )}
  />
);

const toRupees = (value) => Number(String(value || "").replace(/\D/g, "")) || 0;
const splitCsv = (value) =>
  String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const defaultJobValues = {
  title: "",
  company: "",
  location: "",
  industry: "",
  jobType: "Full-Time",
  workplaceMode: "hybrid",
  salaryMin: "",
  salaryMax: "",
  experience: "",
  minExpYears: "",
  maxExpYears: "",
  educationRequired: "",
  requiredSkills: "",
  preferredSkills: "",
  benefits: "",
  closesAt: "",
  description: "",
};

export const JobEditorPage = () => {
  const { organizationId: routeOrgId, jobId } = useParams();
  const auth = useAuth();
  const orgId = routeOrgId || auth.organizationId;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [aiResult, setAiResult] = useState(null);
  const [brief, setBrief] = useState("");
  const [generated, setGenerated] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [teamIds, setTeamIds] = useState([]);

  // Recruiter Permissions
  const userRole = auth.membership?.role;

  // Queries
  const existingJobQuery = useQuery({
    queryKey: ["job", "org", orgId, jobId],
    queryFn: async () => {
      if (!jobId) return null;
      try {
        const res = await getJobsApi().get(jobId);
        return res?.data ? res : { data: res };
      } catch {
        // Fallback to org list if individual get fails
        const r = await getJobsApi().orgList(orgId, { limit: 100 });
        const found = (r.data || []).find((j) => (j._id || j.id) === jobId);
        return { data: found };
      }
    },
    enabled: Boolean(jobId && orgId),
  });

  const job = existingJobQuery.data?.data;
  const isEditing = Boolean(jobId);

  // Organization members for hiring team assignment
  const membersQuery = useQuery({
    queryKey: ["organization-members", orgId],
    queryFn: () => getOrganizationApi().members(orgId, { limit: 100 }),
    enabled: Boolean(jobId && orgId && ["owner", "admin"].includes(userRole)),
  });

  // Subscription plan overview for posting limits check
  const subscriptionQuery = useQuery({
    queryKey: ["subscription-overview", orgId],
    queryFn: () => {
      const subApi = getSubscriptionApi();
      return subApi?.overview ? subApi.overview(orgId) : Promise.resolve({ data: {} });
    },
    enabled: Boolean(orgId),
  });

  const subData = subscriptionQuery.data?.data || {};
  const activeJobsLimit = subData.entitlements?.activeJobs ?? subData.plan?.limits?.activeJobs ?? 3;
  const activeJobsUsage = subData.usage?.activeJobs ?? 0;
  const isJobLimitReached = activeJobsUsage >= activeJobsLimit && job?.status !== "published";

  // Form setup
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    reset,
    formState: { isSubmitting, errors },
  } = useForm({
    defaultValues: defaultJobValues,
  });

  // Watch fields for live preview
  const watchedFields = watch();

  // Populate form when existing job data arrives
  useEffect(() => {
    if (job) {
      const comp = job.compensation;
      const min = comp?.min > 0 ? comp.min : job.salary > 0 ? job.salary : 0;
      const max = comp?.max > 0 && comp.max !== min ? comp.max : 0;

      let formattedClosesAt = "";
      if (job.closesAt) {
        try {
          const d = new Date(job.closesAt);
          if (!isNaN(d.getTime())) {
            formattedClosesAt = d.toISOString().split("T")[0];
          }
        } catch {
          formattedClosesAt = "";
        }
      }

      reset({
        title: job.title || "",
        company: job.company || auth.organization?.name || "",
        location: job.location || "",
        industry: job.industry || "",
        jobType: job.jobType || "Full-Time",
        workplaceMode: job.workplaceMode || "unspecified",
        salaryMin: min ? min.toLocaleString("en-IN") : "",
        salaryMax: max ? max.toLocaleString("en-IN") : "",
        experience: job.experience || "",
        minExpYears: job.minExpYears ?? "",
        maxExpYears: job.maxExpYears ?? "",
        educationRequired: job.educationRequired || "",
        requiredSkills: (job.requiredSkills || job.skills || []).join(", "),
        preferredSkills: (job.preferredSkills || []).join(", "),
        benefits: (job.benefits || []).join(", "),
        closesAt: formattedClosesAt,
        description: job.description || "",
      });

      if (job.hiringTeam && Array.isArray(job.hiringTeam)) {
        setTeamIds(job.hiringTeam.map((m) => (typeof m === "object" ? m._id || m.id : m)));
      }
    } else if (!jobId && auth.organization?.name) {
      setValue("company", auth.organization.name);
    }
  }, [job, jobId, auth.organization, reset, setValue]);

  // Clean payload helper
  const buildPayload = (v) => {
    const min = toRupees(v.salaryMin);
    const max = toRupees(v.salaryMax);
    const reqSkills = splitCsv(v.requiredSkills);
    const prefSkills = splitCsv(v.preferredSkills);
    const benefitsList = splitCsv(v.benefits);

    const body = {
      title: v.title.trim(),
      company: v.company.trim(),
      location: v.location.trim(),
      experience: v.experience.trim(),
      jobType: v.jobType || "Full-Time",
      workplaceMode: v.workplaceMode || "unspecified",
      description: v.description.trim(),
      requiredSkills: reqSkills,
      preferredSkills: prefSkills,
    };

    if (v.industry?.trim()) body.industry = v.industry.trim();
    if (v.educationRequired?.trim()) body.educationRequired = v.educationRequired.trim();
    if (v.minExpYears !== "" && v.minExpYears !== null && !isNaN(Number(v.minExpYears))) {
      body.minExpYears = Number(v.minExpYears);
    }
    if (v.maxExpYears !== "" && v.maxExpYears !== null && !isNaN(Number(v.maxExpYears))) {
      body.maxExpYears = Number(v.maxExpYears);
    }
    if (benefitsList.length > 0) body.benefits = benefitsList;
    if (v.closesAt) body.closesAt = v.closesAt;

    if (min > 0 || max > 0) {
      body.salary = min > 0 ? min : max;
      body.compensation = {
        min: min > 0 ? min : 0,
        max: max > 0 ? max : min,
        currency: "INR",
        period: "year",
      };
    }

    return body;
  };

  // Save Draft Mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (values) => {
      setSaveError(null);
      const body = buildPayload(values);
      if (jobId) {
        return getJobsApi().update(orgId, jobId, body);
      } else {
        return getJobsApi().create(orgId, body);
      }
    },
    onSuccess: (res) => {
      const saved = res.data;
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] });
      qc.invalidateQueries({ queryKey: ["job", "org", orgId, jobId] });

      if (jobId && saved.status === "published" && saved.pendingChanges?.status === "pending") {
        toast.success("Changes submitted for platform approval — live requisition remains active");
      } else {
        toast.success(jobId ? "Requisition updated successfully" : "Draft requisition saved");
      }

      if (!jobId && (saved.id || saved._id)) {
        navigate(`/app/o/${orgId}/jobs/${saved.id || saved._id}/edit`, { replace: true });
      }
    },
    onError: (err) => {
      setSaveError(err);
      toast.error(err.message || "Failed to save requisition");
    },
  });

  // Submit for Approval / Publish Mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (isJobLimitReached) {
        throw new Error(
          `Plan active jobs limit reached (${activeJobsLimit}). Please upgrade your subscription to publish more jobs.`,
        );
      }
      setSaveError(null);
      // If form is dirty, save first
      const values = getValues();
      const body = buildPayload(values);

      let targetJobId = jobId;
      if (!targetJobId) {
        const createRes = await getJobsApi().create(orgId, body);
        targetJobId = createRes.data?.id || createRes.data?._id;
      } else {
        await getJobsApi().update(orgId, targetJobId, body);
      }

      return getJobsApi().publish(orgId, targetJobId);
    },
    onSuccess: (res) => {
      const published = res.data;
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] });
      qc.invalidateQueries({ queryKey: ["job", "org", orgId, jobId] });
      qc.invalidateQueries({ queryKey: ["subscription-overview", orgId] });

      if (published?.moderation?.status === "pending") {
        toast.success("Submitted for platform moderation — you'll be notified when approved");
      } else {
        toast.success("Requisition published successfully");
      }

      const targetId = published.id || published._id || jobId;
      if (!jobId && targetId) {
        navigate(`/app/o/${orgId}/jobs/${targetId}/edit`, { replace: true });
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit requisition for publishing");
    },
  });

  // Close Job Mutation
  const closeMutation = useMutation({
    mutationFn: () => getJobsApi().close(orgId, jobId),
    onSuccess: () => {
      toast.success("Job requisition closed");
      qc.invalidateQueries({ queryKey: ["jobs-org", orgId] });
      qc.invalidateQueries({ queryKey: ["job", "org", orgId, jobId] });
      setShowCloseModal(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to close requisition");
    },
  });

  // Hiring Team Mutation
  const saveTeamMutation = useMutation({
    mutationFn: () => getJobsApi().setHiringTeam(orgId, jobId, teamIds),
    onSuccess: () => {
      toast.success("Hiring team updated");
      qc.invalidateQueries({ queryKey: ["job", "org", orgId, jobId] });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update hiring team");
    },
  });

  // AI JD Generation Mutation
  const generateAI = useMutation({
    mutationFn: () =>
      getAiApi().runOrg(orgId, "jd_generation", {
        text: brief,
        title: getValues("title"),
        skills: splitCsv(getValues("requiredSkills")),
      }),
    onSuccess: (res) => {
      setGenerated(res.data);
      toast.success("AI draft generated");
    },
    onError: (err) => {
      toast.error(err.message || "AI generation failed");
    },
  });

  // AI JD Improvement Mutation
  const improveAI = useMutation({
    mutationFn: () =>
      getAiApi().runOrg(orgId, "jd_improvement", {
        text: getValues("description"),
        title: getValues("title"),
        requiredSkills: getValues("requiredSkills"),
      }),
    onSuccess: (res) => {
      setAiResult(res.data);
      toast.success("AI improvement analysis complete");
    },
    onError: (err) => {
      toast.error(err.message || "AI improvement failed");
    },
  });

  // Lifecycle & Moderation State
  const pendingChanges = job?.pendingChanges;
  const isPublished = job?.status === "published";
  const isModerationRejected = isPublished && job?.moderation?.status === "rejected";
  const isChangesPending = isPublished && pendingChanges?.status === "pending";
  const isChangesRejected = isPublished && pendingChanges?.status === "rejected";
  const isClosed = job?.status === "closed";

  if (existingJobQuery.isLoading) {
    return (
      <div className="page-wrap py-12">
        <LoadingState title="Loading requisition..." description="Retrieving details and hiring requirements." />
      </div>
    );
  }

  if (existingJobQuery.isError) {
    return (
      <div className="page-wrap py-12">
        <ErrorState
          title="Could not load requisition"
          description={existingJobQuery.error?.message || "Requisition not found or access restricted."}
          action={
            <Button as={Link} to={`/app/o/${orgId}/jobs`} variant="secondary">
              Back to Requisitions
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6 pb-20">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Link
            to={`/app/o/${orgId}/jobs`}
            className="flex items-center gap-1.5 font-medium text-ink-600 transition-colors hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Requisitions
          </Link>
          <ChevronRight className="h-4 w-4 text-ink-300" />
          <span className="font-semibold text-ink-900">
            {isEditing ? (job?.title || "Edit Requisition") : "New Requisition"}
          </span>
        </div>

        {/* Top Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            leftIcon={<Eye className="h-4 w-4" />}
          >
            Live Preview
          </Button>

          {isEditing && (
            <Button
              as={Link}
              to={`/app/o/${orgId}/jobs/${jobId}/applications`}
              variant="outline"
              size="sm"
              leftIcon={<Users className="h-4 w-4" />}
            >
              Candidate Pipeline
            </Button>
          )}

          {isEditing && isPublished && !isClosed && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCloseModal(true)}
              className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
            >
              Close Requisition
            </Button>
          )}
        </div>
      </div>

      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <PageHeader
            eyebrow={isEditing ? `Requisition ID: ${jobId?.slice(-8)}` : "Create New Role"}
            title={isEditing ? `Edit Requisition: ${job?.title || ""}` : "Create Job Requisition"}
            description="Define candidate requirements, compensation, and qualifications. You can preview before publishing."
          />
        </div>

        {/* Current Status Pills */}
        {isEditing && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={job.status} />
            {job.moderation?.status === "pending" && (
              <Badge variant="warning" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Awaiting Approval
              </Badge>
            )}
            {job.moderation?.status === "approved" && (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Moderation Approved
              </Badge>
            )}
            {job.moderation?.status === "rejected" && (
              <Badge variant="danger" className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Rejected
              </Badge>
            )}
            {isChangesPending && (
              <Badge variant="warning" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Edits In Review
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Moderation Feedback & Alert Banners */}
      {isModerationRejected && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-900 shadow-sm">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 shrink-0 text-danger-600" />
            <div className="space-y-1">
              <h4 className="font-semibold text-danger-950">Requisition Rejected by Platform Review</h4>
              <p className="text-danger-800">
                {job.moderation?.reason
                  ? `Reason: ${job.moderation.reason}`
                  : "This job requisition does not comply with our platform posting guidelines."}
              </p>
              <p className="text-xs text-danger-700">
                Update the requisition details below to address the feedback, then resubmit for approval.
              </p>
            </div>
          </div>
        </div>
      )}

      {isChangesPending && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900 shadow-sm">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 shrink-0 text-warning-600" />
            <div className="space-y-1">
              <h4 className="font-semibold text-warning-950">Changes Pending Moderation</h4>
              <p className="text-warning-800">
                Your recent edits are awaiting admin approval. The previous approved version remains live to candidates
                until review is completed.
              </p>
            </div>
          </div>
        </div>
      )}

      {isChangesRejected && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-600" />
            <div className="space-y-1">
              <h4 className="font-semibold text-danger-950">Proposed Edits Rejected</h4>
              <p className="text-danger-800">
                {pendingChanges.reason ||
                  "Your last changes were not approved. The live version is unchanged. Edit and save again to resubmit."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Active Jobs Posting Limit Banner */}
      {isJobLimitReached && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <h4 className="font-semibold text-amber-950">Active Job Limit Reached</h4>
                <p className="text-amber-800">
                  Your organization has reached the limit of {activeJobsLimit} active job requisitions on the current
                  plan ({activeJobsUsage}/{activeJobsLimit} active). You can still save drafts, but publishing requires
                  an upgraded subscription or closing an existing active job.
                </p>
              </div>
            </div>
            <Button
              as={Link}
              to={`/app/o/${orgId}/billing`}
              variant="secondary"
              size="sm"
              className="shrink-0 bg-white shadow-sm hover:bg-amber-100"
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      )}

      {saveError && <ErrorCallout error={saveError} />}

      {/* Main Grid: Form on Left, AI Assist & Team on Right */}
      <div className="grid gap-8 xl:grid-cols-[1.25fr_.75fr]">
        {/* Left Column: Requisition Form */}
        <form onSubmit={handleSubmit((values) => saveDraftMutation.mutate(values))} className="space-y-8" noValidate>
          {/* Section 1: Role Overview */}
          <div className="panel space-y-5 p-6">
            <div className="border-b border-ink-100 pb-3">
              <h3 className="text-base font-semibold text-ink-900">Role & Organization</h3>
              <p className="text-xs text-ink-500">Essential information candidates see in search results and cards.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Job Title"
                placeholder="e.g. Senior Frontend Engineer"
                required
                {...register("title", {
                  required: "Job title is required",
                  minLength: { value: 2, message: "Title must be at least 2 characters" },
                  maxLength: { value: 150, message: "Title must be 150 characters or fewer" },
                })}
                error={errors.title?.message}
              />

              <Input
                label="Hiring Company"
                placeholder="e.g. Apex Innovations"
                required
                {...register("company", {
                  required: "Company name is required",
                  minLength: { value: 2, message: "Company must be at least 2 characters" },
                  maxLength: { value: 150, message: "Company must be 150 characters or fewer" },
                })}
                error={errors.company?.message}
              />

              <Input
                label="Location"
                placeholder="e.g. Bengaluru, Karnataka, India"
                required
                {...register("location", {
                  required: "Location is required",
                  minLength: { value: 1, message: "Location is required" },
                  maxLength: { value: 150, message: "Location must be 150 characters or fewer" },
                })}
                error={errors.location?.message}
              />

              <Input
                label="Industry"
                placeholder="e.g. Technology, SaaS, Healthcare"
                {...register("industry", {
                  maxLength: { value: 100, message: "Industry must be 100 characters or fewer" },
                })}
                error={errors.industry?.message}
              />
            </div>
          </div>

          {/* Section 2: Workplace & Employment Details */}
          <div className="panel space-y-5 p-6">
            <div className="border-b border-ink-100 pb-3">
              <h3 className="text-base font-semibold text-ink-900">Employment & Workplace</h3>
              <p className="text-xs text-ink-500">Set the work model, schedule, and application timeline.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                label="Employment Type"
                required
                value={watchedFields.jobType}
                onChange={(e) => setValue("jobType", e.target.value)}
                options={[
                  { value: "Full-Time", label: "Full-Time" },
                  { value: "Part-Time", label: "Part-Time" },
                  { value: "Contract", label: "Contract" },
                  { value: "Internship", label: "Internship" },
                  { value: "Remote", label: "Remote Role" },
                ]}
              />

              <SearchableSelect
                label="Workplace Mode"
                required
                value={watchedFields.workplaceMode}
                onChange={(e) => setValue("workplaceMode", e.target.value)}
                options={[
                  { value: "onsite", label: "On-site" },
                  { value: "hybrid", label: "Hybrid" },
                  { value: "remote", label: "Remote" },
                  { value: "unspecified", label: "Unspecified" },
                ]}
              />

              <div className="sm:col-span-2">
                <DatePicker
                  label="Application Deadline (Closes At)"
                  hint="Optional: The date when this requisition will automatically stop accepting applications."
                  value={watchedFields.closesAt || ""}
                  onChange={(dateStr) => setValue("closesAt", dateStr)}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Compensation & Experience */}
          <div className="panel space-y-5 p-6">
            <div className="border-b border-ink-100 pb-3">
              <h3 className="text-base font-semibold text-ink-900">Compensation & Experience</h3>
              <p className="text-xs text-ink-500">Annual compensation in INR (₹) and required career level.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField
                control={control}
                name="salaryMin"
                label="Minimum Salary (₹ / Year)"
                placeholder="e.g. 12,00,000"
                hint="Digits only — formatted in Indian grouping"
              />

              <MoneyField
                control={control}
                name="salaryMax"
                label="Maximum Salary (₹ / Year)"
                placeholder="e.g. 24,00,000"
                hint="Digits only — formatted in Indian grouping"
              />

              <Input
                label="Experience Summary"
                placeholder="e.g. 3-5 years"
                required
                hint="Candidate-facing summary phrase"
                {...register("experience", {
                  required: "Experience summary is required",
                  maxLength: { value: 100, message: "Experience summary must be 100 characters or fewer" },
                })}
                error={errors.experience?.message}
              />

              <Input
                label="Education Required"
                placeholder="e.g. Bachelor's in CS or equivalent"
                {...register("educationRequired", {
                  maxLength: { value: 200, message: "Education required must be 200 characters or fewer" },
                })}
                error={errors.educationRequired?.message}
              />

              <Input
                label="Min Experience (Years)"
                type="number"
                min="0"
                max="50"
                placeholder="e.g. 3"
                {...register("minExpYears")}
              />

              <Input
                label="Max Experience (Years)"
                type="number"
                min="0"
                max="50"
                placeholder="e.g. 7"
                {...register("maxExpYears")}
              />
            </div>
          </div>

          {/* Section 4: Skills & Benefits */}
          <div className="panel space-y-5 p-6">
            <div className="border-b border-ink-100 pb-3">
              <h3 className="text-base font-semibold text-ink-900">Skills & Benefits</h3>
              <p className="text-xs text-ink-500">
                Skills power candidate matching, resume parsing, and interview scoring.
              </p>
            </div>

            <div className="space-y-4">
              <Input
                label="Required Skills (Must-Have)"
                placeholder="e.g. React, TypeScript, Node.js, Tailwind CSS"
                hint="Comma-separated list (at least 1 required)"
                required
                {...register("requiredSkills", {
                  required: "At least one required skill is needed",
                })}
                error={errors.requiredSkills?.message}
              />

              <Input
                label="Preferred Skills (Good-to-Have)"
                placeholder="e.g. Next.js, GraphQL, Docker, AWS"
                hint="Comma-separated list of secondary skills"
                {...register("preferredSkills")}
              />

              <Input
                label="Perks & Benefits"
                placeholder="e.g. Health Insurance, Flexible Hours, Annual Learning Stipend, Remote Setup"
                hint="Comma-separated list of perks offered"
                {...register("benefits")}
              />
            </div>
          </div>

          {/* Section 5: Job Description */}
          <div className="panel space-y-5 p-6">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink-900">Job Description</h3>
                <p className="text-xs text-ink-500">Comprehensive overview of role duties, expectations, and team.</p>
              </div>
              <span className="text-xs text-ink-400">
                {(watchedFields.description || "").length} / 20,000 characters (min 20)
              </span>
            </div>

            <Textarea
              label="Description Content"
              rows={14}
              placeholder="Detail the role responsibilities, key projects, requirements, interview process, and team culture..."
              required
              {...register("description", {
                required: "Description is required",
                minLength: { value: 20, message: "Description must be at least 20 characters" },
                maxLength: { value: 20000, message: "Description exceeds 20,000 character limit" },
              })}
              error={errors.description?.message}
            />
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              leftIcon={<Eye className="h-4 w-4" />}
            >
              Preview Requisition
            </Button>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="secondary"
                isLoading={saveDraftMutation.isPending || isSubmitting}
                leftIcon={<Save className="h-4 w-4" />}
              >
                {isPublished ? "Save & Submit Changes" : "Save Draft"}
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={() => publishMutation.mutate()}
                isLoading={publishMutation.isPending}
                disabled={isJobLimitReached || (isPublished && !isModerationRejected)}
                leftIcon={<Send className="h-4 w-4" />}
              >
                {isModerationRejected
                  ? "Resubmit for Approval"
                  : isPublished
                    ? "Published (Active)"
                    : "Submit for Approval"}
              </Button>
            </div>
          </div>
        </form>

        {/* Right Column: AI Assist & Hiring Team */}
        <div className="space-y-6">
          {/* AI Description Assist Panel */}
          <div className="ai-panel p-6 shadow-md">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <p className="eyebrow !text-cyan-300">AI Description Assist</p>
            </div>
            <h3 className="mt-2 text-xl font-bold text-white">Draft or Improve with AI</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-300">
              AI suggestions provide structured drafting and bias detection. All suggestions are recruiter-reviewed.
            </p>

            {/* AI Generator */}
            <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-300">
                Generate from Brief
              </label>
              <Textarea
                className="!border-white/10 !bg-white/5 !text-white placeholder:text-ink-500"
                rows={3}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Need a senior React developer for our fintech payments team with 4+ years of scale experience..."
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
                disabled={brief.trim().length < 10}
                isLoading={generateAI.isPending}
                onClick={() => generateAI.mutate()}
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Generate Draft with AI
              </Button>

              {/* Generated Result Preview */}
              {generated && (
                <div className="mt-4 rounded-xl border border-cyan-400/20 bg-white/5 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-cyan-300">AI Generated Requisition Draft</p>
                    <span className="text-xs text-ink-400">Review before using</span>
                  </div>
                  <p className="mt-2 font-semibold text-white">{generated.title}</p>
                  <p className="mt-1 line-clamp-4 text-xs text-ink-300">{generated.description}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      className="bg-cyan-400 text-ink-900 hover:bg-cyan-300"
                      onClick={() => {
                        if (generated.title) setValue("title", generated.title);
                        if (generated.description) setValue("description", generated.description);
                        if (generated.requiredSkills?.length) {
                          setValue("requiredSkills", generated.requiredSkills.join(", "));
                        }
                        if (generated.preferredSkills?.length) {
                          setValue("preferredSkills", generated.preferredSkills.join(", "));
                        }
                        toast.success("Applied AI draft to form fields");
                      }}
                    >
                      Apply to Form
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setGenerated(null)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Improver */}
            <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-ink-300">
                Improve Current Description
              </label>
              <p className="text-xs text-ink-300">
                Enhance clarity, remove gender-biased phrases, and verify completeness.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full bg-white/10 text-white hover:bg-white/20"
                onClick={() => improveAI.mutate()}
                isLoading={improveAI.isPending}
                disabled={!(watchedFields.description || "").trim()}
                leftIcon={<WandSparkles className="h-3.5 w-3.5" />}
              >
                Improve Description & Check Bias
              </Button>

              {aiResult && (
                <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <AIProvenance
                    metadata={aiResult.metadata}
                    confidence={aiResult.confidence}
                    limitations={aiResult.uncertainties}
                  />

                  {aiResult.improvedDescription && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-cyan-300">Refined Content:</p>
                      <div className="max-h-48 overflow-y-auto rounded-lg bg-black/20 p-3 text-xs leading-relaxed text-ink-200">
                        {aiResult.improvedDescription}
                      </div>
                    </div>
                  )}

                  {aiResult.biasWarnings?.length > 0 && (
                    <div className="rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
                      <p className="text-xs font-semibold text-warning-400">Bias Considerations Identified:</p>
                      <ul className="mt-1 space-y-1 text-xs text-warning-200">
                        {aiResult.biasWarnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      className="bg-cyan-400 text-ink-900 hover:bg-cyan-300"
                      onClick={() => {
                        setValue("description", aiResult.improvedDescription, { shouldDirty: true });
                        toast.success("Updated description with improved version");
                      }}
                    >
                      Use Improved Draft
                    </Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setAiResult(null)}>
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hiring Team Assignment (For Existing Jobs) */}
          {isEditing && membersQuery.data?.data?.length > 0 && (
            <div className="panel space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-ink-900">Hiring Team</h3>
                  <p className="text-xs text-ink-500">Assign recruiters and hiring managers to this role.</p>
                </div>
                <Users className="h-5 w-5 text-ink-400" />
              </div>

              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {membersQuery.data.data.map((member) => {
                  const mId = member._id || member.id;
                  const isChecked = teamIds.includes(mId);
                  return (
                    <label
                      key={mId}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors",
                        isChecked ? "border-brand-500 bg-brand-50/50" : "border-ink-200 hover:bg-ink-50",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTeamIds((prev) => [...prev, mId]);
                            } else {
                              setTeamIds((prev) => prev.filter((id) => id !== mId));
                            }
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium text-ink-900">{member.user?.name || "Member"}</p>
                          <p className="text-xs text-ink-500">{member.user?.email}</p>
                        </div>
                      </div>
                      <Badge variant="neutral" className="capitalize">
                        {(member.role || "").replace("_", " ")}
                      </Badge>
                    </label>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => saveTeamMutation.mutate()}
                isLoading={saveTeamMutation.isPending}
              >
                Save Assigned Team
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Candidate Live Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Candidate View Preview"
        description="This shows how candidates see your job requisition on the discovery board."
        size="xl"
      >
        <div className="space-y-6 py-2">
          {/* Header Preview Card */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  {watchedFields.company || "Your Organization"}
                </span>
                <h2 className="mt-1 text-2xl font-bold text-ink-900">
                  {watchedFields.title || "Untitled Job Requisition"}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-600">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-ink-400" />
                    {watchedFields.location || "Location Unspecified"}
                  </span>
                  <span>•</span>
                  <Badge variant="neutral" className="capitalize">
                    {watchedFields.workplaceMode || "Hybrid"}
                  </Badge>
                  <Badge variant="outline">{watchedFields.jobType || "Full-Time"}</Badge>
                </div>
              </div>

              {/* Salary Chip */}
              {(watchedFields.salaryMin || watchedFields.salaryMax) && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-right">
                  <p className="text-xs font-medium text-brand-700">Offered CTC / Year</p>
                  <p className="text-base font-bold text-brand-900">
                    ₹{watchedFields.salaryMin || "0"}
                    {watchedFields.salaryMax && watchedFields.salaryMax !== watchedFields.salaryMin
                      ? ` - ₹${watchedFields.salaryMax}`
                      : ""}{" "}
                    / yr
                  </p>
                </div>
              )}
            </div>

            {/* Key Quick Facts Grid */}
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-ink-200/80 pt-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-400">Experience</p>
                <p className="text-sm font-semibold text-ink-800">
                  {watchedFields.experience ||
                    (watchedFields.minExpYears ? `${watchedFields.minExpYears}+ yrs` : "Not specified")}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Education</p>
                <p className="text-sm font-semibold text-ink-800">
                  {watchedFields.educationRequired || "Any Graduate"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Industry</p>
                <p className="text-sm font-semibold text-ink-800">{watchedFields.industry || "General Tech"}</p>
              </div>
              <div>
                <p className="text-xs text-ink-400">Closes At</p>
                <p className="text-sm font-semibold text-ink-800">
                  {watchedFields.closesAt ? formatDate(watchedFields.closesAt) : "Open until filled"}
                </p>
              </div>
            </div>
          </div>

          {/* Required Skills Badges */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Required Skills</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {splitCsv(watchedFields.requiredSkills).length > 0 ? (
                splitCsv(watchedFields.requiredSkills).map((skill) => (
                  <Badge key={skill} variant="primary">
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-xs italic text-ink-400">No required skills specified yet.</span>
              )}
            </div>
          </div>

          {/* Preferred Skills */}
          {splitCsv(watchedFields.preferredSkills).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Preferred Skills</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {splitCsv(watchedFields.preferredSkills).map((skill) => (
                  <Badge key={skill} variant="neutral">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Perks & Benefits */}
          {splitCsv(watchedFields.benefits).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Perks & Benefits</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {splitCsv(watchedFields.benefits).map((benefit) => (
                  <span
                    key={benefit}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200"
                  >
                    <Check className="h-3 w-3 text-emerald-600" />
                    {benefit}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description Body */}
          <div className="space-y-2 border-t border-ink-100 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Role Description</h4>
            <div className="prose prose-sm max-w-none rounded-lg bg-ink-50/40 p-4 text-ink-700 whitespace-pre-line leading-relaxed">
              {watchedFields.description || "No description provided yet."}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-ink-100 pt-4">
            <p className="text-xs italic text-ink-400">
              Note: This is a preview simulation. Candidates will have an "Apply Now" button.
            </p>
            <Button variant="secondary" onClick={() => setShowPreview(false)}>
              Close Preview
            </Button>
          </div>
        </div>
      </Modal>

      {/* Close Requisition Confirmation Modal */}
      <ConfirmModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onConfirm={() => closeMutation.mutate()}
        title="Close this job requisition?"
        description={`“${job?.title || "This job"}” will be closed and removed from public discovery. Existing applications and interviews will remain intact.`}
        confirmLabel="Close Requisition"
        tone="warning"
        isLoading={closeMutation.isPending}
      />
    </div>
  );
};

export default JobEditorPage;
