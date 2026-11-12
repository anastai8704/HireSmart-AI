// Requirement 2: billing wording, quotas and actions follow the server's entitlement and billing state.
import { describe, expect, it } from "vitest";
import {
  describeBillingState,
  historyModeLabel,
  historyParams,
  historyStatusLabel,
  planCardActionFor,
  quotaRowsFor,
} from "./billingModel";

const paidActive = {
  tier: "recruiter_growth",
  planName: "Growth",
  status: "active",
  paid: true,
  reason: "active",
  periodEnd: "2026-12-20T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  limits: { activeJobs: 10, teamMembers: 5, aiAnalysesPerMonth: 250 },
};
const free = {
  tier: "recruiter_free",
  planName: "Free",
  status: "free",
  paid: false,
  reason: "no_subscription",
  periodEnd: null,
  cancelAtPeriodEnd: false,
  limits: { activeJobs: 1, teamMembers: 1, aiAnalysesPerMonth: 10 },
};
const subGrowth = { planTier: "recruiter_growth", currentPeriodEnd: "2026-12-20T00:00:00.000Z", providerSubscriptionId: "sub_1" };

describe("describeBillingState", () => {
  it("active paid plan: renews on the server period end and can stop renewal", () => {
    const m = describeBillingState({ entitlement: paidActive, subscription: subGrowth, billingState: {} });
    expect(m.headline).toBe("Growth plan");
    expect(m.paidInForce).toBe(true);
    expect(m.status.tone).toBe("success");
    expect(m.status.text).toContain("Renews on 20 Dec 2026");
    expect(m.canCancelRenewal).toBe(true);
  });

  it("scheduled cancellation: still paid until the end date, with no cancel action", () => {
    const m = describeBillingState({
      entitlement: { ...paidActive, cancelAtPeriodEnd: true },
      subscription: subGrowth,
      billingState: {},
    });
    expect(m.paidInForce).toBe(true);
    expect(m.status.tone).toBe("warning");
    expect(m.status.text).toContain("will not renew");
    expect(m.canCancelRenewal).toBe(false);
  });

  it("grace period: paid and in force, with a payment warning", () => {
    const m = describeBillingState({
      entitlement: { ...paidActive, status: "grace", graceEnd: "2026-11-06T00:00:00.000Z" },
      subscription: subGrowth,
      billingState: {},
    });
    expect(m.paidInForce).toBe(true);
    expect(m.status.text).toContain("Access continues until 06 Nov 2026");
  });

  it("expired plan: shows the free plan and never says active", () => {
    const m = describeBillingState({
      entitlement: { ...free, status: "expired", reason: "period_ended" },
      subscription: { ...subGrowth, planTier: "recruiter_growth" },
      billingState: {},
    });
    expect(m.paidInForce).toBe(false);
    expect(m.headline).toBe("Free plan");
    expect(m.status.text).toContain("expired");
    expect(m.status.text).not.toMatch(/active/i);
    expect(m.canCancelRenewal).toBe(false);
  });

  it("pending checkout: the paid plan is not active and no second checkout can start", () => {
    const m = describeBillingState({ entitlement: free, subscription: {}, billingState: { pendingCheckout: true } });
    expect(m.paidInForce).toBe(false);
    expect(m.canUpgrade).toBe(false);
    expect(m.status.text).toContain("awaiting confirmation");
  });

  it("failed last payment: the plan is unchanged and the failure is stated", () => {
    const m = describeBillingState({ entitlement: free, subscription: {}, billingState: { lastPaymentFailed: true } });
    expect(m.status.tone).toBe("danger");
    expect(m.status.text).toContain("did not go through");
    expect(m.canUpgrade).toBe(true);
  });

  it("missing entitlement says the status is unavailable, never a guessed plan", () => {
    const m = describeBillingState({ entitlement: null, subscription: { planTier: "recruiter_starter" }, billingState: {} });
    expect(m.paidInForce).toBe(false);
    expect(m.headline).toBe("Plan status unavailable");
    expect(m.canUpgrade).toBe(false);
  });
});

describe("quotaRowsFor", () => {
  it("uses only the plan's real limits and the real usage", () => {
    const rows = quotaRowsFor({
      limits: paidActive.limits,
      usage: { activeJobsCount: 4, teamMembersCount: 5, aiAnalysesUsedThisMonth: 300 },
      isRecruiter: true,
    });
    expect(rows.map((r) => [r.key, r.used, r.limit])).toEqual([
      ["activeJobs", 4, 10],
      ["teamMembers", 5, 5],
      ["aiAnalysesPerMonth", 300, 250],
    ]);
    expect(rows[1].atLimit).toBe(true);
    expect(rows[2].percent).toBe(100);
  });

  it("never invents a limit when the server sends none", () => {
    expect(quotaRowsFor({ limits: undefined, usage: {}, isRecruiter: true })).toEqual([]);
    expect(quotaRowsFor({ limits: { activeJobs: 3 }, usage: { activeJobsCount: 1 }, isRecruiter: true })).toHaveLength(1);
  });

  it("candidates see only the AI allowance, and zero-limit rows are hidden", () => {
    const rows = quotaRowsFor({
      limits: { activeJobs: 0, teamMembers: 0, aiAnalysesPerMonth: 500 },
      usage: { aiAnalysesUsedThisMonth: 12 },
      isRecruiter: false,
    });
    expect(rows.map((r) => r.key)).toEqual(["aiAnalysesPerMonth"]);
    expect(rows[0].used).toBe(12);
  });
});

