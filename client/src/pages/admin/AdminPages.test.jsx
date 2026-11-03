import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Admin User", email: "admin@example.com" },
    role: "admin",
    organizations: [],
    organizationId: null,
    organization: null,
    membership: null,
    workspaceRole: "platform_admin",
    status: "authenticated",
    isAuthenticated: true,
    logout: () => {},
    setOrganizationId: () => {},
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

vi.mock("../../lib/api", () => ({
  adminApi: {
    users: () =>
      Promise.resolve({
        data: [
          {
            _id: "u1",
            name: "Asha Sharma",
            email: "asha@example.com",
            role: "candidate",
            isActive: true,
            accountStatus: "active",
            emailVerified: true,
            createdAt: "2026-08-01T10:00:00Z",
            updatedAt: "2026-09-01T10:00:00Z",
          },
        ],
        meta: { count: 1, hasMore: false, nextCursor: null, total: 1 },
      }),
    organizations: () =>
      Promise.resolve({
        data: [
          {
            _id: "o1",
            name: "Meridian Cloud",
            slug: "meridian",
            industry: "IT Services",
            size: "11-50",
            timezone: "Asia/Kolkata",
            status: "active",
            verificationStatus: "verified",
            riskScore: 10,
            riskFlags: [],
            businessEmail: "hr@meridiancloud.io",
            gstin: "27ABCDE1234F1Z5",
            registrationNumber: "U72200MH2021PTC123456",
            createdAt: "2026-08-05T10:00:00Z",
            updatedAt: "2026-09-01T10:00:00Z",
          },
        ],
        meta: { count: 1, hasMore: false, nextCursor: null, total: 1 },
      }),
    orgVerificationDetails: () =>
      Promise.resolve({
        data: {
          organization: {
            _id: "o1",
            name: "Meridian Cloud",
            slug: "meridian",
            verificationStatus: "verified",
            riskScore: 10,
            riskFlags: [],
            businessEmail: "hr@meridiancloud.io",
            gstin: "27ABCDE1234F1Z5",
            registrationNumber: "U72200MH2021PTC123456",
          },
          owner: {
            name: "Asha Sharma",
            email: "asha@example.com",
            phone: "+91 9876543210",
          },
          hiringStats: {
            totalJobs: 5,
            pendingJobs: 2,
            approvedJobs: 3,
            totalApplications: 12,
            hiredCount: 2,
            shortlistedCount: 4,
            interviewCount: 3,
            confirmedJoinings: 2,
            verifiedEmployees: 2,
          },
        },
      }),
    audit: () =>
      Promise.resolve({
        data: [
          {
            _id: "a1",
            action: "admin.user_suspended",
            resourceType: "user",
            resourceId: "r1",
            outcome: "success",
            requestId: "req-1",
            metadata: { reason: "test" },
            createdAt: "2026-09-02T10:00:00Z",
          },
        ],
        meta: { count: 1, hasMore: false, nextCursor: null },
      }),
    security: () =>
      Promise.resolve({
        data: [
          {
            _id: "s1",
            type: "auth.failed_login",
            severity: "high",
            requestId: "req-2",
            ipHash: "hash-1",
            details: { attempts: 3 },
            resolvedAt: null,
            createdAt: "2026-09-03T10:00:00Z",
          },
        ],
        meta: { count: 1, hasMore: false, nextCursor: null },
      }),
    aiUsage: () =>
      Promise.resolve({
        data: [
          {
            _id: {
              organization: null,
              feature: "candidate_matching",
              provider: "groq",
              model: "gpt-oss-20b",
            },
            runs: 10,
            inputTokens: 500,
            outputTokens: 100,
            estimatedCostUsd: 0.0005,
            averageLatencyMs: 1200,
            fallbacks: 1,
          },
        ],
      }),
    moderationCompanies: () =>
      Promise.resolve({
        data: [
          {
            organizationId: "o1",
            _id: "o1",
            companyName: "Meridian Cloud",
            companySlug: "meridian",
            verificationStatus: "verified",
            riskScore: 10,
            riskFlags: [],
            jobCounts: { total: 3, pending: 2, approved: 1, rejected: 0 },
            latestSubmission: "2026-09-04T10:00:00Z",
            jobs: [
              {
                id: "j1",
                title: "Backend Engineer",
                company: "Meridian Cloud",
                location: "Pune",
                workplaceMode: "Remote",
                salary: 1200000,
                moderation: { status: "pending" },
                createdAt: "2026-09-04T10:00:00Z",
              },
            ],
          },
        ],
        meta: { total: 1 },
      }),
    moderation: () =>
      Promise.resolve({
        data: [
          {
            id: "j1",
            title: "Backend Engineer",
            company: "Meridian Cloud",
            location: "Pune",
            workplaceMode: "Remote",
            organization: { id: "o1", name: "Meridian Cloud", slug: "meridian" },
            status: "published",
            version: 1,
            requiredSkills: ["Node.js"],
            moderation: { status: "pending" },
            createdAt: "2026-09-04T10:00:00Z",
          },
        ],
        meta: { count: 1, hasMore: false, nextCursor: null, total: 1 },
      }),
    companyModerationJobs: () =>
      Promise.resolve({
        data: {
          organization: { id: "o1", name: "Meridian Cloud", verificationStatus: "verified" },
          jobs: [
            {
              id: "j1",
              title: "Backend Engineer",
              department: "Engineering",
              location: "Pune",
              workplaceMode: "Remote",
              salaryInrLpa: "12.0 LPA",
              applicationCount: 5,
              moderation: { status: "pending" },
              createdAt: "2026-09-04T10:00:00Z",
            },
          ],
        },
      }),
    bulkApproveJobs: () => Promise.resolve({ data: { success: true, approvedCount: 2 } }),
    verifyOrg: () => Promise.resolve({ data: { name: "Meridian Cloud" } }),
    rejectOrg: () => Promise.resolve({ data: {} }),
    requestMoreInfoOrg: () => Promise.resolve({ data: {} }),
    suspendOrg: () => Promise.resolve({ data: {} }),
    reactivateOrg: () => Promise.resolve({ data: {} }),
    moderate: () => Promise.resolve({ data: {} }),
    suspend: () => Promise.resolve({ data: { id: "u1", status: "suspended" } }),
    reactivate: () => Promise.resolve({ data: { id: "u1", status: "active" } }),
    live: () => Promise.resolve({ data: { status: "ok" } }),
    ready: () =>
      Promise.resolve({
        data: {
          status: "ready",
          checks: { mongodb: "up", jobStore: "up" },
          queue: { queued: 0, staleProcessing: 0 },
        },
      }),
    aiActivity: () =>
      Promise.resolve({ data: [], meta: { count: 0, hasMore: false, nextCursor: null } }),
  },
}));

