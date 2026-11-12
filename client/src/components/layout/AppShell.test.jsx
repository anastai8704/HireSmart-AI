import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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

afterEach(() => {
  cleanup();
});

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
    const switcher = screen.getByRole("combobox", { name: "Switch workspace" });
    expect(switcher).toHaveValue("Meridian · owner");
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

describe("AppShell platform header (Requirement 7)", () => {
  const renderAdmin = () => {
    state.role = "admin";
    state.user = { displayName: "Platform Admin" };
    state.workspaceRole = "admin";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/admin"]}>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route path="admin" element={<div>ADMIN HOME</div>} />
              <Route path="admin/search" element={<div>ADMIN SEARCH PAGE</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("submits the header search to the admin search page with the query", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderAdmin();
    const input = screen.getByRole("searchbox", { name: "Search companies and users" });
    await userEvent.type(input, "Meridian{enter}");
    expect(await screen.findByText("ADMIN SEARCH PAGE")).toBeInTheDocument();
  });

  it("ignores a header search shorter than two characters", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderAdmin();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search companies and users" }), "a{enter}");
    expect(screen.getByText("ADMIN HOME")).toBeInTheDocument();
  });

  it("shows the current date in Asia/Kolkata as DD MMM YYYY", () => {
    renderAdmin();
    const expected = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
    expect(screen.getByTestId("admin-header-date")).toHaveTextContent(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    expect(screen.getByTestId("admin-header-date").textContent.replace(/\./g, "")).toBe(expected.replace(/\./g, ""));
  });
});

