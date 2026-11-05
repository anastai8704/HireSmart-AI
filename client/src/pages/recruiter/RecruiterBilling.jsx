import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Building2,
  Users,
  BriefcaseBusiness,
  Sparkles,
  Download,
  CheckCircle2,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { subscriptionApi } from "../../lib/api";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/useToast";
import { openRazorpayCheckout } from "../../lib/razorpayCheckout";
import { formatDate } from "../../lib/utils";

export const RecruiterBilling = () => {
  const toast = useToast();
  const qc = useQueryClient();
  const { organizationId } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutData, setCheckoutData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const subQuery = useQuery({
    queryKey: ["recruiter-subscription", organizationId],
    queryFn: () => subscriptionApi.current(organizationId),
  });

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: subscriptionApi.plans,
  });

  const invoicesQuery = useQuery({
    queryKey: ["recruiter-invoices", organizationId],
    queryFn: () => subscriptionApi.invoices(undefined, organizationId),
  });

  const checkoutMutation = useMutation({
    mutationFn: (planTier) => subscriptionApi.checkout({ planTier }, organizationId),
    onSuccess: (res) => {
      setCheckoutData(res.data);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to initiate checkout");
    },
  });

  const cancelCheckoutMutation = useMutation({
    mutationFn: (body) => subscriptionApi.cancelCheckout(body, organizationId),
  });

  const verifyMutation = useMutation({
    mutationFn: (payload) => subscriptionApi.verifyPayment(payload, organizationId),
    onSuccess: (res) => {
      if (res.data?.status === "pending") {
        // Delayed confirmation: the plan activates when the provider confirms the payment.
        toast.info(res.data.message);
        setProcessing(false);
        return;
      }
      toast.success(res.data?.message || "Plan upgraded successfully!");
      qc.invalidateQueries({ queryKey: ["recruiter-subscription"] });
      qc.invalidateQueries({ queryKey: ["recruiter-invoices"] });
      setSelectedPlan(null);
      setCheckoutData(null);
      setProcessing(false);
    },
    onError: (err) => {
      toast.error(err.message || "Payment verification failed");
      setProcessing(false);
    },
  });

  if (subQuery.isLoading || plansQuery.isLoading) {
    return <LoadingState message="Loading company subscription & billing…" />;
  }

  if (subQuery.error) {
    return <ErrorState error={subQuery.error} onRetry={subQuery.refetch} />;
  }

  const sub = subQuery.data?.data?.subscription || {};
  const currentPlan = subQuery.data?.data?.plan || {};
  // Free plans are not sold: they appear only as the current plan.
  const plans = (plansQuery.data?.data?.recruiter || []).filter(
    (p) => p.priceInr > 0 || p.tier === sub.planTier,
  );
  const invoices = invoicesQuery.data?.data || [];

  const handleOpenUpgrade = (plan) => {
    setSelectedPlan(plan);
    checkoutMutation.mutate(plan.tier);
  };

  const handleConfirmPayment = () => {
    if (!checkoutData) return;
    setProcessing(true);

    // Razorpay test mode: the provider's Checkout collects the payment. The server then verifies it.
    if (checkoutData.order?.mode === "razorpay_test") {
      openRazorpayCheckout({
        order: checkoutData.order,
        plan: selectedPlan,
        handlers: {
          onSuccess: (payment) => verifyMutation.mutate({ ...payment, planTier: selectedPlan.tier }),
          onDismiss: () => {
            setProcessing(false);
            cancelCheckoutMutation.mutate({ orderId: checkoutData.order.orderId });
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

  const activeJobs = sub.usage?.activeJobsCount || 0;
  const maxJobs = sub.limits?.activeJobs || 3;
  const teamMembers = sub.usage?.teamMembersCount || 1;
  const maxTeam = sub.limits?.teamMembers || 2;
  const aiUsed = sub.usage?.aiAnalysesUsedThisMonth || 0;
  const maxAi = sub.limits?.aiAnalysesPerMonth || 50;

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Company Workspace"
        title="Subscription & Billing"
        description="Manage your hiring capacity, active job posting allowances, team seats, and invoices."
      />

      {/* Current Active Plan Banner & Quota Usage */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/70 via-white to-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-brand-600 p-2 text-white">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-ink-950">{currentPlan.name || "Starter"} Plan</h2>
                  <Badge tone="success">Active</Badge>
                </div>
                <p className="text-xs text-ink-500">
                  Renews on {formatDate(sub.currentPeriodEnd)} · ₹{(currentPlan.priceInr || 999).toLocaleString("en-IN")}/month
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Quota Progress Bars */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-600">
              <span className="flex items-center gap-1.5">
                <BriefcaseBusiness className="h-4 w-4 text-brand-600" /> Active Jobs
              </span>
              <span>
                {activeJobs} / {maxJobs}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full transition-all ${
                  activeJobs >= maxJobs ? "bg-danger-500" : "bg-brand-600"
                }`}
                style={{ width: `${Math.min((activeJobs / maxJobs) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-600">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-brand-600" /> Team Members
              </span>
              <span>
                {teamMembers} / {maxTeam}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full transition-all ${
                  teamMembers >= maxTeam ? "bg-amber-500" : "bg-brand-600"
                }`}
                style={{ width: `${Math.min((teamMembers / maxTeam) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-600">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-brand-600" /> Monthly AI Matches
              </span>
              <span>
                {aiUsed} / {maxAi}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min((aiUsed / maxAi) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans Comparison Cards */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-bold text-ink-950">Available Hiring Plans</h3>
          <p className="text-xs text-ink-500">Upgrade or scale your plan as your engineering organization grows</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = sub.planTier === p.tier;
            return (
              <div
                key={p.tier}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm transition-all ${
                  p.highlight ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-ink-900">{p.name}</h4>
                    {p.highlight && <Badge tone="brand">Most Popular</Badge>}
                    {isCurrent && <Badge tone="success">Current Plan</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{p.description}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-ink-950">₹{p.priceInr.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-ink-500">/ month</span>
                  </div>

                  <hr className="my-5 border-ink-100" />

                  <ul className="space-y-2.5 text-xs text-ink-700">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full cursor-default" disabled>
                      Active Plan
                    </Button>
                  ) : (
                    <Button
                      variant={p.highlight ? "primary" : "outline"}
                      className="w-full"
                      onClick={() => handleOpenUpgrade(p)}
                    >
                      {p.priceInr > (currentPlan.priceInr || 0) ? "Upgrade Plan" : "Switch Plan"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment History & Invoices Table */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-sm">
        <div className="border-b border-ink-100 p-6">
          <h3 className="text-base font-bold text-ink-900">Billing History & Invoices</h3>
          <p className="text-xs text-ink-500">Download GST tax receipts for accounting</p>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-400">No previous billing transactions recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500">
                <tr>
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Plan Tier</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-800">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-ink-50/50">
                    <td className="px-6 py-4 font-mono text-xs font-bold text-ink-900">
                      {inv.invoiceNumber || inv.transactionNumber}
                    </td>
                    <td className="px-6 py-4 text-xs text-ink-500">{formatDate(inv.createdAt)}</td>
                    <td className="px-6 py-4 capitalize">{inv.planTier?.replace("_", " ")}</td>
                    <td className="px-6 py-4 font-bold text-ink-900">₹{inv.amount?.toLocaleString("en-IN")}</td>
                    <td className="px-6 py-4">
                      <Badge tone={inv.status === "captured" ? "success" : "warning"}>{inv.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Download className="h-3.5 w-3.5" />}
                        onClick={() => {
                          toast.success(`Receipt ${inv.invoiceNumber} downloaded.`);
                        }}
                      >
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {selectedPlan && (
        <Modal
          open={Boolean(selectedPlan)}
          onClose={() => {
            setSelectedPlan(null);
            setCheckoutData(null);
          }}
          title={`Upgrade to ${selectedPlan.name} Plan`}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-ink-950">{selectedPlan.name} Subscription</h4>
                  <p className="text-xs text-ink-500">Monthly billing · Full feature unlock</p>
                </div>
                <span className="text-2xl font-extrabold text-brand-700">
                  ₹{selectedPlan.priceInr.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-ink-600">
              <p className="font-semibold text-ink-900">What's included immediately:</p>
              <ul className="space-y-1.5">
                {selectedPlan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {checkoutData?.order?.mode === "simulation" && (
              <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <span className="font-bold">Sandbox Test Mode Active:</span> Zero-risk immediate test verification.
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedPlan(null);
                  setCheckoutData(null);
                }}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmPayment}
                loading={processing || checkoutMutation.isPending}
              >
                Confirm & Pay ₹{selectedPlan.priceInr.toLocaleString("en-IN")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
