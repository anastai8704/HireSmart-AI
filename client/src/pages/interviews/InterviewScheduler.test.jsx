import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InterviewScheduler from "./InterviewScheduler";
import { toZonedLocalInput } from "../../lib/interviewWorkflow";

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(),
  applications: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  members: vi.fn(),
  google: vi.fn(),
  resume: vi.fn(),
}));

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
  jobsApi: { orgList: (...args) => mocks.jobs(...args) },
  recruitmentApi: {
    applications: (...args) => mocks.applications(...args),
    detail: (...args) => mocks.detail(...args),
    resume: (...args) => mocks.resume(...args),
  },
  interviewApi: {
    create: (...args) => mocks.create(...args),
    list: (...args) => mocks.list(...args),
  },
  organizationApi: { members: (...args) => mocks.members(...args) },
  integrationsApi: { googleStatus: (...args) => mocks.google(...args) },
  downloadBlob: () => {},
}));

const JOBS = [
  { id: "j1", title: "Backend Engineer", location: "Pune", status: "published" },
  { id: "j2", title: "Data Analyst", location: "Remote", status: "published" },
];
const APPS = {
  j1: [
    {
      _id: "a1",
      status: "shortlisted",
      appliedAt: "2026-10-01T10:00:00Z",
      candidate: { name: "Asha Sharma", email: "asha@example.com", headline: "Backend developer", skills: ["Node.js"] },
    },
  ],
  j2: [
    {
      _id: "a2",
      status: "under_review",
      appliedAt: "2026-10-02T10:00:00Z",
      candidate: { name: "Ravi Kumar", email: "ravi@example.com", headline: "Analyst", skills: ["SQL"] },
    },
  ],
};

const renderScheduler = (entry = "/app/o/org1/interviews/schedule") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/o/:organizationId/interviews/schedule" element={<InterviewScheduler />} />
          <Route path="/app/o/:organizationId/interviews" element={<p>Interview list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.jobs.mockResolvedValue({ data: JOBS, meta: {} });
  mocks.applications.mockImplementation((_org, jobId) => Promise.resolve({ data: APPS[jobId] || [], meta: {} }));
  mocks.detail.mockResolvedValue({ data: { application: null, match: null } });
  mocks.list.mockResolvedValue({ data: [], meta: {} });
  mocks.members.mockResolvedValue({ data: [], meta: {} });
  mocks.google.mockResolvedValue({ data: { configured: true, connected: false, status: "not_connected" } });
  mocks.create.mockResolvedValue({ data: { id: "i1" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("job-first interview scheduling", () => {
  it("asks for a job first and loads no applications until one is chosen", async () => {
    renderScheduler();
    expect(await screen.findByText("Step 1: Choose a job")).toBeInTheDocument();
    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(mocks.applications).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a candidate to schedule")).toBeInTheDocument();
  });

  it("loads only the selected job's applications and never another job's", async () => {
    renderScheduler();
    fireEvent.click(await screen.findByLabelText(/Data Analyst/));

    expect(await screen.findByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.queryByText("Asha Sharma")).not.toBeInTheDocument();
    expect(mocks.applications).toHaveBeenCalledWith("org1", "j2", expect.any(Object));
    expect(mocks.applications).not.toHaveBeenCalledWith("org1", "j1", expect.anything());
  });

  it("shows the candidate profile and the Google notice before the form", async () => {
    renderScheduler();
    fireEvent.click(await screen.findByLabelText(/Data Analyst/));
    fireEvent.click(await screen.findByLabelText(/Ravi Kumar/));

    expect(await screen.findByRole("heading", { name: "Ravi Kumar" })).toBeInTheDocument();
    expect(screen.getByText("Download resume")).toBeInTheDocument();
    expect(await screen.findByText(/Google Calendar is not connected/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open integration settings/i })).toHaveAttribute(
      "href",
      "/app/settings/integrations",
    );
  });

  it("submits the job and application it was chosen with, in UTC instants", async () => {
    renderScheduler();
    fireEvent.click(await screen.findByLabelText(/Data Analyst/));
    fireEvent.click(await screen.findByLabelText(/Ravi Kumar/));
    await screen.findByText(/Google Calendar is not connected/);

    const start = toZonedLocalInput(new Date(Date.now() + 3 * 86400000), "Asia/Kolkata");
    const end = toZonedLocalInput(new Date(Date.now() + 3 * 86400000 + 3600000), "Asia/Kolkata");
    fireEvent.change(screen.getByLabelText(/^starts/i), { target: { value: start } });
    fireEvent.change(screen.getByLabelText(/^ends/i), { target: { value: end } });
    fireEvent.click(screen.getByRole("button", { name: /schedule and send invitation/i }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const [orgId, body, key] = mocks.create.mock.calls[0];
    expect(orgId).toBe("org1");
    expect(body.jobId).toBe("j2");
    expect(body.applicationId).toBe("a2");
    expect(body.timezone).toBe("Asia/Kolkata");
    expect(body.scheduledStart).toMatch(/Z$/);
    expect(new Date(body.scheduledEnd) > new Date(body.scheduledStart)).toBe(true);
    expect(typeof key).toBe("string");
  });

  it("blocks a past start time on the client and does not call the API", async () => {
    renderScheduler();
    fireEvent.click(await screen.findByLabelText(/Data Analyst/));
    fireEvent.click(await screen.findByLabelText(/Ravi Kumar/));
    await screen.findByText(/Google Calendar is not connected/);

    fireEvent.change(screen.getByLabelText(/^starts/i), { target: { value: "2020-01-01T10:00" } });
    fireEvent.change(screen.getByLabelText(/^ends/i), { target: { value: "2020-01-01T11:00" } });
    fireEvent.click(screen.getByRole("button", { name: /schedule and send invitation/i }));

    expect(await screen.findByText(/start time is in the past/i)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses the application from the URL and goes straight to the form", async () => {
    mocks.detail.mockResolvedValue({
      data: {
        application: { _id: "a2", job: { _id: "j2", title: "Data Analyst" }, status: "under_review", candidate: { name: "Ravi Kumar" } },
        match: null,
      },
    });
    renderScheduler("/app/o/org1/interviews/schedule?applicationId=a2");
    expect(await screen.findByRole("heading", { name: "Step 3: Schedule" })).toBeInTheDocument();
    expect(mocks.detail).toHaveBeenCalledWith("org1", "a2");
  });
});
