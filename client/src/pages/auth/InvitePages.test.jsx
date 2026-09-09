import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { infoFn, acceptExisting } = vi.hoisted(() => ({ infoFn: vi.fn(), acceptExisting: vi.fn() }));
const { authState } = vi.hoisted(() => ({ authState: { current: { login: vi.fn(), user: null } } }));
vi.mock("../../lib/api", () => ({
  inviteApi: { info: infoFn, accept: vi.fn(), acceptExisting },
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
