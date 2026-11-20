import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  RefreshCw,
  Users,
  UserCheck,
  Mail,
  AlertCircle,
  X,
  ExternalLink,
  Crown,
  UsersRound,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { PlanBadge } from "../../components/billing/PlanBadge";
import { EmptyState, SkeletonList } from "../../components/ui/States";
import { PageHeader, ErrorCallout, StatusPill } from "../../components/Product";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import * as api from "../../lib/api";
import { formatDate, initials, cn } from "../../lib/utils";

const organizationApi = api.organizationApi;
const getSubscriptionApi = () => {
  try {
    return api.subscriptionApi;
  } catch {
    return null;
  }
};

const JobApprovalToggle = () => (
  <section className="panel mb-4 flex flex-wrap items-center gap-4 p-4">
    <div className="min-w-56 flex-1">
      <p className="font-bold">Job Approval</p>
      <p className="mt-0.5 text-sm text-ink-500">
        Every new job — and every edit to a published job — is reviewed by the platform before it is
        (or stays) visible to candidates.
      </p>
    </div>
    <Badge variant="brand">Always on</Badge>
  </section>
);

const ROLE_RANK = {
  owner: 100,
  admin: 80,
  recruiter: 50,
  hiring_manager: 50,
  interviewer: 30,
  viewer: 30,
};

const ROLE_BADGE_VARIANTS = {
  owner: "brand",
  admin: "default",
  recruiter: "success",
  hiring_manager: "warning",
  interviewer: "default",
  viewer: "default",
};

