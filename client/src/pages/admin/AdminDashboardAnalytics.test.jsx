import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminHome } from "./AdminPages";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Platform Admin", email: "admin@hiresmart.ai" },
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

const mockOverviewStats = {
  users: { total: 142, candidates: 118, recruiters: 22, admins: 2, suspended: 1 },
  companies: { total: 24, verified: 18, pending: 4, underReview: 2, rejected: 0, suspended: 0 },
  jobs: { total: 68, active: 48, pending: 6, draft: 8, closed: 6 },
  applications: { total: 540, submitted: 210, shortlisted: 120, interview: 45, offer: 12, hired: 15, rejected: 138 },
  placements: { total: 15, joiningConfirmed: 12, verifiedPlacements: 10, currentlyWorking: 9, employmentEnded: 1 },
  kpis: {
    candidatesTotal: 118,
    candidatesNew: 14,
    recruitersTotal: 22,
    recruitersNew: 3,
    companiesTotal: 24,
    companiesVerified: 18,
    companiesAwaitingVerification: 6,
    activeJobs: 48,
    pendingJobApprovals: 6,
    jobPostings: 12,
    applications: 540,
    interviewsScheduled: 38,
    offersIssued: 14,
    candidatesHired: 15,
    confirmedEmployment: 10,
    activePaidSubscriptions: 8,
    subscriptionConversion: 33.3,
    successfulPayments: 19,
    revenue: 47200,
    testRevenue: 47200,
    liveRevenue: 0,
    refunds: 0,
    failedPayments: 1,
    upcomingInterviews: 6,
    verifiedPlacements: 10,
    suspendedAccounts: 1,
    fraudReviewQueue: 2,
    hiringConversion: 2.8,
  },
  queues: {
    placementsAwaitingVerification: 3,
    subscriptionsPastDue: 1,
  },
  companyWiseStats: [
    {
      id: "org-1",
      name: "Apex Tech Labs",
      slug: "apex-tech",
      verificationStatus: "verified",
      riskScore: 12,
      jobCount: 10,
      publishedJobsCount: 8,
      applicationCount: 95,
      shortlistCount: 20,
      hiredCount: 4,
      placementCount: 3,
    },
    {
      id: "org-2",
      name: "Solaria Cyber",
      slug: "solaria",
      verificationStatus: "pending",
      riskScore: 45,
      jobCount: 4,
      publishedJobsCount: 2,
      applicationCount: 28,
      shortlistCount: 6,
      hiredCount: 1,
      placementCount: 0,
    },
    {
      id: "org-3",
      name: "Hyperion Global",
      slug: "hyperion",
      verificationStatus: "under_review",
      riskScore: 78,
      jobCount: 2,
      publishedJobsCount: 0,
      applicationCount: 10,
      shortlistCount: 1,
      hiredCount: 0,
      placementCount: 0,
    },
  ],
  monthlyTrends: [
    { yearMonth: "2026-09", monthLabel: "Sep '26", applications: 120, hires: 4, verifiedPlacements: 3, joinings: 4 },
    { yearMonth: "2026-10", monthLabel: "Oct '26", applications: 190, hires: 6, verifiedPlacements: 4, joinings: 5 },
    { yearMonth: "2026-11", monthLabel: "Nov '26", applications: 230, hires: 5, verifiedPlacements: 3, joinings: 3 },
  ],
  recentActivity: [
    {
      action: "organization.verified",
      actor: { name: "Platform Admin" },
      resourceType: "organization",
      organization: { name: "Apex Tech Labs" },
      outcome: "success",
      createdAt: "2026-11-17T10:00:00Z",
    },
  ],
  series: {},
  breakdowns: {},
  range: { preset: "30d" },
};

vi.mock("../../lib/api", () => ({
  adminApi: {
    overviewAnalytics: () => Promise.resolve({ data: mockOverviewStats }),
    moderation: () =>
      Promise.resolve({
        data: [
          {
            id: "job-1",
            title: "Staff AI Engineer",
            company: "Apex Tech Labs",
            location: "Bengaluru, KA",
            workplaceMode: "Hybrid",
            status: "published",
            moderation: { status: "pending" },
            createdAt: "2026-11-17T09:00:00Z",
          },
        ],
        meta: { count: 1, total: 1 },
      }),
    aiUsage: () => Promise.resolve({ data: [{ runs: 42, estimatedCostUsd: 0.05 }] }),
    ready: () =>
      Promise.resolve({
        data: {
          status: "ready",
          checks: { mongodb: "up", jobStore: "up" },
          queue: { queued: 0, staleProcessing: 0 },
        },
      }),
    reportCsv: () => Promise.resolve({ data: "col1,col2\nval1,val2" }),
  },
}));

