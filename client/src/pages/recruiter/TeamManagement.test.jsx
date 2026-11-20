import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { authState } = vi.hoisted(() => ({
  authState: {
    current: {
      user: { displayName: "Rohan Mehta", email: "rohan@meridian.example" },
      role: "recruiter",
      organizations: [{ id: "org1", name: "Meridian", role: "owner" }],
      organizationId: "org1",
      organization: { id: "org1", name: "Meridian", role: "owner" },
      membership: { role: "owner" },
      workspaceRole: "owner",
      status: "authenticated",
      isAuthenticated: true,
      logout: vi.fn(),
      setOrganizationId: vi.fn(),
    },
  },
}));

const mockMembers = [
  {
    _id: "m1",
    role: "owner",
    status: "active",
    createdAt: "2026-08-01T10:00:00Z",
    user: { _id: "u1", name: "Rohan Mehta", email: "rohan@meridian.example" },
  },
  {
    _id: "m2",
    role: "admin",
    status: "active",
    createdAt: "2026-08-15T10:00:00Z",
    user: { _id: "u2", name: "Sara Khan", email: "sara@meridian.example" },
  },
  {
    _id: "m3",
    role: "recruiter",
    status: "active",
    createdAt: "2026-09-01T10:00:00Z",
    user: { _id: "u3", name: "Isha Verma", email: "isha@meridian.example" },
  },
];

const mockInvitations = [
  {
    _id: "inv1",
    email: "new.interviewer@meridian.example",
    role: "interviewer",
    invitedBy: { name: "Rohan Mehta" },
    createdAt: "2026-09-08T10:00:00Z",
    expiresAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    expired: false,
  },
  {
    _id: "inv2",
    email: "expired.person@meridian.example",
    role: "viewer",
    invitedBy: { name: "Sara Khan" },
    createdAt: "2026-08-01T10:00:00Z",
    expiresAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    expired: true,
  },
];

const {
  membersFn,
  invitationsFn,
  inviteFn,
  revokeInvitationFn,
  updateMemberFn,
  invitationLinkFn,
  subscriptionCurrentFn,
} = vi.hoisted(() => ({
  membersFn: vi.fn(),
  invitationsFn: vi.fn(),
  inviteFn: vi.fn(),
  revokeInvitationFn: vi.fn(),
  updateMemberFn: vi.fn(),
  invitationLinkFn: vi.fn(),
  subscriptionCurrentFn: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => authState.current,
}));

vi.mock("../../lib/api", () => ({
  organizationApi: {
    members: membersFn,
    invitations: invitationsFn,
    invite: inviteFn,
    revokeInvitation: revokeInvitationFn,
    updateMember: updateMemberFn,
    invitationLink: invitationLinkFn,
    get: vi.fn().mockResolvedValue({ data: { settings: { requireJobApproval: false } } }),
    settings: vi.fn().mockResolvedValue({ data: { settings: { requireJobApproval: true } } }),
  },
  subscriptionApi: {
    current: subscriptionCurrentFn,
  },
}));

import { ToastProvider } from "../../components/ui/Toast";
import { TeamPage } from "./RecruiterPages";

const renderTeamPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/app/o/org1/team"]}>
          <TeamPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

beforeEach(() => {
  membersFn.mockReset().mockResolvedValue({ data: mockMembers });
  invitationsFn.mockReset().mockResolvedValue({ data: mockInvitations });
  inviteFn.mockReset();
  revokeInvitationFn.mockReset();
  updateMemberFn.mockReset();
  invitationLinkFn.mockReset();
  subscriptionCurrentFn.mockReset().mockResolvedValue({
    data: {
      subscription: { plan: "recruiter_growth", status: "active" },
      entitlement: {
        plan: "recruiter_growth",
        tier: "recruiter_growth",
        limits: { teamMembers: 5 },
      },
    },
  });
  authState.current = {
    user: { displayName: "Rohan Mehta", email: "rohan@meridian.example" },
    role: "recruiter",
    organizations: [{ id: "org1", name: "Meridian", role: "owner" }],
    organizationId: "org1",
    organization: { id: "org1", name: "Meridian", role: "owner" },
    membership: { role: "owner" },
    workspaceRole: "owner",
    status: "authenticated",
    isAuthenticated: true,
    logout: vi.fn(),
    setOrganizationId: vi.fn(),
  };
});

