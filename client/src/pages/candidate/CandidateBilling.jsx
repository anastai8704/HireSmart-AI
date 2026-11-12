// Candidate membership (Requirement 2). Every plan state, limit and action comes from the server.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "../../components/Product";
import { PlanBadge } from "../../components/billing/PlanBadge";
import { CurrentPlanPanel } from "../../components/billing/CurrentPlanPanel";
import { PlanComparison } from "../../components/billing/PlanComparison";
import { PaymentHistory } from "../../components/billing/PaymentHistory";
import { CheckoutDialog } from "../../components/billing/CheckoutDialog";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { subscriptionApi } from "../../lib/api";
import { useSubscriptionCheckout } from "../../hooks/useSubscriptionCheckout";
import { describeBillingState } from "../../lib/billingModel";

const CHECKOUT_COPY = {
  title: (plan) => `Upgrade to ${plan.name}`,
  subline: "Career membership",
};

export const CandidateBilling = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const [billingCycle, setBillingCycle] = useState("monthly");

  const subQuery = useQuery({
    queryKey: ["candidate-subscription"],
    queryFn: () => subscriptionApi.current(),
  });
  const plansQuery = useQuery({ queryKey: ["subscription-plans"], queryFn: subscriptionApi.plans });

  const checkout = useSubscriptionCheckout({
    organizationId: undefined,
    invalidateKeys: [["candidate-subscription"], ["plan-entitlement"], ["candidate-payments"]],
    successMessage: "Career Plus is now active.",
  });

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: (res) => {
      toast.success(res.message || "Your membership will not renew.");
      qc.invalidateQueries({ queryKey: ["candidate-subscription"] });
      qc.invalidateQueries({ queryKey: ["plan-entitlement"] });
    },
    onError: (err) => toast.error(err.message || "Could not stop renewal. Please try again."),
  });

  if (subQuery.isLoading || plansQuery.isLoading) {
    return <LoadingState message="Loading your career membership details…" />;
  }
  if (subQuery.error) return <ErrorState error={subQuery.error} onRetry={subQuery.refetch} />;
  if (plansQuery.error) return <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />;

  const data = subQuery.data?.data || {};
  const subscription = data.subscription || {};
  const entitlement = data.entitlement || null;
  const billingState = data.billingState || {};
  const model = describeBillingState({ entitlement, subscription, billingState });
  // Free plans are not sold: they appear only as the plan in force.
  const plans = (plansQuery.data?.data?.candidate || []).filter(
    (p) => p.priceInr > 0 || p.tier === entitlement?.tier,
  );

  const scrollToPlans = () => document.getElementById("plan-options")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Career Membership"
        title="Candidate Membership & Plans"
        description="Your membership status, AI usage, renewal and payment history."
        action={<PlanBadge />}
      />

      <CurrentPlanPanel
        model={model}
        subscription={subscription}
        entitlement={entitlement}
        usage={subscription.usage}
        isRecruiter={false}
        onUpgrade={scrollToPlans}
        onCancelRenewal={() => cancelMutation.mutate()}
        cancelling={cancelMutation.isPending}
      />

      <div id="plan-options" className="scroll-mt-6">
        <PlanComparison
          plans={plans}
          entitlement={entitlement}
          subscription={subscription}
          model={model}
          billingCycle={billingCycle}
          onCycleChange={setBillingCycle}
          onSelect={(plan) => checkout.startCheckout(plan, billingCycle)}
          starting={checkout.starting}
          selectedTier={checkout.selectedPlan?.tier}
          headingId="plan-options-heading"
          title="Membership plans"
          description="Unlock AI resume enhancement, interview preparation and priority matching."
        />
      </div>

      <PaymentHistory
        queryKeyBase={["candidate-payments"]}
        organizationId={undefined}
        plans={plansQuery.data?.data?.candidate}
        title="Payment history"
      />

      <CheckoutDialog
        plan={checkout.selectedPlan}
        checkoutData={checkout.checkoutData}
        billingCycle={billingCycle}
        processing={checkout.processing}
        starting={checkout.starting}
        onConfirm={checkout.confirmPayment}
        onClose={checkout.close}
        copy={CHECKOUT_COPY}
      />
    </div>
  );
};

export default CandidateBilling;
