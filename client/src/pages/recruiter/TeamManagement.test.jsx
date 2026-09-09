import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
} = vi.hoisted(() => ({
  membersFn: vi.fn(),
  invitationsFn: vi.fn(),
  inviteFn: vi.fn(),
  revokeInvitationFn: vi.fn(),
  updateMemberFn: vi.fn(),
  invitationLinkFn: vi.fn(),
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
    await user.selectOptions(ishaRoleSelect, "hiring_manager");

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
