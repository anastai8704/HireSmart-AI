// Plan badge wording and tone (Requirement 17). Pure: the server's entitlement and billing state decide
// everything. The badge never guesses a plan from the UI and never shows a paid plan as active unless the
// server says the paid entitlement is in force.
import { formatDate } from "./utils";

/**
 * @param {object|null|undefined} entitlement  server `entitlement` from GET /subscriptions/current
 * @param {object|null|undefined} billingState server `billingState` (pendingCheckout, lastPaymentFailed)
 * @returns {{ label: string, status: string, tone: "paid"|"warning"|"danger"|"neutral"|"loading", paidInForce: boolean }}
 */
export const planBadgeFor = (entitlement, billingState = {}) => {
  if (!entitlement) {
    return { label: "Checking plan", status: "", tone: "loading", paidInForce: false };
  }

  const planName = entitlement.planName || "Free";
  const isPaid = Boolean(entitlement.paid);

  // Paid and in force: the entitlement is active and the period has not ended.
  if (isPaid && entitlement.status === "active") {
    if (entitlement.cancelAtPeriodEnd) {
      // Scheduled cancellation keeps the paid badge until the period actually ends.
      return {
        label: planName,
        status: entitlement.periodEnd ? `Ends ${formatDate(entitlement.periodEnd)}` : "Cancellation scheduled",
        tone: "warning",
        paidInForce: true,
      };
    }
    return {
      label: planName,
      status: entitlement.periodEnd ? `Renews ${formatDate(entitlement.periodEnd)}` : "Active",
      tone: "paid",
      paidInForce: true,
    };
  }

  // Paid but in the failed-renewal grace period: still usable, clearly not healthy.
  if (isPaid && entitlement.status === "grace") {
    return {
      label: planName,
      status: entitlement.graceEnd ? `Payment overdue · until ${formatDate(entitlement.graceEnd)}` : "Payment overdue",
      tone: "warning",
      paidInForce: true,
    };
  }

  // Everything else is not a paid badge. Show the free plan the server falls back to.
  const freeLabel = isPaid ? "Free" : planName;
  if (billingState?.pendingCheckout) {
    return { label: freeLabel, status: "Payment pending", tone: "warning", paidInForce: false };
  }
  if (billingState?.lastPaymentFailed) {
    return { label: freeLabel, status: "Last payment failed", tone: "danger", paidInForce: false };
  }
  if (entitlement.status === "expired" || entitlement.reason === "period_ended" || entitlement.reason === "payment_failed") {
    return { label: freeLabel, status: "Expired", tone: "neutral", paidInForce: false };
  }
  if (entitlement.status === "canceled" || entitlement.reason === "not_active") {
    return { label: freeLabel, status: "Canceled", tone: "neutral", paidInForce: false };
  }
  return { label: freeLabel, status: "Free plan", tone: "neutral", paidInForce: false };
};
