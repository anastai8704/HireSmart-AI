// Relative to now: the upcoming fixture must stay upcoming (Requirement 10: buckets follow real time).
const upcomingStart = new Date(Date.now() + 2 * 86400000).toISOString();

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  sampleApplication,
  sampleOfferApplication,
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

  const sampleOfferApplication = {
    _id: "a_offer",
    id: "a_offer",
    job: sampleJob,
    jobSnapshot: {
      title: sampleJob.title,
      company: sampleJob.company,
      location: sampleJob.location,
      workplaceMode: sampleJob.workplaceMode,
    },
    status: "offer",
    appliedAt: "2026-09-01T10:00:00Z",
    offer: {
      status: "issued",
      designation: "Lead Frontend Architect",
      ctc: 3200000,
      currency: "INR",
      joiningDate: "2026-11-01T09:00:00.000Z",
      issuedAt: "2026-09-10T12:00:00.000Z",
    },
    statusHistory: [
      { status: "submitted", changedAt: "2026-09-01T10:00:00Z", note: "Application submitted" },
      { status: "under_review", changedAt: "2026-09-02T10:00:00Z", note: "Recruiter started review" },
      { status: "interview", changedAt: "2026-09-05T10:00:00Z", note: "Interview scheduled" },
      { status: "offer", changedAt: "2026-09-10T12:00:00Z", note: "Offer extended" },
    ],
  };

  const sampleInterview = {
    _id: "i1",
    title: "Technical Interview - System Design",
    type: "video",
    status: "invited",
    // Relative to now so this upcoming fixture stays upcoming (Requirement 10: buckets follow real time).
    scheduledStart: new Date(Date.now() + 2 * 86400000).toISOString(),
    scheduledEnd: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(),
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
      get: vi.fn((id) =>
        Promise.resolve({
          data:
            id === "j2"
              ? sampleJob2
              : id === "j3"
                ? { id: "j3", _id: "j3", title: "Junior QA Tester" }
                : { ...sampleJob, id },
        }),
      ),
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
            sampleOfferApplication,
          ],
          meta: { count: 5 },
        }),
      ),
      application: vi.fn((id) => Promise.resolve({ data: { ...sampleApplication, _id: id } })),
      withdraw: vi.fn(() => Promise.resolve({ data: { ...sampleApplication, status: "withdrawn" } })),
      respondOffer: vi.fn((id, body) =>
        Promise.resolve({
          data: {
            ...sampleApplication,
            _id: id,
            offer: {
              status: body?.response === "accept" ? "accepted" : "declined",
              designation: "Lead Frontend Architect",
              ctc: 3200000,
              currency: "INR",
              responseNote: body?.note,
            },
          },
        }),
      ),
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
      join: vi.fn(() =>
        Promise.resolve({
          data: {
            url: "https://meet.google.com/abc-defg-hij",
            joinState: { canJoin: true, reason: "STARTED", message: "The recruiter has started the interview. You can join now." },
          },
        }),
      ),
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
      create: vi.fn(() => Promise.resolve({ data: { id: "alert-new", name: "New Alert" } })),
      update: vi.fn(() => Promise.resolve({ data: {} })),
      remove: vi.fn(() => Promise.resolve()),
    },
    sampleJob,
    sampleApplication,
    sampleOfferApplication,
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
import { formatDate } from "../../lib/utils";


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
    expect(screen.getByText(/good to see you, priya/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search roles, skills, companies…")).toBeInTheDocument();
    expect(screen.getByText(/profile 100% complete/i)).toBeInTheDocument();
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
    // Date is DD MMM YYYY in Asia/Kolkata, derived from the same instant as the fixture.
    expect(screen.getByText(new RegExp(formatDate(upcomingStart)))).toBeInTheDocument();
  });

  it("filters upcoming interviews correctly across scheduled, invited, in_progress, cancelled, and completed", async () => {
    mockCandidateApi.interviews.mockResolvedValueOnce({
      data: [
        {
          _id: "int_scheduled",
          title: "Scheduled Architecture Round",
          status: "scheduled",
          scheduledStart: new Date(Date.now() + 86400000).toISOString(),
          application: { job: { title: "Lead Architect", company: "Alpha Co" } },
          joinState: { canJoin: false, reason: "WAITING_FOR_RECRUITER", message: "Waiting for recruiter to start" },
        },
        {
          _id: "int_invited",
          title: "Invited Behavioral Round",
          status: "invited",
          scheduledStart: new Date(Date.now() + 2 * 86400000).toISOString(),
          application: { job: { title: "Lead Architect", company: "Alpha Co" } },
          joinState: { canJoin: false, reason: "NOT_STARTED", message: "Waiting for recruiter to start" },
        },
        {
          _id: "int_inprogress",
          title: "Live Technical Round",
          status: "in_progress",
          scheduledStart: new Date(Date.now() - 600000).toISOString(),
          meetingUrl: "https://meet.google.com/live-meeting",
          application: { job: { title: "Staff Engineer", company: "Beta Co" } },
          joinState: { canJoin: true, reason: "STARTED", message: "The recruiter has started the interview. You can join now." },
        },
        {
          _id: "int_cancelled",
          title: "Cancelled Screening Round",
          status: "cancelled",
          scheduledStart: new Date(Date.now() + 3 * 86400000).toISOString(),
          application: { job: { title: "Staff Engineer", company: "Beta Co" } },
        },
        {
          _id: "int_completed",
          title: "Past Completed Round",
          status: "completed",
          scheduledStart: new Date(Date.now() - 86400000).toISOString(),
          application: { job: { title: "Staff Engineer", company: "Beta Co" } },
        },
      ],
      meta: { count: 5 },
    });

    renderWithClient(<CandidateDashboard />);

    expect(await screen.findByText("Scheduled Architecture Round")).toBeInTheDocument();
    expect(screen.getByText("Invited Behavioral Round")).toBeInTheDocument();
    expect(screen.getByText("Live Technical Round")).toBeInTheDocument();
    expect(screen.queryByText("Cancelled Screening Round")).not.toBeInTheDocument();
    expect(screen.queryByText("Past Completed Round")).not.toBeInTheDocument();

    // Verify join button for in-progress interview is enabled and joinable
    const joinButtons = screen.getAllByRole("button", { name: /join interview/i });
    expect(joinButtons.length).toBeGreaterThan(0);
    const enabledJoinButton = joinButtons.find((btn) => !btn.disabled);
    expect(enabledJoinButton).toBeDefined();
  });

  it("calculates profile completion across the 7 distinct fields and links to registered onboarding route", async () => {
    // Missing one field: Location
    mockCandidateApi.profile.mockResolvedValueOnce({
      data: {
        user: {
          id: "u2",
          displayName: "Rahul V",
          headline: "DevOps Specialist",
          location: "",
          bio: "Automating cloud infrastructure.",
          skills: ["Terraform", "Kubernetes"],
          onboardingCompleted: true,
        },
        profile: {
          education: [{ institution: "IIT", degree: "B.Tech" }],
          experience: [{ company: "CloudCorp", position: "DevOps Engineer" }],
        },
      },
    });

    renderWithClient(<CandidateDashboard />);

    // 6 out of 7 completed = 86%
    expect(await screen.findByText(/Profile 86% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/6 of 7 sections/i)).toBeInTheDocument();
    expect(screen.getByText(/Add: Location/i)).toBeInTheDocument();

    // Navigation links point to registered route /app/candidate/onboarding
    const profileLinks = screen.getAllByRole("link", { name: /profile/i });
    const onboardingLinks = profileLinks.filter((link) => link.getAttribute("href") === "/app/candidate/onboarding");
    expect(onboardingLinks.length).toBeGreaterThan(0);
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

  it("renders 'Application Submitted' banner and prevents duplicate applications when already applied", async () => {
    renderWithClient(
      <Routes>
        <Route path="/app/candidate/jobs/:jobId" element={<CandidateJobDetail />} />
      </Routes>,
      "/app/candidate/jobs/j1",
    );

    expect(await screen.findByText("Application Submitted")).toBeInTheDocument();
    expect(screen.getByText(/you applied for this position/i)).toBeInTheDocument();
    expect(screen.getByText("Track Application")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply for this job/i })).toBeNull();
  });

  it("renders benefits only when provided by API and handles missing company/salary safely", async () => {
    const { unmount } = renderWithClient(
      <Routes>
        <Route path="/app/candidate/jobs/:jobId" element={<CandidateJobDetail />} />
      </Routes>,
      "/app/candidate/jobs/j2",
    );

    expect(await screen.findByText("Benefits & Perks")).toBeInTheDocument();
    expect(screen.getByText("Flexible Hours")).toBeInTheDocument();
    unmount();

    renderWithClient(
      <Routes>
        <Route path="/app/candidate/jobs/:jobId" element={<CandidateJobDetail />} />
      </Routes>,
      "/app/candidate/jobs/j3",
    );

    expect(await screen.findByText("Junior QA Tester")).toBeInTheDocument();
    expect(screen.getByText("Company Undisclosed · Location Flexible")).toBeInTheDocument();
    expect(screen.getByText("No detailed description provided for this role.")).toBeInTheDocument();
    expect(screen.queryByText("Benefits & Perks")).toBeNull();
    expect(screen.queryByText(/per year/i)).toBeNull();
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

  it("renders applications summary metrics, stage filters, and allows switching to Offers workspace", async () => {
    renderWithClient(<ApplicationsPage />);

    expect(await screen.findByText("Track your applications")).toBeInTheDocument();

    // Wait for applications data to load
    expect(await screen.findByText(/employment offer extended/i)).toBeInTheDocument();
    expect(screen.getByText("Review Offer Details")).toBeInTheDocument();

    // Summary metric cards
    expect(screen.getByText("Total Applied")).toBeInTheDocument();
    expect(screen.getByText("In Review")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();

    // Search input
    expect(screen.getByPlaceholderText(/search by job title, company, or location/i)).toBeInTheDocument();

    // Switch to Offers & Decisions tab
    const offersTab = screen.getByRole("button", { name: /offers & decisions/i });
    fireEvent.click(offersTab);

    // Offers workspace should show formal offer details
    expect(await screen.findByText(/employment offers & decisions/i)).toBeInTheDocument();
    expect(screen.getAllByText("Lead Frontend Architect").length).toBeGreaterThan(0);
    expect(screen.getByText(/₹32,00,000\/yr/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline offer/i })).toBeInTheDocument();
  });

  it("renders executive offer card and allows accepting an offer with confirmation dialog", async () => {
    mockCandidateApi.application.mockResolvedValueOnce({
      data: sampleOfferApplication,
    });

    renderWithClient(
      <Routes>
        <Route path="/app/candidate/applications/:applicationId" element={<ApplicationDetail />} />
      </Routes>,
      "/app/candidate/applications/a_offer",
    );

    expect(await screen.findByText(/formal employment offer received/i)).toBeInTheDocument();
    expect(screen.getByText("Lead Frontend Architect")).toBeInTheDocument();
    expect(screen.getByText(/₹32,00,000\/yr/i)).toBeInTheDocument();

    // Click Accept Offer to open modal (verify visible green classes: bg-success-600 text-white)
    const acceptBtn = screen.getByRole("button", { name: /^accept offer$/i });
    expect(acceptBtn).toHaveClass("bg-success-600");
    expect(acceptBtn).toHaveClass("text-white");
    expect(acceptBtn).not.toBeDisabled();
    fireEvent.click(acceptBtn);

    expect(await screen.findByText("Confirm Acceptance of Offer")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /confirm acceptance/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCandidateApi.respondOffer).toHaveBeenCalledWith("a_offer", {
        response: "accept",
        note: undefined,
      });
    });
  });

  it("allows declining an offer with confirmation dialog and note", async () => {
    mockCandidateApi.application.mockResolvedValueOnce({
      data: sampleOfferApplication,
    });

    renderWithClient(
      <Routes>
        <Route path="/app/candidate/applications/:applicationId" element={<ApplicationDetail />} />
      </Routes>,
      "/app/candidate/applications/a_offer",
    );

    expect(await screen.findByText(/formal employment offer received/i)).toBeInTheDocument();

    // Fill response note
    const noteInput = screen.getByPlaceholderText(/add an optional note to accompany your decision/i);
    fireEvent.change(noteInput, { target: { value: "Accepted another opportunity. Thank you!" } });

    // Click Decline Offer
    const declineBtn = screen.getByRole("button", { name: /^decline offer$/i });
    fireEvent.click(declineBtn);

    expect(await screen.findByText("Confirm Offer Decline")).toBeInTheDocument();

    const confirmDeclineBtn = screen.getByRole("button", { name: /confirm decline/i });
    fireEvent.click(confirmDeclineBtn);

    await waitFor(() => {
      expect(mockCandidateApi.respondOffer).toHaveBeenCalledWith("a_offer", {
        response: "decline",
        note: "Accepted another opportunity. Thank you!",
      });
    });
  });

  it("renders distinct disabled state when offer has expired and explains why acceptance is unavailable", async () => {
    mockCandidateApi.application.mockResolvedValueOnce({
      data: {
        ...sampleOfferApplication,
        offer: {
          ...sampleOfferApplication.offer,
          status: "expired",
          expiresAt: "2026-08-01T00:00:00Z",
        },
      },
    });

    renderWithClient(
      <Routes>
        <Route path="/app/candidate/applications/:applicationId" element={<ApplicationDetail />} />
      </Routes>,
      "/app/candidate/applications/a_offer",
    );

    expect(await screen.findByText(/this offer has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/acceptance is unavailable/i)).toBeInTheDocument();
    const acceptBtn = screen.getByRole("button", { name: /^accept offer$/i });
    expect(acceptBtn).toBeDisabled();
  });

  it("never exposes internal recruiter notes or private scorecard evaluations to candidate", async () => {
    mockCandidateApi.application.mockResolvedValueOnce({
      data: {
        ...sampleApplication,
        recruiterNotes: "Private candidate assessment: do not share with candidate.",
        scorecard: { rating: 2, internalRemarks: "Weak system design depth." },
      },
    });

    renderWithClient(
      <Routes>
        <Route path="/app/candidate/applications/:applicationId" element={<ApplicationDetail />} />
      </Routes>,
      "/app/candidate/applications/a1",
    );

    expect(await screen.findByText("Hiring Progress")).toBeInTheDocument();
    expect(screen.queryByText(/Private candidate assessment/i)).toBeNull();
    expect(screen.queryByText(/Weak system design depth/i)).toBeNull();
  });
});

