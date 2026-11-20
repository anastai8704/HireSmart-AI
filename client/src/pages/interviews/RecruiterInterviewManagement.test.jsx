import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecruiterInterviewDashboard from "./RecruiterInterviewDashboard";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  staffJoin: vi.fn(),
  jobs: vi.fn(),
  googleStatus: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
  retryMeeting: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u_recruiter", displayName: "Rohan Mehta", email: "rohan@apex.example" },
    role: "recruiter",
    organizationId: "org_apex",
    organizations: [{ id: "org_apex", name: "Apex Innovations", role: "recruiter" }],
    membership: { role: "recruiter" },
    isAuthenticated: true,
    setOrganizationId: () => {},
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

vi.mock("../../lib/api", () => ({
  interviewApi: {
    list: (...args) => mocks.list(...args),
    start: (...args) => mocks.start(...args),
    staffJoin: (...args) => mocks.staffJoin(...args),
    update: (...args) => mocks.update(...args),
    cancel: (...args) => mocks.cancel(...args),
    complete: (...args) => mocks.complete(...args),
    retryMeeting: (...args) => mocks.retryMeeting(...args),
  },
  jobsApi: { orgList: (...args) => mocks.jobs(...args) },
  integrationsApi: {
    googleStatus: (...args) => mocks.googleStatus(...args),
  },
}));

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const fixedNow = new Date("2026-11-20T10:00:00.000Z").getTime();
const iso = (ms) => new Date(ms).toISOString();

const mockJobs = [
  { id: "job_frontend", title: "Senior Frontend Engineer" },
  { id: "job_backend", title: "Staff Backend Engineer" },
];

const mockInterviews = () => [
  {
    _id: "int_upcoming_1",
    title: "Technical Coding Round",
    status: "confirmed",
    type: "technical",
    round: 1,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(fixedNow + 2 * HOUR),
    scheduledEnd: iso(fixedNow + 3 * HOUR),
    meetingUrl: "https://meet.google.com/xyz-abcd-efg",
    meetingProvider: "google_meet",
    meetingStatus: "success",
    instructions: "Please be ready with a browser and camera on.",
    candidateConfirmedAt: iso(fixedNow - 2 * HOUR),
    application: {
      job: { id: "job_frontend", title: "Senior Frontend Engineer" },
      candidate: { name: "Ananya Sharma", email: "ananya@example.com" },
    },
    feedback: [],
  },
  {
    _id: "int_upcoming_2",
    title: "System Architecture Round",
    status: "invited",
    type: "video",
    round: 2,
    timezone: "UTC",
    scheduledStart: iso(fixedNow + 2 * DAY),
    scheduledEnd: iso(fixedNow + 2 * DAY + HOUR),
    meetingUrl: "",
    meetingProvider: "none",
    meetingStatus: "setup_required",
    instructions: "System design on distributed cache.",
    candidateConfirmedAt: null,
    application: {
      job: { id: "job_backend", title: "Staff Backend Engineer" },
      candidate: { name: "Vikram Malhotra", email: "vikram@example.com" },
    },
    feedback: [],
  },
  {
    _id: "int_reschedule",
    title: "Hiring Manager Review",
    status: "reschedule_requested",
    type: "hr",
    round: 3,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(fixedNow + 3 * DAY),
    scheduledEnd: iso(fixedNow + 3 * DAY + HOUR),
    meetingUrl: "https://meet.google.com/res-ched-ule",
    meetingProvider: "google_meet",
    meetingStatus: "success",
    cancelledReason: "Candidate has university exams on this day.",
    candidateConfirmedAt: null,
    application: {
      job: { id: "job_frontend", title: "Senior Frontend Engineer" },
      candidate: { name: "Priya Nair", email: "priya@example.com" },
    },
    feedback: [],
  },
  {
    _id: "int_completed",
    title: "Behavioral & Culture Fit",
    status: "completed",
    type: "hr",
    round: 2,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(fixedNow - 2 * DAY),
    scheduledEnd: iso(fixedNow - 2 * DAY + HOUR),
    meetingUrl: "https://meet.google.com/com-plet-edd",
    meetingProvider: "google_meet",
    meetingStatus: "success",
    application: {
      job: { id: "job_backend", title: "Staff Backend Engineer" },
      candidate: { name: "Rahul Deshmukh", email: "rahul@example.com" },
    },
    feedback: [
      {
        evaluator: { name: "Rohan Mehta" },
        recommendation: "strong_yes",
        ratings: [{ criterion: "Communication", score: 5 }],
      },
    ],
  },
  {
    _id: "int_cancelled",
    title: "Initial Phone Screen",
    status: "cancelled",
    type: "phone",
    round: 1,
    timezone: "UTC",
    scheduledStart: iso(fixedNow + 4 * DAY),
    scheduledEnd: iso(fixedNow + 4 * DAY + HOUR),
    cancelledReason: "Candidate accepted another offer.",
    application: {
      job: { id: "job_frontend", title: "Senior Frontend Engineer" },
      candidate: { name: "Devendra Patel", email: "devendra@example.com" },
    },
    feedback: [],
  },
];

