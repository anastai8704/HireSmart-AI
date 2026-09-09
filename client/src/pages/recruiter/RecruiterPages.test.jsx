import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Rohan Mehta", email: "rohan@meridian.example" },
    role: "recruiter",
    organizations: [{ id: "org1", name: "Meridian", role: "owner" }],
    organizationId: "org1",
    organization: { id: "org1", name: "Meridian", role: "owner" },
    membership: { role: "owner" },
    workspaceRole: "owner",
    status: "authenticated",
    isAuthenticated: true,
    logout: () => {},
    setOrganizationId: () => {},
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

vi.mock("../../lib/api", () => ({
  jobsApi: {
    orgList: () =>
      Promise.resolve({
        data: [
          {
            id: "j1",
            title: "Backend Engineer",
            location: "Pune",
            status: "published",
            moderation: { status: "approved" },
            pendingChanges: null,
            updatedAt: "2026-09-04T10:00:00Z",
          },
          {
            id: "j2",
            title: "Data Analyst",
            location: "Remote",
            status: "draft",
            moderation: { status: "pending" },
            pendingChanges: null,
            updatedAt: "2026-09-05T10:00:00Z",
          },
        ],
        meta: { count: 2 },
      }),
  },
  analyticsApi: {
    recruitment: () =>
      Promise.resolve({
        data: {
          applications: 24,
          funnel: {
            submitted: 24,
            under_review: 10,
            shortlisted: 6,
            interview: 3,
            hired: 1,
          },
          rates: { shortlist: 0.25, interview: 0.125, hired: 0.04 },
          ai: { averageAIScore: 71, scoresGenerated: 18 },
          jobPerformance: [
            { job: { title: "Backend Engineer" }, applications: 12, averageAIScore: 74 },
          ],
          note: "AI scores are decision-support signals and are reported separately from human outcomes.",
        },
      }),
  },
  interviewApi: {
    list: () =>
      Promise.resolve({
        data: [
          {
            _id: "i1",
            title: "Screening call",
            status: "confirmed",
            type: "video",
            scheduledStart: "2026-09-18T14:00:00Z",
            scheduledEnd: "2026-09-18T14:45:00Z",
            timezone: "Asia/Kolkata",
            meetingUrl: "https://meet.google.com/abc-defg-hij",
            application: {
              job: { title: "Backend Engineer", company: "Meridian" },
              candidate: { name: "Asha Sharma", email: "asha@example.com" },
              status: "shortlisted",
            },
            participants: [{ _id: "u1", name: "Rohan Mehta", email: "rohan@meridian.example" }],
            feedback: [
              {
                _id: "fb1",
                evaluator: { name: "Isha Verma" },
                ratings: [{ criterion: "Technical skills", score: 4, evidence: "Strong API design" }],
                recommendation: "yes",
                summary: "Good architectural fundamentals.",
                submittedAt: "2026-09-18T15:00:00Z",
              },
            ],
          },
        ],
        meta: { count: 1 },
      }),
    get: (orgId, id) =>
      Promise.resolve({
        data: {
          _id: id || "i1",
          title: "Screening call",
          status: "confirmed",
          type: "video",
          scheduledStart: "2026-09-18T14:00:00Z",
          scheduledEnd: "2026-09-18T14:45:00Z",
          timezone: "Asia/Kolkata",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          application: {
            job: { title: "Backend Engineer", company: "Meridian" },
            candidate: { name: "Asha Sharma", email: "asha@example.com" },
            status: "shortlisted",
          },
          participants: [{ _id: "u1", name: "Rohan Mehta", email: "rohan@meridian.example" }],
          feedback: [
            {
              _id: "fb1",
              evaluator: { name: "Isha Verma" },
              ratings: [{ criterion: "Technical skills", score: 4, evidence: "Strong API design" }],
              recommendation: "yes",
              summary: "Good architectural fundamentals.",
              submittedAt: "2026-09-18T15:00:00Z",
            },
          ],
        },
      }),
    create: vi.fn(() => Promise.resolve({ data: { _id: "i2", title: "Technical Interview" } })),
    feedback: vi.fn(() => Promise.resolve({ data: { _id: "fb2" } })),
    questions: vi.fn(() =>
      Promise.resolve({
        data: {
          questions: [
            {
              competency: "API Architecture",
              question: "How do you design idempotent APIs?",
              rubric: ["Clear idempotency keys", "Safe replay handling"],
            },
          ],
          metadata: { model: "mock", generatedAt: "2026-09-09T00:00:00Z" },
          confidence: 0.95,
          limitations: ["Review for domain relevance."],
        },
      }),
    ),
    cancel: vi.fn(() => Promise.resolve({ data: { _id: "i1", status: "cancelled" } })),
    complete: vi.fn(() => Promise.resolve({ data: { _id: "i1", status: "completed" } })),
    update: vi.fn(() => Promise.resolve({ data: { _id: "i1" } })),
  },
  organizationApi: {
    members: () =>
      Promise.resolve({
        data: [
          { _id: "m1", role: "owner", status: "active", createdAt: "2026-08-01T10:00:00Z", user: { name: "Rohan Mehta" } },
          { _id: "m2", role: "recruiter", status: "active", createdAt: "2026-09-01T10:00:00Z", user: { name: "Isha Verma" } },
        ],
        meta: { count: 2 },
      }),
  },
  recruitmentApi: {
    applications: (orgId, jobId) =>
      Promise.resolve({
        data:
          jobId === "j1"
            ? [
                { _id: "a1", status: "shortlisted", appliedAt: "2026-09-06T10:00:00Z", candidate: { name: "Asha Sharma", headline: "Backend Dev" } },
              ]
            : [],
        meta: { count: 1 },
      }),
  },
}));

