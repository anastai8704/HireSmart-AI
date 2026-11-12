import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  myPlacements: vi.fn(),
  confirmJoining: vi.fn(),
  orgPlacements: vi.fn(),
  updateEmploymentStatus: vi.fn(),
}));
vi.mock("../../lib/api", () => ({ placementApi: api }));
vi.mock("../../components/ui/useToast", () => {
  const toast = { success: () => {}, error: () => {} };
  return { default: () => toast, useToast: () => toast };
});

import { CandidatePlacements, OrganizationPlacements } from "./PlacementsPages";

const base = {
  _id: "pl-1",
  organization: { name: "Acme Hiring" },
  job: { title: "Backend Engineer" },
  offerDetails: { designation: "Backend Engineer" },
  employmentStatusSource: "",
  verification: { isVerified: false },
  employmentPeriod: {},
};

const renderWith = (ui, path = "/") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/app/o/:organizationId/placements" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("Candidate employment reporting", () => {
  it("shows reported status and says the platform has not verified it yet", async () => {
    api.myPlacements.mockResolvedValue({ data: [{ ...base, status: "hired" }] });
    renderWith(<CandidatePlacements />);
    const card = await screen.findByRole("article", { name: /Acme Hiring/ });
    expect(within(card).getByText(/Reported status/)).toBeInTheDocument();
    expect(within(card).getByText("Not yet verified by the platform")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /left this company/i })).toBeNull();
  });

  it("offers to report leaving only while the candidate is working there", async () => {
    api.myPlacements.mockResolvedValue({ data: [{ ...base, status: "currently_working", employmentStatusSource: "candidate_reported" }] });
    renderWith(<CandidatePlacements />);
    const card = await screen.findByRole("article", { name: /Acme Hiring/ });
    expect(within(card).getByRole("button", { name: /I have left this company/i })).toBeInTheDocument();
    expect(within(card).getByText(/Reported by candidate/)).toBeInTheDocument();
  });

  it("records the leaving date through the existing employment-status route, with the placement id", async () => {
    api.myPlacements.mockResolvedValue({ data: [{ ...base, status: "currently_working" }] });
    api.updateEmploymentStatus.mockResolvedValue({ data: {} });
    renderWith(<CandidatePlacements />);
    const card = await screen.findByRole("article", { name: /Acme Hiring/ });
    fireEvent.click(within(card).getByRole("button", { name: /I have left this company/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Last working day/i), { target: { value: "2026-10-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save update/i }));
    await waitFor(() => expect(api.updateEmploymentStatus).toHaveBeenCalledTimes(1));
    const [id, body] = api.updateEmploymentStatus.mock.calls[0];
    expect(id).toBe("pl-1");
    expect(body.status).toBe("employment_ended");
    expect(body.endDate).toMatch(/^2026-09-30T|^2026-10-01T/);
  });
});

describe("Company employment confirmation", () => {
  const rows = [
    { ...base, _id: "pl-1", status: "currently_working", employmentStatusSource: "candidate_reported", candidate: { name: "Asha Rao" } },
    { ...base, _id: "pl-2", status: "hired", candidate: { name: "Ravi Kumar" }, job: { title: "Data Engineer" }, offerDetails: {} },
  ];

  it("shows each hire, the job it was hired for, and reported vs verified state", async () => {
    api.orgPlacements.mockResolvedValue({ data: rows });
    renderWith(<OrganizationPlacements />, "/app/o/org-1/placements");
    const table = await screen.findByRole("table", { name: /company placements/i });
    expect(within(table).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(table).getByText("Data Engineer")).toBeInTheDocument();
    expect(within(table).getAllByText("Not yet verified by the platform")).toHaveLength(2);
  });

  it("records employment ended only for a working hire, after confirmation", async () => {
    api.orgPlacements.mockResolvedValue({ data: rows });
    api.updateEmploymentStatus.mockResolvedValue({ data: {} });
    renderWith(<OrganizationPlacements />, "/app/o/org-1/placements");
    const table = await screen.findByRole("table", { name: /company placements/i });
    const workingRow = within(table).getByText("Asha Rao").closest("tr");
    expect(within(workingRow).queryByRole("button", { name: /Confirm currently working/i })).toBeNull();
    fireEvent.click(within(workingRow).getByRole("button", { name: /Record employment ended/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Record$/ }));
    await waitFor(() => expect(api.updateEmploymentStatus).toHaveBeenCalledWith("pl-1", { status: "employment_ended" }));
  });
});
