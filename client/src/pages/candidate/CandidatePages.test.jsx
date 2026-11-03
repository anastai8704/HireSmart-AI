import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const {
  mockAuth,
  mockToast,
  mockJobsApi,
  mockCandidateApi,
  mockResumeApi,
  mockInterviewApi,
  mockAiApi,
  mockAlertsApi,
} = vi.hoisted(() => {
  const sampleJob = {
    id: "j1",
    _id: "j1",
    title: "Senior Frontend Engineer",
    company: "Acme Corp",
    location: "Remote",
    workplaceMode: "remote",
    jobType: "Full-Time",
    experience: "3-5 years",
    salary: 1800000,
    compensation: { min: 1500000, max: 2000000, currency: "INR", period: "year" },
    description: "We are looking for an experienced Senior Frontend Engineer to build robust web applications.",
    requiredSkills: ["React", "TypeScript", "GraphQL"],
    preferredSkills: ["TailwindCSS", "Node.js"],
    benefits: ["Health Insurance", "Remote Stipend"],
    createdAt: "2026-09-01T10:00:00Z",
  };

  const sampleJob2 = {
    id: "j2",
    _id: "j2",
    title: "Backend Engineer",
    company: "Beta Systems",
    location: "Bengaluru",
    workplaceMode: "hybrid",
    jobType: "Full-Time",
    experience: "2-4 years",
    salary: 1600000,
    compensation: { min: 1400000, max: 1800000, currency: "INR", period: "year" },
    description: "Design and maintain high throughput APIs and distributed microservices.",
    requiredSkills: ["Node.js", "MongoDB", "TypeScript"],
    preferredSkills: ["Docker", "Redis"],
    benefits: ["Flexible Hours"],
    createdAt: "2026-09-02T10:00:00Z",
  };

  const sampleApplication = {
    _id: "a1",
    id: "a1",
    job: sampleJob,
    jobSnapshot: {
      title: sampleJob.title,
      company: sampleJob.company,
      location: sampleJob.location,
      workplaceMode: sampleJob.workplaceMode,
    },
    status: "under_review",
    appliedAt: "2026-09-01T10:00:00Z",
    statusHistory: [
      { status: "submitted", changedAt: "2026-09-01T10:00:00Z", note: "Application submitted" },
      { status: "under_review", changedAt: "2026-09-02T10:00:00Z", note: "Recruiter started review" },
    ],
  };

  const sampleInterview = {
    _id: "i1",
    title: "Technical Interview - System Design",
    type: "video",
    status: "invited",
    scheduledStart: "2026-09-15T10:00:00Z",
    scheduledEnd: "2026-09-15T11:00:00Z",
    timezone: "Asia/Kolkata",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    application: {
      _id: "a1",
      job: { title: "Senior Frontend Engineer", company: "Acme Corp" },
    },
  };

  const readyVersion = {
    id: "rv1",
    version: 1,
    originalName: "Priya_Sharma_Resume.pdf",
    processingStatus: "ready",
    processingStage: "ready",
    createdAt: "2026-08-01T10:00:00Z",
  };

  return {
    mockAuth: {
      user: { id: "u1", displayName: "Priya Sharma", email: "priya@example.com" },
      role: "candidate",
      organizations: [],
      organizationId: null,
      organization: null,
      membership: null,
      workspaceRole: "candidate",
      status: "authenticated",
      isAuthenticated: true,
      logout: vi.fn(),
      setOrganizationId: vi.fn(),
      refresh: vi.fn(() => Promise.resolve()),
    },
    mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    mockJobsApi: {
      list: vi.fn(() => Promise.resolve({ data: [sampleJob, sampleJob2], meta: { count: 2 } })),
      get: vi.fn((id) => Promise.resolve({ data: id === "j2" ? sampleJob2 : { ...sampleJob, id } })),
      saved: vi.fn(() => Promise.resolve({ data: [sampleJob] })),
      save: vi.fn((id) => Promise.resolve({ data: { jobId: id, saved: true } })),
      unsave: vi.fn(() => Promise.resolve()),
      fit: vi.fn(() =>
        Promise.resolve({
          data: {
            overallScore: 88,
            confidence: 0.9,
            recommendation: "strong_match",
            matchedSkills: ["React", "TypeScript"],
            missingRequiredSkills: ["GraphQL"],
            componentScores: {
              skills: { score: 90, applicable: true },
              semantic: { score: 85, applicable: true },
            },
          },
        }),
      ),
      apply: vi.fn(() =>
        Promise.resolve({
          data: { id: "a2", jobId: "j2", status: "submitted", appliedAt: "2026-09-09T10:00:00Z" },
        }),
      ),
    },
    mockCandidateApi: {
      profile: vi.fn(() =>
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
      ),
      updateProfile: vi.fn(() => Promise.resolve({ data: {} })),
      applications: vi.fn(() =>
        Promise.resolve({
          data: [
            sampleApplication,
            { _id: "a2", job: sampleJob, status: "submitted", appliedAt: "2026-09-01T10:00:00Z" },
            { _id: "a3", job: sampleJob, status: "interview", appliedAt: "2026-09-02T10:00:00Z" },
            { _id: "a4", job: sampleJob, status: "shortlisted", appliedAt: "2026-09-03T10:00:00Z" },
          ],
          meta: { count: 4 },
        }),
      ),
      application: vi.fn((id) => Promise.resolve({ data: { ...sampleApplication, _id: id } })),
      withdraw: vi.fn(() => Promise.resolve({ data: { ...sampleApplication, status: "withdrawn" } })),
      interviews: vi.fn(() =>
        Promise.resolve({
          data: [sampleInterview],
          meta: { count: 1 },
        }),
      ),
      recommendations: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              job: sampleJob,
              match: { overallScore: 82, missingRequiredSkills: ["GraphQL"] },
            },
          ],
        }),
      ),
    },
    mockResumeApi: {
      list: vi.fn(() => Promise.resolve({ meta: { versions: [readyVersion] } })),
      detail: vi.fn((id) =>
        Promise.resolve({
          data: {
            resumeVersion: { ...readyVersion, id },
            parsedResume: {
              confidence: 0.85,
              experienceYears: 4,
              skills: [
                { name: "React", normalized: "react", confidence: 0.95 },
                { name: "TypeScript", normalized: "typescript", confidence: 0.9 },
              ],
              analysis: { atsScore: 84, grade: "A" },
              warnings: [],
            },
          },
        }),
      ),
      analysis: vi.fn(() =>
        Promise.resolve({
          data: {
            confidence: 0.88,
            suggestions: [
              {
                title: "Quantify frontend performance wins",
                detail: "Include metrics like Lighthouse scores or bundle size reductions.",
                severity: "medium",
                confidence: 0.85,
              },
            ],
            strengths: ["Strong evidence of React & TypeScript"],
            uncertainties: [],
          },
        }),
      ),
      tailor: vi.fn(() =>
        Promise.resolve({
          data: {
            fit: { overallScore: 85, confidence: 0.85 },
            improvement: {
              suggestions: [{ title: "Highlight GraphQL API integrations", detail: "Describe schemas and queries built." }],
            },
          },
        }),
      ),
      retry: vi.fn(() => Promise.resolve({ data: {} })),
      remove: vi.fn(() => Promise.resolve()),
      download: vi.fn(() => Promise.resolve(new Blob(["test"]))),
    },
    mockInterviewApi: {
      confirm: vi.fn(() => Promise.resolve({ data: { ...sampleInterview, status: "confirmed" } })),
      reschedule: vi.fn(() => Promise.resolve({ data: { ...sampleInterview, status: "reschedule_requested" } })),
      prep: vi.fn(() =>
        Promise.resolve({
          data: {
            confidence: 0.88,
            focusAreas: ["React Architecture", "GraphQL Query Optimization", "State Management"],
            practiceQuestions: [
              "Explain how you design a reusable component library in TypeScript.",
              "How do you handle client-side caching and invalidation with GraphQL?",
            ],
            skillGaps: ["GraphQL"],
            limitations: ["Based on supplied job and resume evidence."],
          },
        }),
      ),
    },
    mockAiApi: {
      run: vi.fn(() =>
        Promise.resolve({
          data: {
            answer: "To stand out for senior roles, highlight measurable impact, architecture decisions, and mentoring experience.",
            recommendations: [
              "Quantify load time improvements in production",
              "Describe technical trade-offs between REST and GraphQL",
            ],
            confidence: 0.9,
            citations: [],
            limitations: ["Grounded in verified candidate profile."],
          },
        }),
      ),
      nlSearch: vi.fn(() =>
        Promise.resolve({
          data: {
            filters: { query: "React", location: "Bengaluru", workplaceMode: "remote" },
            explanation: "Parsed remote React roles in Bengaluru.",
          },
        }),
      ),
    },
    mockAlertsApi: {
      list: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: "alert1",
              name: "Remote Frontend Roles",
              query: "React",
              location: "Remote",
              cadence: "weekly",
              active: true,
              lastRunAt: "2026-09-08T10:00:00Z",
            },
          ],
        }),
      ),
      update: vi.fn(() => Promise.resolve({ data: {} })),
      remove: vi.fn(() => Promise.resolve()),
    },
  };
});

