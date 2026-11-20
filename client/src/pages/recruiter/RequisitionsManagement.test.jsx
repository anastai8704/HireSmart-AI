import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequisitionsDashboard } from "./RequisitionsDashboard";
import { JobEditorPage } from "./JobEditorPage";

const {
  mockAuth,
  mockToast,
  mockJobsApi,
  mockAnalyticsApi,
  mockSubscriptionApi,
  mockOrganizationApi,
  mockAiApi,
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
    logout: vi.fn(),
    setOrganizationId: vi.fn(),
  },
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  mockJobsApi: {
    orgList: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    close: vi.fn(),
    assigned: vi.fn(),
    setHiringTeam: vi.fn(),
  },
  mockAnalyticsApi: {
    recruitment: vi.fn(),
  },
  mockSubscriptionApi: {
    overview: vi.fn(),
    current: vi.fn(),
  },
  mockOrganizationApi: {
    members: vi.fn(),
  },
  mockAiApi: {
    runOrg: vi.fn(),
  },
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => mockToast,
}));

vi.mock("../../lib/api", () => ({
  jobsApi: mockJobsApi,
  analyticsApi: mockAnalyticsApi,
  subscriptionApi: mockSubscriptionApi,
  organizationApi: mockOrganizationApi,
  aiApi: mockAiApi,
}));

