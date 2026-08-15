/**
 * recruiter/ManageJobs.jsx
 * -----------------------------------------------------------------------------
 * Create, edit, publish, close and delete job postings.
 *
 * The create/edit form lives in a modal rather than its own route because it is
 * short, and keeping the recruiter on their job list preserves their context.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Briefcase,
    Building2,
    MapPin,
    Pencil,
    Plus,
    Trash2,
    Users,
} from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input, { Select, Textarea } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { Card } from "../../components/ui/Card";
import { EmptyState, ErrorState, InlineError, SkeletonList } from "../../components/ui/States";
import { jobApi } from "../../lib/api";
import { formatRelativeTime, formatSalary } from "../../lib/utils";
import { useFetch, useMutation } from "../../hooks/useApi";
import { useToast } from "../../components/ui/useToast";

const JOB_TYPES = ["Full-Time", "Part-Time", "Internship", "Contract", "Remote"];
const JOB_STATUSES = [
    { value: "draft", label: "Draft - not visible to candidates" },
    { value: "published", label: "Published - open for applications" },
    { value: "closed", label: "Closed - no longer accepting" },
];

const EMPTY_FORM = {
    title: "",
    company: "",
    location: "",
    salary: "",
    experience: "",
    jobType: "Full-Time",
    description: "",
    skills: "",
    status: "published",
};

const STATUS_VARIANT = { published: "success", draft: "warning", closed: "default" };

const ManageJobs = () => {
    const toast = useToast();
    const [page, setPage] = useState(1);

    const [editingJob, setEditingJob] = useState(null); // null = closed, {} = new
    const [form, setForm] = useState(EMPTY_FORM);
    const [fieldErrors, setFieldErrors] = useState({});
    const [jobToDelete, setJobToDelete] = useState(null);

    const { data, isLoading, error, refetch } = useFetch(
        () => jobApi.myJobs({ page, limit: 10 }),
        [page]
    );

    const { mutate: saveJob, isLoading: isSaving, error: saveError } = useMutation((payload) =>
        payload._id ? jobApi.update(payload._id, payload.body) : jobApi.create(payload.body)
    );

    const { mutate: deleteJob, isLoading: isDeleting } = useMutation(jobApi.remove);

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setFieldErrors({});
        setEditingJob({});
    };

    const openEdit = (job) => {
        setForm({
            title: job.title || "",
            company: job.company || "",
            location: job.location || "",
            salary: String(job.salary ?? ""),
            experience: job.experience || "",
            jobType: job.jobType || "Full-Time",
            description: job.description || "",
            // Skills are stored as an array but edited as a comma-separated string.
            skills: (job.skills || []).join(", "),
            status: job.status || "published",
        });

        setFieldErrors({});
        setEditingJob(job);
    };

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
        setFieldErrors((current) => ({ ...current, [name]: undefined }));
    };

    /** Mirrors the server-side validator so mistakes surface instantly. */
    const validate = () => {
        const errors = {};

        if (form.title.trim().length < 2) errors.title = "Enter a job title";
        if (form.company.trim().length < 2) errors.company = "Enter the company name";
        if (form.location.trim().length < 2) errors.location = "Enter a location";
        if (!form.experience.trim()) errors.experience = "For example: 2+ years";

        if (form.salary === "" || Number.isNaN(Number(form.salary)) || Number(form.salary) < 0) {
            errors.salary = "Enter the annual salary as a number";
        }

        if (form.description.trim().length < 20) {
            errors.description = "Write at least 20 characters so candidates know the role";
        }

        const skills = form.skills.split(",").map((skill) => skill.trim()).filter(Boolean);
        if (skills.length === 0) errors.skills = "List at least one required skill";

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validate()) return;

        const body = {
            title: form.title.trim(),
            company: form.company.trim(),
            location: form.location.trim(),
            salary: Number(form.salary),
            experience: form.experience.trim(),
            jobType: form.jobType,
            description: form.description.trim(),
            skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
            status: form.status,
        };

        try {
            await saveJob({ _id: editingJob?._id, body });
            toast.success(editingJob?._id ? "Job updated" : "Job created");
            setEditingJob(null);
            refetch();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteJob(jobToDelete._id);
            toast.success("Job deleted");
            setJobToDelete(null);
            refetch();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const jobs = data?.jobs || [];
    const pagination = data?.pagination;

    return (
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-ink-900">My jobs</h1>
                    <p className="mt-1.5 text-ink-500">
                        Create postings and review who has applied.
                    </p>
                </div>

                <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                    Post a job
                </Button>
            </header>

            {isLoading ? (
                <SkeletonList count={3} />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : jobs.length === 0 ? (
                <EmptyState
                    icon={Briefcase}
                    title="You have not posted any jobs yet"
                    description="Create your first posting and applicants will be scored and ranked automatically."
                    action={
                        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                            Post your first job
                        </Button>
                    }
                />
            ) : (
                <>
                    <div className="grid gap-4">
                        {jobs.map((job) => (
                            <Card key={job._id} hoverable className="p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-base font-semibold text-ink-900">
                                                {job.title}
                                            </h2>

                                            <Badge
                                                variant={STATUS_VARIANT[job.status] || "default"}
                                                size="sm"
                                            >
                                                {job.status}
                                            </Badge>
                                        </div>

                                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                {job.company}
                                            </span>

                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                                {job.location}
                                            </span>

                                            <span>{formatSalary(job.salary)}</span>
                                            <span>Posted {formatRelativeTime(job.createdAt)}</span>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button
                                            as={Link}
                                            to={`/recruiter/jobs/${job._id}/applicants`}
                                            size="sm"
                                            leftIcon={<Users className="h-3.5 w-3.5" />}
                                        >
                                            {job.applicationCount ?? job.applicantCount ?? 0} applicants
                                        </Button>

                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => openEdit(job)}
                                            aria-label={`Edit ${job.title}`}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setJobToDelete(job)}
                                            aria-label={`Delete ${job.title}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage((current) => current - 1)}
                            >
                                Previous
                            </Button>

                            <span className="px-3 text-sm text-ink-600">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>

                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={page >= pagination.totalPages}
                                onClick={() => setPage((current) => current + 1)}
                            >
                                Next
                            </Button>
                        </nav>
                    )}
                </>
            )}

            {/* ---------- Create / edit ---------- */}
            <Modal
                isOpen={editingJob !== null}
                onClose={() => setEditingJob(null)}
                title={editingJob?._id ? "Edit job" : "Post a new job"}
                description="Candidates are matched against the skills and description, so be specific."
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditingJob(null)}>
                            Cancel
                        </Button>

                        <Button type="submit" form="job-form" isLoading={isSaving}>
                            {editingJob?._id ? "Save changes" : "Publish job"}
                        </Button>
                    </>
                }
            >
                <form id="job-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {saveError && <InlineError error={saveError} />}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Job title"
                            name="title"
                            placeholder="Full Stack Developer"
                            value={form.title}
                            onChange={handleChange}
                            error={fieldErrors.title}
                            required
                        />

                        <Input
                            label="Company"
                            name="company"
                            placeholder="Acme Technologies"
                            value={form.company}
                            onChange={handleChange}
                            error={fieldErrors.company}
                            required
                        />

                        <Input
                            label="Location"
                            name="location"
                            placeholder="Pune, India or Remote"
                            value={form.location}
                            onChange={handleChange}
                            error={fieldErrors.location}
                            required
                        />

                        <Input
                            label="Annual salary (INR)"
                            name="salary"
                            type="number"
                            min="0"
                            placeholder="1200000"
                            value={form.salary}
                            onChange={handleChange}
                            error={fieldErrors.salary}
                            required
                        />

                        <Input
                            label="Experience required"
                            name="experience"
                            placeholder="2+ years"
                            value={form.experience}
                            onChange={handleChange}
                            error={fieldErrors.experience}
                            hint="Written in plain text - the AI reads the number from it."
                            required
                        />

                        <Select
                            label="Job type"
                            name="jobType"
                            options={JOB_TYPES}
                            value={form.jobType}
                            onChange={handleChange}
                        />
                    </div>

                    <Textarea
                        label="Job description"
                        name="description"
                        rows={6}
                        placeholder="Describe the role, the team, and what the person will actually build..."
                        value={form.description}
                        onChange={handleChange}
                        error={fieldErrors.description}
                        hint="The matching engine compares this text against every resume."
                        required
                    />

                    <Input
                        label="Required skills"
                        name="skills"
                        placeholder="React, Node.js, MongoDB, Docker"
                        value={form.skills}
                        onChange={handleChange}
                        error={fieldErrors.skills}
                        hint="Separate with commas. These carry the most weight in the match score."
                        required
                    />

                    <Select
                        label="Status"
                        name="status"
                        options={JOB_STATUSES}
                        value={form.status}
                        onChange={handleChange}
                    />
                </form>
            </Modal>

            {/* ---------- Delete confirmation ---------- */}
            <Modal
                isOpen={Boolean(jobToDelete)}
                onClose={() => setJobToDelete(null)}
                title="Delete this job?"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setJobToDelete(null)}>
                            Cancel
                        </Button>

                        <Button variant="danger" isLoading={isDeleting} onClick={handleDelete}>
                            Delete permanently
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-ink-600">
                    <strong>{jobToDelete?.title}</strong> and all of its applications will be
                    permanently removed. This cannot be undone.
                </p>
            </Modal>
        </div>
    );
};

export default ManageJobs;
