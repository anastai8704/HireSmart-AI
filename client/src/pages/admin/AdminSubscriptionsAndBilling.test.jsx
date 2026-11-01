import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
    logout: () => {},
    setOrganizationId: () => {},
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

vi.mock("../../lib/api", () => ({
  adminApi: {
    revenueAnalytics: () =>
      Promise.resolve({
        data: {
          metrics: {
            mrrInr: 34990,
            arrInr: 419880,
            activeSubscriptions: 12,
            lifetimeRevenueInr: 104500,
            totalTransactionsCount: 24,
          },
          monthlyRevenueTrend: [
            { yearMonth: "2026-08", revenue: 25000, transactions: 8 },
            { yearMonth: "2026-09", revenue: 34990, transactions: 12 },
          ],
          planBreakdown: [
            { tier: "starter", name: "Starter", count: 8, revenue: 7992 },
            { tier: "growth", name: "Growth", count: 4, revenue: 9996 },
          ],
          recentTransactions: [
            {
              _id: "tx-1",
              invoiceNumber: "INV-2026-0001",
              customerName: "Apex Recruiter",
              customerEmail: "recruiter@apex.com",
              planTier: "recruiter_growth",
              amount: 2499,
              status: "captured",
              paymentMethod: "card",
              createdAt: "2026-09-01T10:00:00Z",
            },
          ],
        },
      }),
  },
  subscriptionApi: {
    adminAnalytics: () =>
      Promise.resolve({
        data: {
          metrics: {
            mrrInr: 34990,
            arrInr: 419880,
            activeSubscriptions: 12,
            lifetimeRevenueInr: 104500,
            totalTransactionsCount: 24,
          },
          monthlyRevenueTrend: [
            { yearMonth: "2026-08", revenue: 25000, transactions: 8 },
            { yearMonth: "2026-09", revenue: 34990, transactions: 12 },
          ],
          planBreakdown: [
            { tier: "starter", name: "Starter", count: 8, revenue: 7992 },
            { tier: "growth", name: "Growth", count: 4, revenue: 9996 },
          ],
          recentTransactions: [
            {
              _id: "tx-1",
              invoiceNumber: "INV-2026-0001",
              customerName: "Apex Recruiter",
              customerEmail: "recruiter@apex.com",
              planTier: "recruiter_growth",
              amount: 2499,
              status: "captured",
              paymentMethod: "card",
              createdAt: "2026-09-01T10:00:00Z",
            },
          ],
        },
      }),
    current: () =>
      Promise.resolve({
        data: {
          subscription: {
            planTier: "recruiter_starter",
            status: "active",
            currentPeriodEnd: "2026-10-01T00:00:00Z",
            limits: {
              activeJobs: 3,
              teamMembers: 2,
              aiAnalysesPerMonth: 50,
            },
            usage: {
              activeJobsCount: 2,
              teamMembersCount: 1,
              aiAnalysesUsedThisMonth: 14,
            },
          },
          plan: {
            tier: "recruiter_starter",
            name: "Starter",
            priceInr: 999,
            billingPeriod: "monthly",
          },
        },
      }),
    plans: () =>
      Promise.resolve({
        data: {
          candidate: [
            {
              tier: "candidate_free",
              name: "Free Standard",
              priceInr: 0,
              description: "Basic candidate tools",
              features: ["3 Applications per day", "Standard Search"],
            },
            {
              tier: "candidate_plus",
              name: "Career Plus",
              priceInr: 149,
              description: "Full AI Copilot & Priority Matching",
              features: ["Unlimited Applications", "AI Interview Prep"],
            },
          ],
          recruiter: [
            {
              tier: "recruiter_starter",
              name: "Starter",
              priceInr: 999,
              description: "For small teams",
              features: ["3 Active Jobs", "2 Team Seats"],
            },
            {
              tier: "recruiter_growth",
              name: "Growth",
              priceInr: 2499,
              description: "For growing scaleups",
              features: ["10 Active Jobs", "5 Team Seats"],
              highlight: true,
            },
          ],
        },
      }),
    invoices: () =>
      Promise.resolve({
        data: [
          {
            _id: "inv-1",
            invoiceNumber: "INV-2026-0001",
            planTier: "recruiter_starter",
            amount: 999,
            status: "captured",
            createdAt: "2026-09-01T10:00:00Z",
          },
        ],
      }),
    checkout: () =>
      Promise.resolve({
        data: {
          order: { orderId: "order_mock_123", mode: "simulation" },
          simulationHelper: {
            orderId: "order_mock_123",
            paymentId: "pay_mock_123",
            signature: "sim_sig_123",
          },
        },
      }),
    verifyPayment: () =>
      Promise.resolve({
        data: { success: true, message: "Subscription upgraded successfully" },
      }),
  },
}));

import { AdminSubscriptions } from "./AdminSubscriptions";
import { RecruiterBilling } from "../recruiter/RecruiterBilling";
import { CandidateBilling } from "../candidate/CandidateBilling";

const renderPage = (ui, path = "/") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Subscriptions, Monetization & Billing UI", () => {
  it("renders admin financial dashboard with MRR and transactions", async () => {
    renderPage(<AdminSubscriptions />, "/app/admin/subscriptions");
    expect(await screen.findByText("Monthly Recurring (MRR)")).toBeInTheDocument();
    expect(await screen.findByText("₹34,990")).toBeInTheDocument();
    expect(await screen.findByText("Annual Run Rate (ARR)")).toBeInTheDocument();
    expect(await screen.findByText("Apex Recruiter")).toBeInTheDocument();
    expect(await screen.findByText("INV-2026-0001")).toBeInTheDocument();
  });

  it("renders recruiter billing page with plan limits and quota bars", async () => {
    renderPage(<RecruiterBilling />, "/app/o/org-1/billing");
    expect(await screen.findByText("Starter Plan")).toBeInTheDocument();
    expect(await screen.findByText("Active Jobs")).toBeInTheDocument();
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
    expect(await screen.findByText("Growth")).toBeInTheDocument();
  });

  it("renders candidate career plus membership comparison and upgrade", async () => {
    renderPage(<CandidateBilling />, "/app/candidate/plans");
    expect(await screen.findByText("Standard Free Plan")).toBeInTheDocument();
    expect(await screen.findByText("Career Plus")).toBeInTheDocument();
    expect(await screen.findByText("₹149")).toBeInTheDocument();
    expect(await screen.findByText("Unlimited Applications")).toBeInTheDocument();
  });
});
