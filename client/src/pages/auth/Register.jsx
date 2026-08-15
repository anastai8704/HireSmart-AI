/**
 * Register.jsx
 * -----------------------------------------------------------------------------
 * Account creation for both candidates and recruiters.
 *
 * The role is chosen with a visual toggle rather than a dropdown, because the
 * two journeys are completely different and the choice must be obvious. The
 * recruiter form reveals extra company fields.
 *
 * Validation runs on the client for instant feedback, but the server validates
 * everything again - client-side checks are convenience, never security.
 */

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AtSign, Briefcase, Building2, Eye, EyeOff, Lock, Sparkles, User } from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/States";
import { homeRouteForRole } from "../../components/layout/ProtectedRoute";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/Toast";

const Register = () => {
    const { register } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const [searchParams] = useSearchParams();

    // Allows deep links such as /register?role=recruiter from the landing page.
    const initialRole = searchParams.get("role") === "recruiter" ? "recruiter" : "candidate";

    const [role, setRole] = useState(initialRole);
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        companyName: "",
        companyWebsite: "",
        inviteCode: "",
    });

    const [fieldErrors, setFieldErrors] = useState({});
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));

        // Clear a field's error as soon as the user starts correcting it.
        setFieldErrors((current) => ({ ...current, [name]: undefined }));
    };

    /** Mirrors the server's rules so users get feedback before a round trip. */
    const validate = () => {
        const errors = {};

        if (form.name.trim().length < 2) {
            errors.name = "Please enter your full name";
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            errors.email = "Enter a valid email address";
        }

        if (form.password.length < 8) {
            errors.password = "Password must be at least 8 characters";
        }

        if (form.password !== form.confirmPassword) {
            errors.confirmPassword = "Passwords do not match";
        }

        if (role === "recruiter" && form.companyName.trim().length < 2) {
            errors.companyName = "Company name is required for recruiter accounts";
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);

        if (!validate()) return;

        setIsSubmitting(true);

        try {
            const payload = {
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                password: form.password,
                role,
                ...(role === "recruiter" && {
                    companyName: form.companyName.trim(),
                    companyWebsite: form.companyWebsite.trim(),
                    inviteCode: form.inviteCode.trim(),
                }),
            };

            const response = await register(payload);

            // Some deployments require email verification before issuing a token.
            if (!response.token) {
                toast.info("Account created. Please verify your email before signing in.");
                navigate("/login");
                return;
            }

            toast.success("Account created. Welcome to HireSmart AI.");
            navigate(homeRouteForRole(response.user?.role || role), { replace: true });
        } catch (caught) {
            setError(caught);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                        <Sparkles className="h-6 w-6" aria-hidden="true" />
                    </span>

                    <h1 className="text-2xl font-bold text-ink-900">Create your account</h1>
                    <p className="mt-1.5 text-sm text-ink-500">
                        Free forever. No credit card required.
                    </p>
                </div>

                <Card>
                    <CardContent className="p-6">
                        {/* ---- Role selector ---- */}
                        <fieldset className="mb-5">
                            <legend className="sr-only">Choose account type</legend>

                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: "candidate", label: "I'm job hunting", icon: User },
                                    { value: "recruiter", label: "I'm hiring", icon: Briefcase },
                                ].map((option) => {
                                    const Icon = option.icon;
                                    const isSelected = role === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setRole(option.value)}
                                            aria-pressed={isSelected}
                                            className={cn(
                                                "flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3.5 text-sm font-medium transition-all",
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50 text-brand-700"
                                                    : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                                            )}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {error && <InlineError error={error} />}

                            <Input
                                label="Full name"
                                name="name"
                                autoComplete="name"
                                placeholder="Anas Tai"
                                icon={<User className="h-4 w-4" />}
                                value={form.name}
                                onChange={handleChange}
                                error={fieldErrors.name}
                                required
                            />

                            <Input
                                label="Email address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                icon={<AtSign className="h-4 w-4" />}
                                value={form.email}
                                onChange={handleChange}
                                error={fieldErrors.email}
                                required
                            />

                            {/* ---- Recruiter-only fields ---- */}
                            {role === "recruiter" && (
                                <>
                                    <Input
                                        label="Company name"
                                        name="companyName"
                                        placeholder="Acme Technologies"
                                        icon={<Building2 className="h-4 w-4" />}
                                        value={form.companyName}
                                        onChange={handleChange}
                                        error={fieldErrors.companyName}
                                        required
                                    />

                                    <Input
                                        label="Company website"
                                        name="companyWebsite"
                                        type="url"
                                        placeholder="https://acme.com"
                                        value={form.companyWebsite}
                                        onChange={handleChange}
                                        hint="Optional, but it builds trust with candidates."
                                    />

                                    <Input
                                        label="Invite code"
                                        name="inviteCode"
                                        placeholder="Leave blank if you were not given one"
                                        value={form.inviteCode}
                                        onChange={handleChange}
                                        hint="Only required if this deployment restricts recruiter sign-ups."
                                    />
                                </>
                            )}

                            <div className="relative">
                                <Input
                                    label="Password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="new-password"
                                    placeholder="At least 8 characters"
                                    icon={<Lock className="h-4 w-4" />}
                                    value={form.password}
                                    onChange={handleChange}
                                    error={fieldErrors.password}
                                    required
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword((shown) => !shown)}
                                    className="absolute right-3 top-[2.15rem] text-ink-400 transition-colors hover:text-ink-600"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>

                            <Input
                                label="Confirm password"
                                name="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Re-enter your password"
                                icon={<Lock className="h-4 w-4" />}
                                value={form.confirmPassword}
                                onChange={handleChange}
                                error={fieldErrors.confirmPassword}
                                required
                            />

                            <Button type="submit" fullWidth isLoading={isSubmitting}>
                                Create account
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-sm text-ink-500">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="font-medium text-brand-600 transition-colors hover:text-brand-700"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
