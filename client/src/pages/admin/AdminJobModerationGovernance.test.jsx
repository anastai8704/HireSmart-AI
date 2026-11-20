import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminModeration from "./AdminModeration";

const { adminApi } = vi.hoisted(() => ({
  adminApi: {
    moderationCompanies: vi.fn(),
    companyModerationJobs: vi.fn(),
    moderationJobDetail: vi.fn(),
    orgVerificationDetails: vi.fn(),
    moderate: vi.fn(),
    bulkApproveJobs: vi.fn(),
    bulkModerate: vi.fn(),
  },
}));

vi.mock("../../lib/api", () => ({ adminApi }));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("../../components/ui/useToast", () => ({
  useToast: () => mockToast,
}));

const mockCompanies = [
  {
    organizationId: "org-apex-100",
    _id: "org-apex-100",
    companyName: "Apex Cybernetics India Pvt Ltd",
    companySlug: "apex-cybernetics",
    industry: "Enterprise AI & Cloud",
    verificationStatus: "verified",
    riskScore: 15,
    riskFlags: [],
    jobCounts: {
      total: 5,
      pending: 2,
      eligible: 2,
      approved: 2,
      rejected: 0,
      changesRequested: 1,
      suspended: 0,
      closed: 0,
      drafts: 0,
    },
    latestSubmission: "2026-11-17T10:00:00.000Z",
    jobs: [
      {
        id: "job-apex-01",
        _id: "job-apex-01",
        title: "Senior AI Platform Architect",
        department: "AI Infrastructure",
        location: "Bengaluru, Karnataka",
        workplaceMode: "hybrid",
        jobType: "full_time",
        employmentType: "full_time",
        status: "published",
        salary: 4500000,
        compensation: { min: 4000000, max: 5000000, currency: "INR", period: "year" },
        moderation: { status: "pending" },
        changeReview: null,
        createdAt: "2026-11-17T10:00:00.000Z",
      },
      {
        id: "job-apex-02",
        _id: "job-apex-02",
        title: "Staff Distributed Systems Engineer",
        department: "Cloud Platforms",
        location: "Pune, Maharashtra",
        workplaceMode: "remote",
        jobType: "full_time",
        employmentType: "full_time",
        status: "published",
        salary: 3800000,
        compensation: { min: 3500000, max: 4200000, currency: "INR", period: "year" },
        moderation: { status: "pending" },
        changeReview: null,
        createdAt: "2026-11-17T11:00:00.000Z",
      },
    ],
  },
  {
    organizationId: "org-shadow-200",
    _id: "org-shadow-200",
    companyName: "Shadow Mining Global Network",
    companySlug: "shadow-mining",
    industry: "Cryptocurrency",
    verificationStatus: "pending",
    riskScore: 78,
    riskFlags: [{ flag: "NO_CIN_GSTIN", message: "No registration documentation provided" }],
    jobCounts: {
      total: 1,
      pending: 1,
      eligible: 0,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
      suspended: 0,
      closed: 0,
      drafts: 0,
    },
    latestSubmission: "2026-11-16T15:00:00.000Z",
    jobs: [
      {
        id: "job-shadow-01",
        _id: "job-shadow-01",
        title: "Crypto Payout Assistant",
        department: "Operations",
        location: "Remote",
        workplaceMode: "remote",
        jobType: "part_time",
        employmentType: "part_time",
        status: "published",
        salary: 1200000,
        compensation: { min: 1000000, max: 1400000, currency: "INR", period: "year" },
        moderation: { status: "pending" },
        changeReview: null,
        createdAt: "2026-11-16T15:00:00.000Z",
      },
    ],
  },
];

