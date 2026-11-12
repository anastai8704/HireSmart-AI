// Requirement 17: the badge shows what the server says, and never a paid plan that is not in force.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { current: {} };
vi.mock("../../hooks/usePlanEntitlement", () => ({ usePlanEntitlement: () => state.current }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ role: "admin", organizationId: null }) }));

import { PlanBadge } from "./PlanBadge";
import { PlanSummaryCard } from "./PlanSummaryCard";
import { planBadgeFor } from "../../lib/planStatus";

const showWith = (entitlement, billingState = {}) => {
  state.current = {
    isAdmin: false,
    enabled: true,
    badge: planBadgeFor(entitlement, billingState),
    isLoading: false,
  };
};

afterEach(() => cleanup());

describe("PlanBadge", () => {
  it("shows the real plan name and renewal date for an active paid plan", () => {
    showWith({ planName: "Growth", status: "active", paid: true, periodEnd: "2026-12-20T00:00:00.000Z", cancelAtPeriodEnd: false });
    render(<PlanBadge />, { wrapper: MemoryRouter });
    const badge = screen.getByTestId("plan-badge");
    expect(badge).toHaveTextContent("Growth");
    expect(badge).toHaveTextContent("Renews 20 Dec 2026");
    expect(badge).toHaveAttribute("data-tone", "paid");
  });

  it("keeps the paid badge with an 'Ends' date after scheduled cancellation", () => {
    showWith({ planName: "Career Plus", status: "active", paid: true, periodEnd: "2026-12-01T00:00:00.000Z", cancelAtPeriodEnd: true });
    render(<PlanBadge />, { wrapper: MemoryRouter });
    expect(screen.getByTestId("plan-badge")).toHaveTextContent("Career Plus");
    expect(screen.getByTestId("plan-badge")).toHaveTextContent("Ends 01 Dec 2026");
    expect(screen.getByTestId("plan-badge")).toHaveAttribute("data-tone", "warning");
  });

  it("shows an expired plan as the free plan, never as active", () => {
    showWith({ planName: "Free", status: "expired", paid: false, reason: "period_ended" });
    render(<PlanBadge />, { wrapper: MemoryRouter });
    const badge = screen.getByTestId("plan-badge");
    expect(badge).toHaveTextContent("Free");
    expect(badge).toHaveTextContent("Expired");
    expect(badge).not.toHaveAttribute("data-tone", "paid");
  });

  it("shows a pending checkout as pending on the free plan", () => {
    showWith({ planName: "Free", status: "free", paid: false, reason: "free_plan" }, { pendingCheckout: true });
    render(<PlanBadge />, { wrapper: MemoryRouter });
    expect(screen.getByTestId("plan-badge")).toHaveTextContent("Payment pending");
    expect(screen.getByTestId("plan-badge")).not.toHaveAttribute("data-tone", "paid");
  });

  it("shows a failed payment on the free plan", () => {
    showWith({ planName: "Free", status: "free", paid: false, reason: "free_plan" }, { lastPaymentFailed: true });
    render(<PlanBadge />, { wrapper: MemoryRouter });
    expect(screen.getByTestId("plan-badge")).toHaveTextContent("Last payment failed");
    expect(screen.getByTestId("plan-badge")).toHaveAttribute("data-tone", "danger");
  });

  it("is a link to billing when given a destination", () => {
    showWith({ planName: "Free", status: "free", paid: false, reason: "free_plan" });
    render(<PlanBadge billingHref="/app/candidate/plans" />, { wrapper: MemoryRouter });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/candidate/plans");
  });

  it("renders nothing for platform admins", () => {
    state.current = { isAdmin: true, enabled: false, badge: null, isLoading: false };
    const { container } = render(<PlanBadge />, { wrapper: MemoryRouter });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a neutral checking state while the plan loads", () => {
    state.current = { isAdmin: false, enabled: true, badge: null, isLoading: true };
    render(<PlanBadge />, { wrapper: MemoryRouter });
    expect(screen.getByTestId("plan-badge")).toHaveTextContent("Checking plan");
  });
});

describe("PlanSummaryCard", () => {
  it("explains a platform admin has no subscription plan", () => {
    state.current = { isAdmin: true, enabled: false, badge: null, isLoading: false };
    render(<PlanSummaryCard />, { wrapper: MemoryRouter });
    expect(screen.getByText(/Platform administrator/)).toBeInTheDocument();
    expect(screen.queryByTestId("plan-badge")).not.toBeInTheDocument();
  });
});