vi.mock("../../context/useAuth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../../lib/api", () => ({
  jobsApi: mockJobsApi,
  candidateApi: mockCandidateApi,
  resumeApi: mockResumeApi,
  interviewApi: mockInterviewApi,
  aiApi: mockAiApi,
  alertsApi: mockAlertsApi,
  downloadBlob: vi.fn(),
}));

import {
  CandidateDashboard,
  CandidateJobs,
  CandidateJobDetail,
  ApplicationsPage,
  ApplicationDetail,
  CandidateInterviews,
  InterviewPrep,
  CareerCopilot,
  ResumeManager,
  ResumeDetail,
  SavedJobsPage,
  AlertsPage,
} from "./CandidatePages";

const renderWithClient = (ui, path = "/app/candidate") => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Candidate Dashboard", () => {
  it("renders role-specific KPIs, completion, pipeline and upcoming interviews", async () => {
    renderWithClient(<CandidateDashboard />);

    expect(await screen.findByText("Candidate workspace")).toBeInTheDocument();
    expect(await screen.findByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("In active review")).toBeInTheDocument();
    expect(screen.getByText("Resume versions")).toBeInTheDocument();
    expect(screen.getByText("Next best action")).toBeInTheDocument();
    expect(screen.getByText("Discover jobs")).toBeInTheDocument();
    expect(screen.getByText("Career assistant")).toBeInTheDocument();
    expect(screen.getByText("Profile completion")).toBeInTheDocument();
    expect(screen.getByText("Application progress")).toBeInTheDocument();
    expect(screen.getByText("Upcoming interviews")).toBeInTheDocument();
    expect(screen.getByText("Recommended for you")).toBeInTheDocument();
    expect(screen.getByText("Resume readiness")).toBeInTheDocument();
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offer").length).toBeGreaterThan(0);
    expect(screen.getByText("Technical Interview - System Design")).toBeInTheDocument();
    expect(screen.getByText(/15 Sept? 2026/)).toBeInTheDocument();
  });
});

