import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminVerificationReview from "./AdminVerificationReview";

const { verificationApi } = vi.hoisted(() => ({
  verificationApi: { adminQueue: vi.fn(), adminCase: vi.fn() },
}));

vi.mock("../../lib/api", () => ({
  verificationApi,
  downloadBlob: vi.fn(),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

const renderQueue = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/verification"]}>
        <AdminVerificationReview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminVerificationReview queue", () => {
  it("lists cases with risk level, missing checks and duplicate flags, without treating risk as proof", async () => {
    verificationApi.adminQueue.mockResolvedValue({
      data: [
        {
          id: "case-1",
          organization: { name: "Acme Verify Pvt Ltd" },
          submittedAt: "2026-11-01T10:00:00.000Z",
          risk: { level: "elevated", requiresManualReview: true },
          missing: ["business_registration"],
          duplicateCount: 1,
          changeRequestActive: false,
        },
      ],
    });

    renderQueue();

    expect(await screen.findByText("Acme Verify Pvt Ltd")).toBeTruthy();
    expect(screen.getByText("Risk: elevated")).toBeTruthy();
    expect(screen.getByText("1 check(s) missing")).toBeTruthy();
    expect(screen.getByText("Possible duplicate")).toBeTruthy();
    expect(screen.queryByText(/fraud/i)).toBeNull();
    expect(verificationApi.adminQueue).toHaveBeenCalledWith(expect.objectContaining({ status: "under_review", limit: 50 }));
  });

  it("shows an empty state when no case matches the filters", async () => {
    verificationApi.adminQueue.mockResolvedValue({ data: [] });

    renderQueue();

    expect(await screen.findByText("No cases match these filters.")).toBeTruthy();
  });
});
