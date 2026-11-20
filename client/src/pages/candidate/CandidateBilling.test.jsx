import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("../../components/ui/useToast", () => ({ useToast: () => mockToast }));

const mockAuth = { user: { role: "candidate", name: "Candidate" }, role: "candidate", isAuthenticated: true };
vi.mock("../../context/useAuth", () => ({ useAuth: () => mockAuth }));

const api = vi.hoisted(() => ({
  current: vi.fn(),
  plans: vi.fn(),
  invoices: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
  verifyPayment: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  subscriptionApi: {
    current: (...args) => api.current(...args),
    plans: (...args) => api.plans(...args),
    invoices: (...args) => api.invoices(...args),
    cancel: (...args) => api.cancel(...args),
    checkout: (...args) => api.checkout(...args),
    verifyPayment: (...args) => api.verifyPayment(...args),
  },
}));

import { CandidateBilling } from "./CandidateBilling";

const CANDIDATE_PLANS = {
  candidate: [
    {
      tier: "candidate_free",
      name: "Free",
      priceInr: 0,
      features: ["5 job applications/month", "1 AI resume scan", "Standard matching"],
      description: "Everything you need to discover and apply to opportunities.",
    },
    {
      tier: "candidate_plus",
      name: "Career Plus",
      priceInr: 499,
      yearlyPriceInr: 4990,
      features: ["Unlimited applications", "50 AI resume scans/month", "AI interview prep", "Priority matching"],
      description: "Supercharge your career search with AI copilot and priority recommendations.",
    },
  ],
};

const FREE_SUBSCRIPTION_DATA = {
  subscription: {
    tier: "candidate_free",
    status: "active",
    billingCycle: "monthly",
    priceInr: 0,
    usage: {
      aiAnalysesUsedThisMonth: 2,
    },
  },
  entitlement: {
    tier: "candidate_free",
    planName: "Free",
    status: "active",
    paid: false,
    limits: {
      aiAnalysesPerMonth: 5,
    },
  },
  billingState: {
    status: "active",
  },
};

const PAID_SUBSCRIPTION_DATA = {
  subscription: {
    tier: "candidate_plus",
    status: "active",
    billingCycle: "monthly",
    priceInr: 499,
    currentPeriodEnd: "2026-12-31T23:59:59Z",
    providerSubscriptionId: "sub_rzp_123",
    cancelAtPeriodEnd: false,
    usage: {
      applications: 14,
      resumeScans: 12,
    },
  },
  entitlement: {
    tier: "candidate_plus",
    planName: "Career Plus",
    status: "active",
    paid: true,
    periodEnd: "2026-12-31T23:59:59Z",
    limits: {
      applications: 100,
      resumeScans: 50,
    },
  },
  billingState: {
    status: "active",
  },
};

const INVOICES_DATA = {
  data: [
    {
      _id: "txn_1",
      invoiceNumber: "INV-2026-001",
      amountInr: 499,
      status: "captured",
      tier: "candidate_plus",
      mode: "test",
      createdAt: "2026-11-01T12:00:00Z",
    },
  ],
  meta: { total: 1 },
};

const renderCandidateBilling = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/candidate/plans"]}>
        <CandidateBilling />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  api.plans.mockResolvedValue({ data: CANDIDATE_PLANS });
  api.invoices.mockResolvedValue(INVOICES_DATA);
});

afterEach(() => {
  cleanup();
});

describe("CandidateBilling component", () => {
  it("renders Free Plan summary and quota limits for unpaid users", async () => {
    api.current.mockResolvedValue({ data: FREE_SUBSCRIPTION_DATA });
    renderCandidateBilling();

    expect(await screen.findByRole("heading", { name: "Candidate Membership & Plans" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free plan" })).toBeInTheDocument();
    expect(screen.getByText(/View plans/i)).toBeInTheDocument();

    // Check quota meter
    expect(await screen.findByTestId("quota-aiAnalysesPerMonth")).toHaveTextContent("2 of 5");
  });

  it("renders active paid plan details with price and renewal info", async () => {
    api.current.mockResolvedValue({ data: PAID_SUBSCRIPTION_DATA });
    renderCandidateBilling();

    expect(await screen.findByRole("heading", { name: "Career Plus plan" })).toBeInTheDocument();
    expect(screen.getByText(/₹499 \/ month/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel renewal/i })).toBeInTheDocument();
  });

  it("opens confirmation modal and stops renewal when confirmed", async () => {
    api.current.mockResolvedValue({ data: PAID_SUBSCRIPTION_DATA });
    api.cancel.mockResolvedValue({ message: "Renewal stopped successfully." });
    const user = userEvent.setup();
    renderCandidateBilling();

    const cancelBtn = await screen.findByRole("button", { name: /Cancel renewal/i });
    await user.click(cancelBtn);

    // Modal appears
    expect(screen.getByRole("heading", { name: "Stop renewal?" })).toBeInTheDocument();

    // Confirm cancel
    const confirmBtn = screen.getByRole("button", { name: "Stop renewal" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.cancel).toHaveBeenCalled();
    });
    expect(mockToast.success).toHaveBeenCalledWith("Renewal stopped successfully.");
  });

  it("toggles billing cycle between monthly and yearly in plan comparison", async () => {
    api.current.mockResolvedValue({ data: FREE_SUBSCRIPTION_DATA });
    const user = userEvent.setup();
    renderCandidateBilling();

    expect(await screen.findByRole("heading", { name: "Membership plans" })).toBeInTheDocument();

    const yearlyBtn = screen.getByRole("button", { name: /yearly/i });
    await user.click(yearlyBtn);
    expect(yearlyBtn).toHaveAttribute("aria-pressed", "true");

    const monthlyBtn = screen.getByRole("button", { name: /monthly/i });
    await user.click(monthlyBtn);
    expect(monthlyBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders payment history with invoice rows and mode badges", async () => {
    api.current.mockResolvedValue({ data: PAID_SUBSCRIPTION_DATA });
    renderCandidateBilling();

    expect(await screen.findByRole("heading", { name: "Payment history" })).toBeInTheDocument();
    expect(await screen.findByText("INV-2026-001")).toBeInTheDocument();
    expect(screen.getByText("₹499")).toBeInTheDocument();
  });

  it("renders error state when current subscription query fails", async () => {
    api.current.mockRejectedValue(new Error("Failed to load subscription"));
    renderCandidateBilling();

    expect(await screen.findByText("Failed to load subscription")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