const renderManagementDashboard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/o/org_apex/interviews"]}>
        <Routes>
          <Route path="/app/o/:organizationId/interviews" element={<RecruiterInterviewDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.list.mockResolvedValue({ data: mockInterviews(), meta: {} });
  mocks.jobs.mockResolvedValue({ data: mockJobs, meta: {} });
  mocks.googleStatus.mockResolvedValue({
    data: { configured: true, status: "connected", connected: true, connectedAt: iso(fixedNow - 10 * DAY) },
  });
  mocks.start.mockResolvedValue({ data: { status: "in_progress" } });
  mocks.staffJoin.mockResolvedValue({ data: { url: "https://meet.google.com/xyz-abcd-efg" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Recruiter Interview Management & Dashboard (Phase 3F)", () => {
  it("calculates and displays all 6 KPI status cards accurately", async () => {
    renderManagementDashboard();

    // Wait for data load
    await screen.findByText("Technical Coding Round");

    // 1. Total KPI
    const kpiTotal = screen.getByTestId("kpi-total");
    expect(within(kpiTotal).getByText("5")).toBeInTheDocument();
    expect(within(kpiTotal).getByText(/total/i)).toBeInTheDocument();

    // 2. Upcoming KPI (3 upcoming: int_upcoming_1, int_upcoming_2, int_reschedule)
    const kpiUpcoming = screen.getByTestId("kpi-upcoming");
    expect(within(kpiUpcoming).getByText("3")).toBeInTheDocument();

    // 3. Completed KPI (1 completed: int_completed)
    const kpiCompleted = screen.getByTestId("kpi-completed");
    expect(within(kpiCompleted).getByText("1")).toBeInTheDocument();

    // 4. Pending Confirmation KPI (1 invited without confirmation: int_upcoming_2)
    const kpiPending = screen.getByTestId("kpi-pending-confirmation");
    expect(within(kpiPending).getByText("1")).toBeInTheDocument();

    // 5. Reschedule Requests KPI (1 reschedule requested: int_reschedule)
    const kpiReschedule = screen.getByTestId("kpi-reschedule-requests");
    expect(within(kpiReschedule).getByText("1")).toBeInTheDocument();

    // 6. Cancelled KPI (1 cancelled: int_cancelled)
    const kpiCancelled = screen.getByTestId("kpi-cancelled");
    expect(within(kpiCancelled).getByText("1")).toBeInTheDocument();
  });

  it("displays Google Calendar connection status when connected", async () => {
    renderManagementDashboard();

    expect(await screen.findByText("Google Calendar & Meet Integration")).toBeInTheDocument();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Real Google Meet links are generated automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage integration/i })).toHaveAttribute(
      "href",
      "/app/settings/integrations",
    );
  });

  it("filters interviews by candidate name search", async () => {
    renderManagementDashboard();

    await screen.findByText("Ananya Sharma");
    expect(screen.getByText("Vikram Malhotra")).toBeInTheDocument();

    const searchInput = screen.getByLabelText(/search/i);
    fireEvent.change(searchInput, { target: { value: "Ananya" } });

    expect(screen.getByText("Ananya Sharma")).toBeInTheDocument();
    expect(screen.queryByText("Vikram Malhotra")).not.toBeInTheDocument();
  });

  it("filters interviews when clicking a status KPI card", async () => {
    renderManagementDashboard();

    await screen.findByText("Ananya Sharma");

    // Click Reschedule KPI card
    const kpiReschedule = screen.getByTestId("kpi-reschedule-requests");
    fireEvent.click(kpiReschedule);

    // Rescheduled item is shown
    expect(await screen.findByText("Priya Nair")).toBeInTheDocument();
    expect(screen.queryByText("Ananya Sharma")).not.toBeInTheDocument();

    // Clear filter button appears and works
    const clearBtn = screen.getByRole("button", { name: /clear status filter/i });
    fireEvent.click(clearBtn);

    expect(await screen.findByText("Ananya Sharma")).toBeInTheDocument();
  });

  it("switches to Calendar View and displays month grid with interactive chips", async () => {
    renderManagementDashboard();

    await screen.findByText("Ananya Sharma");

    // Click Calendar View button
    const calendarViewBtn = screen.getByRole("button", { name: /calendar view/i });
    fireEvent.click(calendarViewBtn);

    // Weekdays are rendered
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();

    // An event chip for Ananya Sharma is rendered in the calendar
    const chip = screen.getByRole("button", { name: /ananya sharma/i });
    expect(chip).toBeInTheDocument();

    // Clicking the event chip opens QuickViewModal
    fireEvent.click(chip);

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Interview Quick View")).toBeInTheDocument();
    expect(within(modal).getByText(/Please be ready with a browser and camera on/i)).toBeInTheDocument();
    expect(within(modal).getByText(/Candidate confirmed attendance/i)).toBeInTheDocument();

    // Close modal via the Close button in the modal footer
    const closeButtons = within(modal).getAllByRole("button", { name: /close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Switch back to List View
    const listViewBtn = screen.getByRole("button", { name: /list view/i });
    fireEvent.click(listViewBtn);
    expect(screen.getByRole("tablist", { name: /interview groups/i })).toBeInTheDocument();
  });

  it("displays interview instructions on cards when present", async () => {
    renderManagementDashboard();

    await screen.findByText("Ananya Sharma");

    expect(screen.getByText(/Please be ready with a browser and camera on/i)).toBeInTheDocument();
  });

  it("refetches interviews when Refresh button is clicked", async () => {
    renderManagementDashboard();

    const refreshBtn = await screen.findByRole("button", { name: /refresh/i });
    fireEvent.click(refreshBtn);

    expect(mocks.list).toHaveBeenCalledWith("org_apex", expect.objectContaining({ limit: 100 }));
  });
});
