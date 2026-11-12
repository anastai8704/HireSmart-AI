// Requirement 17: plan badges follow the server entitlement. Pending, failed and expired never show as paid.
import { describe, expect, it } from "vitest";
import { planBadgeFor } from "./planStatus";

const paid = (overrides = {}) => ({
  tier: "recruiter_growth",
  planName: "Growth",
  status: "active",
  paid: true,
  reason: "active",
  periodEnd: "2026-12-20T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  ...overrides,
});
const free = (overrides = {}) => ({
  tier: "recruiter_free",
  planName: "Free",
  status: "free",
  paid: false,
  reason: "free_plan",
  periodEnd: null,
  cancelAtPeriodEnd: false,
  ...overrides,
});

describe("plan badge from the server entitlement", () => {
  it("shows the real catalogue name and 'Renews' for an active paid plan", () => {
    const badge = planBadgeFor(paid());
    expect(badge).toMatchObject({ label: "Growth", tone: "paid", paidInForce: true });
    expect(badge.status).toBe("Renews 20 Dec 2026");
  });

  it("keeps the paid badge after scheduled cancellation until the period ends", () => {
    const badge = planBadgeFor(paid({ cancelAtPeriodEnd: true }));
    expect(badge).toMatchObject({ label: "Growth", tone: "warning", paidInForce: true });
    expect(badge.status).toBe("Ends 20 Dec 2026");
  });

  it("does not show an active paid badge when the paid period has already ended", () => {
    const badge = planBadgeFor({ ...free(), planName: "Free", status: "expired", reason: "period_ended" });
    expect(badge).toMatchObject({ label: "Free", tone: "neutral", paidInForce: false, status: "Expired" });
  });

  it("shows failed-renewal grace as a warning, still in force, never as active", () => {
    const badge = planBadgeFor(paid({ status: "grace", graceEnd: "2026-11-23T00:00:00.000Z", reason: "payment_grace" }));
    expect(badge.tone).toBe("warning");
    expect(badge.status).toMatch(/Payment overdue/);
    expect(badge.paidInForce).toBe(true);
  });

  it("shows a pending checkout as pending, on the free plan, not as paid", () => {
    const badge = planBadgeFor(free(), { pendingCheckout: true });
    expect(badge).toMatchObject({ label: "Free", status: "Payment pending", tone: "warning", paidInForce: false });
  });

  it("shows a failed payment as failed on the free plan", () => {
    const badge = planBadgeFor(free(), { lastPaymentFailed: true });
    expect(badge).toMatchObject({ label: "Free", status: "Last payment failed", tone: "danger", paidInForce: false });
  });

  it("when a paid plan is past due and the attempt failed, the free plan is shown, not the old paid name", () => {
    const badge = planBadgeFor(paid({ status: "expired", paid: false, reason: "payment_failed", planName: "Free" }), {
      lastPaymentFailed: true,
    });
    expect(badge.label).toBe("Free");
    expect(badge.paidInForce).toBe(false);
  });

  it("shows a canceled subscription as canceled on the free plan", () => {
    const badge = planBadgeFor({ ...free(), status: "canceled", reason: "not_active" });
    expect(badge).toMatchObject({ label: "Free", status: "Canceled", paidInForce: false });
  });

  it("uses the server's free plan name for candidates", () => {
    const badge = planBadgeFor({ ...free({ tier: "candidate_free" }), planName: "Free" });
    expect(badge).toMatchObject({ label: "Free", status: "Free plan", tone: "neutral" });
  });

  it("shows a loading state rather than guessing when no entitlement is loaded", () => {
    expect(planBadgeFor(undefined)).toMatchObject({ label: "Checking plan", tone: "loading", paidInForce: false });
  });

  it("never reports a paid plan in force unless the server entitlement is paid and active", () => {
    const cases = [
      paid({ status: "expired" }),
      paid({ status: "canceled" }),
      paid({ status: "grace" }),
      paid({ status: "active", paid: false }),
    ];
    for (const entitlement of cases) {
      const badge = planBadgeFor(entitlement, { pendingCheckout: true });
      if (entitlement.status === "active") continue;
      expect(badge.tone).not.toBe("paid");
    }
  });
});
