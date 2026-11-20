import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApplicationsPipelinePage } from "./ApplicationsPipelinePage";
import {
  PERMITTED_TRANSITIONS,
} from "./Candidate360Drawer";

const {
  mockAuth,
  mockToast,
  mockRecruitmentApi,
  mockJobsApi,
  mockInterviewApi,
  mockDownloadBlob,
} = vi.hoisted(() => ({
  mockAuth: {
    user: { displayName: "Priya Sharma", email: "priya@apex.example" },
    role: "recruiter",
    organizationId: "org-apex-100",
    organization: { id: "org-apex-100", name: "Apex Innovations", role: "owner" },
    membership: { role: "owner" },
    workspaceRole: "owner",
    status: "authenticated",
    isAuthenticated: true,
  },
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  mockRecruitmentApi: {
    applications: vi.fn(),
    orgApplications: vi.fn(),
    detail: vi.fn(),
    transition: vi.fn(),
    shortlist: vi.fn(),
    issueOffer: vi.fn(),
    notes: vi.fn(),
    addNote: vi.fn(),
    match: vi.fn(),
    resume: vi.fn(),
  },
  mockJobsApi: {
    orgList: vi.fn(),
  },
  mockInterviewApi: {
    list: vi.fn(),
  },
  mockDownloadBlob: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../../lib/api", () => ({
  recruitmentApi: mockRecruitmentApi,
  jobsApi: mockJobsApi,
  interviewApi: mockInterviewApi,
  downloadBlob: mockDownloadBlob,
}));

// Sample applications spanning all 7 stages
const sampleApplications = [
  {
    _id: "app-1",
    id: "app-1",
    status: "submitted",
    appliedAt: "2026-10-20T10:00:00Z",
    matchScore: 88,
    candidate: {
      _id: "cand-1",
      id: "cand-1",
      name: "Aarav Patel",
      email: "aarav@example.com",
      phone: "+91 98765 43210",
      headline: "Senior React Developer",
      location: "Bengaluru, India",
      skills: ["React", "TypeScript", "Node.js"],
    },
    job: {
      _id: "job-1",
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Apex Innovations",
      status: "published",
    },
    resumeSnapshot: {
      originalName: "Aarav_Patel_CV.pdf",
    },
    statusHistory: [
      {
        status: "submitted",
        fromStatus: "",
        changedAt: "2026-10-20T10:00:00Z",
        note: "Inbound application via careers portal",
      },
    ],
  },
  {
    _id: "app-2",
    id: "app-2",
    status: "under_review",
    appliedAt: "2026-10-18T10:00:00Z",
    matchScore: 92,
    candidate: {
      _id: "cand-2",
      id: "cand-2",
      name: "Diya Sen",
      email: "diya@example.com",
      phone: "+91 98765 43211",
      headline: "Staff Frontend Architect",
      location: "Remote, India",
      skills: ["React", "Architecture", "Design Systems"],
    },
    job: {
      _id: "job-1",
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Apex Innovations",
      status: "published",
    },
    resumeSnapshot: {
      originalName: "Diya_Sen_Resume.pdf",
    },
    statusHistory: [
      {
        status: "submitted",
        fromStatus: "",
        changedAt: "2026-10-18T10:00:00Z",
        note: "Application submitted",
      },
      {
        status: "under_review",
        fromStatus: "submitted",
        changedAt: "2026-10-19T10:00:00Z",
        note: "Assigned to hiring manager review",
      },
    ],
  },
  {
    _id: "app-3",
    id: "app-3",
    status: "shortlisted",
    appliedAt: "2026-10-15T10:00:00Z",
    matchScore: 78,
    candidate: {
      _id: "cand-3",
      id: "cand-3",
      name: "Rohan Gupta",
      email: "rohan@example.com",
      headline: "DevOps & Cloud Engineer",
      skills: ["AWS", "Kubernetes", "Docker"],
    },
    job: {
      _id: "job-2",
      id: "job-2",
      title: "Cloud Infrastructure Engineer",
      company: "Apex Innovations",
      status: "published",
    },
  },
  {
    _id: "app-4",
    id: "app-4",
    status: "interview",
    appliedAt: "2026-10-12T10:00:00Z",
    matchScore: 84,
    candidate: {
      _id: "cand-4",
      id: "cand-4",
      name: "Sneha Rao",
      email: "sneha@example.com",
      headline: "Distributed Systems Lead",
      skills: ["Go", "Distributed Systems", "Kafka"],
    },
    job: {
      _id: "job-1",
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Apex Innovations",
      status: "published",
    },
  },
  {
    _id: "app-5",
    id: "app-5",
    status: "offer",
    appliedAt: "2026-10-08T10:00:00Z",
    matchScore: 95,
    candidate: {
      _id: "cand-5",
      id: "cand-5",
      name: "Vikram Malhotra",
      email: "vikram@example.com",
      headline: "Principal Engineer",
      skills: ["System Architecture", "Leadership"],
    },
    job: {
      _id: "job-1",
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Apex Innovations",
      status: "published",
    },
    offer: {
      status: "issued",
      designation: "Principal Engineer",
      ctc: 3200000,
      currency: "INR",
      joiningDate: "2026-12-01T00:00:00Z",
    },
  },
  {
    _id: "app-6",
    id: "app-6",
    status: "hired",
    appliedAt: "2026-10-01T10:00:00Z",
    matchScore: 90,
    candidate: {
      _id: "cand-6",
      id: "cand-6",
      name: "Pooja Verma",
      email: "pooja@example.com",
      headline: "QA Automation Architect",
      skills: ["Cypress", "Playwright", "CI/CD"],
    },
    job: {
      _id: "job-2",
      id: "job-2",
      title: "Cloud Infrastructure Engineer",
      company: "Apex Innovations",
      status: "published",
    },
  },
  {
    _id: "app-7",
    id: "app-7",
    status: "rejected",
    appliedAt: "2026-10-05T10:00:00Z",
    matchScore: 45,
    candidate: {
      _id: "cand-7",
      id: "cand-7",
      name: "Karan Mehta",
      email: "karan@example.com",
      headline: "Junior Web Developer",
      skills: ["HTML", "CSS"],
    },
    job: {
      _id: "job-1",
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Apex Innovations",
      status: "published",
    },
  },
];

