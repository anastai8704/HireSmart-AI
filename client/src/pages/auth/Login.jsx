/**
 * Login.jsx
 * -----------------------------------------------------------------------------
 * Sign-in screen.
 *
 * Two details worth noting:
 *   1. After a successful login we send the user to wherever they were trying
 *      to go (location.state.from), falling back to their role's dashboard.
 *   2. The demo-account buttons make the project instantly explorable by an
 *      examiner or interviewer who does not want to create an account.
 */

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AtSign, Eye, EyeOff, Lock, Sparkles } from "lucide-react";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent } from "../../components/ui/Card";
import { InlineError } from "../../components/ui/States";
import { homeRouteForRole } from "../../components/layout/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/Toast";

/** Accounts created by `npm run seed`, offered as one-click logins. */
const DEMO_ACCOUNTS = [
    { label: "Candidate", email: "anastai.candidate@hiresmart.ai", password: "Password@123" },
    { label: "Recruiter", email: "alexander.recruiter@hiresmart.ai", password: "Password@123" },
];

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const [form, setForm] = useState({ email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
    };

    const signIn = async (credentials) => {
        setError(null);
        setIsSubmitting(true);

        try {
            const user = await login(credentials);
            toast.success(`Welcome back, ${user.name.split(" ")[0]}`);

            // Return the user to the page that sent them here, if any.
            const destination = location.state?.from?.pathname || homeRouteForRole(user.role);
            navigate(destination, { replace: true });
        } catch (caught) {
            setError(caught);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        signIn(form);
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                        <Sparkles className="h-6 w-6" aria-hidden="true" />
                    </span>

                    <h1 className="text-2xl font-bold text-ink-900">Welcome back</h1>
                    <p className="mt-1.5 text-sm text-ink-500">
                        Sign in to continue to HireSmart AI
                    </p>
                </div>

                <Card>
                    <CardContent className="p-6">
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {error && <InlineError error={error} />}

                            <Input
                                label="Email address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                icon={<AtSign className="h-4 w-4" />}
                                value={form.email}
                                onChange={handleChange}
                                required
                            />

                            <div className="relative">
                                <Input
                                    label="Password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                    icon={<Lock className="h-4 w-4" />}
                                    value={form.password}
                                    onChange={handleChange}
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

                            <Button type="submit" fullWidth isLoading={isSubmitting}>
                                Sign in
                            </Button>
                        </form>

                        {/* ---- Demo accounts ---- */}
                        <div className="mt-6 border-t border-ink-100 pt-5">
                            <p className="mb-2.5 text-center text-xs font-medium text-ink-500">
                                Or explore with a demo account
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                {DEMO_ACCOUNTS.map((account) => (
                                    <Button
                                        key={account.label}
                                        variant="secondary"
                                        size="sm"
                                        disabled={isSubmitting}
                                        onClick={() =>
                                            signIn({
                                                email: account.email,
                                                password: account.password,
                                            })
                                        }
                                    >
                                        {account.label}
                                    </Button>
                                ))}
                            </div>

                            <p className="mt-2 text-center text-[11px] text-ink-400">
                                Demo data is created by running <code>npm run seed</code>.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-sm text-ink-500">
                    New here?{" "}
                    <Link
                        to="/register"
                        className="font-medium text-brand-600 transition-colors hover:text-brand-700"
                    >
                        Create an account
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
