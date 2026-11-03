import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = {
  user: { displayName: "Test User" },
  role: "candidate",
  organizations: [],
  organizationId: null,
  organization: null,
  membership: null,
  workspaceRole: "candidate",
  status: "authenticated",
  isAuthenticated: true,
  logout: () => {},
  setOrganizationId: () => {},
};

vi.mock("../../context/useAuth", () => ({
  useAuth: () => state,
}));

vi.mock("../../lib/api", () => ({
  notificationApi: { list: () => Promise.resolve({ data: [] }) },
}));

const renderShell = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

import AppShell from "./AppShell";

beforeEach(() => {
  state.user = { displayName: "Test User" };
  state.role = "candidate";
  state.organizations = [];
  state.organizationId = null;
  state.organization = null;
  state.membership = null;
  state.workspaceRole = "candidate";
});

describe("AppShell smoke", () => {
  it("renders candidate grouped nav", () => {
    renderShell("/app/candidate");
    expect(screen.getByText("Career Assistant")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
  });
  it("renders recruiter grouped nav with org switcher", () => {
    state.role = "recruiter";
    state.user = { displayName: "Rec User" };
    state.organizations = [{ id: "org1", name: "Meridian", role: "owner" }];
    state.organizationId = "org1";
    state.organization = { id: "org1", name: "Meridian", role: "owner" };
    state.membership = { role: "owner" };
    state.workspaceRole = "owner";
    renderShell("/app/o/org1");
    expect(screen.getByText("Hiring Assistant")).toBeInTheDocument();
    expect(screen.getByText("Hiring")).toBeInTheDocument();
    expect(screen.getByText("Meridian · owner")).toBeInTheDocument();
  });
  it("renders admin grouped nav", () => {
    state.role = "admin";
    state.user = { displayName: "Admin User" };
    state.workspaceRole = "platform_admin";
    renderShell("/app/admin");
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Security & Audit")).toBeInTheDocument();
  });
});
