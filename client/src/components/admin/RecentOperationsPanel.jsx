// Recent operations (Requirement 7): five short, read-only lists for the admin control center.
// Dates are shown in Asia/Kolkata (DD MMM YYYY). Empty lists say so instead of showing blank space.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { adminApi } from "../../lib/api";
import { EMPLOYMENT_STATUS_LABELS, fmtIst } from "../../lib/revenueFormat";
import { formatDate } from "../../lib/utils";
import { ErrorState, LoadingState } from "../ui/States";

const List = ({ title, empty, items, render, footer }) => (
  <section aria-label={title} className="space-y-2">
    <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
    {items.length === 0 ? (
      <p className="text-xs text-ink-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.id} className="py-2 text-sm">
            {render(item)}
          </li>
        ))}
      </ul>
    )}
    {footer}
  </section>
);

export const RecentOperationsPanel = () => {
  const query = useQuery({
    queryKey: ["admin-recent-operations"],
    queryFn: () => adminApi.recentOperations(),
    retry: false,
  });

  if (query.isLoading) return <LoadingState message="Loading recent operations…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const data = query.data?.data || {};
  const {
    companies = [],
    jobPostings = [],
    upcomingInterviews = [],
    placementUpdates = [],
    payments = [],
  } = data;

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <List
        title="New companies"
        empty="No companies have registered yet."
        items={companies}
        footer={<Link to="/app/admin/organizations" className="text-xs font-semibold text-brand-700 hover:underline">All companies</Link>}
        render={(c) => (
          <span>
            <Link to={`/app/admin/organizations/${c.id}`} className="font-medium text-ink-900 hover:underline">{c.name}</Link>
            <span className="block text-xs text-ink-500">{c.verificationStatus} · {formatDate(c.createdAt)}</span>
          </span>
        )}
      />
      <List
        title="Recent job postings"
        empty="No job postings yet."
        items={jobPostings}
        render={(j) => (
          <span>
            <span className="font-medium text-ink-900">{j.title || "Untitled job"}</span>
            <span className="block text-xs text-ink-500">{j.organizationName || "Company"} · {j.status} · {formatDate(j.createdAt)}</span>
          </span>
        )}
      />
      <List
        title="Upcoming interviews"
        empty="No upcoming interviews."
        items={upcomingInterviews}
        render={(i) => (
          <span>
            <span className="font-medium text-ink-900">{i.jobTitle || "Interview"}</span>
            <span className="block text-xs text-ink-500">{i.organizationName || "Company"} · {fmtIst(i.scheduledStart)} · {i.status}</span>
          </span>
        )}
      />
      <List
        title="Placement updates"
        empty="No placement updates yet."
        items={placementUpdates}
        render={(p) => (
          <span>
            <span className="font-medium text-ink-900">{EMPLOYMENT_STATUS_LABELS[p.employmentStatus] || "Not recorded yet"}</span>
            <span className="block text-xs text-ink-500">{p.organizationName || "Company"} · {p.jobTitle || "Job"} · {formatDate(p.updatedAt)}</span>
          </span>
        )}
      />
      <List
        title="Recent payments"
        empty="No captured Razorpay payments yet."
        items={payments}
        footer={<Link to="/app/admin/revenue" className="text-xs font-semibold text-brand-700 hover:underline">Revenue and plans</Link>}
        render={(t) => (
          <span>
            <span className="font-medium text-ink-900">{t.transactionNumber || "Payment"}</span>
            <span className="block text-xs text-ink-500">
              ₹{Number(t.amount || 0).toLocaleString("en-IN")} {t.currency} · {t.mode === "live" ? "Live" : "Test"} · {t.status} · {formatDate(t.createdAt)}
            </span>
          </span>
        )}
      />
    </div>
  );
};
