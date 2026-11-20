import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock("../../components/ui/useToast", () => ({ useToast: () => mockToast }));

let mockAuth = {
  user: {
    _id: "u_recruiter_owner",
    displayName: "Robin Recruiter",
    email: "robin@apex.com",
    role: "recruiter",
  },
  role: "recruiter",
  organizationId: "org_apex_123",
  workspaceRole: "owner",
  refresh: vi.fn().mockResolvedValue({}),
  logout: vi.fn(),
};

vi.mock("../../context/useAuth", () => ({
  useAuth: () => mockAuth,
}));

const mockPlans = {
  data: {
    recruiter: [
      {
        id: "recruiter_free",
        name: "Free",
        tier: "recruiter_free",
        role: "recruiter",
        priceInr: 0,
        billingCycle: "monthly",
        yearlyPriceInr: null,
        description: "Essential company profile and limited job postings.",
        limits: { activeJobs: 1, teamMembers: 1, aiAnalysesPerMonth: 10 },
        features: ["One active job posting", "Single recruiter seat", "Core applicant management"],
        highlight: false,
      },
      {
        id: "recruiter_growth",
        name: "Growth",
        tier: "recruiter_growth",
        role: "recruiter",
        priceInr: 2499,
        billingCycle: "monthly",
        yearlyPriceInr: null,
        description: "Designed for scaling businesses with active hiring pipelines.",
        limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
        features: ["Up to 10 active job postings", "Up to 5 hiring team members", "AI semantic match"],
        highlight: true,
      },
      {
        id: "recruiter_enterprise",
        name: "Enterprise",
        tier: "recruiter_enterprise",
        role: "recruiter",
        priceInr: 7999,
        billingCycle: "monthly",
        yearlyPriceInr: null,
        description: "Uncapped hiring capacity with comprehensive governance.",
        limits: { activeJobs: 100, teamMembers: 50, aiAnalysesPerMonth: 2000 },
        features: ["Unlimited active jobs", "Unlimited seats", "ATS webhooks"],
        highlight: false,
      },
    ],
  },
};

const mockSubscription = {
  data: {
    subscription: {
      _id: "sub_apex_1",
      planName: "Growth",
      planTier: "recruiter_growth",
      status: "active",
      priceInr: 2499,
      billingCycle: "monthly",
      currentPeriodEnd: "2026-12-31T23:59:59.000Z",
      cancelAtPeriodEnd: false,
      usage: {
        activeJobsCount: 8,
        teamMembersCount: 2,
        aiAnalysesUsedThisMonth: 250,
      },
    },
    entitlement: {
      paid: true,
      status: "active",
      planName: "Growth",
      tier: "recruiter_growth",
      periodEnd: "2026-12-31T23:59:59.000Z",
      limits: {
        activeJobs: 10,
        teamMembers: 5,
        aiAnalysesPerMonth: 250,
      },
    },
    billingState: {
      status: "active",
      paidInForce: true,
      canUpgrade: true,
      canCancelRenewal: true,
    },
  },
};

const mockInvoices = {
  data: [
    {
      _id: "inv_1",
      transactionNumber: "TXN-202611-0001",
      gatewayPaymentId: "pay_test_apex_101",
      invoiceNumber: "INV-2026-001",
      amount: 2499,
      currency: "INR",
      status: "captured",
      mode: "test",
      planTier: "recruiter_growth",
      createdAt: "2026-11-01T10:30:00.000Z",
    },
  ],
  meta: { total: 1, hasMore: false, nextCursor: null },
};

const mockOrgData = {
  data: {
    _id: "org_apex_123",
    name: "Apex Innovations",
    slug: "apex-innovations",
    website: "https://apex.example.com",
    about: "Pioneering technical recruiting tools.",
    timezone: "Asia/Kolkata",
    verificationStatus: "verified",
    settings: {
      requireJobApproval: false,
      aiEnabled: true,
      retentionDays: 730,
    },
  },
};