describe("Team Management Page (RBAC & Invitations)", () => {
  it("renders team members and pending invitations for an owner", async () => {
    renderTeamPage();

    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.getByText("Isha Verma")).toBeInTheDocument();

    // Check pending invitations section
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("new.interviewer@meridian.example")).toBeInTheDocument();
    expect(screen.getByText("expired.person@meridian.example")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("allows owner to invite a new teammate with role selection", async () => {
    const user = userEvent.setup();
    inviteFn.mockResolvedValue({
      data: {
        link: "http://localhost:5173/accept-invite?token=mocktoken123",
        invitation: { email: "candidate.test@meridian.example", role: "recruiter" },
      },
    });

    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    // Click "Invite Member" button
    const inviteBtns = screen.getAllByRole("button", { name: /Invite Member/i });
    await user.click(inviteBtns[0]);

    expect(screen.getByText("Invite a teammate")).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/Teammate email/);
    fireEvent.change(emailInput, { target: { value: "candidate.test@meridian.example" } });

    // Click "Send Invite"
    await user.click(screen.getByRole("button", { name: "Send Invite" }));

    await waitFor(() => {
      expect(inviteFn).toHaveBeenCalled();
    });
    expect(inviteFn).toHaveBeenCalledWith("org1", {
      email: "candidate.test@meridian.example",
      role: "recruiter",
    });

    // Invitation link panel surfaces
    expect(await screen.findByText(/Invitation link/)).toBeInTheDocument();
    expect(screen.getByText("http://localhost:5173/accept-invite?token=mocktoken123")).toBeInTheDocument();
  });

  it("allows owner to change a member's role below their own rank", async () => {
    const user = userEvent.setup();
    updateMemberFn.mockResolvedValue({ data: { ...mockMembers[2], role: "hiring_manager" } });

    renderTeamPage();
    expect(await screen.findByText("Isha Verma")).toBeInTheDocument();

    const ishaRoleSelect = screen.getByLabelText("Role for Isha Verma");
    expect(ishaRoleSelect).toBeInTheDocument();
    // Searchable dropdown: open it and pick the option, as a user would.
    await user.click(ishaRoleSelect);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "hiring manager" }));

    expect(updateMemberFn).toHaveBeenCalledWith("org1", "m3", { role: "hiring_manager" });
  });

  it("allows owner to remove a team member via confirm modal", async () => {
    const user = userEvent.setup();
    updateMemberFn.mockResolvedValue({ data: { ...mockMembers[2], status: "revoked" } });

    renderTeamPage();
    expect(await screen.findByText("Isha Verma")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[removeButtons.length - 1]);

    expect(await screen.findByText("Remove team member?")).toBeInTheDocument();
    expect(screen.getByText(/This revokes Isha Verma's access/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove member" }));

    expect(updateMemberFn).toHaveBeenCalledWith("org1", "m3", { status: "revoked" });
  });

  it("allows owner to revoke a pending invitation via confirm modal", async () => {
    const user = userEvent.setup();
    revokeInvitationFn.mockResolvedValue({ data: { revoked: true } });

    renderTeamPage();
    expect(await screen.findByText("new.interviewer@meridian.example")).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    await user.click(revokeButtons[0]);

    expect(await screen.findByText("Revoke this invitation?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));

    expect(revokeInvitationFn).toHaveBeenCalledWith("org1", "inv1");
  });

  it("filters members by search query", async () => {
    const user = userEvent.setup();
    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.getByText("Isha Verma")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search by name or email/i);
    await user.type(searchInput, "Sara");

    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.queryByText("Rohan Mehta")).not.toBeInTheDocument();
    expect(screen.queryByText("Isha Verma")).not.toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);
    expect(screen.getByText("Rohan Mehta")).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.getByText("Isha Verma")).toBeInTheDocument();
  });

  it("filters members by role dropdown", async () => {
    const user = userEvent.setup();
    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    const roleFilter = screen.getByLabelText("Filter by role");
    await user.click(roleFilter);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Admin" }));

    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.queryByText("Rohan Mehta")).not.toBeInTheDocument();
    expect(screen.queryByText("Isha Verma")).not.toBeInTheDocument();
  });

  it("enforces subscription seat limits and shows upgrade guidance when limit reached", async () => {
    // 3 active members, limit of 2 seats -> limit exceeded
    subscriptionCurrentFn.mockResolvedValue({
      data: {
        subscription: { plan: "recruiter_starter", status: "active" },
        entitlement: {
          plan: "recruiter_starter",
          tier: "recruiter_starter",
          limits: { teamMembers: 2 },
        },
      },
    });

    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    // Check alert banner is rendered
    expect(await screen.findByText(/Seat limit reached/i)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade your plan to invite more teammates/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade Plan/i })).toHaveAttribute("href", "/app/o/org1/billing");

    // Invite Member button is disabled
    const inviteBtns = screen.getAllByRole("button", { name: /Invite Member/i });
    expect(inviteBtns[0]).toBeDisabled();
  });

  it("displays You and Owner badges and prevents self-removal", async () => {
    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    // Rohan is the logged-in owner
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();

    // Rohan has no remove button next to his card
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
  });

  it("warns about duplicate invitations and blocks invites for existing members in invite modal", async () => {
    const user = userEvent.setup();
    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    const inviteBtns = screen.getAllByRole("button", { name: /Invite Member/i });
    await user.click(inviteBtns[0]);

    const emailInput = screen.getByLabelText(/Teammate email/i);

    // Existing active member
    fireEvent.change(emailInput, { target: { value: "sara@meridian.example" } });
    expect(await screen.findByText(/already an active member/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invite" })).toBeDisabled();

    // Clear and type existing pending invite
    fireEvent.change(emailInput, { target: { value: "new.interviewer@meridian.example" } });
    expect(await screen.findByText(/invitation is already pending for this email/i)).toBeInTheDocument();
  });

  it("allows owner to resend a pending invitation", async () => {
    const user = userEvent.setup();
    inviteFn.mockResolvedValue({ data: { success: true } });

    renderTeamPage();
    expect(await screen.findByText("new.interviewer@meridian.example")).toBeInTheDocument();

    const resendBtn = screen.getAllByRole("button", { name: "Resend" })[0];
    await user.click(resendBtn);

    expect(inviteFn).toHaveBeenCalledWith("org1", {
      email: "new.interviewer@meridian.example",
      role: "interviewer",
      resend: true,
    });
  });

  it("allows copying invitation link from pending invitations", async () => {
    const user = userEvent.setup();
    invitationLinkFn.mockResolvedValue({
      data: { link: "http://localhost:5173/accept-invite?token=inv1token" },
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    renderTeamPage();
    expect(await screen.findByText("new.interviewer@meridian.example")).toBeInTheDocument();

    const copyBtn = screen.getAllByRole("button", { name: "Copy link" })[0];
    await user.click(copyBtn);

    expect(invitationLinkFn).toHaveBeenCalledWith("org1", "inv1");
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("http://localhost:5173/accept-invite?token=inv1token");
    });
  });

  it("shows empty state when search matches zero members", async () => {
    const user = userEvent.setup();
    renderTeamPage();
    expect(await screen.findByText("Rohan Mehta")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search by name or email/i);
    await user.type(searchInput, "NonexistentUser");

    expect(await screen.findByText("No members match filters")).toBeInTheDocument();
    expect(screen.getByText(/Try clearing your search query or role\/status filters/i)).toBeInTheDocument();
  });

  it("shows restricted access empty state if user is not owner/admin", async () => {
    authState.current = {
      user: { displayName: "Viewer User", email: "viewer@meridian.example" },
      role: "recruiter",
      organizations: [{ id: "org1", name: "Meridian", role: "viewer" }],
      organizationId: "org1",
      organization: { id: "org1", name: "Meridian", role: "viewer" },
      membership: { role: "viewer" },
      workspaceRole: "viewer",
      status: "authenticated",
      isAuthenticated: true,
      logout: vi.fn(),
      setOrganizationId: vi.fn(),
    };

    renderTeamPage();
    expect(await screen.findByText("Team management is restricted")).toBeInTheDocument();
    expect(screen.getByText("Organization owners and admins manage members.")).toBeInTheDocument();
  });
});
