import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RecruiterInterviewDashboard from "./RecruiterInterviewDashboard";

const mocks = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), staffJoin: vi.fn(), jobs: vi.fn() }));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Rohan Mehta", email: "rohan@meridian.example" },
    role: "recruiter",
    organizationId: "org1",
    organizations: [{ id: "org1", name: "Meridian", role: "owner" }],
    membership: { role: "owner" },
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
    update: vi.fn(),
    cancel: vi.fn(),
    complete: vi.fn(),
    retryMeeting: vi.fn(),
  },
  jobsApi: { orgList: (...args) => mocks.jobs(...args) },
}));

const HOUR = 3600 * 1000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const fixtures = () => [
  {
    _id: "ia",
    title: "Round A",
    status: "invited",
    type: "video",
    round: 1,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(now + 5 * 60 * 1000),
    scheduledEnd: iso(now + 65 * 60 * 1000),
    meetingUrl: "https://zoom.us/j/123456789",
    meetingProvider: "manual",
    meetingStatus: "manual",
    application: { job: { title: "Backend Engineer" }, candidate: { name: "Asha Sharma" } },
    feedback: [],
  },
  {
    _id: "ib",
    title: "Round B",
    status: "invited",
    type: "video",
    round: 1,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(now + 3 * 24 * HOUR),
    scheduledEnd: iso(now + 3 * 24 * HOUR + HOUR),
    meetingUrl: "",
    meetingProvider: "none",
    meetingStatus: "setup_required",
    application: { job: { title: "Backend Engineer" }, candidate: { name: "Ravi Kumar" } },
    feedback: [],
  },
  {
    _id: "ic",
    title: "Round C",
    status: "confirmed",
    type: "technical",
    round: 2,
    timezone: "Asia/Kolkata",
    scheduledStart: iso(now + 4 * 24 * HOUR),
    scheduledEnd: iso(now + 4 * 24 * HOUR + HOUR),
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "google_meet",
    meetingStatus: "success",
    application: { job: { title: "Data Analyst" }, candidate: { name: "Meera Iyer" } },
    feedback: [],
  },
  {
    _id: "id",
    title: "Round D",
    status: "cancelled",
    type: "hr",
    round: 1,
    timezone: "UTC",
    scheduledStart: iso(now + 5 * 24 * HOUR),
    scheduledEnd: iso(now + 5 * 24 * HOUR + HOUR),
    application: { job: { title: "Data Analyst" }, candidate: { name: "Dev Patel" } },
    feedback: [],
  },
  {
    _id: "ie",
    title: "Round E",
    status: "invited",
    type: "phone",
    round: 1,
    timezone: "UTC",
    scheduledStart: iso(now - 3 * HOUR),
    scheduledEnd: iso(now - 2 * HOUR),
    application: { job: { title: "Data Analyst" }, candidate: { name: "Old Candidate" } },
    feedback: [],
  },
];

const renderDashboard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/o/org1/interviews"]}>
        <Routes>
          <Route path="/app/o/:organizationId/interviews" element={<RecruiterInterviewDashboard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.list.mockResolvedValue({ data: fixtures(), meta: {} });
  mocks.jobs.mockResolvedValue({ data: [], meta: {} });
  mocks.start.mockResolvedValue({ data: { status: "in_progress" } });
  mocks.staffJoin.mockResolvedValue({ data: { url: "https://zoom.us/j/123456789" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = (title) => screen.getByRole("article", { name: title });

describe("recruiter interview dashboard", () => {
  it("groups interviews into tabs by time and status", async () => {
    renderDashboard();
    expect(await screen.findByRole("tab", { name: /upcoming \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /past \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /cancelled \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Round A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /cancelled/i }));
    expect(await screen.findByRole("article", { name: "Round D" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Round A" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /past/i }));
    expect(await screen.findByRole("article", { name: "Round E" })).toBeInTheDocument();
  });

  it("enables Start only inside the window and disables it with a reason outside it", async () => {
    renderDashboard();
    await screen.findByRole("article", { name: "Round A" });

    const startA = within(card("Round A")).getByRole("button", { name: /start interview/i });
    expect(startA).toBeEnabled();

    const startB = within(card("Round B")).getByRole("button", { name: /start interview/i });
    expect(startB).toBeDisabled();
    expect(within(card("Round B")).getByText(/Set a date and time|Add a meeting link|start from 15 minutes/i)).toBeInTheDocument();
  });

  it("asks for confirmation, then starts the interview through the API", async () => {
    renderDashboard();
    await screen.findByRole("article", { name: "Round A" });
    fireEvent.click(within(card("Round A")).getByRole("button", { name: /start interview/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/candidate will be notified/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /start interview/i }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("org1", "ia"));
  });

  it("labels each meeting link by its real source", async () => {
    renderDashboard();
    await screen.findByRole("article", { name: "Round A" });

    // Manual link is labelled manual, never Google Meet.
    expect(within(card("Round A")).getByText("Manual link")).toBeInTheDocument();
    expect(within(card("Round A")).queryByText("Google Meet")).not.toBeInTheDocument();

    // Google Meet is named and linked only where Google created the link.
    const meet = within(card("Round C")).getByText("Google Meet");
    expect(meet).toBeInTheDocument();
    expect(within(card("Round C")).getByRole("link", { name: /open link/i })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );

    // Not set up: no link, and no false claim of a Meet link.
    expect(within(card("Round B")).getByText("Google Meet not set up")).toBeInTheDocument();
    expect(within(card("Round B")).queryByRole("link", { name: /open link/i })).toBeNull();
  });

  it("shows the candidate and job for each card", async () => {
    renderDashboard();
    const a = await screen.findByRole("article", { name: "Round A" });
    expect(within(a).getByText("Asha Sharma")).toBeInTheDocument();
    expect(within(a).getByText(/Backend Engineer/)).toBeInTheDocument();
  });

  it("offers reschedule, cancel and a link to details and feedback", async () => {
    renderDashboard();
    const a = await screen.findByRole("article", { name: "Round A" });
    expect(within(a).getByRole("button", { name: /reschedule/i })).toBeInTheDocument();
    expect(within(a).getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(within(a).getByRole("link", { name: /details, feedback/i })).toHaveAttribute(
      "href",
      "/app/o/org1/interviews/ia",
    );
  });
});
