// Checkout confirmation (Requirement 2). Shows the server-issued checkout; the price is never set here.
import { CheckCircle2 } from "lucide-react";

import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { displayPrice } from "../../lib/billingCycle";

export const CheckoutDialog = ({ plan, checkoutData, billingCycle, processing, starting, onConfirm, onClose, copy }) => {
  if (!plan) return null;
  const sandbox = checkoutData?.order?.mode === "simulation";
  return (
    <Modal open onClose={onClose} title={copy.title(plan)}>
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-ink-950">{plan.name}</h4>
              <p className="text-xs text-ink-500">{billingCycle === "yearly" ? "Yearly" : "Monthly"} billing · {copy.subline}</p>
            </div>
            <span className="text-2xl font-extrabold text-brand-700">{displayPrice(plan, billingCycle)}</span>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-ink-600">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {sandbox && (
          <div className="rounded-lg bg-warning-50 p-3 text-xs text-warning-900">
            <span className="font-bold">Sandbox mode:</span> this immediate activation is a test. It is not a real payment and is never counted as revenue.
          </div>
        )}
        <p className="text-xs text-ink-500">Your plan changes only after the payment is confirmed.</p>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={processing || starting} disabled={!checkoutData}>
            Confirm and pay {displayPrice(plan, billingCycle)}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CheckoutDialog;