describe("Interviews & AI Preparation", () => {
  it("keeps Join disabled and hides the meeting link until the recruiter starts", async () => {
    renderWithClient(<CandidateInterviews />);

    expect(await screen.findByText("Your interview schedule")).toBeInTheDocument();
    expect(await screen.findByText("Technical Interview - System Design")).toBeInTheDocument();
    const join = screen.getByRole("button", { name: /join interview/i });
    expect(join).toBeDisabled();
    expect(screen.getByText(/waiting for the recruiter to start/i)).toBeInTheDocument();
    // The raw link is never rendered for a candidate before the server allows it.
    expect(document.querySelector('a[href="https://meet.google.com/abc-defg-hij"]')).toBeNull();

    const confirmBtn = screen.getByRole("button", { name: /confirm attendance/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockInterviewApi.confirm).toHaveBeenCalledWith("i1");
    });
  });

  it("never renders interviewer feedback to the candidate", async () => {
    mockCandidateApi.interviews.mockImplementationOnce(() =>
      Promise.resolve({
        data: [
          {
            _id: "i9",
            title: "Round with feedback",
            status: "completed",
            scheduledStart: "2026-09-15T10:00:00Z",
            scheduledEnd: "2026-09-15T11:00:00Z",
            timezone: "Asia/Kolkata",
            application: { job: { title: "Backend Engineer", company: "Acme" } },
            feedback: [{ recommendation: "strong_no", summary: "Confidential scorecard summary" }],
            joinState: { canJoin: false, reason: "ENDED", message: "This interview has ended." },
          },
        ],
      }),
    );
    renderWithClient(<CandidateInterviews />);
    fireEvent.click(await screen.findByRole("button", { name: /past & completed/i }));
    expect(await screen.findByText("Round with feedback")).toBeInTheDocument();
    expect(screen.queryByText(/confidential scorecard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strong no/i)).not.toBeInTheDocument();
  });

  it("asks the server for the link only after the recruiter has started the interview", async () => {
    const started = {
      _id: "i1",
      title: "Technical Interview - System Design",
      type: "video",
      status: "in_progress",
      scheduledStart: new Date(Date.now() - 1800000).toISOString(),
      scheduledEnd: new Date(Date.now() + 1800000).toISOString(),
      timezone: "Asia/Kolkata",
      application: { job: { title: "Backend Engineer", company: "Acme" }, candidate: { name: "Asha" } },
      joinState: { canJoin: true, reason: "STARTED", message: "The recruiter has started the interview. You can join now." },
    };
    mockCandidateApi.interviews.mockImplementationOnce(() => Promise.resolve({ data: [started] }));
    const opened = { location: { href: "" }, closed: false, opener: {} };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(opened);

    renderWithClient(<CandidateInterviews />);
    const join = await screen.findByRole("button", { name: /join interview/i });
    expect(join).toBeEnabled();
    fireEvent.click(join);

    await waitFor(() => {
      expect(mockInterviewApi.join).toHaveBeenCalledWith("i1");
    });
    await waitFor(() => {
      expect(opened.location.href).toBe("https://meet.google.com/abc-defg-hij");
    });
    expect(opened.opener).toBeNull();
    openSpy.mockRestore();
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

  it("renders interview overview KPIs and allows submitting a reschedule request", async () => {
    renderWithClient(<CandidateInterviews />);

    expect(await screen.findByText("Technical Interview - System Design")).toBeInTheDocument();
    expect(screen.getByText("Total Interviews")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Pending Confirmation")).toBeInTheDocument();
    expect(screen.getByText("Reschedule Requests")).toBeInTheDocument();

    const rescheduleBtn = screen.getByRole("button", { name: /request reschedule/i });
    fireEvent.click(rescheduleBtn);

    expect(screen.getByText("Request interview reschedule")).toBeInTheDocument();
    const textarea = screen.getByLabelText("Reason and preferred availability");
    fireEvent.change(textarea, { target: { value: "I have a conflicting university exam." } });

    const submitBtn = screen.getByRole("button", { name: /send request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockInterviewApi.reschedule).toHaveBeenCalledWith("i1", "I have a conflicting university exam.");
    });
  });

  it("correctly counts completed interviews and excludes no_show from completed KPI", async () => {
    mockCandidateApi.interviews.mockImplementationOnce(() =>
      Promise.resolve({
        data: [
          {
            _id: "int_completed_1",
            title: "Round 1 Technical",
            status: "completed",
            scheduledStart: "2026-09-01T10:00:00Z",
            scheduledEnd: "2026-09-01T11:00:00Z",
            timezone: "Asia/Kolkata",
            application: { job: { title: "Backend Engineer", company: "Stripe" } },
            joinState: { canJoin: false, reason: "ENDED", message: "This interview has concluded." },
          },
          {
            _id: "int_noshow_1",
            title: "Round 2 Screening",
            status: "no_show",
            scheduledStart: "2026-09-02T10:00:00Z",
            scheduledEnd: "2026-09-02T11:00:00Z",
            timezone: "Asia/Kolkata",
            application: { job: { title: "Backend Engineer", company: "Stripe" } },
            joinState: { canJoin: false, reason: "ENDED", message: "Candidate marked as no-show." },
          },
        ],
      }),
    );

    renderWithClient(<CandidateInterviews />);

    expect(await screen.findByText("1 no-show recorded")).toBeInTheDocument();
    expect(screen.getByText("Total Interviews")).toBeInTheDocument();

    const completedKpi = screen.getByText("Completed").closest(".group");
    expect(within(completedKpi).getByText("1")).toBeInTheDocument();

    const pastTab = screen.getByRole("button", { name: /Past & Completed/i });
    fireEvent.click(pastTab);
    expect(await screen.findByText("Round 1 Technical")).toBeInTheDocument();
    expect(screen.getByText("Round 2 Screening")).toBeInTheDocument();
    expect(screen.getByText("No show")).toBeInTheDocument();
  });

  it("blocks join action and shows ended note for completed or cancelled interviews", async () => {
    mockCandidateApi.interviews.mockImplementationOnce(() =>
      Promise.resolve({
        data: [
          {
            _id: "i-cancelled",
            title: "Cancelled System Design",
            status: "cancelled",
            scheduledStart: "2026-09-10T10:00:00Z",
            timezone: "Asia/Kolkata",
            application: { job: { title: "Lead Architect", company: "Meta" } },
            joinState: { canJoin: false, reason: "CANCELLED", message: "This interview was cancelled." },
          },
        ],
      }),
    );
    renderWithClient(<CandidateInterviews />);
    fireEvent.click(await screen.findByRole("button", { name: /all interviews/i }));

    expect(await screen.findByText("Cancelled System Design")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join interview/i })).toBeNull();
  });
});