describe("planCardActionFor", () => {
  const plans = [
    { tier: "recruiter_starter", name: "Starter", priceInr: 999 },
    { tier: "recruiter_growth", name: "Growth", priceInr: 2499 },
  ];
  const base = { subscription: subGrowth, cyclesAvailable: true };

  it("marks the paid plan in force as current, and a lower plan as a switch", () => {
    const state = describeBillingState({ entitlement: paidActive, subscription: subGrowth, billingState: {} });
    expect(planCardActionFor({ ...base, plan: plans[1], entitlement: paidActive, state, currentPrice: 2499 }).kind).toBe("current");
    expect(planCardActionFor({ ...base, plan: plans[0], entitlement: paidActive, state, currentPrice: 2499 }).kind).toBe("switch");
  });

  it("offers renewal for a lapsed paid plan, not a plain upgrade", () => {
    const expired = { ...free, status: "expired", reason: "period_ended" };
    const state = describeBillingState({ entitlement: expired, subscription: subGrowth, billingState: {} });
    const action = planCardActionFor({ ...base, plan: plans[1], entitlement: expired, state, currentPrice: 0 });
    expect(action.kind).toBe("renew");
    expect(action.label).toBe("Renew Growth");
  });

  it("disables every purchase while a checkout is pending", () => {
    const state = describeBillingState({ entitlement: free, subscription: {}, billingState: { pendingCheckout: true } });
    const action = planCardActionFor({ plan: plans[0], entitlement: free, subscription: {}, state, currentPrice: 0, cyclesAvailable: true });
    expect(action).toMatchObject({ kind: "pending", disabled: true });
  });

  it("upgrades from the free plan", () => {
    const state = describeBillingState({ entitlement: free, subscription: {}, billingState: {} });
    expect(planCardActionFor({ plan: plans[1], entitlement: free, subscription: {}, state, currentPrice: 0, cyclesAvailable: true }).label).toBe("Upgrade to Growth");
  });
});

describe("history labels and query", () => {
  it("labels Test Mode and Live Mode as real gateway records and sandbox as not a payment", () => {
    expect(historyModeLabel("test")).toBe("Test Mode");
    expect(historyModeLabel("live")).toBe("Live Mode");
    expect(historyModeLabel("simulation")).toMatch(/Sandbox/);
    expect(historyStatusLabel("captured")).toBe("Paid");
    expect(historyStatusLabel("failed")).toBe("Failed");
  });

  it("omits empty filters so the server applies its defaults", () => {
    expect(historyParams({ status: "all", from: "", to: "" })).toEqual({});
    expect(historyParams({ status: "failed", from: "2026-11-01", to: "", after: "abc" })).toEqual({
      status: "failed",
      from: "2026-11-01",
      after: "abc",
    });
  });
});

describe("planCardActionFor: a recurring subscription in force holds the single slot", () => {
  const plans = [
    { tier: "recruiter_starter", name: "Starter", priceInr: 999 },
    { tier: "recruiter_growth", name: "Growth", priceInr: 2499 },
  ];
  const activeRecurring = {
    planTier: "recruiter_starter",
    status: "active",
    providerSubscriptionId: "sub_1",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
  };
  const state = { paidInForce: true, canUpgrade: true, periodEnd: "2026-12-01T00:00:00.000Z" };
  const entitlement = { tier: "recruiter_starter", paid: true, status: "active" };

  it("locks other plans, with the date they become available, instead of offering a checkout that is refused", () => {
    const growth = planCardActionFor({
      plan: plans[1],
      entitlement,
      subscription: activeRecurring,
      state,
      currentPrice: 999,
      cyclesAvailable: true,
    });
    expect(growth.kind).toBe("locked");
    expect(growth.disabled).toBe(true);
    expect(growth.note).toMatch(/Growth after/);
  });

  it("keeps the current plan as current", () => {
    const starter = planCardActionFor({
      plan: plans[0],
      entitlement,
      subscription: activeRecurring,
      state,
      currentPrice: 999,
      cyclesAvailable: true,
    });
    expect(starter.kind).toBe("current");
  });

  it("does not lock plans for a Free account with no recurring subscription", () => {
    const growth = planCardActionFor({
      plan: plans[1],
      entitlement: { tier: "recruiter_free", paid: false, status: "active" },
      subscription: { planTier: "recruiter_free", status: "active" },
      state: { paidInForce: false, canUpgrade: true },
      currentPrice: 0,
      cyclesAvailable: true,
    });
    expect(growth.kind).toBe("upgrade");
    expect(growth.disabled).toBe(false);
  });
});