const mockJobDetail = {
  data: {
    id: "job-apex-01",
    _id: "job-apex-01",
    title: "Senior AI Platform Architect",
    company: "Apex Cybernetics India Pvt Ltd",
    location: "Bengaluru, Karnataka",
    department: "AI Infrastructure",
    workplaceMode: "hybrid",
    jobType: "full_time",
    employmentType: "full_time",
    organization: {
      id: "org-apex-100",
      _id: "org-apex-100",
      name: "Apex Cybernetics India Pvt Ltd",
      slug: "apex-cybernetics",
      verificationStatus: "verified",
      riskScore: 15,
      riskFlags: [],
    },
    recruiter: {
      id: "usr-rec-01",
      name: "Radhika Sharma",
      email: "radhika@apex.io",
    },
    status: "published",
    version: 1,
    skills: ["Python", "Kubernetes", "PyTorch", "gRPC", "Distributed Training"],
    requiredSkills: ["Python", "Kubernetes", "PyTorch"],
    preferredSkills: ["Ray", "CUDA", "vLLM"],
    description: "Design high-performance distributed LLM training workflows and multi-node clusters.",
    experience: "8+ years",
    minExpYears: 8,
    maxExpYears: 15,
    educationRequired: "B.Tech / M.Tech in CS or equivalent",
    compensation: { min: 4000000, max: 5000000, currency: "INR", period: "year" },
    salary: 4500000,
    salaryInrLpa: "₹45.0 LPA",
    moderation: { status: "pending", reason: "" },
    changeReview: null,
    history: [
      {
        id: "ev-01",
        fromStatus: "none",
        toStatus: "pending",
        reason: "Initial job submission",
        actor: { name: "Radhika Sharma" },
        createdAt: "2026-11-17T10:00:00.000Z",
      },
    ],
    applicationQuestions: [
      { question: "How many years of distributed AI cluster experience do you have?" },
    ],
    createdAt: "2026-11-17T10:00:00.000Z",
  },
};