describe("Resume Manager & Details", () => {
  it("renders uploaded resume versions and deterministic ATS score", async () => {
    renderWithClient(<ResumeManager />);

    expect(await screen.findByText("Your resumes")).toBeInTheDocument();
    expect(screen.getByText("Priya_Sharma_Resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("Drop a PDF or DOCX, or browse files")).toBeInTheDocument();
  });

  it("renders resume dashboard metrics, download action, and delete confirmation modal", async () => {
    renderWithClient(<ResumeManager />);

    expect(await screen.findByText("Total Resume Versions")).toBeInTheDocument();
    expect(screen.getByText("Ready Resumes")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Failed Processing")).toBeInTheDocument();

    const downloadBtn = screen.getByRole("button", { name: /download/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(mockResumeApi.download).toHaveBeenCalledWith("rv1");
    });

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtn);

    expect(screen.getByText("Delete resume version?")).toBeInTheDocument();
    const confirmDeleteBtn = screen.getByRole("button", { name: /^delete version$/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(mockResumeApi.remove).toHaveBeenCalledWith("rv1");
    });
  });

  it("handles failed resume version state with retry action", async () => {
    mockResumeApi.list.mockImplementationOnce(() =>
      Promise.resolve({
        meta: {
          versions: [
            {
              id: "rv-failed",
              version: 2,
              originalName: "Corrupt_Resume.pdf",
              processingStatus: "failed",
              failure: { code: "CORRUPT_PDF", message: "PDF parser could not extract text" },
              createdAt: "2026-08-02T10:00:00Z",
            },
          ],
        },
      }),
    );
    renderWithClient(<ResumeManager />);

    expect(await screen.findByText("Corrupt_Resume.pdf")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockResumeApi.retry).toHaveBeenCalledWith("rv-failed");
    });
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

  it("allows creating a new persistent job alert via modal", async () => {
    renderWithClient(<AlertsPage />);

    const createBtn = await screen.findByRole("button", { name: /create job alert/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Create new job alert")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Senior React Engineer");
    const queryInput = screen.getByPlaceholderText("e.g. React, Node.js, Frontend, Full Stack");
    const locationInput = screen.getByPlaceholderText("e.g. Surat, Gujarat or Bengaluru or Remote");

    fireEvent.change(nameInput, { target: { value: "Full Stack Engineer" } });
    fireEvent.change(queryInput, { target: { value: "Node.js, React" } });
    fireEvent.change(locationInput, { target: { value: "Surat" } });

    // Click "Remote" workplace mode button
    const remoteBtn = screen.getByRole("button", { name: "Remote" });
    fireEvent.click(remoteBtn);

    // Click "Daily Digest" cadence button
    const dailyBtn = screen.getByRole("button", { name: "Daily Digest" });
    fireEvent.click(dailyBtn);

    const submitBtn = screen.getByRole("button", { name: "Create alert" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAlertsApi.create).toHaveBeenCalledWith({
        name: "Full Stack Engineer",
        query: "Node.js, React",
        location: "Surat",
        workplaceMode: "remote",
        cadence: "daily",
      });
    });
  });

  it("allows editing an existing job alert via modal", async () => {
    renderWithClient(<AlertsPage />);

    expect(await screen.findByText("Remote Frontend Roles")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: /edit/i });
    fireEvent.click(editBtn);

    expect(await screen.findByText("Edit job alert")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Senior React Engineer");
    fireEvent.change(nameInput, { target: { value: "Updated Frontend Lead" } });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAlertsApi.update).toHaveBeenCalledWith("alert1", {
        name: "Updated Frontend Lead",
        query: "React",
        location: "Remote",
        workplaceMode: "",
        cadence: "weekly",
      });
    });
  });

  it("supports continuous typing and editing in Alert Name, Keywords, and Location fields", async () => {
    renderWithClient(<AlertsPage />);

    const createBtn = await screen.findByRole("button", { name: /create job alert/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Create new job alert")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Senior React Engineer");
    const queryInput = screen.getByPlaceholderText("e.g. React, Node.js, Frontend, Full Stack");
    const locationInput = screen.getByPlaceholderText("e.g. Surat, Gujarat or Bengaluru or Remote");

    // Continuous sequential keystrokes
    fireEvent.change(nameInput, { target: { value: "S" } });
    expect(nameInput.value).toBe("S");
    fireEvent.change(nameInput, { target: { value: "Staff" } });
    expect(nameInput.value).toBe("Staff");
    fireEvent.change(nameInput, { target: { value: "Staff Engineer" } });
    expect(nameInput.value).toBe("Staff Engineer");

    // Query continuous typing
    fireEvent.change(queryInput, { target: { value: "Python" } });
    expect(queryInput.value).toBe("Python");
    fireEvent.change(queryInput, { target: { value: "Python, Django, FastAPI" } });
    expect(queryInput.value).toBe("Python, Django, FastAPI");

    // Location continuous typing
    fireEvent.change(locationInput, { target: { value: "Remote, India" } });
    expect(locationInput.value).toBe("Remote, India");
  });
});