import { InterviewDetail, InterviewsPage, RecruiterDashboard } from "./RecruiterPages";

const renderPage = (ui, initialEntry = "/app/o/org1") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Recruiter dashboard", () => {
  it("renders role-specific KPIs, pipeline, approvals, AI insights and team", async () => {
    renderPage(<RecruiterDashboard />);

    expect(await screen.findByText("Hiring workspace")).toBeInTheDocument();

    // Recruiter-specific KPIs (differs from the candidate view).
    expect(await screen.findByText("Open positions")).toBeInTheDocument();
    expect(screen.getAllByText("Pending approvals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offers out").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hired").length).toBeGreaterThan(0);

    // Spec-required recruiter dashboard elements.
    expect(screen.getByText("Jobs needing attention")).toBeInTheDocument();
    expect(screen.getByText("Candidate Hiring Progress")).toBeInTheDocument();
    expect(screen.getByText("Upcoming interviews")).toBeInTheDocument();
    expect(screen.getByText("AI insights")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Candidates to Review")).toBeInTheDocument();

    // Real funnel + conversion rates.
    expect(screen.getByText("Shortlist rate")).toBeInTheDocument();
    expect(screen.getByText("Hire rate")).toBeInTheDocument();

    // The pending-approval job and the scheduled interview surface.
    expect(screen.getAllByText("Data Analyst").length).toBeGreaterThan(0);
    expect(screen.getByText("Screening call")).toBeInTheDocument();
    expect(screen.getByText("Asha Sharma")).toBeInTheDocument();
  });
});

describe("Recruiter Interviews Management (Phase 10)", () => {
  it("renders interview scheduling form, duration presets, and calendar-style list", async () => {
    renderPage(<InterviewsPage />, "/app/o/org1/interviews");

    expect(await screen.findByText("Schedule and manage interviews")).toBeInTheDocument();
    expect(screen.getByText("Schedule Interview")).toBeInTheDocument();

    // Scheduling form controls
    expect(screen.getByLabelText(/find a candidate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/interview title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/starts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ends/i)).toBeInTheDocument();
    expect(screen.getByText("Quick duration:")).toBeInTheDocument();

    // Filter tabs
    expect(screen.getByRole("button", { name: /upcoming/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /past/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();

    // Scheduled interview card
    expect(await screen.findByText("Screening call")).toBeInTheDocument();
    expect(screen.getByText("Asha Sharma")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Join video")).toBeInTheDocument();
    expect(screen.getByText("Add to calendar")).toBeInTheDocument();
    expect(screen.getByText("Interview workspace")).toBeInTheDocument();
  });

  it("renders interview detail workspace with AI question kit and multi-criteria scorecards", async () => {
    renderPage(<InterviewDetail />, "/app/o/org1/interviews/i1");

    expect(await screen.findByText("Interview workspace")).toBeInTheDocument();
    expect(screen.getByText("Screening call")).toBeInTheDocument();
    expect(screen.getByText("Asha Sharma")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Candidate confirmed attendance/i)).toBeInTheDocument();

    // AI Question Kit
    expect(screen.getByText("Interview Question Kit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate questions/i })).toBeInTheDocument();

    // Scorecard Form & History
    expect(screen.getByText("Evaluation Scorecard")).toBeInTheDocument();
    expect(screen.getByText("Team Scorecards (1)")).toBeInTheDocument();
    expect(screen.getByText("Isha Verma")).toBeInTheDocument();
    expect(screen.getByText(/"Strong API design"/i)).toBeInTheDocument();
    expect(screen.getByText("Good architectural fundamentals.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit scorecard/i })).toBeInTheDocument();
  });
});