// Sample test jobs
const sampleJobs = [
  {
    id: "job-1",
    _id: "job-1",
    title: "Senior Full Stack Engineer",
    company: "Apex Innovations",
    location: "Bengaluru, Karnataka",
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    salary: 2400000,
    compensation: { min: 2000000, max: 2800000, currency: "INR", period: "year" },
    experience: "4-6 years",
    minExpYears: 4,
    maxExpYears: 6,
    educationRequired: "B.Tech in CS or related field",
    requiredSkills: ["React", "Node.js", "TypeScript", "PostgreSQL"],
    preferredSkills: ["GraphQL", "Docker"],
    benefits: ["Health Insurance", "Remote Flexibility"],
    description: "Build scalable web applications and distributed systems for our high-growth platform.",
    moderation: { status: "approved" },
    pendingChanges: null,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-15T10:00:00Z",
  },
  {
    id: "job-2",
    _id: "job-2",
    title: "Product Designer",
    company: "Apex Innovations",
    location: "Remote",
    jobType: "Full-Time",
    workplaceMode: "remote",
    status: "draft",
    salary: 1600000,
    compensation: { min: 1400000, max: 1800000, currency: "INR", period: "year" },
    experience: "3+ years",
    requiredSkills: ["Figma", "UI/UX", "Design Systems"],
    preferredSkills: ["User Research"],
    description: "Design delightful web and mobile interfaces for next-generation recruitment tooling.",
    moderation: { status: "none" },
    pendingChanges: null,
    createdAt: "2026-10-05T10:00:00Z",
    updatedAt: "2026-10-10T10:00:00Z",
  },
  {
    id: "job-3",
    _id: "job-3",
    title: "DevOps Engineer",
    company: "Apex Innovations",
    location: "Hyderabad, Telangana",
    jobType: "Full-Time",
    workplaceMode: "onsite",
    status: "published",
    salary: 2200000,
    compensation: { min: 2000000, max: 2500000, currency: "INR", period: "year" },
    experience: "5+ years",
    requiredSkills: ["Kubernetes", "AWS", "Terraform", "CI/CD"],
    description: "Architect and maintain secure multi-cloud infrastructure and deployment automation.",
    moderation: { status: "pending" },
    pendingChanges: null,
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-14T10:00:00Z",
  },
  {
    id: "job-4",
    _id: "job-4",
    title: "Marketing Lead",
    company: "Apex Innovations",
    location: "Mumbai, Maharashtra",
    jobType: "Full-Time",
    workplaceMode: "hybrid",
    status: "published",
    salary: 1800000,
    experience: "4+ years",
    requiredSkills: ["Content Strategy", "SEO", "Growth"],
    description: "Drive talent acquisition brand awareness and recruiter community engagement campaigns.",
    moderation: {
      status: "rejected",
      reason: "Compensation details or job location must specify compliant local wage terms.",
    },
    pendingChanges: null,
    createdAt: "2026-10-08T10:00:00Z",
    updatedAt: "2026-10-11T10:00:00Z",
  },
  {
    id: "job-5",
    _id: "job-5",
    title: "Frontend Intern",
    company: "Apex Innovations",
    location: "Bengaluru, Karnataka",
    jobType: "Internship",
    workplaceMode: "onsite",
    status: "closed",
    salary: 360000,
    experience: "0-1 years",
    requiredSkills: ["JavaScript", "HTML", "CSS"],
    description: "Assist engineering team with UI component library development and automated tests.",
    moderation: { status: "approved" },
    pendingChanges: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-30T10:00:00Z",
  },
];

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Phase 3D: Requisitions & Job Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockJobsApi.orgList.mockResolvedValue({
      data: sampleJobs,
      meta: { total: sampleJobs.length },
    });

    mockJobsApi.get.mockImplementation((jobId) => {
      const match = sampleJobs.find((j) => j.id === jobId || j._id === jobId);
      return Promise.resolve({ data: match || sampleJobs[0] });
    });

    mockAnalyticsApi.recruitment.mockResolvedValue({
      data: {
        jobPerformance: [
          { job: "job-1", applications: 18, shortlisted: 6, interviews: 4, hires: 1 },
          { job: "job-3", applications: 7, shortlisted: 2, interviews: 1, hires: 0 },
        ],
      },
    });

    const defaultSub = {
      data: {
        plan: { id: "recruiter_growth", name: "Growth Plan" },
        entitlements: { activeJobs: 10 },
        usage: { activeJobs: 3 },
      },
    };
    mockSubscriptionApi.overview.mockResolvedValue(defaultSub);
    mockSubscriptionApi.current.mockResolvedValue(defaultSub);

    mockOrganizationApi.members.mockResolvedValue({
      data: [
        { _id: "m-1", user: { name: "Priya Sharma", email: "priya@apex.example" }, role: "owner" },
        { _id: "m-2", user: { name: "Ananya Iyer", email: "ananya@apex.example" }, role: "recruiter" },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 6 KPI lifecycle metric cards with correct counts", async () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    });

    // Verify 6 KPI Cards: Total Jobs, Published, Drafts, Pending Approval, Rejected, Closed
    expect(screen.getByText("Total Jobs")).toBeInTheDocument();
    expect(screen.getByText("Published / Active")).toBeInTheDocument();
    expect(screen.getByText("Drafts")).toBeInTheDocument();
    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Closed / Expired")).toBeInTheDocument();

    expect(screen.getByTestId("kpi-total-jobs")).toHaveTextContent("5");
    expect(screen.getByTestId("kpi-draft-jobs")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-pending-jobs")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-rejected-jobs")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-closed-jobs")).toHaveTextContent("1");
  });

  it("filters jobs by search query (title, location, skills)", async () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by title/i);

    // Search by title
    fireEvent.change(searchInput, { target: { value: "DevOps" } });
    expect(screen.getByText("DevOps Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Senior Full Stack Engineer")).not.toBeInTheDocument();

    // Search by location
    fireEvent.change(searchInput, { target: { value: "Bengaluru" } });
    expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    expect(screen.getByText("Frontend Intern")).toBeInTheDocument();
    expect(screen.queryByText("Product Designer")).not.toBeInTheDocument();

    // Search by skill
    fireEvent.change(searchInput, { target: { value: "Kubernetes" } });
    expect(screen.getByText("DevOps Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Product Designer")).not.toBeInTheDocument();
  });

  it("filters jobs by status and workplace mode", async () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    });

    // Filter by status: Draft
    const statusCombobox = screen.getByRole("combobox", { name: /filter by status/i });
    fireEvent.keyDown(statusCombobox, { key: "ArrowDown" });
    const draftOption = screen.getByRole("option", { name: "Draft" });
    fireEvent.mouseDown(draftOption);

    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.queryByText("Senior Full Stack Engineer")).not.toBeInTheDocument();

    // Reset status filter to All
    fireEvent.keyDown(statusCombobox, { key: "ArrowDown" });
    fireEvent.mouseDown(screen.getByRole("option", { name: "All Statuses" }));

    // Filter by workplace: Remote
    const workplaceCombobox = screen.getByRole("combobox", { name: /filter by workplace/i });
    fireEvent.keyDown(workplaceCombobox, { key: "ArrowDown" });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Remote" }));

    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.queryByText("DevOps Engineer")).not.toBeInTheDocument();
  });

  it("displays candidate pipeline metrics and link for active jobs", async () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    });

    // job-1 has pipeline: 18 applied, 6 shortlisted, 4 interviews, 1 hires
    const card = screen.getByTestId("job-card-job-1");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("18"); // Applied
    expect(card).toHaveTextContent("6"); // Shortlisted
    expect(card).toHaveTextContent("4"); // Interviews
    expect(card).toHaveTextContent("1"); // Hires

    // Link to candidate pipeline
    const pipelineBtn = card.querySelector('a[href*="/applications"]');
    expect(pipelineBtn).toBeInTheDocument();
    expect(pipelineBtn.getAttribute("href")).toBe("/app/o/org-apex-100/jobs/job-1/applications");
  });

  it("opens close requisition modal and closes job upon confirmation", async () => {
    mockJobsApi.close.mockResolvedValue({ data: { id: "job-1", status: "closed" } });

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Senior Full Stack Engineer")).toBeInTheDocument();
    });

    const card = screen.getByTestId("job-card-job-1");
    const closeBtn = card.querySelector('button[data-action="close-job"]');
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Close this job requisition\?/i)).toBeInTheDocument();
    });

    // Confirm close
    const confirmBtn = screen.getByRole("button", { name: /^Close Job$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockJobsApi.close).toHaveBeenCalledWith("org-apex-100", "job-1");
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/closed/i));
    });
  });

  it("shows subscription posting limit banner when limit is reached", async () => {
    // Mock subscription at capacity (1 of 1 published used)
    const limitedSub = {
      data: {
        plan: { id: "recruiter_starter", name: "Starter Plan" },
        entitlements: { activeJobs: 1 },
        usage: { activeJobs: 1 },
      },
    };
    mockSubscriptionApi.overview.mockResolvedValue(limitedSub);
    mockSubscriptionApi.current.mockResolvedValue(limitedSub);

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs" element={<RequisitionsDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Active job posting limit reached/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Upgrade Plan/i)).toBeInTheDocument();
    const createBtn = screen.getByRole("link", { name: /Create Requisition/i });
    expect(createBtn).toHaveAttribute("aria-disabled", "true");
  });

  it("validates required fields in JobEditorPage", async () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs/new"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs/new" element={<JobEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Create Job Requisition")).toBeInTheDocument();
    });

    // Submit without required fields
    const saveBtn = screen.getByRole("button", { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Job title is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Location is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Description is required/i)).toBeInTheDocument();
    });

    expect(mockJobsApi.create).not.toHaveBeenCalled();
  });

  it("saves a draft job with formatted payload", async () => {
    mockJobsApi.create.mockResolvedValue({
      data: {
        id: "job-new-1",
        title: "Staff Platform Architect",
        status: "draft",
      },
    });

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs/new"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs/new" element={<JobEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Create Job Requisition")).toBeInTheDocument();
    });

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/Job Title/i), {
      target: { value: "Staff Platform Architect" },
    });
    fireEvent.change(screen.getByLabelText(/Hiring Company/i), {
      target: { value: "Apex Innovations" },
    });
    fireEvent.change(screen.getByLabelText(/Location/i), {
      target: { value: "Bengaluru, India" },
    });
    fireEvent.change(screen.getByLabelText(/Experience Summary/i), {
      target: { value: "8+ years" },
    });
    fireEvent.change(screen.getByLabelText(/Required Skills/i), {
      target: { value: "Architecture, Golang, Kubernetes" },
    });
    fireEvent.change(screen.getByLabelText(/Description Content/i), {
      target: {
        value: "Architect high throughput core systems handling over 100 million daily transactions.",
      },
    });

    const saveBtn = screen.getByRole("button", { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockJobsApi.create).toHaveBeenCalledWith(
        "org-apex-100",
        expect.objectContaining({
          title: "Staff Platform Architect",
          company: "Apex Innovations",
          location: "Bengaluru, India",
          experience: "8+ years",
          requiredSkills: ["Architecture", "Golang", "Kubernetes"],
          description: "Architect high throughput core systems handling over 100 million daily transactions.",
        }),
      );
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/saved/i));
    });
  });

  it("displays admin rejection feedback on rejected job", async () => {
    mockJobsApi.get.mockResolvedValue({ data: sampleJobs[3] }); // job-4 is rejected

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs/job-4/edit"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs/:jobId/edit" element={<JobEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Requisition Rejected by Platform Review/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Compensation details or job location must specify compliant local wage terms/i),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Resubmit for Approval/i })).toBeInTheDocument();
  });

  it("opens live candidate preview modal with formatted requisition details", async () => {
    mockJobsApi.get.mockResolvedValue({ data: sampleJobs[0] });

    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/app/o/org-apex-100/jobs/job-1/edit"]}>
          <Routes>
            <Route path="/app/o/:organizationId/jobs/:jobId/edit" element={<JobEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Edit Requisition: Senior Full Stack Engineer/i)).toBeInTheDocument();
    });

    // Click Live Preview
    const previewBtn = screen.getByRole("button", { name: /Live Preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText("Candidate View Preview")).toBeInTheDocument();
      expect(
        screen.getByText("This shows how candidates see your job requisition on the discovery board."),
      ).toBeInTheDocument();
    });

    // Check preview content elements
    expect(screen.getAllByText("Senior Full Stack Engineer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Offered CTC \/ Year/i)).toBeInTheDocument();
    expect(screen.getByText(/₹20,00,000 - ₹28,00,000 \/ yr/i)).toBeInTheDocument();
    expect(screen.getByText("B.Tech in CS or related field")).toBeInTheDocument();
    expect(screen.getByText("Health Insurance")).toBeInTheDocument();
  });
});
