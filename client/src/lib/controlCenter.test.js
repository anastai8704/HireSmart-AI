// Requirement 7: queue counts are live DB values; a missing value is "no data", never zero.
import { describe, expect, it } from "vitest";
import { buildQueues } from "./controlCenter";
import { healthFrom } from "./platformHealth";

describe("buildQueues", () => {
  it("maps each queue to its real count and drill-down page", () => {
    const q = buildQueues({
      jobs: { pending: 4 },
      companies: { pending: 2, underReview: 1 },
      kpis: { fraudReviewQueue: 1, failedPayments: 3 },
      queues: { placementsAwaitingVerification: 5, subscriptionsPastDue: 0 },
      users: { suspended: 0 },
    });
    const byKey = Object.fromEntries(q.map((r) => [r.key, r]));
    expect(byKey.jobApprovals).toMatchObject({ count: 4, tone: "warning", to: "/app/admin/moderation" });
    expect(byKey.companyVerification.count).toBe(3);
    expect(byKey.placementVerification).toMatchObject({ count: 5, to: "/app/admin/placements" });
    expect(byKey.pastDue).toMatchObject({ count: 0, tone: "neutral" });
    expect(byKey.failedPayments.to).toBe("/app/admin/revenue");
  });

  it("shows null, not zero, when the server has not sent a count", () => {
    const byKey = Object.fromEntries(buildQueues({}).map((r) => [r.key, r]));
    expect(byKey.jobApprovals.count).toBeNull();
    expect(byKey.companyVerification.count).toBeNull();
    expect(byKey.pastDue.count).toBeNull();
    expect(byKey.jobApprovals.tone).toBe("neutral");
  });
});

describe("healthFrom", () => {
  const ready = { checks: { mongodb: "up", jobStore: "up" }, queue: { queued: 2, staleProcessing: 0 } };

  it("is operational only when every real check is up", () => {
    const h = healthFrom({ data: ready });
    expect(h.overall).toBe("operational");
    expect(h.services.map((s) => s.state)).toEqual(["up", "up"]);
    expect(h.queue).toEqual({ queued: 2, staleProcessing: 0 });
  });

  it("reports the failing service from a 503 body, and never 'operational'", () => {
    const h = healthFrom({ error: { status: 503, data: { checks: { mongodb: "down", jobStore: "down" } } } });
    expect(h.overall).toBe("down");
    expect(h.services.every((s) => s.state === "down")).toBe(true);
  });

  it("is degraded when runs are stuck processing", () => {
    expect(healthFrom({ data: { ...ready, queue: { queued: 0, staleProcessing: 3 } } }).overall).toBe("degraded");
  });

  it("is unreachable, with every service unknown, when there is no readiness body", () => {
    const h = healthFrom({ error: new Error("network") });
    expect(h.overall).toBe("unreachable");
    expect(h.services.every((s) => s.state === "unknown")).toBe(true);
    expect(h.queue).toBeNull();
  });
});
