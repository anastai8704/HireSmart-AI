// Plan cards with status-aware actions (Requirement 2). Actions come from planCardActionFor.
import { Check } from "lucide-react";

import Button from "../ui/Button";
import Badge from "../ui/Badge";
import { cn } from "../../lib/utils";
import { cycleAvailable, cycleSuffix, displayPrice, hasYearlyPrice } from "../../lib/billingCycle";
import { planCardActionFor } from "../../lib/billingModel";

export const PlanComparison = ({ plans, entitlement, subscription, model, billingCycle, onCycleChange, onSelect, starting, selectedTier, headingId, title, description }) => {
  const currentPrice = Number(plans.find((p) => p.tier === entitlement?.tier)?.priceInr || 0);
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-bold text-ink-950">
            {title}
          </h2>
          <p className="text-xs text-ink-500">{description}</p>
        </div>
        {hasYearlyPrice(plans) && (
          <div role="group" aria-label="Billing cycle" className="inline-flex rounded-lg border border-ink-200 p-1 text-xs font-semibold">
            {["monthly", "yearly"].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={billingCycle === c}
                onClick={() => onCycleChange(c)}
                className={`rounded-md px-3 py-1.5 ${billingCycle === c ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cn("grid gap-6", plans.length > 2 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2")}>
        {plans.map((plan) => {
          const action = planCardActionFor({
            plan,
            entitlement,
            subscription,
            state: model,
            currentPrice,
            cyclesAvailable: cycleAvailable(plan, billingCycle),
          });
          const isCurrent = action.kind === "current";
          return (
            <article
              key={plan.tier}
              aria-label={plan.name}
              className={cn(
                "flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm",
                plan.highlight ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-100",
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-ink-950">{plan.name}</h3>
                  <div className="flex flex-wrap justify-end gap-1">
                    {plan.highlight && <Badge variant="brand">Most popular</Badge>}
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-500">{plan.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-ink-950">{displayPrice(plan, billingCycle)}</span>
                  <span className="text-xs text-ink-500">/ {cycleSuffix(billingCycle)}</span>
                </div>
                <hr className="my-5 border-ink-100" />
                <ul className="space-y-2.5 text-xs text-ink-700">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6">
                <Button
                  variant={action.kind === "current" ? "outline" : plan.highlight ? "primary" : "outline"}
                  className="w-full"
                  disabled={action.disabled}
                  loading={starting && selectedTier === plan.tier}
                  onClick={() => onSelect(plan)}
                >
                  {action.label}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default PlanComparison;