import {
  AdminAIUsage,
  AdminHome,
  AdminModeration,
  AdminOrganizations,
  AdminSecurity,
  AdminUsers,
} from "./AdminPages";

const renderPage = (ui, path = "/app/admin") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Admin portal smoke", () => {
  it("renders overview with real KPIs and pending actions", async () => {
    renderPage(<AdminHome />);
    expect(await screen.findByText("Platform Overview")).toBeInTheDocument();
    expect(await screen.findByText("Total Users")).toBeInTheDocument();
    expect(await screen.findByText("Pending Approvals")).toBeInTheDocument();
    expect(await screen.findByText("AI Operations")).toBeInTheDocument();
    expect(await screen.findByText("Pending Actions")).toBeInTheDocument();
    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(await screen.findByText("Platform Health")).toBeInTheDocument();
  });

  it("renders approvals with company moderation card and pending job", async () => {
    renderPage(<AdminModeration />, "/app/admin/moderation");
    expect(await screen.findByText("Job Listing Moderation")).toBeInTheDocument();
    expect(await screen.findByText("Meridian Cloud")).toBeInTheDocument();
    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(await screen.findByText("Approve All Eligible (2)")).toBeInTheDocument();
    expect(await screen.findByText("Reject")).toBeInTheDocument();
    expect(await screen.findByText("Approve")).toBeInTheDocument();
  });

  it("opens bulk approve modal when clicking Approve All Eligible", async () => {
    renderPage(<AdminModeration />, "/app/admin/moderation");
    const bulkBtn = await screen.findByText("Approve All Eligible (2)");
    fireEvent.click(bulkBtn);
    expect(await screen.findByText("Bulk Approve Job Listings")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to approve all/i)).toBeInTheDocument();
  });

  it("renders users table with role and status", async () => {
    renderPage(<AdminUsers />, "/app/admin/users");
    expect(await screen.findByText("Asha Sharma")).toBeInTheDocument();
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(await screen.findByText("candidate")).toBeInTheDocument();
  });

  it("renders companies table and allows inspection", async () => {
    renderPage(<AdminOrganizations />, "/app/admin/organizations");
    expect(await screen.findByText("Meridian Cloud")).toBeInTheDocument();
    expect(await screen.findByText("IT Services")).toBeInTheDocument();

    const inspectBtn = await screen.findByRole("button", { name: "Inspect" });
    fireEvent.click(inspectBtn);
    expect(await screen.findByText("Verification Review: Meridian Cloud")).toBeInTheDocument();
    expect((await screen.findAllByText("27ABCDE1234F1Z5")).length).toBeGreaterThan(0);
    expect(screen.getByText("Company Hiring & Placement Activity")).toBeInTheDocument();
  });

  it("renders AI activity with KPIs and honest cost display", async () => {
    renderPage(<AdminAIUsage />, "/app/admin/ai-usage");
    expect(await screen.findByText("AI Activity")).toBeInTheDocument();
    expect(await screen.findByText("Total AI Runs")).toBeInTheDocument();
    expect((await screen.findAllByText("Fallbacks")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Estimated Cost")).toBeInTheDocument();
  });

  it("renders security and audit tabs", async () => {
    renderPage(<AdminSecurity />, "/app/admin/security");
    expect(await screen.findByText("Security & Audit")).toBeInTheDocument();
    expect(await screen.findByText("Security Events")).toBeInTheDocument();
    expect(await screen.findByText("Audit Log")).toBeInTheDocument();
  });
});
