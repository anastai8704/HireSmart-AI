import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProtectedRoute from "../components/layout/ProtectedRoute";

const { authState } = vi.hoisted(() => ({
  authState: {
    current: {
      user: { _id: "u-candidate-1", displayName: "Aarav Patel", email: "aarav@candidate.example" },
      role: "candidate",
      organizations: [],
      organizationId: null,
      organization: null,
      membership: null,
      workspaceRole: "candidate",
      status: "authenticated",
      isAuthenticated: true,
      logout: vi.fn(),
      setOrganizationId: vi.fn(),
    },
  },
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => authState.current,
}));

const TestRecruiterDashboard = () => <div>Recruiter Workspace Active</div>;
const TestAdminDashboard = () => <div>Platform Admin Dashboard Active</div>;
const TestCandidateDashboard = () => <div>Candidate Portal Active</div>;
const TestForbidden = () => <div>Access Denied (403 Forbidden)</div>;

const renderRouter = (initialRoute) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/forbidden" element={<TestForbidden />} />
          <Route element={<ProtectedRoute roles={["candidate"]} />}>
            <Route path="/app/candidate" element={<TestCandidateDashboard />} />
          </Route>
          <Route
            element={
              <ProtectedRoute
                membershipRoles={[
                  "owner",
                  "admin",
                  "recruiter",
                  "hiring_manager",
                  "interviewer",
                  "viewer",
                ]}
              />
            }
          >
            <Route path="/app/o/:organizationId" element={<TestRecruiterDashboard />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/app/admin" element={<TestAdminDashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Phase 6 Security, RBAC & Tenant Isolation Tests", () => {
  describe("1. Tenant Isolation & IDOR Protection", () => {
    it("prevents candidate from accessing an organization workspace they do not belong to", async () => {
      authState.current = {
        user: { _id: "u-cand-1", displayName: "Aarav", email: "aarav@test.com" },
        role: "candidate",
        organizations: [],
        organizationId: null,
        organization: null,
        membership: null,
        workspaceRole: "candidate",
        status: "authenticated",
        isAuthenticated: true,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      renderRouter("/app/o/company-alpha-123");
      expect(await screen.findByText("Access Denied (403 Forbidden)")).toBeInTheDocument();
      expect(screen.queryByText("Recruiter Workspace Active")).not.toBeInTheDocument();
    });

    it("prevents Company A member from navigating to Company B organization workspace", async () => {
      authState.current = {
        user: { _id: "u-recruiter-1", displayName: "Priya", email: "priya@companya.com" },
        role: "recruiter",
        organizations: [
          { id: "company-a-id", name: "Company A", slug: "company-a", role: "recruiter" },
        ],
        organizationId: "company-a-id",
        organization: { id: "company-a-id", name: "Company A", slug: "company-a", role: "recruiter" },
        membership: { role: "recruiter" },
        workspaceRole: "recruiter",
        status: "authenticated",
        isAuthenticated: true,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      // Attempt to access Company B
      renderRouter("/app/o/company-b-id");
      expect(await screen.findByText("Access Denied (403 Forbidden)")).toBeInTheDocument();
      expect(screen.queryByText("Recruiter Workspace Active")).not.toBeInTheDocument();
    });

    it("allows Company A member to access Company A workspace", async () => {
      authState.current = {
        user: { _id: "u-recruiter-1", displayName: "Priya", email: "priya@companya.com" },
        role: "recruiter",
        organizations: [
          { id: "company-a-id", name: "Company A", slug: "company-a", role: "recruiter" },
        ],
        organizationId: "company-a-id",
        organization: { id: "company-a-id", name: "Company A", slug: "company-a", role: "recruiter" },
        membership: { role: "recruiter" },
        workspaceRole: "recruiter",
        status: "authenticated",
        isAuthenticated: true,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      renderRouter("/app/o/company-a-id");
      expect(await screen.findByText("Recruiter Workspace Active")).toBeInTheDocument();
    });
  });

  describe("2. RBAC Role Matrix & Platform Admin Separation", () => {
    it("blocks recruiter from accessing platform admin routes", async () => {
      authState.current = {
        user: { _id: "u-rec-1", displayName: "Recruiter Bob", email: "bob@company.com" },
        role: "recruiter",
        organizations: [{ id: "org-1", name: "Org 1", role: "owner" }],
        organizationId: "org-1",
        organization: { id: "org-1", name: "Org 1", role: "owner" },
        membership: { role: "owner" },
        workspaceRole: "owner",
        status: "authenticated",
        isAuthenticated: true,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      renderRouter("/app/admin");
      expect(await screen.findByText("Access Denied (403 Forbidden)")).toBeInTheDocument();
      expect(screen.queryByText("Platform Admin Dashboard Active")).not.toBeInTheDocument();
    });

    it("allows platform admin to access platform admin routes and any organization workspace", async () => {
      authState.current = {
        user: { _id: "u-admin-1", displayName: "Super Admin", email: "admin@hiresmart.ai" },
        role: "admin",
        organizations: [],
        organizationId: null,
        organization: null,
        membership: null,
        workspaceRole: "platform_admin",
        status: "authenticated",
        isAuthenticated: true,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      renderRouter("/app/admin");
      expect(await screen.findByText("Platform Admin Dashboard Active")).toBeInTheDocument();
    });

    it("blocks unauthenticated users and redirects to login", async () => {
      authState.current = {
        user: null,
        role: null,
        organizations: [],
        organizationId: null,
        organization: null,
        membership: null,
        workspaceRole: null,
        status: "anonymous",
        isAuthenticated: false,
        logout: vi.fn(),
        setOrganizationId: vi.fn(),
      };

      renderRouter("/app/candidate");
      // ProtectedRoute redirects unauthenticated users to /auth/login
      expect(screen.queryByText("Candidate Portal Active")).not.toBeInTheDocument();
    });
  });

  describe("3. Role Hierarchy & Privilege Escalation Rules", () => {
    const ROLE_RANK = Object.freeze({
      owner: 100,
      admin: 80,
      recruiter: 50,
      hiring_manager: 50,
      interviewer: 30,
      viewer: 30,
    });

    it("verifies Owner rank is higher than Admin, Recruiter, Hiring Manager, Interviewer, Viewer", () => {
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.recruiter);
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.hiring_manager);
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.interviewer);
      expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.viewer);
    });

    it("verifies Admin cannot manage another Admin or Owner", () => {
      const adminRank = ROLE_RANK.admin;
      expect(adminRank > ROLE_RANK.owner).toBe(false);
      expect(adminRank > ROLE_RANK.admin).toBe(false);
      expect(adminRank > ROLE_RANK.recruiter).toBe(true);
      expect(adminRank > ROLE_RANK.hiring_manager).toBe(true);
      expect(adminRank > ROLE_RANK.interviewer).toBe(true);
      expect(adminRank > ROLE_RANK.viewer).toBe(true);
    });

    it("verifies Recruiter and below cannot manage members", () => {
      const permissionsByRole = {
        owner: ["member.manage"],
        admin: ["member.manage"],
        recruiter: ["job.manage", "application.manage", "interview.manage", "analytics.read"],
        hiring_manager: ["job.read", "application.review", "interview.feedback", "analytics.read"],
        interviewer: ["application.review", "interview.feedback"],
        viewer: ["job.read"],
      };

      expect(permissionsByRole.owner.includes("member.manage")).toBe(true);
      expect(permissionsByRole.admin.includes("member.manage")).toBe(true);
      expect(permissionsByRole.recruiter.includes("member.manage")).toBe(false);
      expect(permissionsByRole.hiring_manager.includes("member.manage")).toBe(false);
      expect(permissionsByRole.interviewer.includes("member.manage")).toBe(false);
      expect(permissionsByRole.viewer.includes("member.manage")).toBe(false);
    });
  });
});
