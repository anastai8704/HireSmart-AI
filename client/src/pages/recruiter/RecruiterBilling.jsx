// Recruiter / organization billing (Requirement 2). Every plan state, limit and action comes from the server.
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
import { useAuth } from "../../context/useAuth";
import { useSubscriptionCheckout } from "../../hooks/useSubscriptionCheckout";
import { describeBillingState } from "../../lib/billingModel";
import { hasYearlyPrice } from "../../lib/billingCycle";

const CHECKOUT_COPY = {
  title: (plan) => `Upgrade to ${plan.name}`,
  subline: "Workspace hiring plan",
};

export const RecruiterBilling = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  const [billingCycle, setBillingCycle] = useState("monthly");

  const subQuery = useQuery({
    queryKey: ["recruiter-subscription", organizationId],
    queryFn: () => subscriptionApi.current(organizationId),
    enabled: Boolean(organizationId),
  });
  const plansQuery = useQuery({ queryKey: ["subscription-plans"], queryFn: subscriptionApi.plans });

  const checkout = useSubscriptionCheckout({
    organizationId,
    invalidateKeys: [["recruiter-subscription"], ["plan-entitlement"], ["recruiter-payments"]],
    successMessage: "Your plan has been updated.",
  });

  const cancelMutation = useMutation({
    mutationFn: () => subscriptionApi.cancel(organizationId),
    onSuccess: (res) => {
      toast.success(res.message || "Your plan will not renew.");
      qc.invalidateQueries({ queryKey: ["recruiter-subscription"] });
      qc.invalidateQueries({ queryKey: ["plan-entitlement"] });
    },
    onError: (err) => toast.error(err.message || "Could not stop renewal. Please try again."),
  });

  if (!organizationId) return <ErrorState title="No workspace selected" error={null} />;
  if (subQuery.isLoading || plansQuery.isLoading) {
    return <LoadingState message="Loading company subscription & billing…" />;
  }
  if (subQuery.error) return <ErrorState error={subQuery.error} onRetry={subQuery.refetch} />;
  if (plansQuery.error) return <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />;

  const data = subQuery.data?.data || {};
  const subscription = data.subscription || {};
  const entitlement = data.entitlement || null;
  const billingState = data.billingState || {};
  const model = describeBillingState({ entitlement, subscription, billingState });
  // Free plans are not sold: they appear only as the plan in force.
  const plans = (plansQuery.data?.data?.recruiter || []).filter(
    (p) => p.priceInr > 0 || p.tier === entitlement?.tier,
  );

  const scrollToPlans = () => document.getElementById("plan-options")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Company Workspace"
        title="Subscription & Billing"
        description="Plan status, hiring limits, renewal and payment history for this company workspace."
        action={<PlanBadge />}
      />

      <CurrentPlanPanel
        model={model}
        subscription={subscription}
        entitlement={entitlement}
        usage={subscription.usage}
        isRecruiter
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
          title="Hiring plans"
          description={hasYearlyPrice(plans) ? "Yearly billing is shown where the plan offers it." : "Choose the capacity your team needs."}
        />
      </div>

      <PaymentHistory
        queryKeyBase={["recruiter-payments", organizationId]}
        organizationId={organizationId}
        plans={plansQuery.data?.data?.recruiter}
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

export default RecruiterBilling;
