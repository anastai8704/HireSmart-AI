import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Priya Sharma", email: "priya@example.com" },
    role: "candidate",
    organizations: [],
    organizationId: null,
    organization: null,
    membership: null,
    workspaceRole: "candidate",
    status: "authenticated",
    isAuthenticated: true,
    logout: () => {},
    setOrganizationId: () => {},
    refresh: () => Promise.resolve(),
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

const readyVersion = {
  id: "rv1",
  processingStatus: "ready",
  createdAt: "2026-08-01T10:00:00Z",
};

vi.mock("../../lib/api", () => ({
  candidateApi: {
    profile: () =>
      Promise.resolve({
        data: {
          user: {
            id: "u1",
            displayName: "Priya Sharma",
            email: "priya@example.com",
            headline: "Frontend Engineer",
            location: "Ahmedabad",
            bio: "Building accessible web apps.",
            skills: ["React", "TypeScript"],
            onboardingCompleted: true,
          },
          profile: {
            education: [{ institution: "NIT", degree: "B.Tech" }],
            experience: [{ company: "Acme", position: "SDE" }],
          },
        },
      }),
    applications: () =>
      Promise.resolve({
        data: [
          { _id: "a1", status: "submitted", appliedAt: "2026-09-01T10:00:00Z" },
          { _id: "a2", status: "interview", appliedAt: "2026-09-02T10:00:00Z" },
          { _id: "a3", status: "shortlisted", appliedAt: "2026-09-03T10:00:00Z" },
        ],
        meta: { count: 3 },
      }),
    interviews: () =>
      Promise.resolve({
        data: [
          {
            _id: "i1",
            title: "Technical interview",
            status: "invited",
            scheduledStart: "2026-09-15T10:00:00Z",
            application: { job: { title: "Frontend Engineer" } },
          },
        ],
        meta: { count: 1 },
      }),
    recommendations: () =>
      Promise.resolve({
        data: [
          {
            job: {
              id: "j1",
              title: "Senior Frontend Engineer",
              location: "Remote",
              workplaceMode: "remote",
              requiredSkills: ["React", "GraphQL"],
            },
            match: { overallScore: 82, missingRequiredSkills: ["GraphQL"] },
          },
        ],
      }),
  },
  resumeApi: {
    list: () => Promise.resolve({ meta: { versions: [readyVersion] } }),
    detail: () =>
      Promise.resolve({
        data: { parsedResume: { analysis: { atsScore: 84 } } },
      }),
  },
}));

import { CandidateDashboard } from "./CandidatePages";

const renderPage = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/candidate"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

describe("Candidate dashboard", () => {
  it("renders role-specific KPIs, completion, pipeline and upcoming interviews", async () => {
    renderPage(<CandidateDashboard />);

    // Role-specific workspace framing.
    expect(await screen.findByText("Candidate workspace")).toBeInTheDocument();

    // KPI row.
    expect(await screen.findByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("In active review")).toBeInTheDocument();
    expect(screen.getByText("Resume versions")).toBeInTheDocument();

    // Next best action + quick actions.
    expect(screen.getByText("Next best action")).toBeInTheDocument();
    expect(screen.getByText("Discover jobs")).toBeInTheDocument();
    expect(screen.getByText("Career assistant")).toBeInTheDocument();

    // Spec-required candidate dashboard elements.
    expect(screen.getByText("Profile completion")).toBeInTheDocument();
    expect(screen.getByText("Application progress")).toBeInTheDocument();
    expect(screen.getByText("Upcoming interviews")).toBeInTheDocument();
    expect(screen.getByText("Recommended for you")).toBeInTheDocument();
    expect(screen.getByText("Resume readiness")).toBeInTheDocument();

    // Real pipeline stages render from application data.
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Interview")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();

    // The scheduled interview surfaces with its job and a date.
    expect(screen.getByText("Technical interview")).toBeInTheDocument();
    expect(screen.getByText(/15 Sept? 2026/)).toBeInTheDocument();
  });
});