const renderModeration = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/admin/moderation"]}>
        <AdminModeration />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  adminApi.moderationCompanies.mockResolvedValue({
    data: mockCompanies,
    meta: {
      total: 2,
      counts: {
        total: 6,
        pending: 3,
        approved: 2,
        rejected: 0,
        changesRequested: 1,
        suspended: 0,
      },
    },
  });
  adminApi.moderationJobDetail.mockResolvedValue(mockJobDetail);
  adminApi.moderate.mockResolvedValue({ data: { success: true } });
  adminApi.bulkModerate.mockResolvedValue({
    data: {
      batchId: "b-apex-99",
      action: "approve",
      summary: { requested: 2, succeeded: 2, skipped: 0, failed: 0, duplicatesRemoved: 0 },
      results: [
        { jobId: "job-apex-01", title: "Senior AI Platform Architect", outcome: "approved", message: "approved" },
        { jobId: "job-apex-02", title: "Staff Distributed Systems Engineer", outcome: "approved", message: "approved" },
      ],
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Phase 4C: Admin Job Moderation & Bulk Governance", () => {
  it("renders the 6 headline KPI status cards with real backend metrics", async () => {
    renderModeration();

    expect(await screen.findByText("Total Jobs")).toBeInTheDocument();
    expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    expect(screen.getByText("Approved / Active")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Changes Requested")).toBeInTheDocument();
    expect(screen.getByText("Suspended / Closed")).toBeInTheDocument();

    // Verify accurate count representations once queries resolve
    expect(await screen.findByText("6")).toBeInTheDocument(); // Total
    expect((await screen.findAllByText("3")).length).toBeGreaterThanOrEqual(1); // Pending
    expect((await screen.findAllByText("2")).length).toBeGreaterThanOrEqual(1); // Approved
  });

  it("renders company-grouped cards with expandable pending jobs and verification indicators", async () => {
    renderModeration();

    expect(await screen.findByText("Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("Shadow Mining Global Network")).toBeInTheDocument();

    // Check verification status badges
    expect(screen.getByText("Company: verified")).toBeInTheDocument();
    expect(screen.getByText("Company: pending")).toBeInTheDocument();
    expect(screen.getByText(/Unverified company: approvals blocked/i)).toBeInTheDocument();

    // In-card pending jobs rendered
    expect(screen.getByText("Senior AI Platform Architect")).toBeInTheDocument();
    expect(screen.getByText("Staff Distributed Systems Engineer")).toBeInTheDocument();
    expect(screen.getByText("Crypto Payout Assistant")).toBeInTheDocument();
  });

  it("allows selecting all eligible jobs for a verified company and bulk approving them", async () => {
    renderModeration();

    await screen.findByText("Apex Cybernetics India Pvt Ltd");
    const selectAllEligible = screen.getByLabelText("Select all eligible (2)");
    fireEvent.click(selectAllEligible);

    // In-card toolbar appears with Approve selected jobs (2)
    const approveBtn = await screen.findByRole("button", { name: "Approve selected jobs (2)" });
    expect(approveBtn).not.toBeDisabled();

    fireEvent.click(approveBtn);

    // Modal opens
    expect(await screen.findByText(/Approve 2 selected job\(s\)/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm approve" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.bulkModerate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approve",
          jobIds: ["job-apex-01", "job-apex-02"],
        }),
      );
    });
  });

  it("prevents approving jobs for unverified or suspended companies", async () => {
    renderModeration();

    await screen.findByText("Shadow Mining Global Network");

    // Single job approve button for unverified company is disabled
    const approveButtons = screen.getAllByRole("button", { name: "Approve" });
    // The last approve button belongs to Shadow Mining
    const shadowApproveBtn = approveButtons[approveButtons.length - 1];
    expect(shadowApproveBtn).toBeDisabled();
    expect(shadowApproveBtn).toHaveAttribute("title", "Verify the company before approving");
  });

  it("enforces a mandatory reason of at least 3 characters when rejecting a job", async () => {
    renderModeration();

    await screen.findByText("Senior AI Platform Architect");
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" });
    fireEvent.click(rejectButtons[0]);

    expect(await screen.findByText(/Reject "Senior AI Platform Architect"/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm reject" });

    // Click confirm with empty reason
    fireEvent.click(confirmBtn);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please give a reason of at least 3 characters.");
    expect(adminApi.moderate).not.toHaveBeenCalled();

    // Fill valid reason
    const textarea = screen.getByLabelText(/Reason \(shown to the recruiter\)/i);
    fireEvent.change(textarea, { target: { value: "Salary range exceeds approved platform bands" } });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.moderate).toHaveBeenCalledWith(
        "job-apex-01",
        "reject",
        "Salary range exceeds approved platform bands",
      );
    });
  });

  it("allows requesting changes with an actionable message for the recruiter", async () => {
    renderModeration();

    await screen.findByText("Senior AI Platform Architect");
    const requestButtons = screen.getAllByRole("button", { name: "Request changes" });
    fireEvent.click(requestButtons[0]);

    expect(await screen.findByText(/Request changes "Senior AI Platform Architect"/i)).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Reason \(shown to the recruiter\)/i);
    fireEvent.change(textarea, { target: { value: "Please specify whether remote workplace mode is full or hybrid" } });

    const confirmBtn = screen.getByRole("button", { name: "Confirm request changes" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.moderate).toHaveBeenCalledWith(
        "job-apex-01",
        "request-changes",
        "Please specify whether remote workplace mode is full or hybrid",
      );
    });
  });

  it("opens individual job review modal with complete compensation, skills, description, and history", async () => {
    renderModeration();

    await screen.findByText("Senior AI Platform Architect");
    const detailsButtons = screen.getAllByRole("button", { name: "View Details" });
    fireEvent.click(detailsButtons[0]);

    // Modal loads full details
    expect(await screen.findByText("Compensation & Location")).toBeInTheDocument();
    expect(screen.getByText(/Bengaluru, Karnataka \(hybrid\)/i)).toBeInTheDocument();
    expect(screen.getByText("Design high-performance distributed LLM training workflows and multi-node clusters.")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("PyTorch")).toBeInTheDocument();
    expect(screen.getByText(/How many years of distributed AI cluster experience/i)).toBeInTheDocument();
    expect(screen.getByText(/Initial job submission/i)).toBeInTheDocument();
  });
});
