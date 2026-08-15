/**
 * Profile.jsx
 * -----------------------------------------------------------------------------
 * Edit your own profile. The fields shown adapt to the role: candidates get a
 * headline, bio and skills; recruiters get company details.
 *
 * Skills matter more than they look - they feed directly into the match score,
 * so the form explains that rather than presenting a bare input.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, FileText, Save, Sparkles, User } from "lucide-react";

import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input, { Textarea } from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { InlineError } from "../components/ui/States";
import { userApi } from "../lib/api";
import { initials } from "../lib/utils";
import { useAuth } from "../context/useAuth";
import { useMutation } from "../hooks/useApi";
import { useToast } from "../components/ui/useToast";

const ProfileForm = ({ user, refresh, role }) => {
    const toast = useToast();

    const isCandidate = role === "candidate";
    const isRecruiter = role === "recruiter";

    /**
     * Build the form's initial values from the user object.
     *
     * The user arrives asynchronously, so we cannot simply pass it to useState
     * once. Instead of copying it in with an effect (which renders an empty
     * form first, then re-renders), the whole form is remounted via a `key`
     * further down as soon as the user id is known. React then runs this
     * initialiser again with real data - one render, no flicker, and the user
     * never sees their typing wiped by a late refresh.
     */
    const buildInitialForm = (source) => ({
        name: source?.name || "",
        phone: source?.phone || "",
        headline: source?.headline || "",
        location: source?.location || "",
        bio: source?.bio || "",
        skills: (source?.skills || []).join(", "),
        companyName: source?.companyName || "",
        companyWebsite: source?.companyWebsite || "",
        companyDescription: source?.companyDescription || "",
    });

    const [form, setForm] = useState(() => buildInitialForm(user));

    const { mutate: save, isLoading, error } = useMutation(userApi.updateProfile);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const payload = {
            name: form.name.trim(),
            phone: form.phone.trim(),
            headline: form.headline.trim(),
            location: form.location.trim(),
            bio: form.bio.trim(),
            ...(isCandidate && {
                skills: form.skills
                    .split(",")
                    .map((skill) => skill.trim())
                    .filter(Boolean),
            }),
            ...(isRecruiter && {
                companyName: form.companyName.trim(),
                companyWebsite: form.companyWebsite.trim(),
                companyDescription: form.companyDescription.trim(),
            }),
        };

        try {
            await save(payload);
            await refresh();
            toast.success("Profile updated");
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const skillList = form.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);

    return (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-6 flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
                    {initials(user?.name)}
                </span>

                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-ink-900">
                        {user?.name}
                    </h1>
                    <p className="text-ink-500">{user?.email}</p>
                    <Badge variant="brand" size="sm" className="mt-1">
                        {role}
                    </Badge>
                </div>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <InlineError error={error} />}

                {/* ---------- Basics ---------- */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-4 w-4 text-ink-400" aria-hidden="true" />
                            Basic details
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Full name"
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            required
                        />

                        <Input
                            label="Phone"
                            name="phone"
                            type="tel"
                            placeholder="+91 98765 43210"
                            value={form.phone}
                            onChange={handleChange}
                        />

                        <Input
                            label="Location"
                            name="location"
                            placeholder="Pune, India"
                            value={form.location}
                            onChange={handleChange}
                        />

                        <Input
                            label="Headline"
                            name="headline"
                            placeholder="Full Stack Developer"
                            value={form.headline}
                            onChange={handleChange}
                            hint="One line recruiters see first."
                        />

                        <Textarea
                            containerClassName="sm:col-span-2"
                            label="About you"
                            name="bio"
                            rows={4}
                            placeholder="A short summary of your experience and what you are looking for."
                            value={form.bio}
                            onChange={handleChange}
                        />
                    </CardContent>
                </Card>

                {/* ---------- Candidate: skills ---------- */}
                {isCandidate && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" />
                                Skills
                            </CardTitle>
                            <p className="text-sm text-ink-500">
                                These are weighted at 55% of every match score, so list everything
                                you can genuinely evidence.
                            </p>
                        </CardHeader>

                        <CardContent className="space-y-3">
                            <Input
                                label="Your skills"
                                name="skills"
                                placeholder="React, Node.js, MongoDB, Docker, Python"
                                value={form.skills}
                                onChange={handleChange}
                                hint="Separate with commas."
                            />

                            {skillList.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {skillList.map((skill) => (
                                        <Badge key={skill} variant="brand" size="sm">
                                            {skill}
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-3">
                                <FileText
                                    className="h-4 w-4 shrink-0 text-brand-600"
                                    aria-hidden="true"
                                />

                                <p className="text-sm text-ink-600">
                                    Your resume matters even more.{" "}
                                    <Link
                                        to="/my-resume"
                                        className="font-medium text-brand-700 hover:underline"
                                    >
                                        Manage it here
                                    </Link>
                                    .
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ---------- Recruiter: company ---------- */}
                {isRecruiter && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-ink-400" aria-hidden="true" />
                                Company
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Input
                                label="Company name"
                                name="companyName"
                                value={form.companyName}
                                onChange={handleChange}
                            />

                            <Input
                                label="Website"
                                name="companyWebsite"
                                type="url"
                                placeholder="https://acme.com"
                                value={form.companyWebsite}
                                onChange={handleChange}
                            />

                            <Textarea
                                containerClassName="sm:col-span-2"
                                label="About the company"
                                name="companyDescription"
                                rows={4}
                                placeholder="What your company does and why people want to work there."
                                value={form.companyDescription}
                                onChange={handleChange}
                            />
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        isLoading={isLoading}
                        leftIcon={<Save className="h-4 w-4" />}
                    >
                        Save changes
                    </Button>
                </div>
            </form>
        </div>
    );
};

/**
 * Wrapper that remounts the form once the real user object has loaded.
 *
 * The `key` is the crux: when it changes from "loading" to the user's id React
 * discards the old form and mounts a fresh one, re-running the state
 * initialiser with populated data. This is React's officially recommended way
 * to reset form state from props, and it replaces the effect-copies-props
 * pattern that causes cascading renders.
 */
const Profile = () => {
    const { user, refresh, role } = useAuth();

    return (
        <ProfileForm
            key={user?.id || user?._id || "loading"}
            user={user}
            refresh={refresh}
            role={role}
        />
    );
};

export default Profile;
