/**
 * Settings.jsx
 * -----------------------------------------------------------------------------
 * Account settings: change password and sign out.
 *
 * Note the deliberate friction on the password form - it asks for the current
 * password (verified server-side) and a confirmation, and it clears itself on
 * success so a shared screen never leaves credentials visible.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LogOut, Save, ShieldCheck } from "lucide-react";

import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { InlineError } from "../components/ui/States";
import { authApi } from "../lib/api";
import { useAuth } from "../context/useAuth";
import { useMutation } from "../hooks/useApi";
import { useToast } from "../components/ui/useToast";

const Settings = () => {
    const { user, logout, role } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const [form, setForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    const [fieldErrors, setFieldErrors] = useState({});
    const [showPasswords, setShowPasswords] = useState(false);

    const { mutate: changePassword, isLoading, error } = useMutation(authApi.changePassword);

    const handleChange = (event) => {
        const { name, value } = event.target;
        setForm((current) => ({ ...current, [name]: value }));
        setFieldErrors((current) => ({ ...current, [name]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const errors = {};

        if (!form.currentPassword) {
            errors.currentPassword = "Enter your current password";
        }

        if (form.newPassword.length < 8) {
            errors.newPassword = "New password must be at least 8 characters";
        }

        if (form.newPassword !== form.confirmPassword) {
            errors.confirmPassword = "Passwords do not match";
        }

        if (form.currentPassword && form.currentPassword === form.newPassword) {
            errors.newPassword = "Choose a password different from your current one";
        }

        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            await changePassword({
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            });

            // Never leave credentials sitting in the form.
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            toast.success("Password changed successfully");
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-ink-900">Settings</h1>
                <p className="mt-1 text-ink-500">Manage your account security.</p>
            </header>

            <div className="space-y-6">
                {/* ---------- Account summary ---------- */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-ink-400" aria-hidden="true" />
                            Account
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-ink-500">Name</dt>
                                <dd className="font-medium text-ink-900">{user?.name}</dd>
                            </div>

                            <div className="flex justify-between">
                                <dt className="text-ink-500">Email</dt>
                                <dd className="font-medium text-ink-900">{user?.email}</dd>
                            </div>

                            <div className="flex justify-between">
                                <dt className="text-ink-500">Role</dt>
                                <dd className="font-medium capitalize text-ink-900">{role}</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>

                {/* ---------- Password ---------- */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-ink-400" aria-hidden="true" />
                            Change password
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {error && <InlineError error={error} />}

                            <Input
                                label="Current password"
                                name="currentPassword"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="current-password"
                                value={form.currentPassword}
                                onChange={handleChange}
                                error={fieldErrors.currentPassword}
                                required
                            />

                            <Input
                                label="New password"
                                name="newPassword"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="new-password"
                                value={form.newPassword}
                                onChange={handleChange}
                                error={fieldErrors.newPassword}
                                hint="At least 8 characters."
                                required
                            />

                            <Input
                                label="Confirm new password"
                                name="confirmPassword"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="new-password"
                                value={form.confirmPassword}
                                onChange={handleChange}
                                error={fieldErrors.confirmPassword}
                                required
                            />

                            <div className="flex items-center justify-between">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowPasswords((shown) => !shown)}
                                    leftIcon={
                                        showPasswords ? (
                                            <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                            <Eye className="h-3.5 w-3.5" />
                                        )
                                    }
                                >
                                    {showPasswords ? "Hide" : "Show"} passwords
                                </Button>

                                <Button
                                    type="submit"
                                    isLoading={isLoading}
                                    leftIcon={<Save className="h-4 w-4" />}
                                >
                                    Update password
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* ---------- Sign out ---------- */}
                <Card className="border-danger-500/30">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div>
                            <h3 className="text-sm font-semibold text-ink-900">Sign out</h3>
                            <p className="text-sm text-ink-500">
                                End your session on this device.
                            </p>
                        </div>

                        <Button
                            variant="danger"
                            onClick={handleLogout}
                            leftIcon={<LogOut className="h-4 w-4" />}
                        >
                            Sign out
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Settings;
