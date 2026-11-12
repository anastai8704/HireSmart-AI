import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  placementCompanies: vi.fn(),
  placementCompanyJobs: vi.fn(),
  placements: vi.fn(),
  placementDetail: vi.fn(),
  placementCandidateProfile: vi.fn(),
  verifyPlacement: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ adminApi: api }));
vi.mock("../../components/ui/useToast", () => {
  const toast = { success: () => {}, error: () => {} };
  return { default: () => toast, useToast: () => toast };
});

import { AdminPlacements, AdminPlacementDetail } from "./AdminPlacements";

const company = {
  organization: { id: "org-a", name: "Acme Hiring", slug: "acme" },
  counts: { total: 2, hired: 0, currentlyWorking: 1, employmentEnded: 0, verified: 1, reportedNotVerified: 1 },
};
const job = { job: { id: "job-1", title: "Backend Engineer", location: "Pune" }, counts: { total: 2, verified: 1, currentlyWorking: 1 } };
const placement = (over = {}) => ({
  _id: "pl-1",
  candidate: { name: "Asha Rao", email: "asha@example.com" },
  job: { title: "Backend Engineer" },
  status: "currently_working",
  employmentStatusSource: "candidate_reported",
  verification: { isVerified: false },
  updatedAt: "2026-10-02T04:00:00Z",
  ...over,
});

const renderAt = (path, element) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/admin/placements" element={<AdminPlacements />} />
          <Route path="/app/admin/placements/:placementId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("Admin placements: company → job → candidate", () => {
  it("loads no placements until a company is chosen, then only that job's hires", async () => {
    api.placementCompanies.mockResolvedValue({ data: [company] });
    api.placementCompanyJobs.mockResolvedValue({ data: [job] });
    api.placements.mockResolvedValue({ data: [placement()] });
    renderAt("/app/admin/placements", <AdminPlacementDetail />);

    fireEvent.click(await screen.findByRole("button", { name: /Acme Hiring/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Backend Engineer \(2\)/ }));

    await waitFor(() =>
      expect(api.placements).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "org-a", jobId: "job-1" })),
    );
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("Reported by candidate")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /hired candidates/i })).toHaveTextContent("Not verified");
  });

  it("does not request placements before a company is selected", async () => {
    api.placementCompanies.mockResolvedValue({ data: [company] });
    renderAt("/app/admin/placements", <AdminPlacementDetail />);
    expect(await screen.findByText(/Select a company/i)).toBeInTheDocument();
    expect(api.placements).not.toHaveBeenCalled();
  });
});

describe("Admin placement detail", () => {
  const detail = {
    placement: {
      _id: "pl-1",
      status: "employment_ended",
      organization: { name: "Acme Hiring" },
      job: { title: "Backend Engineer" },
      candidate: { name: "Asha Rao", email: "asha@example.com" },
      employmentFacts: {
        reported: { status: "employment_ended", source: "candidate_reported" },
        verified: { isVerified: true, verifiedAt: "2026-10-05T04:00:00Z", verifiedBy: "Platform Admin" },
      },
      verification: { isVerified: true, verifiedAt: "2026-10-05T04:00:00Z", verifiedBy: { name: "Platform Admin" } },
      employmentPeriod: { startDate: "2026-09-01T00:00:00Z", endDate: "2026-10-01T00:00:00Z" },
      employmentHistory: [
        { event: "placement_created", toStatus: "hired", source: "platform_reported", at: "2026-08-20T00:00:00Z" },
        { event: "employment_reported", fromStatus: "hired", toStatus: "currently_working", source: "candidate_reported", at: "2026-09-01T00:00:00Z" },
        { event: "employment_reported", fromStatus: "currently_working", toStatus: "employment_ended", source: "candidate_reported", at: "2026-10-01T00:00:00Z", note: "Relocated" },
        { event: "placement_verified", fromStatus: "employment_ended", toStatus: "employment_ended", source: "platform_reported", at: "2026-10-05T00:00:00Z" },
      ],
    },
    application: { id: "app-1", status: "hired", appliedAt: "2026-08-01T00:00:00Z", jobTitle: "Backend Engineer", statusHistory: [] },
  };

  it("keeps every employment event and shows reported and verified facts separately", async () => {
    api.placementDetail.mockResolvedValue({ data: detail });
    renderAt("/app/admin/placements/pl-1", <AdminPlacementDetail />);

    const history = await screen.findByRole("list", { name: /employment history/i });
    expect(history.querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByText("Reported by candidate")).toBeInTheDocument();
    expect(screen.getByText("Platform verified")).toBeInTheDocument();
    expect(screen.getByText("Relocated")).toBeInTheDocument();
  });

  it("does not load the candidate profile until the admin asks, and says the view is audited", async () => {
    api.placementDetail.mockResolvedValue({ data: detail });
    api.placementCandidateProfile.mockResolvedValue({
      data: {
        candidate: { id: "c1", name: "Asha Rao", email: "asha@example.com" },
        skills: ["Node.js"],
        profile: { education: [{ degree: "B.Tech", institution: "COEP" }], experience: [], projects: [], certifications: [] },
        applicationHistory: [],
      },
    });
    renderAt("/app/admin/placements/pl-1", <AdminPlacementDetail />);

    await screen.findByRole("list", { name: /employment history/i });
    expect(api.placementCandidateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/recorded in the audit log/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view candidate profile/i }));
    expect(await screen.findByText("Node.js")).toBeInTheDocument();
    expect(api.placementCandidateProfile).toHaveBeenCalledWith("pl-1");
  });

  it("offers verification as a separate action, and no verify button once verified", async () => {
    api.placementDetail.mockResolvedValue({ data: { ...detail, placement: { ...detail.placement, verification: { isVerified: false } } } });
    renderAt("/app/admin/placements/pl-1", <AdminPlacementDetail />);
    const verifyBtn = await screen.findByRole("button", { name: /verify placement/i });
    expect(verifyBtn).toBeEnabled();
    fireEvent.click(verifyBtn);
    await waitFor(() => expect(api.verifyPlacement).toHaveBeenCalledWith("pl-1", { adminRemarks: "" }));
  });
});
