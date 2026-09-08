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
            scheduledStart: "2026-09-18T14:00:00Z",
            application: { job: { title: "Backend Engineer" } },
          },
        ],
        meta: { count: 1 },
      }),
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

import { RecruiterDashboard } from "./RecruiterPages";

const renderPage = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/o/org1"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Recruiter dashboard", () => {
  it("renders role-specific KPIs, pipeline, approvals, AI insights and team", async () => {
    renderPage(<RecruiterDashboard />);

    expect(await screen.findByText("Hiring workspace")).toBeInTheDocument();

    // Recruiter-specific KPIs (differs from the candidate view).
    expect(await screen.findByText("Active jobs")).toBeInTheDocument();
    expect(screen.getAllByText("Pending approvals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shortlisted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hired").length).toBeGreaterThan(0);

    // Spec-required recruiter dashboard elements.
    expect(screen.getByText("Jobs needing attention")).toBeInTheDocument();
    expect(screen.getByText("Candidate pipeline")).toBeInTheDocument();
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
