// Account plan summary for Settings (Requirement 17). Shows the server-derived plan and a link to billing.
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";

import { useAuth } from "../../context/useAuth";
import { usePlanEntitlement } from "../../hooks/usePlanEntitlement";
import { PlanBadge } from "./PlanBadge";

export const PlanSummaryCard = () => {
  const auth = useAuth();
  const { isAdmin, enabled } = usePlanEntitlement();
  const billingHref = auth.role === "candidate" ? "/app/candidate/plans" : auth.organizationId ? `/app/o/${auth.organizationId}/billing` : null;

  return (
    <section className="panel p-5" aria-labelledby="plan-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="plan-summary-title" className="font-bold">
              Plan
            </h2>
            {isAdmin ? (
              <p className="text-sm text-ink-500">Platform administrator. Plans apply to candidate and organization accounts.</p>
            ) : (
              <p className="text-sm text-ink-500">What is in force for this {auth.role === "candidate" ? "account" : "workspace"} right now.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {enabled && <PlanBadge />}
          {!isAdmin && billingHref && (
            <Link to={billingHref} className="text-sm font-semibold text-brand-700 hover:underline">
              Manage billing
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

export default PlanSummaryCard;
