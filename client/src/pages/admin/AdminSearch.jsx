// Admin global search (Requirement 7). Reads ?q= from the header search box and searches companies and users
// with the same endpoints the admin lists use. Results link to the record's page. Read-only.
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import Badge from "../../components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States";
import { PageHeader } from "../../components/Product";
import { adminApi } from "../../lib/api";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatDate } from "../../lib/utils";

const MIN_CHARS = 2;

export const AdminSearch = () => {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim().slice(0, 100);
  const term = useDebouncedValue(q, 200);
  const enabled = term.length >= MIN_CHARS;

  const orgs = useQuery({
    queryKey: ["admin-search-orgs", term],
    queryFn: () => adminApi.organizations({ search: term, limit: 10 }),
    enabled,
    retry: false,
  });
  const users = useQuery({
    queryKey: ["admin-search-users", term],
    queryFn: () => adminApi.users({ search: term, limit: 10 }),
    enabled,
    retry: false,
  });

  const companies = orgs.data?.data || [];
  const people = users.data?.data || [];
  const nothingFound = enabled && !orgs.isLoading && !users.isLoading && companies.length === 0 && people.length === 0;

  return (
    <div>
      <PageHeader eyebrow="Platform administration" title="Search" description={q ? `Results for “${q}”` : "Search companies and users from the header."} />
      {!enabled && <EmptyState title="Type at least two characters" description="Use the search box in the header." />}
      {enabled && (orgs.isLoading || users.isLoading) && <LoadingState message="Searching…" />}
      {enabled && orgs.error && <ErrorState error={orgs.error} onRetry={orgs.refetch} />}
      {enabled && users.error && <ErrorState error={users.error} onRetry={users.refetch} />}
      {nothingFound && <EmptyState title="No matches" description="Try a different name, email, or GSTIN." />}
      {companies.length > 0 && (
        <section aria-label="Companies" className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">Companies</h2>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
            {companies.map((c) => (
              <li key={c._id || c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link to={`/app/admin/organizations/${c._id || c.id}`} className="font-medium text-ink-900 hover:underline">{c.name}</Link>
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <Badge>{c.verificationStatus || "—"}</Badge>
                  {formatDate(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {people.length > 0 && (
        <section aria-label="Users">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">Users</h2>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
            {people.map((u) => (
              <li key={u._id || u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link to="/app/admin/users" className="font-medium text-ink-900 hover:underline">{u.name}</Link>
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <span>{u.email}</span>
                  <Badge>{u.role}</Badge>
                  {formatDate(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default AdminSearch;
