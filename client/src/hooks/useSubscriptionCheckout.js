// Checkout and payment verification shared by the candidate and recruiter billing pages (Requirement 2).
// Behaviour is unchanged from the previous pages: the server issues every price and payment proof.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { subscriptionApi } from "../lib/api";
import { useToast } from "../components/ui/useToast";
import { openRazorpayCheckout } from "../lib/razorpayCheckout";

/**
 * @param {object} opts
 * @param {string|undefined} opts.organizationId  recruiter workspace; undefined for candidates
 * @param {Array<unknown[]>} opts.invalidateKeys  query keys refreshed after a verified payment
 * @param {string} opts.successMessage            toast after a verified payment, when the server gives none
 */
export const useSubscriptionCheckout = ({ organizationId, invalidateKeys, successMessage }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutData, setCheckoutData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const close = () => {
    setSelectedPlan(null);
    setCheckoutData(null);
  };

  const checkoutMutation = useMutation({
    mutationFn: ({ planTier, billingCycle }) => subscriptionApi.checkout({ planTier, billingCycle }, organizationId),
    onSuccess: (res) => setCheckoutData(res.data),
    onError: (err) => toast.error(err.message || "Failed to start checkout"),
  });

  const cancelCheckoutMutation = useMutation({
    mutationFn: (body) => subscriptionApi.cancelCheckout(body, organizationId),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ kind, ...payload }) =>
      kind === "subscription"
        ? subscriptionApi.verifySubscription(payload, organizationId)
        : subscriptionApi.verifyPayment(payload, organizationId),
    onSuccess: (res) => {
      if (res.data?.status === "pending") {
        // Delayed confirmation: the plan activates when the provider confirms the payment.
        toast.info(res.data.message);
        setProcessing(false);
        qc.invalidateQueries({ queryKey: ["plan-entitlement"] });
        return;
      }
      toast.success(res.data?.message || successMessage);
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      close();
      setProcessing(false);
    },
    onError: (err) => {
      toast.error(err.message || "Payment verification failed");
      setProcessing(false);
    },
  });

  const startCheckout = (plan, billingCycle) => {
    setSelectedPlan(plan);
    checkoutMutation.mutate({ planTier: plan.tier, billingCycle });
  };

  const confirmPayment = () => {
    if (!checkoutData || !selectedPlan) return;
    setProcessing(true);

    // Razorpay test mode: a recurring subscription. Checkout authorises it; the server verifies the charge.
    if (checkoutData.subscription?.mode === "razorpay_subscription") {
      const subscription = checkoutData.subscription;
      openRazorpayCheckout({
        order: subscription,
        plan: selectedPlan,
        handlers: {
          onSuccess: (payment) =>
            verifyMutation.mutate({
              kind: "subscription",
              subscriptionId: payment.subscriptionId,
              paymentId: payment.paymentId,
              signature: payment.signature,
              planTier: selectedPlan.tier,
            }),
          onDismiss: () => {
            setProcessing(false);
            cancelCheckoutMutation.mutate({ subscriptionId: subscription.subscriptionId });
          },
          onFailed: (message) => {
            setProcessing(false);
            toast.error(message || "The payment was not successful. You can try again.");
          },
        },
      }).catch((error) => {
        setProcessing(false);
        toast.error(error.message || "Could not open the payment window");
      });
      return;
    }

    const helper = checkoutData.simulationHelper;
    if (!helper) {
      // The server only issues sandbox payment proofs. Never fabricate one on the client.
      setProcessing(false);
      toast.error("Payments are not available on this server. Please contact support.");
      return;
    }
    // Sandbox payment: the server issued and signed these values during checkout.
    verifyMutation.mutate({
      orderId: helper.orderId,
      paymentId: helper.paymentId,
      signature: helper.signature,
      planTier: selectedPlan.tier,
    });
  };

  return {
    selectedPlan,
    checkoutData,
    processing,
    starting: checkoutMutation.isPending,
    startCheckout,
    confirmPayment,
    close,
  };
};

export default useSubscriptionCheckout;
