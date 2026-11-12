import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  recentOperations: vi.fn(),
  organizations: vi.fn(),
  users: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ adminApi: api }));

import { AdminSearch } from "./AdminSearch";
import { RecentOperationsPanel } from "../../components/admin/RecentOperationsPanel";

const renderWith = (path, element) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminSearch", () => {
  it("asks for at least two characters before searching", () => {
    renderWith("/app/admin/search?q=a", <AdminSearch />);
    expect(screen.getByText("Type at least two characters")).toBeTruthy();
    expect(api.organizations).not.toHaveBeenCalled();
  });

  it("shows companies and users that match the term, each linking to its record", async () => {
    api.organizations.mockResolvedValue({ data: [{ _id: "org-1", name: "Meridian Labs", verificationStatus: "approved", createdAt: "2026-10-01T00:00:00Z" }] });
    api.users.mockResolvedValue({ data: [{ _id: "u-1", name: "Asha Rao", email: "asha@example.com", role: "candidate", createdAt: "2026-10-01T00:00:00Z" }] });
    renderWith("/app/admin/search?q=meri", <AdminSearch />);
    const link = await screen.findByRole("link", { name: "Meridian Labs" });
    expect(link.getAttribute("href")).toBe("/app/admin/organizations/org-1");
    expect(screen.getByRole("link", { name: "Asha Rao" })).toBeTruthy();
    expect(api.organizations).toHaveBeenCalledWith(expect.objectContaining({ search: "meri" }));
  });

  it("says when nothing matches", async () => {
    api.organizations.mockResolvedValue({ data: [] });
    api.users.mockResolvedValue({ data: [] });
    renderWith("/app/admin/search?q=zzz", <AdminSearch />);
    expect(await screen.findByText("No matches")).toBeTruthy();
  });
});

describe("RecentOperationsPanel", () => {
  it("renders the five lists with empty messages when there is no activity", async () => {
    api.recentOperations.mockResolvedValue({
      data: { companies: [], jobPostings: [], upcomingInterviews: [], placementUpdates: [], payments: [] },
    });
    renderWith("/", <RecentOperationsPanel />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Upcoming interviews" })).toBeTruthy());
    expect(screen.getByText("No upcoming interviews.")).toBeTruthy();
    expect(screen.getByText("No captured Razorpay payments yet.")).toBeTruthy();
    for (const name of ["New companies", "Recent job postings", "Placement updates", "Recent payments"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
  });

  it("labels test-mode payments as Test and shows a DD MMM YYYY date", async () => {
    api.recentOperations.mockResolvedValue({
      data: {
        companies: [],
        jobPostings: [],
        upcomingInterviews: [],
        placementUpdates: [],
        payments: [{ id: "t1", transactionNumber: "TXN-1", amount: 999, currency: "INR", mode: "test", status: "captured", createdAt: "2026-10-05T06:00:00Z" }],
      },
    });
    renderWith("/", <RecentOperationsPanel />);
    expect(await screen.findByText("TXN-1")).toBeTruthy();
    expect(screen.getByText(/Test · captured · 05 Oct 2026/)).toBeTruthy();
  });
});
