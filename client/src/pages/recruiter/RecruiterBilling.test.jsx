// Requirement 2 and 17: the billing page reflects the server's plan state and never shows a lapsed or pending plan as active.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  current: vi.fn(),
  plans: vi.fn(),
  invoices: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ organizationId: "org1", role: "recruiter", user: { role: "recruiter" }, isAuthenticated: true }),
}));
vi.mock("../../lib/api", () => ({
  subscriptionApi: {
    current: (...a) => api.current(...a),
    plans: (...a) => api.plans(...a),
    invoices: (...a) => api.invoices(...a),
    cancel: (...a) => api.cancel(...a),
    checkout: vi.fn(),
    cancelCheckout: vi.fn(),
    verifyPayment: vi.fn(),
    verifySubscription: vi.fn(),
  },
}));

import { ToastProvider } from "../../components/ui/Toast";
import { RecruiterBilling } from "./RecruiterBilling";

const PLANS = {
  recruiter: [
    { tier: "recruiter_free", name: "Free", priceInr: 0, features: ["One job"], description: "Start" },
    { tier: "recruiter_starter", name: "Starter", priceInr: 999, features: ["Three jobs"], description: "Small" },
    { tier: "recruiter_growth", name: "Growth", priceInr: 2499, features: ["Ten jobs"], description: "Teams", highlight: true },
  ],
};

const freeEntitlement = {
  tier: "recruiter_free",
  planName: "Free",
  status: "free",
  paid: false,
  reason: "no_subscription",
  periodEnd: null,
  cancelAtPeriodEnd: false,
  limits: { activeJobs: 1, teamMembers: 1, aiAnalysesPerMonth: 10 },
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <RecruiterBilling />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.plans.mockResolvedValue({ data: PLANS });
  api.invoices.mockResolvedValue({ data: [], meta: { hasMore: false, count: 0 } });
  api.cancel.mockReset();
});
afterEach(() => cleanup());

describe("RecruiterBilling", () => {
  it("an expired Growth subscription is not shown as active; it offers renewal, and quotas use the free limits", async () => {
    api.current.mockResolvedValue({
      data: {
        subscription: {
          planTier: "recruiter_growth",
          status: "expired",
          currentPeriodEnd: "2026-10-01T00:00:00.000Z",
          usage: { activeJobsCount: 1, teamMembersCount: 1, aiAnalysesUsedThisMonth: 2 },
          limits: { activeJobs: 10 },
        },
        plan: { name: "Growth" },
        // The server's shape for a lapsed paid plan: the free limits apply and the reason is the period end.
        entitlement: { ...freeEntitlement, status: "expired", reason: "period_ended" },
        billingState: {},
      },
    });
    renderPage();

    const panel = await screen.findByRole("heading", { name: "Free plan" });
    const section = panel.closest("section");
    expect(within(section).queryByText(/^Active$/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("plan-badge")).toHaveTextContent("Free"));
    expect(screen.getByTestId("plan-badge")).not.toHaveAttribute("data-tone", "paid");
    expect(within(section).getByRole("status")).toHaveTextContent("Your paid plan expired");
    expect(screen.getByTestId("quota-activeJobs")).toHaveTextContent("1 of 1");
    expect(screen.getByRole("button", { name: "Renew Growth" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).not.toBeInTheDocument();
  });

  it("a pending checkout shows the payment as pending and disables every purchase", async () => {
    api.current.mockResolvedValue({
      data: {
        subscription: { planTier: "recruiter_free", usage: {} },
        entitlement: freeEntitlement,
        billingState: { pendingCheckout: true },
      },
    });
    renderPage();
    await screen.findByText(/awaiting confirmation/);
    await waitFor(() => expect(screen.getByTestId("plan-badge")).toHaveTextContent("Payment pending"));
    for (const button of screen.getAllByRole("button", { name: /Upgrade to|Payment pending/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("a failed last payment states that the plan has not changed", async () => {
    api.current.mockResolvedValue({
      data: { subscription: { planTier: "recruiter_free", usage: {} }, entitlement: freeEntitlement, billingState: { lastPaymentFailed: true } },
    });
    renderPage();
    expect(await screen.findByText(/did not go through. Your plan has not changed/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("plan-badge")).toHaveTextContent("Last payment failed"));
  });

  it("stopping renewal asks first, then cancels through the server", async () => {
    const user = userEvent.setup();
    api.current.mockResolvedValue({
      data: {
        subscription: { planTier: "recruiter_growth", providerSubscriptionId: "sub_1", currentPeriodEnd: "2026-12-20T00:00:00.000Z", usage: {} },
        entitlement: {
          ...freeEntitlement,
          tier: "recruiter_growth",
          planName: "Growth",
          status: "active",
          paid: true,
          reason: "active",
          periodEnd: "2026-12-20T00:00:00.000Z",
          limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
        },
        billingState: {},
      },
    });
    api.cancel.mockResolvedValue({ message: "Renewal stopped." });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Cancel renewal" }));
    expect(api.cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop renewal" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith("org1"));
  });
});
