import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCheckoutOptions, openRazorpayCheckout } from "./razorpayCheckout";

const order = { orderId: "order_TEST1", amount: 149, currency: "INR", keyId: "rzp_test_key" };

describe("buildCheckoutOptions", () => {
  it("uses the server order and converts rupees to paise for display only", () => {
    const opts = buildCheckoutOptions({ order, plan: { name: "Career Plus" }, onSuccess: vi.fn() });
    expect(opts.key).toBe("rzp_test_key");
    expect(opts.order_id).toBe("order_TEST1");
    expect(opts.amount).toBe(14900);
    expect(opts.description).toBe("Career Plus plan");
  });

  it("maps the provider's success fields to the names the server expects", () => {
    const onSuccess = vi.fn();
    const opts = buildCheckoutOptions({ order, onSuccess });
    opts.handler({ razorpay_order_id: "order_TEST1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" });
    expect(onSuccess).toHaveBeenCalledWith({ orderId: "order_TEST1", paymentId: "pay_1", signature: "sig" });
  });
});

describe("buildCheckoutOptions for a subscription", () => {
  const subscription = { subscriptionId: "sub_TEST1", keyId: "rzp_test_key", billingCycle: "monthly" };

  it("opens Checkout with the subscription id and no amount or order id", () => {
    const opts = buildCheckoutOptions({ order: subscription, plan: { name: "Career Plus" }, onSuccess: vi.fn() });
    expect(opts.subscription_id).toBe("sub_TEST1");
    expect(opts.key).toBe("rzp_test_key");
    expect(opts.amount).toBeUndefined();
    expect(opts.order_id).toBeUndefined();
  });

  it("maps the subscription success fields to subscriptionId, paymentId and signature", () => {
    const onSuccess = vi.fn();
    const opts = buildCheckoutOptions({ order: subscription, onSuccess });
    opts.handler({ razorpay_subscription_id: "sub_TEST1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" });
    expect(onSuccess).toHaveBeenCalledWith({ subscriptionId: "sub_TEST1", paymentId: "pay_1", signature: "sig" });
  });
});

describe("openRazorpayCheckout", () => {
  let instances;
  beforeEach(() => {
    instances = [];
    window.Razorpay = class {
      constructor(options) {
        this.options = options;
        this.listeners = {};
        instances.push(this);
      }
      on(event, fn) {
        this.listeners[event] = fn;
      }
      open() {
        this.opened = true;
      }
    };
  });

  it("opens the modal and cancels only when the payer dismisses before paying", async () => {
    const handlers = { onSuccess: vi.fn(), onDismiss: vi.fn(), onFailed: vi.fn() };
    await openRazorpayCheckout({ order, plan: { name: "Career Plus" }, handlers });
    const instance = instances[0];
    expect(instance.opened).toBe(true);
    instance.options.modal.ondismiss();
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not treat a dismiss after a successful payment as an abandoned checkout", async () => {
    const handlers = { onSuccess: vi.fn(), onDismiss: vi.fn(), onFailed: vi.fn() };
    await openRazorpayCheckout({ order, handlers });
    const instance = instances[0];
    instance.options.handler({ razorpay_order_id: "order_TEST1", razorpay_payment_id: "pay_1", razorpay_signature: "s" });
    instance.options.modal.ondismiss();
    expect(handlers.onSuccess).toHaveBeenCalledTimes(1);
    expect(handlers.onDismiss).not.toHaveBeenCalled();
  });

  it("reports a provider failure with the provider's description", async () => {
    const handlers = { onSuccess: vi.fn(), onDismiss: vi.fn(), onFailed: vi.fn() };
    await openRazorpayCheckout({ order, handlers });
    instances[0].listeners["payment.failed"]({ error: { description: "Card declined" } });
    expect(handlers.onFailed).toHaveBeenCalledWith("Card declined");
  });
});