export const TeamManagementPage = ({ orgId: propOrgId }) => {
  const { organizationId: routeOrgId } = useParams();
  const auth = useAuth();
  const orgId = propOrgId || routeOrgId || auth.organizationId;
  const canManage = ["owner", "admin"].includes(auth.membership?.role);
  const toast = useToast();
  const qc = useQueryClient();

  // Queries
  const membersQuery = useQuery({
    queryKey: ["organization-members", orgId],
    queryFn: () => organizationApi.members(orgId, { limit: 100 }),
    enabled: Boolean(canManage && orgId),
  });

  const invitationsQuery = useQuery({
    queryKey: ["organization-invitations", orgId],
    queryFn: () => organizationApi.invitations(orgId),
    enabled: Boolean(canManage && orgId),
  });

  const subQuery = useQuery({
    queryKey: ["recruiter-subscription", orgId],
    queryFn: () => {
      const subApi = getSubscriptionApi();
      return subApi?.current ? subApi.current(orgId) : Promise.resolve({ data: {} });
    },
    enabled: Boolean(canManage && orgId && getSubscriptionApi()?.current),
  });

  // Local state
  const [form, setForm] = useState({ email: "", role: "recruiter" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [lastLink, setLastLink] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Role ladder logic
  const myRank =
    auth.workspaceRole === "platform_admin" ? 200 : ROLE_RANK[auth.membership?.role] ?? 0;

  const canChangeRole = (m) =>
    m.user?.email !== auth.user?.email && myRank > (ROLE_RANK[m.role] ?? 0);

  const assignableRoles = Object.keys(ROLE_RANK).filter(
    (r) => r !== "owner" && ROLE_RANK[r] < myRank,
  );

  // Subscription seat calculation
  const subData = subQuery.data?.data || {};
  const entitlement = subData.entitlement || null;
  const planSeatLimit = entitlement?.limits?.teamMembers;
  const hasSeatLimit = typeof planSeatLimit === "number";
  const isEnterprise =
    entitlement?.tier === "recruiter_enterprise" ||
    entitlement?.plan === "recruiter_enterprise" ||
    subData?.subscription?.plan === "recruiter_enterprise";

  const allMembers = useMemo(() => membersQuery.data?.data || [], [membersQuery.data?.data]);
  const activeMembersCount = allMembers.filter((m) => m.status === "active").length;
  const isSeatLimitReached = !isEnterprise && hasSeatLimit && activeMembersCount >= planSeatLimit;
  const remainingSeats = isEnterprise || !hasSeatLimit ? "Unlimited" : Math.max(0, planSeatLimit - activeMembersCount);

  // Mutations
  const invite = useMutation({
    mutationFn: () => organizationApi.invite(orgId, form),
    onSuccess: (r) => {
      setForm({ email: "", role: "recruiter" });
      setInviteOpen(false);
      setLastLink(r.data?.link || "");
      qc.invalidateQueries({ queryKey: ["organization-invitations", orgId] });
      qc.invalidateQueries({ queryKey: ["recruiter-subscription", orgId] });
      toast.success(`Invitation sent to ${form.email}`);
    },
    onError: (error) => toast.error(error.message || "Failed to send invitation"),
  });

  const revoke = useMutation({
    mutationFn: (invitationId) => organizationApi.revokeInvitation(orgId, invitationId),
    onSuccess: () => {
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["organization-invitations", orgId] });
      toast.success("Invitation revoked");
    },
    onError: (error) => toast.error(error.message || "Failed to revoke invitation"),
  });

  const resend = useMutation({
    mutationFn: (inv) =>
      organizationApi.invite(orgId, { email: inv.email, role: inv.role, resend: true }),
    onSuccess: (_, inv) => {
      qc.invalidateQueries({ queryKey: ["organization-invitations", orgId] });
      toast.success(`Invitation re-sent to ${inv.email}`);
    },
    onError: (error) => toast.error(error.message || "Failed to resend invitation"),
  });

  const changeRole = useMutation({
    mutationFn: ({ membershipId, role }) =>
      organizationApi.updateMember(orgId, membershipId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-members", orgId] });
      toast.success("Role updated");
    },
    onError: (error) => toast.error(error.message || "Failed to update role"),
  });

  const remove = useMutation({
    mutationFn: ({ membershipId }) =>
      organizationApi.updateMember(orgId, membershipId, { status: "revoked" }),
    onSuccess: (_, vars) => {
      setConfirmId(null);
      toast.success(`${vars.name || "Member"} removed from the team`);
      qc.invalidateQueries({ queryKey: ["organization-members", orgId] });
      qc.invalidateQueries({ queryKey: ["recruiter-subscription", orgId] });
    },
    onError: (error) => {
      setConfirmId(null);
      toast.error(error.message || "Failed to remove member");
    },
  });

  // Link copy helpers
  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("Copy failed - select the link manually");
    }
  };

  const copyLink = async (invitationId) => {
    try {
      const r = await organizationApi.invitationLink(orgId, invitationId);
      await navigator.clipboard.writeText(r.data.link);
      toast.success("Invitation link copied");
    } catch (error) {
      toast.error(error.message || "Copy failed");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      membersQuery.refetch(),
      invitationsQuery.refetch(),
      subQuery.refetch(),
    ]);
    setIsRefreshing(false);
    toast.success("Team data refreshed");
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return allMembers.filter((m) => {
      const name = m.user?.name?.toLowerCase() || "";
      const email = m.user?.email?.toLowerCase() || "";
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || name.includes(query) || email.includes(query);
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [allMembers, searchQuery, roleFilter, statusFilter]);

  const removeTarget = allMembers.find((m) => m._id === confirmId) || null;

  // Duplicate checks for invite form
  const pendingInvitations = invitationsQuery.data?.data || [];
  const isEmailAlreadyPending = pendingInvitations.some(
    (i) => i.email.toLowerCase() === form.email.trim().toLowerCase(),
  );
  const isEmailAlreadyMember = allMembers.some(
    (m) => m.user?.email?.toLowerCase() === form.email.trim().toLowerCase() && m.status === "active",
  );

  if (!canManage) {
    return (
      <div className="page-wrap">
        <EmptyState
          title="Team management is restricted"
          description="Organization owners and admins manage members."
        />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6" data-testid="team-management-page">
      <PageHeader
        eyebrow="Team"
        title="Manage your team"
        description="Invite teammates and control their roles. They open the link, create or sign in to their account, and join the company."
        action={
          <Button
            onClick={() => setInviteOpen(true)}
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={isSeatLimitReached}
          >
            Invite Member
          </Button>
        }
      />

      <JobApprovalToggle />

      {/* Seat limits & Plan capacity banner */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Team metrics">
        <div className="panel p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-medium text-ink-500">Active Members</p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              {activeMembersCount}{" "}
              <span className="text-xs font-normal text-ink-500">
                {isEnterprise ? "/ Unlimited seats" : hasSeatLimit ? `/ ${planSeatLimit} seats` : "active"}
              </span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="panel p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-medium text-ink-500">Available Seats</p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              {remainingSeats}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="panel p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-medium text-ink-500">Pending Invitations</p>
            <p className="mt-1 text-xl font-bold text-ink-900">
              {pendingInvitations.length}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Mail className="h-5 w-5" />
          </div>
        </div>

        <div className="panel p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-medium text-ink-500">Workspace Plan</p>
            <div className="mt-1">
              <PlanBadge compact billingHref={`/app/o/${orgId}/billing`} />
            </div>
          </div>
          <Link
            to={`/app/o/${orgId}/billing`}
            className="flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <span>Billing</span>
            <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Seat limit warning callout if full */}
      {isSeatLimitReached && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold">Seat limit reached</p>
                <p className="text-xs text-ink-600">
                  Your workspace has reached the maximum of {planSeatLimit} team member
                  {planSeatLimit === 1 ? "" : "s"} allowed on your plan. Upgrade your plan to invite
                  more teammates.
                </p>
              </div>
            </div>
            <Link to={`/app/o/${orgId}/billing`}>
              <Button size="sm" variant="secondary" className="border-amber-300 text-amber-900 hover:bg-amber-100">
                Upgrade Plan
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Invitation generated link banner */}
      {lastLink && (
        <div className="panel flex flex-wrap items-center gap-3 p-4 shadow-2xs border-brand-200 bg-brand-50/40">
          <p className="flex-1 text-sm font-medium text-ink-800">
            Invitation link (the email is delivered when SMTP is configured):
          </p>
          <code className="max-w-full truncate rounded bg-white px-2.5 py-1 text-xs font-mono text-brand-700 border border-brand-200">
            {lastLink}
          </code>
          <Button size="sm" variant="secondary" onClick={() => copy(lastLink, "Link copied")}>
            Copy link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLastLink("")}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Search and Filter Controls Toolbar */}
      <div className="panel p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-64">
            <div className="relative flex-1 min-w-48 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-white py-1.5 pl-9 pr-8 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-ink-400 hover:text-ink-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="w-40">
              <SearchableSelect
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Roles" },
                  { value: "owner", label: "Owner" },
                  { value: "admin", label: "Admin" },
                  { value: "recruiter", label: "Recruiter" },
                  { value: "hiring_manager", label: "Hiring Manager" },
                  { value: "interviewer", label: "Interviewer" },
                  { value: "viewer", label: "Viewer" },
                ]}
              />
            </div>

            <div className="w-36">
              <SearchableSelect
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active" },
                  { value: "invited", label: "Invited" },
                  { value: "suspended", label: "Suspended" },
                  { value: "revoked", label: "Revoked" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(searchQuery || roleFilter !== "all" || statusFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                }}
              >
                Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRefresh}
              disabled={isRefreshing}
              leftIcon={<RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <section className="space-y-3" aria-label="Pending invitations">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
              <span>Pending invitations</span>
              <span className="ml-1 text-ink-400">({pendingInvitations.length})</span>
            </h2>
          </div>
          <div className="space-y-2">
            {pendingInvitations.map((i) => (
              <div
                className="panel flex flex-wrap items-center gap-4 p-4 shadow-2xs hover:border-brand-200 transition-colors"
                key={i._id}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-48">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink-900">{i.email}</p>
                    {i.expired && <Badge variant="danger">Expired</Badge>}
                  </div>
                  <p className="text-xs text-ink-500">
                    {i.role.replace("_", " ")} · invited by {i.invitedBy?.name || "—"} · sent{" "}
                    {formatDate(i.createdAt)} · expires {formatDate(i.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={resend.isPending && resend.variables?._id === i._id}
                    onClick={() => resend.mutate(i)}
                  >
                    Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={i.expired}
                    onClick={() => copyLink(i._id)}
                  >
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-700 hover:bg-danger-50"
                    onClick={() => setRevokeTarget(i)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team Members List */}
      <section className="space-y-3" aria-label="Team members list">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Team Members ({filteredMembers.length})
          </h2>
        </div>

        {membersQuery.isLoading ? (
          <SkeletonList count={3} />
        ) : filteredMembers.length > 0 ? (
          <div className="space-y-3">
            {filteredMembers.map((m) => {
              const isOwner = m.role === "owner";
              const isSelf = m.user?.email === auth.user?.email;
              const removable = canChangeRole(m) && m.status !== "revoked" && !isOwner && !isSelf;

              return (
                <div
                  className="panel flex flex-wrap items-center gap-4 p-5 shadow-2xs transition-colors hover:border-brand-200"
                  key={m._id}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {initials(m.user?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-900">{m.user?.name}</p>
                      {isSelf && (
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-2xs font-semibold text-brand-700">
                          You
                        </span>
                      )}
                      {isOwner && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-700">
                          <Crown className="h-3 w-3" />
                          Owner
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-ink-500">
                      {m.user?.email}
                      {m.joinedAt ? ` · joined ${formatDate(m.joinedAt)}` : ""}
                    </p>
                  </div>

                  {canChangeRole(m) && m.status === "active" ? (
                    <SearchableSelect
                      aria-label={`Role for ${m.user?.name || "member"}`}
                      className="w-44"
                      value={m.role}
                      disabled={changeRole.isPending}
                      options={assignableRoles.map((r) => ({
                        value: r,
                        label: r.replace(/_/g, " "),
                      }))}
                      onChange={(e) => changeRole.mutate({ membershipId: m._id, role: e.target.value })}
                    />
                  ) : (
                    <Badge variant={ROLE_BADGE_VARIANTS[m.role] || "default"}>
                      {m.role.replace(/_/g, " ")}
                    </Badge>
                  )}

                  <StatusPill status={m.status} />

                  {removable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger-700 hover:bg-danger-50"
                      onClick={() => setConfirmId(m._id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : allMembers.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No team members yet"
            description="Invite a teammate with the button above — they join with the role you choose."
            action={
              <Button
                onClick={() => setInviteOpen(true)}
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={isSeatLimitReached}
              >
                Invite Member
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No members match filters"
            description="Try clearing your search query or role/status filters."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear Filters
              </Button>
            }
          />
        )}
      </section>

      {/* Invite Modal */}
      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a teammate"
        description="They'll get a secure link to join the company with the role you choose."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="invite-form"
              isLoading={invite.isPending}
              disabled={isEmailAlreadyMember || isSeatLimitReached || !form.email.trim()}
              onClick={() => invite.mutate()}
            >
              Send Invite
            </Button>
          </>
        }
      >
        <form
          id="invite-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Input
            aria-label="Teammate email"
            label="Email"
            type="email"
            placeholder="Teammate email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            error={
              isEmailAlreadyMember
                ? "This person is already an active member of the company."
                : undefined
            }
            hint={
              isEmailAlreadyPending
                ? "An invitation is already pending for this email. Submitting will update the role and refresh expiration."
                : undefined
            }
          />
          <SearchableSelect
            aria-label="Role"
            label="Role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            options={assignableRoles.map((x) => ({
              value: x,
              label: x.replace(/_/g, " "),
            }))}
          />
          {invite.error && <ErrorCallout error={invite.error} />}
        </form>
      </Modal>

      {/* Confirm Member Removal Modal */}
      <ConfirmModal
        isOpen={Boolean(removeTarget)}
        onClose={() => setConfirmId(null)}
        onConfirm={() =>
          removeTarget &&
          remove.mutate({ membershipId: removeTarget._id, name: removeTarget.user?.name })
        }
        title="Remove team member?"
        description={`This revokes ${removeTarget?.user?.name || "the member"}'s access to your hiring workspace. They keep their account and any past activity.`}
        confirmLabel="Remove member"
        tone="danger"
        isLoading={remove.isPending}
      />

      {/* Confirm Revoke Invitation Modal */}
      <ConfirmModal
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget._id)}
        title="Revoke this invitation?"
        description={`The link for ${revokeTarget?.email || "this invitation"} stops working immediately. They can still be re-invited later.`}
        confirmLabel="Revoke invitation"
        tone="warning"
        isLoading={revoke.isPending}
      />
    </div>
  );
};

export default TeamManagementPage;
