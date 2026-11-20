import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OffersDashboard from "./OffersDashboard";

const mocks = vi.hoisted(() => ({
  offers: vi.fn(),
  orgApplications: vi.fn(),
  issueOffer: vi.fn(),
  withdrawOffer: vi.fn(),
  transition: vi.fn(),
  jobs: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Rohan Mehta", email: "rohan@apex.example" },
    role: "recruiter",
    organizationId: "org-apex-1",
    organizations: [{ id: "org-apex-1", name: "Apex Innovations", role: "owner" }],
    membership: { role: "owner" },
    isAuthenticated: true,
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../lib/api", () => ({
  recruitmentApi: {
    offers: (...args) => mocks.offers(...args),
    orgApplications: (...args) => mocks.orgApplications(...args),
    issueOffer: (...args) => mocks.issueOffer(...args),
    withdrawOffer: (...args) => mocks.withdrawOffer(...args),
    transition: (...args) => mocks.transition(...args),
  },
  jobsApi: {
    orgList: (...args) => mocks.jobs(...args),
  },
}));

const mockJobs = [
  { _id: "job-1", title: "Senior Backend Engineer", company: "Apex Innovations" },
  { _id: "job-2", title: "Product Designer", company: "Apex Innovations" },
];

const mockApplications = [
  {
    _id: "app-1",
    status: "offer",
    candidate: { _id: "cand-1", name: "Aarav Sharma", email: "aarav@example.com", phone: "+91 9876543210" },
    job: { _id: "job-1", title: "Senior Backend Engineer" },
    offer: {
      status: "issued",
      designation: "Lead Backend Engineer",
      ctc: 2400000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 2000000,
      bonus: 400000,
      employmentType: "full_time",
      joiningDate: "2026-12-01T09:00:00.000Z",
      expiresAt: "2026-11-30T18:00:00.000Z",
      notes: "Standard equity vesting schedule.",
      issuedAt: "2026-11-15T10:00:00.000Z",
    },
  },
  {
    _id: "app-2",
    status: "offer",
    candidate: { _id: "cand-2", name: "Diya Patel", email: "diya@example.com", phone: "+91 9811122233" },
    job: { _id: "job-2", title: "Product Designer" },
    offer: {
      status: "accepted",
      designation: "Senior Product Designer",
      ctc: 1800000,
      currency: "INR",
      payFrequency: "annual",
      baseSalary: 1600000,
      bonus: 200000,
      employmentType: "full_time",
      joiningDate: "2026-12-15T09:00:00.000Z",
      expiresAt: "2026-11-20T18:00:00.000Z",
      respondedAt: "2026-11-16T14:30:00.000Z",
      responseNote: "Excited to join the team!",
      issuedAt: "2026-11-10T10:00:00.000Z",
    },
  },
  {
    _id: "app-3",
    status: "interview",
    candidate: { _id: "cand-3", name: "Kunal Verma", email: "kunal@example.com" },
    job: { _id: "job-1", title: "Senior Backend Engineer" },
    offer: {
      status: "draft",
      designation: "Staff Backend Engineer",
      ctc: 3200000,
      currency: "INR",
      payFrequency: "annual",
      employmentType: "full_time",
      joiningDate: "2027-01-05T09:00:00.000Z",
      draftSavedAt: "2026-11-17T10:00:00.000Z",
    },
  },
  {
    _id: "app-4",
    status: "offer",
    candidate: { _id: "cand-4", name: "Ananya Roy", email: "ananya@example.com" },
    job: { _id: "job-1", title: "Senior Backend Engineer" },
    offer: {
      status: "declined",
      designation: "Senior Backend Engineer",
      ctc: 2100000,
      currency: "INR",
      payFrequency: "annual",
      respondedAt: "2026-11-12T10:00:00.000Z",
      responseNote: "Accepted another counter-offer.",
    },
  },
  {
    _id: "app-5",
    status: "offer",
    candidate: { _id: "cand-5", name: "Vikram Sen", email: "vikram@example.com" },
    job: { _id: "job-2", title: "Product Designer" },
    offer: {
      status: "expired",
      designation: "Product Designer",
      ctc: 1500000,
      currency: "INR",
      payFrequency: "annual",
      expiresAt: "2026-11-01T10:00:00.000Z",
    },
  },
];

