import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPlacements, AdminPlacementDetail } from "./AdminPlacements";

const api = vi.hoisted(() => ({
  placementCompanies: vi.fn(),
  placementCompanyJobs: vi.fn(),
  placements: vi.fn(),
  placementDetail: vi.fn(),
  placementCandidateProfile: vi.fn(),
  verifyPlacement: vi.fn(),
  rejectPlacement: vi.fn(),
  requestPlacementEvidence: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ adminApi: api, placementApi: {} }));
vi.mock("../../components/ui/useToast", () => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { default: () => toast, useToast: () => toast };
});

const renderWithClient = (path, element) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/admin/placements" element={<AdminPlacements />} />
          <Route path="/app/admin/placements/:placementId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("AdminPlacementsOversight Component", () => {
  const mockCompany = {
    organization: { id: "org-1", name: "Starlight Dynamics", slug: "starlight" },
    counts: { total: 3, hired: 1, currentlyWorking: 1, employmentEnded: 1, verified: 2, reportedNotVerified: 1 },
  };

  const mockPlacementDetail = {
    placement: {
      _id: "pl-123",
      status: "joining_confirmed",
      organization: { name: "Starlight Dynamics" },
      job: { title: "Lead AI Researcher" },
      candidate: { name: "Ananya Deshmukh", email: "ananya@starlight.test" },
      offerDetails: {
        designation: "Lead AI Researcher",
        ctc: 4500000,
        currency: "INR",
        acceptedAt: "2026-03-01T10:00:00.000Z",
      },
      joiningConfirmation: {
        confirmedByCandidate: true,
        actualJoiningDate: "2026-03-05T09:00:00.000Z",
      },
      employment: {
        status: "joined_pending_verification",
        lastVerifiedStatus: "offer_accepted",
      },
      employmentFacts: {
        reported: { status: "joined_pending_verification", source: "candidate_reported" },
        verified: { isVerified: false },
      },
      verification: {
        isVerified: false,
        proofDocumentUrl: "https://docs.internal/joining.pdf",
      },
      employmentPeriod: {
        startDate: "2026-03-05T09:00:00.000Z",
      },
      employmentHistory: [
        { event: "placement_created", toStatus: "hired", at: "2026-03-01T10:00:00.000Z" },
      ],
    },
    application: {
      id: "app-123",
      status: "hired",
      appliedAt: "2026-02-15T10:00:00.000Z",
      jobTitle: "Lead AI Researcher",
    },
  };

  beforeEach(() => {
    api.placementCompanies.mockResolvedValue({ data: [mockCompany] });
    api.placementDetail.mockResolvedValue({ data: mockPlacementDetail });
    api.verifyPlacement.mockResolvedValue({ data: { success: true } });
    api.rejectPlacement.mockResolvedValue({ data: { success: true } });
    api.requestPlacementEvidence.mockResolvedValue({ data: { success: true } });
  });

  it("renders 5 placement KPI cards at top of dashboard", async () => {
    renderWithClient("/app/admin/placements", <AdminPlacementDetail />);

    expect(await screen.findByText("Total Placements")).toBeInTheDocument();
    expect(screen.getByText("Pending Verification")).toBeInTheDocument();
    expect(screen.getByText("Platform Verified")).toBeInTheDocument();
    expect(screen.getByText("Currently Working")).toBeInTheDocument();
    expect(screen.getByText("Employment Ended")).toBeInTheDocument();
  });

  it("renders placement compensation, designation, and supporting evidence", async () => {
    renderWithClient("/app/admin/placements/pl-123", <AdminPlacementDetail />);

    expect(await screen.findByText("Placement & Offer Details")).toBeInTheDocument();
    expect(screen.getAllByText("Lead AI Researcher")[0]).toBeInTheDocument();
    expect(screen.getByText(/₹45\.00 L|45,00,000/)).toBeInTheDocument();
    expect(screen.getByText("✓ Joining confirmed by candidate")).toBeInTheDocument();
    expect(screen.getByText("View Evidence Document")).toBeInTheDocument();
  });

  it("renders read-only employment records and status overview without verification mutations", async () => {
    renderWithClient("/app/admin/placements/pl-123", <AdminPlacementDetail />);

    expect(await screen.findByText("Employment Status & Record")).toBeInTheDocument();
    expect(screen.getByText("Employment History")).toBeInTheDocument();
    expect(screen.getByText("Read-only verified placement record. Placement records originate through recruiter offer acceptances and candidate onboarding.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Verify placement/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reject verification/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Request evidence/i })).toBeNull();
  });
});
