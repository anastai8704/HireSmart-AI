import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { adminApi } = vi.hoisted(() => ({ adminApi: {} }));

vi.mock("../../lib/api", () => ({ adminApi }));
vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

import { AdminModeration } from "./AdminModeration";

const company = {
  organizationId: "o1",
  _id: "o1",
  companyName: "Meridian Cloud",
  companySlug: "meridian",
  verificationStatus: "verified",
  riskScore: 10,
  riskFlags: [],
  jobCounts: { total: 2, pending: 2, eligible: 2, approved: 0, rejected: 0 },
  latestSubmission: "2026-09-04T10:00:00Z",
  jobs: [
    { id: "j1", title: "Backend Engineer", location: "Pune", workplaceMode: "remote", status: "published", moderation: { status: "pending" }, changeReview: { status: null } },
    { id: "j2", title: "Data Engineer", location: "Pune", workplaceMode: "hybrid", status: "published", moderation: { status: "pending" }, changeReview: { status: null } },
  ],
};

const companyJobs = {
  data: {
    organization: { id: "o1", name: "Meridian Cloud", verificationStatus: "verified", verificationCase: null },
    jobs: [
      { id: "j1", title: "Backend Engineer", location: "Pune", workplaceMode: "remote", salaryInrLpa: "12.0 LPA", applicationCount: 3, status: "published", moderation: { status: "pending" }, needsReview: true, changeReview: null, recruiter: { id: "r1", name: "Asha" }, createdAt: "2026-09-04T10:00:00Z" },
      { id: "j2", title: "Data Engineer", location: "Pune", workplaceMode: "hybrid", salaryInrLpa: "10.0 LPA", applicationCount: 0, status: "published", moderation: { status: "pending" }, needsReview: true, changeReview: null, recruiter: { id: "r1", name: "Asha" }, createdAt: "2026-09-05T10:00:00Z" },
    ],
  },
  meta: { total: 2, returned: 2, truncated: false },
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/moderation"]}>
        <AdminModeration />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  adminApi.moderationCompanies = vi.fn(() => Promise.resolve({ data: [company], meta: { total: 1 } }));
  adminApi.companyModerationJobs = vi.fn(() => Promise.resolve(companyJobs));
  adminApi.moderationJobDetail = vi.fn();
  adminApi.orgVerificationDetails = vi.fn();
  adminApi.moderate = vi.fn(() => Promise.resolve({ data: {} }));
  adminApi.bulkApproveJobs = vi.fn();
  adminApi.bulkModerate = vi.fn(() =>
    Promise.resolve({
      data: {
        batchId: "b1",
        action: "approve",
        summary: { requested: 2, succeeded: 1, skipped: 1, failed: 0, duplicatesRemoved: 0 },
        results: [
          { jobId: "j1", title: "Backend Engineer", company: "Meridian Cloud", outcome: "approved", code: null, message: "approved" },
          { jobId: "j2", title: "Data Engineer", company: "Meridian Cloud", outcome: "skipped", code: "COMPANY_NOT_VERIFIED", message: "The company is under_review" },
        ],
      },
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminModeration (Phase 3)", () => {
  it("shows a partial bulk result with the reason for every job that was not changed", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("View All Jobs (2)"));
    fireEvent.click(await screen.findByLabelText("Select Backend Engineer"));
    fireEvent.click(screen.getByLabelText("Select Data Engineer"));
    fireEvent.click(screen.getByText("Approve selected (2)"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm approve" }));

    expect(await screen.findByTestId("bulk-summary")).toHaveTextContent("2 selected · 1 succeeded · 1 skipped · 0 failed");
    expect(screen.getByText(/Partial result: some jobs were not changed/)).toBeInTheDocument();
    expect(screen.getByText("The company is not verified")).toBeInTheDocument();
    expect(adminApi.bulkModerate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "approve", jobIds: ["j1", "j2"], organizationId: "o1" }),
    );
  });

  it("requires a reason of at least 3 characters before a rejection is sent", async () => {
    renderPage();
    await screen.findByText("Backend Engineer");
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm reject" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please give a reason of at least 3 characters.");
    expect(adminApi.moderate).not.toHaveBeenCalled();
  });

  it("shows an error state when the moderation list cannot be loaded", async () => {
    adminApi.moderationCompanies = vi.fn(() => Promise.reject(new Error("Service unavailable")));
    renderPage();
    expect(await screen.findByText("Could not load moderation")).toBeInTheDocument();
  });

  it("shows an empty state when no company has listings to review", async () => {
    adminApi.moderationCompanies = vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } }));
    renderPage();
    expect(await screen.findByText("No job listings to moderate")).toBeInTheDocument();
    await waitFor(() => expect(adminApi.moderationCompanies).toHaveBeenCalled());
  });
});
