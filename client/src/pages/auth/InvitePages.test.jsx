import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { infoFn, acceptFn, acceptExisting } = vi.hoisted(() => ({
  infoFn: vi.fn(),
  acceptFn: vi.fn(),
  acceptExisting: vi.fn(),
}));
const { authState } = vi.hoisted(() => ({ authState: { current: { login: vi.fn(), user: null } } }));
vi.mock("../../lib/api", () => ({
  inviteApi: { info: infoFn, accept: acceptFn, acceptExisting },
}));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => authState.current,
}));

import { AcceptInvitePage } from "./InvitePages";

const renderInvite = (qs = "?token=abc123") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/accept-invite${qs}`]}>
        <AcceptInvitePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const errorFor = (code, message) => ({ response: { data: { code, message } } });

const inviteInfo = {
  email: "new.hire@company.com",
  role: "hiring_manager",
  organization: { id: "org-1", name: "BlueOrbit Technologies" },
  invitedByName: "Priya",
  expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
  accountExists: false,
};

afterEach(cleanup);

beforeEach(() => {
  infoFn.mockReset();
  acceptFn.mockReset();
  acceptExisting.mockReset();
  authState.current = { login: vi.fn(), user: null };
});

describe("accept invitation page", () => {
  it("shows the company, inviter and role, with create/sign-in options", async () => {
    infoFn.mockResolvedValue({ data: inviteInfo });
    renderInvite();
    expect(await screen.findByText("BlueOrbit Technologies")).toBeInTheDocument();
    expect(screen.getByText("Invited by")).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Hiring Manager")).toBeInTheDocument();
    expect(screen.getAllByText("new.hire@company.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account and join" })).toBeInTheDocument();
  });

  it("renders the expired state without an acceptance form", async () => {
    infoFn.mockRejectedValue(errorFor("INVITE_EXPIRED", "This invitation has expired."));
    renderInvite();
    expect(await screen.findByText("Invitation expired")).toBeInTheDocument();
    expect(screen.getByText("This invitation is no longer valid.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account and join" })).not.toBeInTheDocument();
  });

  it("renders the revoked state", async () => {
    infoFn.mockRejectedValue(errorFor("INVITE_REVOKED", "This invitation was revoked."));
    renderInvite();
    expect(await screen.findByText("Invitation revoked")).toBeInTheDocument();
    expect(screen.getByText("This invitation has been cancelled by the organization.")).toBeInTheDocument();
  });

  it("renders the already-accepted state", async () => {
    infoFn.mockRejectedValue(errorFor("INVITE_USED", "This invitation has already been used."));
    renderInvite();
    expect(await screen.findByText("Invitation already accepted")).toBeInTheDocument();
  });

  it("renders invalid / not found invitation state", async () => {
    infoFn.mockRejectedValue(errorFor("INVITE_INVALID", "This invitation link is no longer valid."));
    renderInvite();
    expect(await screen.findByText("Invitation not found")).toBeInTheDocument();
    expect(screen.getByText("This invitation link is no longer valid.")).toBeInTheDocument();
  });

  it("renders banner when signed in as a different user", async () => {
    infoFn.mockResolvedValue({ data: inviteInfo });
    authState.current = {
      login: vi.fn(),
      user: { email: "other.user@different.com", displayName: "Other User" },
    };
    renderInvite();
    expect(await screen.findByText(/You're signed in as other.user@different.com/)).toBeInTheDocument();
  });

  it("allows a new user to create account and join the company", async () => {
    const user = userEvent.setup();
    infoFn.mockResolvedValue({ data: inviteInfo });
    acceptFn.mockResolvedValue({
      data: {
        organization: { id: "org-1", name: "BlueOrbit Technologies" },
        role: "hiring_manager",
      },
    });
    authState.current = { login: vi.fn().mockResolvedValue({}), user: null };

    renderInvite();
    expect(await screen.findByText("BlueOrbit Technologies")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), "Alex Mercer");
    await user.type(screen.getByLabelText(/Create password/), "SuperSecure123!@#");
    await user.click(screen.getByRole("button", { name: "Create account and join" }));

    expect(acceptFn).toHaveBeenCalledWith("abc123", {
      name: "Alex Mercer",
      password: "SuperSecure123!@#",
    });
    expect(authState.current.login).toHaveBeenCalledWith({
      email: "new.hire@company.com",
      password: "SuperSecure123!@#",
    });

    expect(await screen.findByText("You're in!")).toBeInTheDocument();
    expect(screen.getByText(/Your account is ready as a/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to workspace" })).toBeInTheDocument();
  });

  it("allows an existing account to sign in and accept the invitation", async () => {
    const user = userEvent.setup();
    infoFn.mockResolvedValue({ data: { ...inviteInfo, accountExists: true } });
    acceptExisting.mockResolvedValue({
      data: {
        organization: { id: "org-1", name: "BlueOrbit Technologies" },
        role: "hiring_manager",
      },
    });
    authState.current = { login: vi.fn().mockResolvedValue({}), user: null };

    renderInvite();
    expect(await screen.findByText("BlueOrbit Technologies")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Password/), "ExistingPassword123!");
    await user.click(screen.getByRole("button", { name: "Sign in and accept" }));

    expect(authState.current.login).toHaveBeenCalledWith({
      email: "new.hire@company.com",
      password: "ExistingPassword123!",
    });
    expect(acceptExisting).toHaveBeenCalledWith("abc123");

    expect(await screen.findByText("You're in!")).toBeInTheDocument();
  });

  it("handles ALREADY_MEMBER state smoothly by showing welcome back screen", async () => {
    const user = userEvent.setup();
    infoFn.mockResolvedValue({ data: { ...inviteInfo, accountExists: true } });
    authState.current = { login: vi.fn().mockResolvedValue({}), user: null };
    acceptExisting.mockRejectedValue(
      errorFor("ALREADY_MEMBER", "You are already a member of this company."),
    );

    renderInvite();
    await user.type(await screen.findByLabelText(/^Password/), "ExistingPassword123!");
    await user.click(screen.getByRole("button", { name: "Sign in and accept" }));

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText(/You're already part of the team/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to workspace" })).toBeInTheDocument();
  });

  it("renders the email mismatch state and offers sign-in with the invited email", async () => {
    const user = userEvent.setup();
    infoFn.mockResolvedValue({ data: inviteInfo });
    authState.current = { login: vi.fn().mockResolvedValue({}), user: null };
    acceptExisting.mockRejectedValue(
      errorFor("INVITE_EMAIL_MISMATCH", "This invitation was sent to a different email address."),
    );
    renderInvite();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    const emailInput = screen.getByLabelText(/Work email/);
    expect(emailInput).toHaveValue("new.hire@company.com");
    await user.clear(emailInput);
    await user.type(emailInput, "wrong.account@elsewhere.com");
    await user.type(screen.getByLabelText(/^Password/), "WrongPassword123!");
    await user.click(screen.getByRole("button", { name: "Sign in and accept" }));
    expect(await screen.findByText("This invitation was sent to another email address.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in with new.hire@company.com" })).toBeInTheDocument();
    expect(acceptExisting).toHaveBeenCalledTimes(1);
  });
});