const renderDashboard = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin"]}>
        <AdminHome />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Phase 4A: Admin Workspace Dashboard & Analytics", () => {
  it("renders all 10 headline KPI cards with real platform values", async () => {
    renderDashboard();

    expect(await screen.findByText("Platform Headline KPIs · All Time")).toBeInTheDocument();

    // 1. Total candidates
    expect(screen.getByText("Total candidates")).toBeInTheDocument();
    expect(screen.getAllByText("118").length).toBeGreaterThanOrEqual(1);

    // 2. Total organizations
    expect(screen.getByText("Total organizations")).toBeInTheDocument();

    // 3. Verified organizations
    expect(screen.getByText("Verified organizations")).toBeInTheDocument();

    // 4. Pending verifications
    expect(screen.getByText("Pending verifications")).toBeInTheDocument();

    // 5. Total jobs
    expect(screen.getByText("Total jobs")).toBeInTheDocument();

    // 6. Jobs pending approval
    expect(screen.getByText("Jobs pending approval")).toBeInTheDocument();

    // 7. Total applications
    expect(screen.getByText("Total applications")).toBeInTheDocument();

    // 8. Placements & hires
    expect(screen.getByText("Placements & hires")).toBeInTheDocument();

    // 9. Active subscriptions
    expect(screen.getByText("Active subscriptions")).toBeInTheDocument();

    // 10. Revenue (Test Mode)
    expect(screen.getByText("Revenue (Test Mode)")).toBeInTheDocument();
    expect(screen.getAllByText("₹47,200").length).toBeGreaterThanOrEqual(1);
  });

  it("renders active operational alerts banner with drill-down links", async () => {
    renderDashboard();

    expect(await screen.findByTestId("platform-alerts-banner")).toBeInTheDocument();
    expect(screen.getByText(/Active Operational Alerts/i)).toBeInTheDocument();

    // Check specific alerts
    const jobAlert = screen.getByTestId("alert-jobs");
    expect(jobAlert).toHaveTextContent("6 job postings awaiting moderation");
    expect(jobAlert).toHaveAttribute("href", "/app/admin/moderation");

    const verifAlert = screen.getByTestId("alert-verif");
    expect(verifAlert).toHaveTextContent("6 organization verification requests pending");
    expect(verifAlert).toHaveAttribute("href", "/app/admin/verification");

    const placementAlert = screen.getByTestId("alert-placements");
    expect(placementAlert).toHaveTextContent("3 confirmed joinings need placement verification");
    expect(placementAlert).toHaveAttribute("href", "/app/admin/placements");

    const fraudAlert = screen.getByTestId("alert-fraud");
    expect(fraudAlert).toHaveTextContent("2 organization(s) flagged for fraud review");
    expect(fraudAlert).toHaveAttribute("href", "/app/admin/organizations");

    const pastDueAlert = screen.getByTestId("alert-pastDue");
    expect(pastDueAlert).toHaveTextContent("1 subscriptions past due");
    expect(pastDueAlert).toHaveAttribute("href", "/app/admin/subscriptions");

    const failedPayAlert = screen.getByTestId("alert-failedPayments");
    expect(failedPayAlert).toHaveTextContent("1 failed payment transactions recorded");
    expect(failedPayAlert).toHaveAttribute("href", "/app/admin/revenue");
  });

  it("renders recent organizations card with risk score and inspect buttons", async () => {
    renderDashboard();

    expect(await screen.findByTestId("recent-orgs-card")).toBeInTheDocument();
    expect(screen.getByText("Recent Organizations")).toBeInTheDocument();
    expect(screen.getByText("Apex Tech Labs")).toBeInTheDocument();
    expect(screen.getByText("Solaria Cyber")).toBeInTheDocument();
    expect(screen.getByText("Hyperion Global")).toBeInTheDocument();

    // Check risk display
    expect(screen.getByText("12/100")).toBeInTheDocument();
    expect(screen.getByText("45/100")).toBeInTheDocument();
    expect(screen.getByText("78/100")).toBeInTheDocument();

    // Check inspect buttons
    const inspectButtons = screen.getAllByRole("link", { name: "Inspect" });
    expect(inspectButtons.length).toBe(3);
    expect(inspectButtons[0]).toHaveAttribute("href", "/app/admin/organizations");
  });

  it("renders subscription & revenue overview card with test mode indicator", async () => {
    renderDashboard();

    expect(await screen.findByTestId("subscription-overview-card")).toBeInTheDocument();
    expect(screen.getByText("Subscription & Revenue Overview")).toBeInTheDocument();
    expect(screen.getByText("Active Paid Plans")).toBeInTheDocument();
    expect(screen.getByText("Test Mode Net Volume")).toBeInTheDocument();
    expect(screen.getByText("33.3% company conversion")).toBeInTheDocument();
    expect(screen.getByText("1 past due")).toBeInTheDocument();
  });

  it("renders quick navigation shortcuts for all core admin tools", async () => {
    renderDashboard();

    expect(await screen.findByText("Admin Tool Shortcuts")).toBeInTheDocument();

    expect(screen.getByTestId("shortcut-job-moderation")).toHaveAttribute("href", "/app/admin/moderation");
    expect(screen.getByTestId("shortcut-company-verification")).toHaveAttribute("href", "/app/admin/verification");
    expect(screen.getByTestId("shortcut-placements-tracking")).toHaveAttribute("href", "/app/admin/placements");
    expect(screen.getByTestId("shortcut-candidates---users")).toHaveAttribute("href", "/app/admin/users");
    expect(screen.getByTestId("shortcut-organizations")).toHaveAttribute("href", "/app/admin/organizations");
    expect(screen.getByTestId("shortcut-global-search")).toHaveAttribute("href", "/app/admin/search");
    expect(screen.getByTestId("shortcut-subscriptions")).toHaveAttribute("href", "/app/admin/subscriptions");
    expect(screen.getByTestId("shortcut-revenue---ledger")).toHaveAttribute("href", "/app/admin/revenue");
    expect(screen.getByTestId("shortcut-security---audit")).toHaveAttribute("href", "/app/admin/security");
    expect(screen.getByTestId("shortcut-ai-usage-analytics")).toHaveAttribute("href", "/app/admin/ai-usage");
  });

  it("renders pending moderation queue with review action", async () => {
    renderDashboard();

    expect(await screen.findByText("Staff AI Engineer")).toBeInTheDocument();
    expect(screen.getByText("Apex Tech Labs · Bengaluru, KA")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Review" });
    expect(reviewLink).toHaveAttribute("href", "/app/admin/moderation");
  });
});
