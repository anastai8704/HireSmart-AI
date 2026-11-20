import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const subscriptionsMock = vi.hoisted(() => vi.fn());
const subscriptionDetailsMock = vi.hoisted(() => vi.fn());
const cancelSubscriptionMock = vi.hoisted(() => vi.fn());
const revenueAnalyticsMock = vi.hoisted(() => vi.fn());
const revenueMock = vi.hoisted(() => vi.fn());
const revenueExportCsvMock = vi.hoisted(() => vi.fn());
const transactionDetailsMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  adminApi: {
    subscriptions: subscriptionsMock,
    subscriptionDetails: subscriptionDetailsMock,
    cancelSubscription: cancelSubscriptionMock,
    revenueAnalytics: revenueAnalyticsMock,
    revenue: revenueMock,
    revenueExportCsv: revenueExportCsvMock,
    transactionDetails: transactionDetailsMock,
  },
  downloadBlob: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Admin User", email: "admin@example.com" },
    role: "admin",
    organizations: [{ id: "org-1", name: "Apex Innovations", role: "owner" }],
    organizationId: "org-1",
    organization: { id: "org-1", name: "Apex Innovations" },
    membership: { role: "owner" },
    workspaceRole: "platform_admin",
    status: "authenticated",
    isAuthenticated: true,
  }),
}));

import { AdminSubscriptions } from "./AdminSubscriptions";
import AdminRevenue from "./AdminRevenue";

const mockSubscriptionData = {
  data: [
    {
      id: "sub-101",
      subscriberType: "organization",
      subscriberId: "org-101",
      subscriber: {
        id: "org-101",
        name: "CloudTech Labs",
        email: "billing@cloudtech.test",
        type: "organization",
      },
      planTier: "recruiter_growth",
      planName: "Growth",
      status: "active",
      billingCycle: "monthly",
      priceInr: 2499,
      isDemo: false,
      currentPeriodStart: "2026-11-01T00:00:00.000Z",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
      usage: { activeJobsCount: 4, teamMembersCount: 2, aiAnalysesUsedThisMonth: 45 },
    },
    {
      id: "sub-102",
      subscriberType: "organization",
      subscriberId: "org-102",
      subscriber: {
        id: "org-102",
        name: "Legacy Dynamics",
        email: "finance@legacydyn.test",
        type: "organization",
      },
      planTier: "recruiter_starter",
      planName: "Starter",
      status: "past_due",
      billingCycle: "monthly",
      priceInr: 999,
      renewalFailures: 2,
      currentPeriodStart: "2026-10-15T00:00:00.000Z",
      currentPeriodEnd: "2026-11-15T00:00:00.000Z",
      limits: { activeJobs: 3, teamMembers: 2, aiAnalysesPerMonth: 50 },
      usage: { activeJobsCount: 1, teamMembersCount: 1, aiAnalysesUsedThisMonth: 10 },
    },
  ],
  meta: {
    page: 1,
    pages: 1,
    total: 2,
    counts: {
      total: 15,
      activePaid: 8,
      free: 5,
      trial: 0,
      pastDue: 2,
      canceled: 0,
      expired: 0,
    },
    planDistribution: [
      { tier: "recruiter_growth", name: "Growth", count: 5, activeCount: 5, revenue: 12495 },
      { tier: "recruiter_starter", name: "Starter", count: 3, activeCount: 3, revenue: 2997 },
    ],
  },
};

const mockAnalyticsData = {
  data: {
    metrics: {
      monthlyRecurringRevenue: 15492,
      mrrInr: 15492,
      totalGrossRevenue: 85000,
      totalCapturedTransactions: 34,
      netRevenue: 82500,
      totalRefunds: 2500,
    },
    monthlyTrends: [{ yearMonth: "2026-11", revenue: 15492, transactions: 8 }],
    planDistribution: [
      { tier: "recruiter_growth", name: "Growth", count: 5, revenue: 12495 },
      { tier: "recruiter_starter", name: "Starter", count: 3, revenue: 2997 },
    ],
    recentTransactions: [],
  },
};

const renderSubscriptionsPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/subscriptions"]}>
        <AdminSubscriptions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const renderRevenuePage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/revenue"]}>
        <AdminRevenue />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Admin Subscriptions & Revenue Management (Phase 4F)", () => {
  it("renders status breakdown KPI cards and subscriptions directory table", async () => {
    revenueAnalyticsMock.mockResolvedValue(mockAnalyticsData);
    subscriptionsMock.mockResolvedValue(mockSubscriptionData);

    renderSubscriptionsPage();

    expect(await screen.findByText("Subscriptions & Revenue Management")).toBeInTheDocument();
    expect(await screen.findByText("Total Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Active Paid")).toBeInTheDocument();
    expect(screen.getByText("Free Tier")).toBeInTheDocument();
    expect(screen.getAllByText("Past Due")[0]).toBeInTheDocument();

    // Table rows
    expect(await screen.findByText("CloudTech Labs")).toBeInTheDocument();
    expect(screen.getByText("Legacy Dynamics")).toBeInTheDocument();
    expect(screen.getByText("2 renewal failures")).toBeInTheDocument();
  });

  it("opens subscription inspection modal and displays entitlements and payment history", async () => {
    const user = userEvent.setup();
    revenueAnalyticsMock.mockResolvedValue(mockAnalyticsData);
    subscriptionsMock.mockResolvedValue(mockSubscriptionData);
    subscriptionDetailsMock.mockResolvedValue({
      data: {
        subscription: {
          id: "sub-101",
          subscriberType: "organization",
          subscriberId: "org-101",
          planTier: "recruiter_growth",
          planName: "Growth",
          status: "active",
          billingCycle: "monthly",
          priceInr: 2499,
          currentPeriodStart: "2026-11-01T00:00:00.000Z",
          currentPeriodEnd: "2026-12-01T00:00:00.000Z",
          providerSubscriptionId: "sub_rzp_12345",
          providerStatus: "active",
          limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
          usage: { activeJobsCount: 4, teamMembersCount: 2, aiAnalysesUsedThisMonth: 45 },
        },
        subscriber: {
          id: "org-101",
          name: "CloudTech Labs",
          email: "billing@cloudtech.test",
          type: "organization",
        },
        paymentHistory: [
          {
            id: "tx-1",
            transactionNumber: "TXN-001",
            invoiceNumber: "INV-001",
            amount: 2499,
            currency: "INR",
            status: "captured",
            gateway: "razorpay",
            mode: "test",
            createdAt: "2026-11-01T10:00:00.000Z",
          },
        ],
        auditHistory: [],
      },
    });

    renderSubscriptionsPage();

    const inspectButtons = await screen.findAllByRole("button", { name: /inspect/i });
    await user.click(inspectButtons[0]);

    expect(await screen.findByText("Subscription Details & Governance")).toBeInTheDocument();
    expect(screen.getByText("sub_rzp_12345")).toBeInTheDocument();
    expect(screen.getByText("TXN-001")).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
    expect(screen.getByText("Administrative Cancellation")).toBeInTheDocument();
  });

  it("submits administrative cancellation with reason and immediate flag", async () => {
    const user = userEvent.setup();
    revenueAnalyticsMock.mockResolvedValue(mockAnalyticsData);
    subscriptionsMock.mockResolvedValue(mockSubscriptionData);
    subscriptionDetailsMock.mockResolvedValue({
      data: {
        subscription: {
          id: "sub-101",
          subscriberType: "organization",
          subscriberId: "org-101",
          planTier: "recruiter_growth",
          status: "active",
          priceInr: 2499,
          currentPeriodStart: "2026-11-01T00:00:00.000Z",
          currentPeriodEnd: "2026-12-01T00:00:00.000Z",
        },
        subscriber: { id: "org-101", name: "CloudTech Labs" },
        paymentHistory: [],
        auditHistory: [],
      },
    });
    cancelSubscriptionMock.mockResolvedValue({
      data: { id: "sub-101", status: "canceled" },
      message: "Subscription canceled immediately",
    });

    renderSubscriptionsPage();

    const inspectButtons = await screen.findAllByRole("button", { name: /inspect/i });
    await user.click(inspectButtons[0]);

    const cancelOpenBtn = await screen.findByRole("button", { name: "Cancel Subscription" });
    await user.click(cancelOpenBtn);

    const textarea = screen.getByPlaceholderText(/Enter explicit governance reason/i);
    await user.type(textarea, "Client non-payment after grace period");

    const immediateCheckbox = screen.getByLabelText(/Immediate Termination/i);
    await user.click(immediateCheckbox);

    const confirmBtn = screen.getByRole("button", { name: "Confirm Cancellation" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(cancelSubscriptionMock).toHaveBeenCalledWith("sub-101", {
        reason: "Client non-payment after grace period",
        immediate: true,
      });
    });
  });

  it("supports CSV export and payment inspection modal in Admin Revenue", async () => {
    const user = userEvent.setup();
    const revenueSummary = {
      total: { grossCaptured: 5000, refunds: 0, netRevenue: 5000, successfulPayments: 2, refundedPayments: 0 },
      test: { grossCaptured: 5000, refunds: 0, netRevenue: 5000, successfulPayments: 2, refundedPayments: 0 },
      live: { grossCaptured: 0, refunds: 0, netRevenue: 0, successfulPayments: 0, refundedPayments: 0 },
      failedPayments: 0,
      pendingAttempts: 0,
      rule: "Test rule",
    };
    revenueMock.mockResolvedValue({
      data: {
        summary: revenueSummary,
        transactions: [
          {
            id: "tx-201",
            transactionNumber: "TXN-REV-001",
            subscriberType: "organization",
            organizationName: "Test Company",
            planTier: "recruiter_growth",
            amount: 2500,
            currency: "INR",
            status: "captured",
            mode: "test",
            refundStatus: "none",
            verification: "verified",
            gatewayPaymentId: "pay_rzp_99",
            subscriptionId: "sub_rzp_99",
            createdAt: "2026-11-05T12:00:00.000Z",
          },
        ],
      },
      meta: { page: 1, pages: 1, total: 1 },
    });
    revenueExportCsvMock.mockResolvedValue(new Blob(["Transaction Number,Amount\nTXN-REV-001,2500"], { type: "text/csv" }));
    transactionDetailsMock.mockResolvedValue({
      data: {
        id: "tx-201",
        transactionNumber: "TXN-REV-001",
        invoiceNumber: "INV-REV-001",
        subscriber: { name: "Test Company", email: "info@testco.test", type: "organization" },
        planTier: "recruiter_growth",
        planName: "Growth",
        amount: 2500,
        currency: "INR",
        status: "captured",
        mode: "test",
        gatewayOrderId: "order_rzp_99",
        gatewayPaymentId: "pay_rzp_99",
        createdAt: "2026-11-05T12:00:00.000Z",
      },
    });

    renderRevenuePage();

    // Verify Export CSV button is present and clickable
    const exportBtn = await screen.findByRole("button", { name: /export csv/i });
    expect(exportBtn).toBeInTheDocument();
    await user.click(exportBtn);

    await waitFor(() => {
      expect(revenueExportCsvMock).toHaveBeenCalled();
    });

    // Inspect payment transaction details
    const inspectBtn = await screen.findByRole("button", { name: /inspect/i });
    await user.click(inspectBtn);

    expect(await screen.findByText("Payment Transaction Details")).toBeInTheDocument();
    expect(screen.getByText("order_rzp_99")).toBeInTheDocument();
    expect(screen.getByText(/INV-REV-001/)).toBeInTheDocument();
    expect(screen.getByText(/Test Mode Record:/i)).toBeInTheDocument();
  });
});