describe("Job Discovery & Search", () => {
  it("renders published jobs with real filters and allows saving a job", async () => {
    renderWithClient(<CandidateJobs />);

    expect(await screen.findByText("Explore open opportunities")).toBeInTheDocument();
    expect(await screen.findByText("Senior Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp · Remote")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Job title, skills, keywords…")).toBeInTheDocument();

    const saveButtons = screen.getAllByRole("button", { name: /saved/i });
    expect(saveButtons.length).toBeGreaterThan(0);
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(mockJobsApi.unsave).toHaveBeenCalledWith("j1");
    });
  });

  it("triggers AI search parsing when using Natural Language search", async () => {
    renderWithClient(<CandidateJobs />);

    const aiSearchBtn = await screen.findByRole("button", { name: /ai search/i });
    fireEvent.click(aiSearchBtn);

    const nlInput = screen.getByPlaceholderText("Describe your ideal role in natural language…");
    fireEvent.change(nlInput, { target: { value: "Remote React engineer in Bengaluru" } });

    const applyAiBtn = screen.getByRole("button", { name: /apply ai/i });
    fireEvent.click(applyAiBtn);

    await waitFor(() => {
      expect(mockAiApi.nlSearch).toHaveBeenCalledWith("Remote React engineer in Bengaluru");
    });
  });
});