const apiMocks = vi.hoisted(() => ({
  subscriptionCurrent: vi.fn(),
  subscriptionPlans: vi.fn(),
  subscriptionInvoices: vi.fn(),
  subscriptionCheckout: vi.fn(),
  subscriptionCancel: vi.fn(),
  organizationGet: vi.fn(),
  organizationUpdate: vi.fn(),
  organizationSettings: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  subscriptionApi: {
    current: (...args) => apiMocks.subscriptionCurrent(...args),
    plans: (...args) => apiMocks.subscriptionPlans(...args),
    invoices: (...args) => apiMocks.subscriptionInvoices(...args),
    checkout: (...args) => apiMocks.subscriptionCheckout(...args),
    cancel: (...args) => apiMocks.subscriptionCancel(...args),
  },
  organizationApi: {
    get: (...args) => apiMocks.organizationGet(...args),
    update: (...args) => apiMocks.organizationUpdate(...args),
    settings: (...args) => apiMocks.organizationSettings(...args),
  },
  userApi: {
    me: vi.fn().mockResolvedValue({ data: {} }),
    updateProfile: vi.fn().mockResolvedValue({ data: {} }),
    updateNotificationPrefs: vi.fn().mockResolvedValue({ data: {} }),
    remove: vi.fn().mockResolvedValue({ data: {} }),
    exportData: vi.fn(),
  },
  authApi: {
    changeEmail: vi.fn().mockResolvedValue({ data: {} }),
    changePassword: vi.fn().mockResolvedValue({ data: {} }),
    sessions: vi.fn().mockResolvedValue({ data: [] }),
    security: vi.fn().mockResolvedValue({ data: [] }),
  },
  notificationApi: {
    preferences: vi.fn().mockResolvedValue({ data: { groups: [] } }),
  },
  downloadBlob: vi.fn(),
}));

import { RecruiterBilling } from "./RecruiterBilling";
import { WorkspaceSettingsSection } from "./WorkspaceSettingsSection";

const renderWithProviders = (ui, { route = "/app/o/org_apex_123/billing" } = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/app/o/:organizationId/billing" element={ui} />
          <Route path="/app/settings" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = {
    user: {
      _id: "u_recruiter_owner",
      displayName: "Robin Recruiter",
      email: "robin@apex.com",
      role: "recruiter",
    },
    role: "recruiter",
    organizationId: "org_apex_123",
    workspaceRole: "owner",
    refresh: vi.fn().mockResolvedValue({}),
    logout: vi.fn(),
  };

  apiMocks.subscriptionCurrent.mockResolvedValue(mockSubscription);
  apiMocks.subscriptionPlans.mockResolvedValue(mockPlans);
  apiMocks.subscriptionInvoices.mockResolvedValue(mockInvoices);
  apiMocks.subscriptionCheckout.mockResolvedValue({ data: { orderId: "order_test_123" } });
  apiMocks.subscriptionCancel.mockResolvedValue({ message: "Renewal stopped successfully." });
  apiMocks.organizationGet.mockResolvedValue(mockOrgData);
  apiMocks.organizationUpdate.mockResolvedValue({ data: mockOrgData.data });
  apiMocks.organizationSettings.mockResolvedValue({ data: mockOrgData.data });
});

afterEach(() => {
  cleanup();
});

