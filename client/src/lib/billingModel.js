// Billing view model (Requirement 2). Pure functions: every status, limit and action comes from the server's
// entitlement, subscription and billing state. Nothing here invents a limit, a plan or a payment state.
import { formatDate } from "./utils";
import { planBadgeFor } from "./planStatus";

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Headline, status line and available actions for the signed-in subscriber.
 * @returns {{ headline: string, freeName: string, paidInForce: boolean, badge: object,
 *   status: { tone: "success"|"warning"|"danger"|"neutral", text: string },
 *   canUpgrade: boolean, canCancelRenewal: boolean }}
 */
export const describeBillingState = ({ entitlement, subscription, billingState = {} }) => {
  const badge = planBadgeFor(entitlement, billingState);
  const ent = entitlement || {};
  const sub = subscription || {};
  const paidInForce = Boolean(badge.paidInForce);
  const planName = ent.planName || "Free";
  const freeName = ent.paid ? "Free" : planName;
  if (!entitlement) {
    // No server entitlement: say so. Never present a guess as the plan in force.
    return {
      headline: "Plan status unavailable",
      freeName: "Free",
      paidInForce: false,
      badge,
      status: { tone: "neutral", text: "We could not confirm your plan right now. Refresh the page to try again." },
      canUpgrade: false,
      canCancelRenewal: false,
    };
  }

  let status;
  if (paidInForce && ent.status === "grace") {
    status = {
      tone: "warning",
      text: `Your last renewal payment did not go through. Access continues until ${formatDate(ent.graceEnd)}. Update your payment method to keep this plan.`,
    };
  } else if (paidInForce && ent.cancelAtPeriodEnd) {
    status = {
      tone: "warning",
      text: `This plan will not renew. Access continues until ${formatDate(ent.periodEnd)}.`,
    };
  } else if (paidInForce) {
    status = { tone: "success", text: `Renews on ${formatDate(ent.periodEnd)}.` };
  } else if (billingState?.pendingCheckout) {
    status = {
      tone: "warning",
      text: "A payment is awaiting confirmation. Your plan changes only after the provider confirms the payment.",
    };
  } else if (billingState?.lastPaymentFailed) {
    status = { tone: "danger", text: "Your last payment did not go through. Your plan has not changed." };
  } else if (ent.status === "expired" || ent.reason === "period_ended" || ent.reason === "payment_failed") {
    const ended = sub.currentPeriodEnd ? ` on ${formatDate(sub.currentPeriodEnd)}` : "";
    status = { tone: "neutral", text: `Your paid plan expired${ended}. You are on the ${freeName} plan.` };
  } else if (ent.status === "canceled" || ent.reason === "not_active") {
    status = { tone: "neutral", text: `Your subscription was canceled. You are on the ${freeName} plan.` };
  } else {
    status = { tone: "neutral", text: `You are on the ${freeName} plan.` };
  }

  const pending = Boolean(billingState?.pendingCheckout);
  return {
    headline: paidInForce ? `${planName} plan` : `${freeName} plan`,
    freeName,
    paidInForce,
    periodEnd: ent.periodEnd || null,
    badge,
    status,
    // A second checkout while one is pending could double-charge; wait for the first to settle.
    canUpgrade: !pending,
    canCancelRenewal:
      paidInForce && ent.status === "active" && !ent.cancelAtPeriodEnd && Boolean(sub.providerSubscriptionId),
  };
};

/**
 * Quota meters for the plan in force. Rows appear only for real, positive limits from the plan.
 * @returns {Array<{ key: string, label: string, used: number, limit: number, percent: number, atLimit: boolean }>}
 */
export const quotaRowsFor = ({ limits, usage, isRecruiter }) => {
  if (!limits) return [];
  const u = usage || {};
  const candidates = isRecruiter
    ? [
        ["activeJobs", "Active job postings", u.activeJobsCount],
        ["teamMembers", "Team members", u.teamMembersCount],
        ["aiAnalysesPerMonth", "AI analyses this month", u.aiAnalysesUsedThisMonth],
      ]
    : [["aiAnalysesPerMonth", "AI analyses this month", u.aiAnalysesUsedThisMonth]];

  return candidates
    .filter(([key]) => isFiniteNumber(limits[key]) && limits[key] > 0)
    .map(([key, label, rawUsed]) => {
      const limit = limits[key];
      const used = isFiniteNumber(rawUsed) ? rawUsed : 0;
      return {
        key,
        label,
        used,
        limit,
        percent: Math.min(100, Math.round((used / limit) * 100)),
        atLimit: used >= limit,
      };
    });
};

/**
 * Action for one plan card.
 * - current: the paid plan in force, or the free plan when nothing paid is in force.
 * - renew: a paid plan that lapsed (still on the subscription record, not in force).
 * - upgrade / switch: relative to the price of the plan in force (`currentPrice`, 0 when on free).
 * - pending: a checkout is awaiting confirmation, so no second checkout starts.
 */
export const planCardActionFor = ({ plan, entitlement, subscription, state, currentPrice = 0, cyclesAvailable }) => {
  const isCurrent = Boolean(entitlement) && entitlement.tier === plan.tier && (state.paidInForce || plan.priceInr === 0);
  const isLapsed = !state.paidInForce && subscription?.planTier === plan.tier && plan.priceInr > 0;
  if (isCurrent) return { kind: "current", label: "Current plan", disabled: true };
  if (isLapsed) {
    return { kind: "renew", label: `Renew ${plan.name}`, disabled: !state.canUpgrade || !cyclesAvailable };
  }
  // A recurring subscription in force holds the single subscription slot (the server refuses a second checkout until
  // the period ends). Other plans are shown, locked, with the date they become available.
  const recurringInForce =
    state.paidInForce && Boolean(subscription?.providerSubscriptionId) && ["active", "past_due"].includes(subscription?.status);
  if (recurringInForce) {
    const when = state.periodEnd ? formatDate(state.periodEnd) : "the end of the current period";
    return {
      kind: "locked",
      label: "Available after current period",
      disabled: true,
      note: `You can choose ${plan.name} after ${when}. Your current plan stays active until then.`,
    };
  }
  if (!state.canUpgrade) return { kind: "pending", label: "Payment pending", disabled: true };
  const upgrade = plan.priceInr > currentPrice;
  return {
    kind: upgrade ? "upgrade" : "switch",
    label: upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`,
    disabled: !cyclesAvailable,
  };
};

export const historyStatusLabel = (status) =>
  ({ captured: "Paid", refunded: "Refunded", failed: "Failed" })[status] || status || "-";

export const historyStatusTone = (status) =>
  ({ captured: "success", refunded: "default", failed: "danger" })[status] || "default";

/** Mode label. Razorpay Test Mode and Live captures are real gateway records; sandbox ones never count as revenue. */
export const historyModeLabel = (mode) =>
  ({ live: "Live Mode", test: "Test Mode", simulation: "Sandbox · not a real payment" })[mode] || "Unknown mode";

export const historyModeTone = (mode) => ({ live: "success", test: "brand", simulation: "warning" })[mode] || "default";

export const HISTORY_STATUS_OPTIONS = [
  { value: "all", label: "All payments" },
  { value: "captured", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
];

/** Query params for the invoices endpoint. Empty filters are omitted so the server applies its defaults. */
export const historyParams = ({ status = "all", from = "", to = "", q = "", after = "" }) => {
  const params = {};
  if (status && status !== "all") params.status = status;
  if (from) params.from = from;
  if (to) params.to = to;
  const term = String(q || "").trim();
  if (term) params.q = term;
  if (after) params.after = after;
  return params;
};