const renderWithProviders = (initialRoute = "/app/o/org-apex-1/offers") => {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/app/o/:organizationId/offers" element={<OffersDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  mocks.jobs.mockResolvedValue({ success: true, data: mockJobs });
  mocks.offers.mockImplementation((orgId, params) => {
    let filtered = [...mockApplications];
    if (params?.status === "accepted") {
      filtered = filtered.filter((a) => a.offer?.status === "accepted");
    }
    return Promise.resolve({
      success: true,
      data: filtered,
      meta: {
        counts: {
          total: 5,
          drafts: 1,
          awaitingResponse: 1,
          accepted: 1,
          declined: 1,
          expired: 1,
        },
      },
    });
  });
  mocks.orgApplications.mockResolvedValue({
    success: true,
    data: mockApplications,
  });
  mocks.issueOffer.mockResolvedValue({ success: true });
  mocks.withdrawOffer.mockResolvedValue({ success: true });
  mocks.transition.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OffersDashboard & Hiring Management", () => {
  it("renders page header and 6 KPI status cards with correct counts", async () => {
    renderWithProviders();

    expect(screen.getByRole("heading", { name: /Offer management/i })).toBeTruthy();
    expect(screen.getByText("Total Offers")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-total-offers")).toHaveTextContent("5");
      expect(screen.getByTestId("kpi-drafts")).toHaveTextContent("1");
      expect(screen.getByTestId("kpi-awaiting-response")).toHaveTextContent("1");
      expect(screen.getByTestId("kpi-accepted")).toHaveTextContent("1");
      expect(screen.getByTestId("kpi-declined")).toHaveTextContent("1");
      expect(screen.getByTestId("kpi-expired")).toHaveTextContent("1");
    });
  });

  it("lists all candidate offers with compensation and status badges", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Aarav Sharma")).toBeTruthy();
      expect(screen.getByText("Diya Patel")).toBeTruthy();
      expect(screen.getByText("Kunal Verma")).toBeTruthy();
      expect(screen.getByText("Ananya Roy")).toBeTruthy();
      expect(screen.getByText("Vikram Sen")).toBeTruthy();
    });

    // Compensation formatting (INR ₹24,00,000 / yr)
    expect(screen.getByText("₹24,00,000 / yr")).toBeTruthy();
    expect(screen.getByText("₹18,00,000 / yr")).toBeTruthy();

    // Status badges
    expect(screen.getByText("Awaiting Response")).toBeTruthy();
    expect(screen.getAllByText("Accepted").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Draft").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Declined").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Expired").length).toBeGreaterThanOrEqual(1);
  });

  it("filters candidate offers by search term", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Aarav Sharma")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/Candidate, job or designation/i);
    fireEvent.change(searchInput, { target: { value: "Diya" } });

    expect(screen.getByText("Diya Patel")).toBeTruthy();
    expect(screen.queryByText("Aarav Sharma")).toBeNull();
    expect(screen.queryByText("Kunal Verma")).toBeNull();
  });

  it("filters candidate offers by clicking a KPI card", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Aarav Sharma")).toBeTruthy();
    });

    // Click Accepted KPI card
    const acceptedCard = screen.getByTestId("kpi-accepted");
    fireEvent.click(acceptedCard);

    await waitFor(() => {
      expect(screen.getByText("Diya Patel")).toBeTruthy();
      expect(screen.queryByText("Aarav Sharma")).toBeNull();
      expect(screen.queryByText("Kunal Verma")).toBeNull();
    });
  });

  it("opens Create Offer Modal, fills proposal details, and saves as draft", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const createBtn = screen.getByRole("button", { name: /^Create Offer$/i });
    await user.click(createBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Create Offer Proposal/i })).toBeTruthy();
    });

    // Select job via combobox
    const jobCombobox = screen.getByLabelText(/Job Requisition/i);
    await user.click(jobCombobox);
    const jobOption = await screen.findByRole("option", { name: /Senior Backend Engineer/i });
    await user.click(jobOption);

    // Wait for candidate options to be available, then select candidate
    const appCombobox = screen.getByLabelText(/Eligible Candidate/i);
    await user.click(appCombobox);
    const candOption = await screen.findByRole("option", { name: /Kunal Verma/i });
    await user.click(candOption);

    // Enter compensation
    const ctcInput = screen.getByLabelText(/Total CTC/i);
    await user.type(ctcInput, "2800000");

    // Save as draft
    const draftBtn = screen.getByRole("button", { name: /Save as Draft/i });
    await user.click(draftBtn);

    await waitFor(() => {
      expect(mocks.issueOffer).toHaveBeenCalledWith("org-apex-1", "app-3", expect.objectContaining({
        isDraft: true,
        ctc: 2800000,
      }));
    });
  });

  it("opens Offer Detail Drawer and allows recruiter to finalize hire for accepted offer", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Diya Patel")).toBeTruthy();
    });

    // Click Diya's row
    const row = screen.getByText("Diya Patel").closest("tr");
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Offer & Hiring Workspace/i })).toBeTruthy();
      expect(screen.getByText(/Offer Accepted by Candidate/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Finalize Hire & Create Placement/i })).toBeTruthy();
    });

    // Click Finalize Hire
    const finalizeBtn = screen.getByRole("button", { name: /Finalize Hire & Create Placement/i });
    fireEvent.click(finalizeBtn);

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Confirm Candidate Hire/i })).toBeTruthy();
    });

    // Confirm hire
    const confirmHireBtn = screen.getByRole("button", { name: /Confirm Hire/i });
    fireEvent.click(confirmHireBtn);

    await waitFor(() => {
      expect(mocks.transition).toHaveBeenCalledWith("org-apex-1", "app-2", { toStatus: "hired" });
    });
  });

  it("opens Offer Detail Drawer and allows recruiter to withdraw an awaiting offer with a reason", async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("Aarav Sharma")).toBeTruthy();
    });

    // Click Aarav's row (awaiting response)
    const row = screen.getByText("Aarav Sharma").closest("tr");
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Offer & Hiring Workspace/i })).toBeTruthy();
      expect(screen.getByText(/Awaiting Candidate Decision/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Withdraw Offer/i })).toBeTruthy();
    });

    // Click Withdraw
    const withdrawBtn = screen.getByRole("button", { name: /Withdraw Offer/i });
    fireEvent.click(withdrawBtn);

    // Enter withdrawal reason in modal
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Withdraw Offer Proposal/i })).toBeTruthy();
    });

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Headcount freeze, requirement revised\.\.\./i);
    fireEvent.change(reasonInput, { target: { value: "Requisition headcount frozen by leadership" } });

    const confirmWithdrawBtn = screen.getByRole("button", { name: /Confirm Withdrawal/i });
    fireEvent.click(confirmWithdrawBtn);

    await waitFor(() => {
      expect(mocks.withdrawOffer).toHaveBeenCalledWith(
        "org-apex-1",
        "app-1",
        "Requisition headcount frozen by leadership"
      );
    });
  });
});
