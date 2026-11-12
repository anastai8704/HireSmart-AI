// The signed-in subscriber's plan as the server derives it (Requirement 17). One query, keyed by the
// workspace, so switching workspace shows that workspace's plan. Platform admins have no plan.
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../context/useAuth";
import { subscriptionApi } from "../lib/api";
import { planBadgeFor } from "../lib/planStatus";

export const PLAN_QUERY_PREFIX = "plan-entitlement";

export const usePlanEntitlement = () => {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const isCandidate = auth.role === "candidate";
  const organizationId = auth.organizationId || null;
  const scope = isCandidate ? "candidate" : organizationId;
  const enabled = Boolean(auth.isAuthenticated) && !isAdmin && (isCandidate || Boolean(organizationId));

  const query = useQuery({
    queryKey: [PLAN_QUERY_PREFIX, scope],
    queryFn: () => subscriptionApi.current(isCandidate ? undefined : organizationId),
    enabled,
    staleTime: 60 * 1000,
  });

  const entitlement = query.data?.data?.entitlement || null;
  const billingState = query.data?.data?.billingState || {};
  return {
    isAdmin,
    enabled,
    entitlement,
    billingState,
    badge: enabled ? planBadgeFor(entitlement, billingState) : null,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
};

export default usePlanEntitlement;