describe("Job Details & Application", () => {
  it("renders full job details, match calculation, and applies with selected resume", async () => {
    renderWithClient(
      <Routes>
        <Route path="/app/candidate/jobs/:jobId" element={<CandidateJobDetail />} />
      </Routes>,
      "/app/candidate/jobs/j2",
    );

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Beta Systems · Bengaluru")).toBeInTheDocument();
    expect(screen.getByText("Required Skills")).toBeInTheDocument();
    expect(screen.getByText("Role Description & Responsibilities")).toBeInTheDocument();

    const checkMatchBtn = screen.getByRole("button", { name: /check my match score/i });
    fireEvent.click(checkMatchBtn);

    await waitFor(() => {
      expect(mockJobsApi.fit).toHaveBeenCalledWith("j2", "rv1");
    });

    const applyBtn = screen.getByRole("button", { name: /apply for this job/i });
    fireEvent.click(applyBtn);

    expect(await screen.findByText("Submit your application")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /confirm & apply/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockJobsApi.apply).toHaveBeenCalledWith(
        "j2",
        { resumeVersionId: "rv1", source: "direct" },
        expect.any(String),
      );
    });
  });
});

describe("Application Tracking & Hiring Progress", () => {
  it("renders applications list with stage progression and filter tabs", async () => {
    renderWithClient(<ApplicationsPage />);

    expect(await screen.findByText("Track your applications")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("Saved jobs")).toBeInTheDocument();
  });

  it("renders detailed hiring progress journey with stage stepper and withdraw modal", async () => {
    renderWithClient(
      <Routes>
        <Route path="/app/candidate/applications/:applicationId" element={<ApplicationDetail />} />
      </Routes>,
      "/app/candidate/applications/a1",
    );

    expect(await screen.findByText("Hiring Progress")).toBeInTheDocument();
    expect(screen.getByText("Job Snapshot at Application")).toBeInTheDocument();
    expect(screen.getByText("Status History")).toBeInTheDocument();

    const withdrawBtn = screen.getByRole("button", { name: /withdraw application/i });
    fireEvent.click(withdrawBtn);

    expect(await screen.findByText("Withdraw this application?")).toBeInTheDocument();
    const withdrawButtons = screen.getAllByRole("button", { name: "Withdraw application" });
    fireEvent.click(withdrawButtons[withdrawButtons.length - 1]);

    await waitFor(() => {
      expect(mockCandidateApi.withdraw).toHaveBeenCalledWith("a1", "");
    });
  });
});

