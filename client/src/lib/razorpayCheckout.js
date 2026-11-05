// Razorpay Checkout for the browser (Phase 7). The browser only collects the payment; the server creates
// the order, verifies the signature, fetches the payment from Razorpay and activates the plan.
// The success callback is NOT proof of payment, so this module never activates anything itself.

export const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loading = null;

/** Loads Razorpay's checkout.js once. Resolves with the global Razorpay constructor. */
export const loadRazorpayCheckout = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Payments can only be opened in a browser."));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RAZORPAY_CHECKOUT_SRC;
      script.async = true;
      script.onload = () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else {
          loading = null;
          reject(new Error("The payment provider did not load. Please try again."));
        }
      };
      script.onerror = () => {
        loading = null;
        reject(new Error("Could not reach the payment provider. Check your connection and try again."));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
};

/**
 * Builds the options passed to Razorpay Checkout.
 * - Subscription (`order.subscriptionId`): Checkout authorises the recurring subscription. No amount is sent;
 *   the provider's subscription defines it. The success fields are returned under subscriptionId.
 * - One-time order (`order.orderId`, sandbox only): the amount shown is the server-created order's amount.
 * The browser never decides the price, and nothing here activates a plan.
 */
export const buildCheckoutOptions = ({ order, plan, prefill = {}, onSuccess, onDismiss }) => {
  const common = {
    key: order.keyId,
    name: "HireSmart AI",
    description: plan?.name ? `${plan.name} plan` : "Subscription",
    prefill,
    theme: { color: "#4f46e5" },
    modal: { ondismiss: () => onDismiss?.() },
  };
  if (order.subscriptionId) {
    return {
      ...common,
      subscription_id: order.subscriptionId,
      handler: (response) =>
        onSuccess({
          subscriptionId: response.razorpay_subscription_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
    };
  }
  return {
    ...common,
    amount: Math.round(Number(order.amount) * 100),
    currency: order.currency || "INR",
    order_id: order.orderId,
    handler: (response) =>
      onSuccess({
        orderId: response.razorpay_order_id,
        paymentId: response.razorpay_payment_id,
        signature: response.razorpay_signature,
      }),
  };
};

/**
 * Opens Checkout. `handlers.onDismiss` runs only when the payer closed the window without paying: a dismiss
 * that follows a successful handler is ignored, so an order that is being verified is never cancelled.
 * Returns a promise that resolves once the modal has been opened.
 */
export const openRazorpayCheckout = async ({ order, plan, prefill, handlers }) => {
  const Razorpay = await loadRazorpayCheckout();
  let paid = false;
  const options = buildCheckoutOptions({
    order,
    plan,
    prefill,
    onSuccess: (payment) => {
      paid = true;
      handlers.onSuccess(payment);
    },
    onDismiss: () => {
      if (!paid) handlers.onDismiss();
    },
  });
  const instance = new Razorpay(options);
  instance.on("payment.failed", (response) => {
    handlers.onFailed?.(response?.error?.description || "The payment was not successful. You can try again.");
  });
  instance.open();
  return instance;
};