describe("RecruiterBilling component", () => {
  it("renders current plan status, pricing, and quota meters with warnings", async () => {
    renderWithProviders(<RecruiterBilling />);

    expect(await screen.findByRole("heading", { name: "Subscription & Billing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growth plan" })).toBeInTheDocument();
    expect(screen.getAllByText(/2,499/).length).toBeGreaterThan(0);

    // Check Quota Meters
    // 8 of 10 active jobs is 80% (approaching limit)
    expect(screen.getByTestId("quota-activeJobs")).toHaveTextContent("8 of 10");
    expect(screen.getByText(/Approaching limit \(80% used\)\./)).toBeInTheDocument();

    // 250 of 250 aiAnalyses is 100% (limit reached)
    expect(screen.getByTestId("quota-aiAnalysesPerMonth")).toHaveTextContent("250 of 250");
    expect(screen.getByText("Limit reached for this plan.")).toBeInTheDocument();
  });

  it("renders plan options comparison and allows upgrading", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecruiterBilling />);

    expect(await screen.findByRole("heading", { name: "Hiring plans" })).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();

    // The enterprise upgrade button
    const upgradeEnterprise = screen.getByRole("button", { name: /Upgrade to Enterprise/i });
    expect(upgradeEnterprise).toBeInTheDocument();

    await user.click(upgradeEnterprise);

    await waitFor(() => {
      expect(apiMocks.subscriptionCheckout).toHaveBeenCalledWith(
        { planTier: "recruiter_enterprise", billingCycle: "monthly" },
        "org_apex_123",
      );
    });
  });

  it("displays payment history with IST date, payment ID and status badge", async () => {
    renderWithProviders(<RecruiterBilling />);

    expect(await screen.findByRole("heading", { name: "Payment history" })).toBeInTheDocument();
    expect(await screen.findByTestId("payment-id")).toHaveTextContent("pay_test_apex_101");
    expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
    expect(screen.getAllByText(/2,499/).length).toBeGreaterThan(0);
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Test Mode")).toBeInTheDocument();
  });

  it("restricts plan upgrades and cancellations for viewer role", async () => {
    mockAuth.workspaceRole = "viewer";
    renderWithProviders(<RecruiterBilling />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/View-only billing access:/)).toBeInTheDocument();
  });
});

describe("WorkspaceSettingsSection component", () => {
  it("renders company profile, timezone, workflow toggles and saves changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkspaceSettingsSection auth={mockAuth} />, { route: "/app/settings" });

    expect(await screen.findByRole("heading", { name: /Workspace Profile & Regional Preferences/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Apex Innovations")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://apex.example.com")).toBeInTheDocument();

    // Edit company name
    const nameInput = screen.getByLabelText(/Company Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Apex Innovations Global");

    // Toggle Require Job Approval
    const approvalSwitch = screen.getByRole("switch", { name: /Require Job Approval before publishing/i });
    expect(approvalSwitch).toHaveAttribute("aria-checked", "false");
    await user.click(approvalSwitch);
    expect(approvalSwitch).toHaveAttribute("aria-checked", "true");

    // Save settings
    const saveBtn = screen.getByRole("button", { name: /Save Workspace Settings/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(apiMocks.organizationUpdate).toHaveBeenCalledWith("org_apex_123", {
        name: "Apex Innovations Global",
        website: "https://apex.example.com",
        about: "Pioneering technical recruiting tools.",
        timezone: "Asia/Kolkata",
      });
      expect(apiMocks.organizationSettings).toHaveBeenCalledWith("org_apex_123", {
        requireJobApproval: true,
        aiEnabled: true,
        retentionDays: 730,
      });
      expect(mockToast.success).toHaveBeenCalledWith("Workspace settings updated successfully");
    });
  });

  it("shows view-only alert and disables inputs for non-admin/viewer members", async () => {
    mockAuth.workspaceRole = "viewer";
    renderWithProviders(<WorkspaceSettingsSection auth={mockAuth} />, { route: "/app/settings" });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/View-only workspace access:/)).toBeInTheDocument();

    const nameInput = await screen.findByLabelText(/Company Name/i);
    expect(nameInput).toBeDisabled();

    expect(screen.queryByRole("button", { name: /Save Workspace Settings/i })).not.toBeInTheDocument();
  });

  it("provides direct navigation hub cards to Billing, Team Members and Verification", async () => {
    renderWithProviders(<WorkspaceSettingsSection auth={mockAuth} />, { route: "/app/settings" });

    expect(await screen.findByText("Plan & Limits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Billing & Subscription →/i })).toHaveAttribute(
      "href",
      "/app/o/org_apex_123/billing",
    );
    expect(screen.getByRole("link", { name: /Team Management →/i })).toHaveAttribute(
      "href",
      "/app/o/org_apex_123/team",
    );
    expect(screen.getByRole("link", { name: /Verification Details →/i })).toHaveAttribute(
      "href",
      "/app/o/org_apex_123/verification",
    );
  });
});