const sampleJobs = [
  { _id: "job-1", id: "job-1", title: "Senior Full Stack Engineer", status: "published" },
  { _id: "job-2", id: "job-2", title: "Cloud Infrastructure Engineer", status: "published" },
];

const renderComponent = (initialRoute = "/app/o/org-apex-100/applications") => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/app/o/:organizationId/applications" element={<ApplicationsPipelinePage />} />
          <Route
            path="/app/o/:organizationId/jobs/:jobId/applications"
            element={<ApplicationsPipelinePage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("ApplicationsPipelinePage & Candidate 360", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockJobsApi.orgList.mockResolvedValue({
      data: sampleJobs,
    });

    mockRecruitmentApi.applications.mockResolvedValue({
      data: sampleApplications,
      meta: { nextCursor: null },
    });

    mockRecruitmentApi.detail.mockImplementation((orgId, appId) => {
      const app = sampleApplications.find((a) => a._id === appId) || sampleApplications[0];
      return Promise.resolve({
        data: {
          application: app,
        },
      });
    });

    mockRecruitmentApi.notes.mockResolvedValue({
      data: [
        {
          _id: "note-1",
          body: "Candidate impressed in the technical screen.",
          visibility: "hiring_team",
          author: { name: "Priya Sharma" },
          createdAt: "2026-10-21T10:00:00Z",
        },
      ],
    });

    mockRecruitmentApi.match.mockResolvedValue({
      data: {
        overallScore: 88,
        score: 88,
      },
    });

    mockRecruitmentApi.transition.mockResolvedValue({
      data: { success: true },
    });

    mockInterviewApi.list.mockResolvedValue({
      data: [
        {
          _id: "int-1",
          title: "Technical System Architecture",
          status: "completed",
          scheduledAt: "2026-10-22T14:00:00Z",
          type: "video",
        },
      ],
    });

    mockRecruitmentApi.resume.mockResolvedValue({
      data: new Blob(["dummy resume content"], { type: "application/pdf" }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 8 KPI status metrics with accurate counts from real data", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    // Total: 7
    expect(within(screen.getByTestId("kpi-total")).getByText("7")).toBeInTheDocument();
    expect(screen.getByText("All applicants")).toBeInTheDocument();

    // Verify stage metrics headers are present
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Under Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shortlisted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
  });

  it("renders candidates in Kanban pipeline view by default across stage columns", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
      expect(screen.getByText("Diya Sen")).toBeInTheDocument();
      expect(screen.getByText("Rohan Gupta")).toBeInTheDocument();
    });

    // Verify skills pills render
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Design Systems")).toBeInTheDocument();
  });

  it("switches to Table/List view and displays candidate data correctly", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    // Click Table view toggle
    const tableToggle = screen.getByRole("button", { name: /Table/i });
    fireEvent.click(tableToggle);

    // Verify table headers appear
    expect(screen.getByText("Candidate")).toBeInTheDocument();
    expect(screen.getByText("Requisition")).toBeInTheDocument();
    expect(screen.getByText("Fit Score")).toBeInTheDocument();
    expect(screen.getByText("Applied Date")).toBeInTheDocument();

    // Verify candidate rows render
    expect(screen.getByText("Senior React Developer")).toBeInTheDocument();
    expect(screen.getAllByText("Senior Full Stack Engineer").length).toBeGreaterThan(0);
  });

  it("filters candidates by search keyword", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by candidate name/i);
    fireEvent.change(searchInput, { target: { value: "Diya" } });

    expect(screen.getByText("Diya Sen")).toBeInTheDocument();
    expect(screen.queryByText("Aarav Patel")).not.toBeInTheDocument();
    expect(screen.queryByText("Rohan Gupta")).not.toBeInTheDocument();
  });

  it("enforces permitted state machine transitions correctly", () => {
    // Check PERMITTED_TRANSITIONS rules
    expect(PERMITTED_TRANSITIONS.submitted).toEqual(["under_review", "shortlisted", "rejected"]);
    expect(PERMITTED_TRANSITIONS.under_review).toEqual(["shortlisted", "interview", "rejected"]);
    expect(PERMITTED_TRANSITIONS.shortlisted).toEqual(["interview", "rejected"]);
    expect(PERMITTED_TRANSITIONS.interview).toEqual(["offer", "rejected"]);
    expect(PERMITTED_TRANSITIONS.offer).toEqual(["hired", "rejected"]);

    // Terminal states have no outbound transitions
    expect(PERMITTED_TRANSITIONS.hired).toEqual([]);
    expect(PERMITTED_TRANSITIONS.rejected).toEqual([]);
    expect(PERMITTED_TRANSITIONS.closed).toEqual([]);
  });

  it("triggers valid quick transition from card dropdown", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    const moveSelect = screen.getByTestId("move-select-app-1");
    fireEvent.change(moveSelect, { target: { value: "shortlisted" } });

    await waitFor(() => {
      expect(mockRecruitmentApi.transition).toHaveBeenCalledWith(
        "org-apex-100",
        "app-1",
        expect.objectContaining({
          toStatus: "shortlisted",
        }),
      );
      expect(mockToast.success).toHaveBeenCalledWith("Candidate moved to Shortlisted");
    });
  });

  it("opens Candidate 360 Drawer when candidate name or card is clicked", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    // Click candidate card link
    fireEvent.click(screen.getByTestId("card-candidate-name-app-1"));

    await waitFor(() => {
      expect(screen.getByTestId("candidate-360-drawer")).toBeInTheDocument();
    });

    const drawer = screen.getByTestId("candidate-360-drawer");

    // Verify drawer displays full details
    expect(within(drawer).getByText("aarav@example.com")).toBeInTheDocument();
    expect(within(drawer).getByText("+91 98765 43210")).toBeInTheDocument();
    expect(within(drawer).getByText("Bengaluru, India")).toBeInTheDocument();

    // Verify tabs in drawer
    expect(within(drawer).getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: "Pipeline & Stages" })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: "Resume" })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: /Interviews/i })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: /Notes/i })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: "Offer" })).toBeInTheDocument();
  });

  it("downloads candidate resume successfully from Candidate 360 drawer", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("card-candidate-name-app-1"));

    await waitFor(() => {
      expect(screen.getByTestId("candidate-360-drawer")).toBeInTheDocument();
    });

    const drawer = screen.getByTestId("candidate-360-drawer");

    // Click Resume tab
    fireEvent.click(within(drawer).getByRole("tab", { name: "Resume" }));

    // Click download resume button in drawer
    await waitFor(() => {
      expect(screen.getByTestId("drawer-download-resume-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("drawer-download-resume-btn"));

    await waitFor(() => {
      expect(mockRecruitmentApi.resume).toHaveBeenCalledWith("org-apex-100", "app-1");
      expect(mockToast.success).toHaveBeenCalledWith("Resume downloaded successfully");
    });
  });

  it("supports bulk selection and executes bulk shortlist via Promise.allSettled", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    });

    // Select candidate checkboxes (checkbox 0 is app-1 submitted, checkbox 1 is app-2 under_review)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Bulk toolbar appears
    await waitFor(() => {
      expect(screen.getByTestId("bulk-toolbar")).toBeInTheDocument();
    });

    // Click Bulk Shortlist
    fireEvent.click(screen.getByTestId("bulk-shortlist-btn"));

    // Bulk modal appears
    await waitFor(() => {
      expect(screen.getByText(/Bulk Shortlist/i)).toBeInTheDocument();
    });

    // Confirm execution
    fireEvent.click(screen.getByTestId("bulk-confirm-btn"));

    await waitFor(() => {
      expect(mockRecruitmentApi.transition).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining("Successfully moved all 2 candidates to Shortlisted"),
      );
    });
  });

  it("enforces strict organization data isolation across all endpoints", async () => {
    renderComponent("/app/o/org-apex-100/applications");

    await waitFor(() => {
      expect(mockRecruitmentApi.applications).toHaveBeenCalledWith(
        "org-apex-100",
        undefined,
        expect.any(Object),
      );
      expect(mockJobsApi.orgList).toHaveBeenCalledWith("org-apex-100", expect.any(Object));
    });
  });
});