describe("Interviews & AI Preparation", () => {
  it("renders interview schedule with video meeting link and confirm action", async () => {
    renderWithClient(<CandidateInterviews />);

    expect(await screen.findByText("Your interview schedule")).toBeInTheDocument();
    expect(await screen.findByText("Technical Interview - System Design")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /join interview/i })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );

    const confirmBtn = screen.getByRole("button", { name: /confirm attendance/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockInterviewApi.confirm).toHaveBeenCalledWith("i1");
    });
  });

  it("generates structured AI preparation plan grounded in real requirements", async () => {
    renderWithClient(
      <Routes>
        <Route path="/app/candidate/interviews/:interviewId" element={<InterviewPrep />} />
      </Routes>,
      "/app/candidate/interviews/i1",
    );

    expect(await screen.findByText("Prepare for your interview")).toBeInTheDocument();
    const genBtn = screen.getByRole("button", { name: /generate prep plan/i });
    fireEvent.click(genBtn);

    await waitFor(() => {
      expect(mockInterviewApi.prep).toHaveBeenCalledWith("i1");
    });

    expect(await screen.findByText("Core Competencies & Focus Areas")).toBeInTheDocument();
    expect(screen.getByText("Targeted Practice Questions")).toBeInTheDocument();
    expect(screen.getByText("React Architecture")).toBeInTheDocument();
  });
});

describe("Resume Manager & Details", () => {
  it("renders uploaded resume versions and deterministic ATS score", async () => {
    renderWithClient(<ResumeManager />);

    expect(await screen.findByText("Your resumes")).toBeInTheDocument();
    expect(screen.getByText("Priya_Sharma_Resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("Drop a PDF or DOCX, or browse files")).toBeInTheDocument();
  });

  it("renders parsed skills, ATS score, and AI improvements in resume detail", async () => {
    renderWithClient(
      <Routes>
        <Route path="/app/candidate/resumes/:versionId" element={<ResumeDetail />} />
      </Routes>,
      "/app/candidate/resumes/rv1",
    );

    expect(await screen.findByText("Priya_Sharma_Resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("Extracted resume evidence")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText(/React/)).toBeInTheDocument();

    const analyzeBtn = screen.getByRole("button", { name: /analyze version/i });
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(mockResumeApi.analysis).toHaveBeenCalledWith("rv1");
    });

    expect(await screen.findByText("Prioritized improvements")).toBeInTheDocument();
    expect(screen.getByText("Quantify frontend performance wins")).toBeInTheDocument();
  });
});

describe("Career Copilot AI Assistant", () => {
  it("accepts candidate questions and renders grounded AI responses with recommendations", async () => {
    renderWithClient(<CareerCopilot />);

    expect(await screen.findByText("Ask your career assistant")).toBeInTheDocument();
    const textarea = screen.getByLabelText("What would you like assistance with?");
    fireEvent.change(textarea, { target: { value: "How can I improve my frontend resume?" } });

    const askBtn = screen.getByRole("button", { name: /ask assistant/i });
    fireEvent.click(askBtn);

    await waitFor(() => {
      expect(mockAiApi.run).toHaveBeenCalledWith("career_copilot", {
        text: "How can I improve my frontend resume?",
      });
    });

    expect(await screen.findByText("Actionable Steps")).toBeInTheDocument();
    expect(screen.getByText(/Quantify load time improvements/)).toBeInTheDocument();
  });
});

describe("Saved Jobs & Job Alerts", () => {
  it("renders saved jobs list with unsave action", async () => {
    renderWithClient(<SavedJobsPage />);

    expect(await screen.findByText("Your bookmarked opportunities")).toBeInTheDocument();
    expect(await screen.findByText("Senior Frontend Engineer")).toBeInTheDocument();
  });

  it("renders candidate job alerts and allows toggling active state", async () => {
    renderWithClient(<AlertsPage />);

    expect(await screen.findByText("Your saved job searches")).toBeInTheDocument();
    expect(await screen.findByText("Remote Frontend Roles")).toBeInTheDocument();

    const toggleBtn = screen.getByRole("button", { name: "Active" });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(mockAlertsApi.update).toHaveBeenCalledWith("alert1", { active: false });
    });
  });
});
