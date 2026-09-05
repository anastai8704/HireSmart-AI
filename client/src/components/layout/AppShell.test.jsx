import { beforeEach, describe, expect, it, vi } from "vitest";
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
    render(
      <MemoryRouter initialEntries={["/app/candidate"]}>
        <AppShell />
      </MemoryRouter>,
    );
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
    render(
      <MemoryRouter initialEntries={["/app/o/org1"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText("Hiring")).toBeInTheDocument();
    expect(screen.getByText("Meridian · owner")).toBeInTheDocument();
  });
  it("renders admin grouped nav", () => {
    state.role = "admin";
    state.user = { displayName: "Admin User" };
    state.workspaceRole = "platform_admin";
    render(
      <MemoryRouter initialEntries={["/app/admin"]}>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Security & Audit")).toBeInTheDocument();
  });
});
