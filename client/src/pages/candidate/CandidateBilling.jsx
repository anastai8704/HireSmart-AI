import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Check,
  CheckCircle2,
  Zap,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { subscriptionApi } from "../../lib/api";
import { useToast } from "../../components/ui/useToast";
import { formatDate } from "../../lib/utils";

export const CandidateBilling = () => {
  const toast = useToast();
  const qc = useQueryClient();

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutData, setCheckoutData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const subQuery = useQuery({
    queryKey: ["candidate-subscription"],
    queryFn: () => subscriptionApi.current(),
  });

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: subscriptionApi.plans,
  });

  const invoicesQuery = useQuery({
    queryKey: ["candidate-invoices"],
    queryFn: () => subscriptionApi.invoices(),
  });

  const checkoutMutation = useMutation({
    mutationFn: (planTier) => subscriptionApi.checkout({ planTier }),
    onSuccess: (res) => {
      setCheckoutData(res.data);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to initiate upgrade");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (payload) => subscriptionApi.verifyPayment(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Career Plus unlocked successfully!");
      qc.invalidateQueries({ queryKey: ["candidate-subscription"] });
      qc.invalidateQueries({ queryKey: ["candidate-invoices"] });
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
    return <LoadingState message="Loading your career membership details…" />;
  }

  if (subQuery.error) {
    return <ErrorState error={subQuery.error} onRetry={subQuery.refetch} />;
  }

  const sub = subQuery.data?.data?.subscription || {};
  // Free plans are not sold: they appear only as the current plan.
  const candidatePlans = (plansQuery.data?.data?.candidate || []).filter(
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

  const isCareerPlus = sub.planTier === "candidate_plus";

  return (
    <div className="page-wrap space-y-8">
      <PageHeader
        eyebrow="Career Membership"
        title="Candidate Membership & Plans"
        description="Accelerate your interview callbacks with AI resume enhancement, tailored interview prep, and priority matching."
      />

      {/* Current Active Plan Header */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-white to-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-600 p-2.5 text-white">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-ink-950">
                  {isCareerPlus ? "Career Plus Member" : "Standard Free Plan"}
                </h2>
                <Badge tone={isCareerPlus ? "success" : "ink"}>Active</Badge>
              </div>
              <p className="text-xs text-ink-500">
                {isCareerPlus
                  ? `Unlimited AI matching & career copilot active · Renews ${formatDate(sub.currentPeriodEnd)}`
                  : "You are currently using basic free job application tools."}
              </p>
            </div>
          </div>

          {!isCareerPlus && (
            <Button
              variant="primary"
              leftIcon={<Zap className="h-4 w-4" />}
              onClick={() => handleOpenUpgrade(candidatePlans.find((p) => p.tier === "candidate_plus") || candidatePlans[1])}
            >
              Upgrade to Career Plus (₹149/mo)
            </Button>
          )}
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {candidatePlans.map((p) => {
          const isCurrent = sub.planTier === p.tier;
          const isPlus = p.tier === "candidate_plus";

          return (
            <div
              key={p.tier}
              className={`flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm transition-all ${
                isPlus ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-100"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-ink-950">{p.name}</h3>
                    {isPlus && <Badge tone="brand">Recommended</Badge>}
                  </div>
                  {isCurrent && <Badge tone="success">Current Plan</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-500">{p.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-ink-950">
                    ₹{p.priceInr.toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-ink-500">/ month</span>
                </div>

                <hr className="my-5 border-ink-100" />

                <ul className="space-y-3 text-xs text-ink-700">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" className="w-full cursor-default" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleOpenUpgrade(p)}
                  >
                    Unlock Career Plus (₹149/mo)
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment History & Receipts */}
      {invoices.length > 0 && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-sm">
          <div className="border-b border-ink-100 p-6">
            <h3 className="text-base font-bold text-ink-900">Payment Invoices & Receipts</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50/70 text-xs font-semibold text-ink-500">
                <tr>
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {selectedPlan && (
        <Modal
          open={Boolean(selectedPlan)}
          onClose={() => {
            setSelectedPlan(null);
            setCheckoutData(null);
          }}
          title={`Upgrade to ${selectedPlan.name}`}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-ink-950">{selectedPlan.name} Membership</h4>
                  <p className="text-xs text-ink-500">Instant AI unlock · 30-day billing</p>
                </div>
                <span className="text-2xl font-extrabold text-brand-700">
                  ₹{selectedPlan.priceInr.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-ink-600">
              <p className="font-semibold text-ink-900">Features unlocked instantly:</p>
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
                <span className="font-bold">Test Sandbox Mode:</span> Immediate activation without actual charge.
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
