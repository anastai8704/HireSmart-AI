/**
 * admin/ManageUsers.jsx
 * -----------------------------------------------------------------------------
 * Search users, filter by role, and activate or deactivate accounts.
 *
 * Deactivating rather than deleting is deliberate: a user's applications and a
 * recruiter's job posts must survive, and the action must be reversible. The
 * backend also prevents an admin from deactivating themselves.
 */

import { useState } from "react";
import { Ban, CheckCheck, Search, Users } from "lucide-react";

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input, { Select } from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { Card, CardContent } from "../../components/ui/Card";
import { EmptyState, ErrorState, SkeletonList } from "../../components/ui/States";
import { userApi } from "../../lib/api";
import { formatDate, initials } from "../../lib/utils";
import { useAuth } from "../../context/useAuth";
import { useDebouncedValue, useFetch, useMutation } from "../../hooks/useApi";
import { useToast } from "../../components/ui/useToast";

const ROLE_OPTIONS = [
    { value: "candidate", label: "Candidates" },
    { value: "recruiter", label: "Recruiters" },
    { value: "admin", label: "Admins" },
];

const ROLE_VARIANT = { admin: "danger", recruiter: "warning", candidate: "brand" };

const ManageUsers = () => {
    const { user: currentUser } = useAuth();
    const toast = useToast();

    const [search, setSearch] = useState("");
    const [role, setRole] = useState("");
    const [page, setPage] = useState(1);
    const [target, setTarget] = useState(null);

    const debouncedSearch = useDebouncedValue(search, 400);

    const { data, isLoading, error, refetch } = useFetch(
        () => userApi.listUsers({ page, limit: 20, search: debouncedSearch, role }),
        [page, debouncedSearch, role]
    );

    const { mutate: setStatus, isLoading: isUpdating } = useMutation(({ id, isActive }) =>
        userApi.setUserStatus(id, isActive)
    );

    const handleToggle = async () => {
        try {
            await setStatus({ id: target._id, isActive: !target.isActive });
            toast.success(target.isActive ? "Account deactivated" : "Account reactivated");
            setTarget(null);
            refetch();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const users = data?.users || [];
    const pagination = data?.pagination;

    return (
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-ink-900">Manage users</h1>
                <p className="mt-1.5 text-ink-500">
                    {pagination ? `${pagination.total} accounts` : "All platform accounts"}
                </p>
            </header>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    <Input
                        placeholder="Search by name or email"
                        aria-label="Search users"
                        icon={<Search className="h-4 w-4" />}
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />

                    <Select
                        aria-label="Filter by role"
                        placeholder="All roles"
                        options={ROLE_OPTIONS}
                        value={role}
                        onChange={(event) => {
                            setRole(event.target.value);
                            setPage(1);
                        }}
                    />
                </CardContent>
            </Card>

            {isLoading ? (
                <SkeletonList count={5} />
            ) : error ? (
                <ErrorState error={error} onRetry={refetch} />
            ) : users.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No users found"
                    description="Try a different search term or clear the role filter."
                />
            ) : (
                <>
                    <div className="grid gap-3">
                        {users.map((user) => {
                            const isSelf = user._id === currentUser?.id || user._id === currentUser?._id;

                            return (
                                <Card key={user._id} className="p-4">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                                            {initials(user.name)}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-ink-900">
                                                    {user.name}
                                                </p>

                                                <Badge
                                                    size="sm"
                                                    variant={ROLE_VARIANT[user.role] || "default"}
                                                >
                                                    {user.role}
                                                </Badge>

                                                {!user.isActive && (
                                                    <Badge size="sm" variant="danger">
                                                        deactivated
                                                    </Badge>
                                                )}

                                                {isSelf && (
                                                    <Badge size="sm" variant="outline">
                                                        you
                                                    </Badge>
                                                )}
                                            </div>

                                            <p className="truncate text-sm text-ink-500">
                                                {user.email}
                                            </p>

                                            <p className="text-xs text-ink-400">
                                                Joined {formatDate(user.createdAt)}
                                            </p>
                                        </div>

                                        <Button
                                            size="sm"
                                            variant={user.isActive ? "ghost" : "secondary"}
                                            disabled={isSelf}
                                            onClick={() => setTarget(user)}
                                            leftIcon={
                                                user.isActive ? (
                                                    <Ban className="h-3.5 w-3.5 text-danger-500" />
                                                ) : (
                                                    <CheckCheck className="h-3.5 w-3.5 text-success-500" />
                                                )
                                            }
                                        >
                                            {user.isActive ? "Deactivate" : "Reactivate"}
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
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

            <Modal
                isOpen={Boolean(target)}
                onClose={() => setTarget(null)}
                title={target?.isActive ? "Deactivate this account?" : "Reactivate this account?"}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setTarget(null)}>
                            Cancel
                        </Button>

                        <Button
                            variant={target?.isActive ? "danger" : "success"}
                            isLoading={isUpdating}
                            onClick={handleToggle}
                        >
                            {target?.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-ink-600">
                    {target?.isActive ? (
                        <>
                            <strong>{target?.name}</strong> will be signed out and unable to sign
                            in again. Their data is kept and you can reverse this at any time.
                        </>
                    ) : (
                        <>
                            <strong>{target?.name}</strong> will be able to sign in and use the
                            platform again.
                        </>
                    )}
                </p>
            </Modal>
        </div>
    );
};

export default ManageUsers;
