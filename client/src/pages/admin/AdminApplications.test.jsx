import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminApplications } from "./AdminApplications";

const mocks = vi.hoisted(() => ({
  applications: vi.fn(),
  applicationDetail: vi.fn(),
  candidate360: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  adminApi: {
    applications: (...args) => mocks.applications(...args),
    applicationDetail: (...args) => mocks.applicationDetail(...args),
    candidate360: (...args) => mocks.candidate360(...args),
  },
  downloadBlob: vi.fn(),
}));

afterEach(cleanup);

describe("AdminApplications Component", () => {
  const mockAppsResponse = {
    data: [
      {
        _id: "app123",
        status: "interview",
        appliedAt: "2026-03-01T10:00:00.000Z",
        matchScore: 88,
        candidate: {
          _id: "cand123",
          name: "Rohan Verma",
          email: "rohan@example.test",
          location: "Pune, India",
        },
        job: {
          _id: "job123",
          title: "Senior Cloud Engineer",
          workplaceMode: "remote",
        },
        organization: {
          _id: "org123",
          name: "Apex Cloud Systems",
          verificationStatus: "verified",
        },
        offer: {
          status: "issued",
          ctc: 3200000,
          currency: "INR",
        },
      },
    ],
    meta: {
      total: 1,
      counts: {
        total: 1,
        underReview: 0,
        shortlisted: 0,
        interview: 1,
        offer: 1,
        hired: 0,
        rejected: 0,
      },
    },
  };

  const mockDetailResponse = {
    data: {
      _id: "app123",
      status: "interview",
      appliedAt: "2026-03-01T10:00:00.000Z",
      candidate: {
        _id: "cand123",
        name: "Rohan Verma",
        email: "rohan@example.test",
      },
      job: {
        _id: "job123",
        title: "Senior Cloud Engineer",
      },
      organization: {
        _id: "org123",
        name: "Apex Cloud Systems",
      },
      statusHistory: [
        {
          status: "Applied",
          changedAt: "2026-03-01T10:00:00.000Z",
          changedBy: { name: "Rohan Verma", role: "candidate" },
        },
        {
          status: "interview",
          fromStatus: "Applied",
          changedAt: "2026-03-02T12:00:00.000Z",
          changedBy: { name: "Recruiter One", role: "recruiter" },
          note: "Passed initial technical screening",
        },
      ],
      offer: {
        status: "issued",
        designation: "Senior Cloud Engineer",
        ctc: 3200000,
        currency: "INR",
        joiningDate: "2026-04-01T00:00:00.000Z",
      },
      screeningAnswers: [
        { question: "Years of experience?", answer: "7 years" },
      ],
      recruiterNotes: "Strong candidate with multi-cloud experience.",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applications.mockResolvedValue(mockAppsResponse);
    mocks.applicationDetail.mockResolvedValue(mockDetailResponse);
  });

  const renderComponent = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AdminApplications />
      </QueryClientProvider>
    );
  };

  it("renders KPI cards and application rows", async () => {
    renderComponent();

    // Check KPI cards
    expect(await screen.findByText("Total Apps")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();

    // Check application row
    expect(await screen.findByText("Rohan Verma")).toBeInTheDocument();
    expect(screen.getByText("Senior Cloud Engineer")).toBeInTheDocument();
    expect(screen.getByText("Apex Cloud Systems")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("opens application detail modal with pipeline history and offer", async () => {
    renderComponent();

    const reviewBtn = await screen.findByRole("button", { name: /Review/i });
    fireEvent.click(reviewBtn);

    expect(await screen.findByText("Application Oversight & Pipeline History")).toBeInTheDocument();
    expect(await screen.findByText(/Passed initial technical screening/i)).toBeInTheDocument();
    expect(screen.getByText("Offer Milestone & Terms")).toBeInTheDocument();
    expect(screen.getByText(/Years of experience\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong candidate with multi-cloud experience/i)).toBeInTheDocument();
  });

  it("supports searching and status filtering", async () => {
    renderComponent();

    const searchInput = await screen.findByLabelText("Search applications");
    fireEvent.change(searchInput, { target: { value: "Rohan" } });

    await waitFor(() => {
      expect(mocks.applications).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Rohan" })
      );
    });

    const statusInput = screen.getByLabelText("Filter by status");
    fireEvent.mouseDown(statusInput);
    const option = await screen.findByRole("option", { name: "Interview" });
    fireEvent.mouseDown(option);

    await waitFor(() => {
      expect(mocks.applications).toHaveBeenCalledWith(
        expect.objectContaining({ status: "interview" })
      );
    });
  });
});
