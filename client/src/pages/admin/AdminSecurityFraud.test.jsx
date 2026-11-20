import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminSecurity } from "./AdminSecurity";

const securityOverviewMock = vi.hoisted(() => vi.fn());
const securityEventsMock = vi.hoisted(() => vi.fn());
const securityEventDetailsMock = vi.hoisted(() => vi.fn());
const addSecurityEventNoteMock = vi.hoisted(() => vi.fn());
const resolveSecurityEventMock = vi.hoisted(() => vi.fn());
const flagSecurityEntityMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  adminApi: {
    securityOverview: securityOverviewMock,
    securityEvents: securityEventsMock,
    securityEventDetails: securityEventDetailsMock,
    addSecurityEventNote: addSecurityEventNoteMock,
    resolveSecurityEvent: resolveSecurityEventMock,
    flagSecurityEntity: flagSecurityEntityMock,
    audit: auditMock,
  },
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Admin User", email: "admin@example.com" },
    role: "admin",
    organizations: [{ id: "org-1", name: "Apex Global", role: "owner" }],
    organizationId: "org-1",
    organization: { id: "org-1", name: "Apex Global" },
    membership: { role: "owner" },
    workspaceRole: "platform_admin",
    status: "authenticated",
    isAuthenticated: true,
  }),
}));

const mockOverview = {
  data: {
    metrics: {
      totalEvents: 42,
      highRiskEvents: 7,
      openInvestigations: 5,
      resolvedInvestigations: 35,
      flaggedUsers: 2,
      suspiciousOrganizations: 3,
      jobRiskAlerts: 4,
    },
    severityDistribution: {
      critical: 2,
      high: 5,
      medium: 12,
      low: 15,
      info: 8,
    },
  },
};

const mockEventsResponse = {
  data: [
    {
      _id: "sec-event-1",
      id: "sec-event-1",
      type: "rapid_job_posting_burst",
      severity: "high",
      status: "open",
      createdAt: "2026-11-18T10:00:00.000Z",
      user: {
        _id: "user-1",
        name: "Suspicious Recruiter",
        email: "recruiter@fraudcorp.test",
        isFlagged: false,
      },
      organization: {
        _id: "org-1",
        name: "FraudCorp Inc",
        riskScore: 78,
        verificationStatus: "pending",
      },
      details: {
        reason: "Recruiter posted 15 jobs in 3 minutes",
        ruleTriggered: "rapid_job_post_velocity",
        ipAddress: "192.168.1.100",
      },
      ipHash: "a1b2c3d4e5f6...",
    },
  ],
  meta: {
    total: 1,
    limit: 20,
    page: 1,
    pages: 1,
    counts: {
      total: 1,
      critical: 0,
      high: 1,
      open: 1,
      resolved: 0,
    },
  },
};

const mockEventDetail = {
  data: {
    event: {
      _id: "sec-event-1",
      id: "sec-event-1",
      type: "rapid_job_posting_burst",
      severity: "high",
      status: "open",
      createdAt: "2026-11-18T10:00:00.000Z",
      user: {
        _id: "user-1",
        name: "Suspicious Recruiter",
        email: "recruiter@fraudcorp.test",
        role: "recruiter",
        isFlagged: false,
        createdAt: "2026-11-15T08:00:00.000Z",
      },
      organization: {
        _id: "org-1",
        name: "FraudCorp Inc",
        riskScore: 78,
        riskFlags: ["rapid_job_posting", "high_velocity_candidate_messaging"],
        verificationStatus: "pending",
        gstin: "27AAAAA0000A1Z5",
      },
      details: {
        reason: "Recruiter posted 15 jobs in 3 minutes",
        ruleTriggered: "rapid_job_post_velocity",
        ipAddress: "192.168.1.100",
      },
      ipHash: "a1b2c3d4e5f6...",
      investigationNotes: [
        {
          _id: "note-1",
          note: "Initial triage completed. High rate of template jobs.",
          addedBy: { name: "Security Lead" },
          createdAt: "2026-11-18T10:05:00.000Z",
        },
      ],
    },
    relatedHistory: [],
    riskSignals: [
      {
        id: "sig-1",
        name: "Rapid Job Posting Velocity",
        score: 78,
        reasons: ["Organization verification is still pending", "Spike in job postings detected within 1 hour"],
        requiresManualReview: true,
      },
    ],
    auditTrail: [],
  },
};

const renderWithProviders = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe("AdminSecurityFraud Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders 7 headline KPI cards with real platform metrics", async () => {
    securityOverviewMock.mockResolvedValueOnce(mockOverview);
    securityEventsMock.mockResolvedValueOnce(mockEventsResponse);

    renderWithProviders(<AdminSecurity />);

    expect(await screen.findByText("Security & Audit")).toBeInTheDocument();
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Total Security Events")).toBeInTheDocument();
    expect(screen.getByText("High-Risk & Critical")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Open Investigations")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Resolved Cases")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("Flagged Users")).toBeInTheDocument();
    expect(screen.getByText("Suspicious Organizations")).toBeInTheDocument();
    expect(screen.getByText("Job Risk Alerts")).toBeInTheDocument();
  });

  it("renders security events table and opens investigation modal with diagnostic details", async () => {
    const user = userEvent.setup();
    securityOverviewMock.mockResolvedValueOnce(mockOverview);
    securityEventsMock.mockResolvedValueOnce(mockEventsResponse);
    securityEventDetailsMock.mockResolvedValueOnce(mockEventDetail);

    renderWithProviders(<AdminSecurity />);

    expect(await screen.findByText("rapid_job_posting_burst")).toBeInTheDocument();
    expect(screen.getByText("FraudCorp Inc")).toBeInTheDocument();
    expect(screen.getByText("Suspicious Recruiter")).toBeInTheDocument();

    const inspectBtn = screen.getByRole("button", { name: /inspect/i });
    await user.click(inspectBtn);

    await waitFor(() => {
      expect(securityEventDetailsMock).toHaveBeenCalledWith("sec-event-1");
    });

    expect(await screen.findByText("Security Event Investigation")).toBeInTheDocument();
    expect(screen.getByText(/Recruiter posted 15 jobs in 3 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Initial triage completed\. High rate of template jobs\./i)).toBeInTheDocument();
  });

  it("allows adding an investigation note and resolving the security incident", async () => {
    const user = userEvent.setup();
    securityOverviewMock.mockResolvedValue(mockOverview);
    securityEventsMock.mockResolvedValue(mockEventsResponse);
    securityEventDetailsMock.mockResolvedValue(mockEventDetail);
    addSecurityEventNoteMock.mockResolvedValueOnce({
      success: true,
      message: "Investigation note recorded",
    });
    resolveSecurityEventMock.mockResolvedValueOnce({
      success: true,
      message: "Security event status updated",
    });

    renderWithProviders(<AdminSecurity />);

    const inspectBtn = await screen.findByRole("button", { name: /inspect/i });
    await user.click(inspectBtn);

    expect(await screen.findByText("Security Event Investigation")).toBeInTheDocument();

    // Add note
    const noteInput = await screen.findByPlaceholderText(/Add investigation observation/i);
    await user.type(noteInput, "Verified IP origin and job contents.");
    const addNoteBtn = screen.getByRole("button", { name: /Add Note/i });
    await user.click(addNoteBtn);

    await waitFor(() => {
      expect(addSecurityEventNoteMock).toHaveBeenCalledWith("sec-event-1", {
        note: "Verified IP origin and job contents.",
      });
    });

    // Open resolve form
    const openResolveBtn = screen.getByRole("button", { name: /Resolve \/ Dismiss Event/i });
    await user.click(openResolveBtn);

    // Type resolution reason
    const reasonInput = screen.getByPlaceholderText(/Enter detailed reason for closing or resolving this security event…/i);
    await user.type(reasonInput, "Recruiter warned and rate-limited.");

    const confirmResolveBtn = screen.getByRole("button", { name: /Confirm Resolution/i });
    await user.click(confirmResolveBtn);

    await waitFor(() => {
      expect(resolveSecurityEventMock).toHaveBeenCalledWith("sec-event-1", {
        resolution: "resolved",
        reason: "Recruiter warned and rate-limited.",
      });
    });
  });

  it("supports flagging a suspicious user or organization with mandatory justification", async () => {
    const user = userEvent.setup();
    securityOverviewMock.mockResolvedValue(mockOverview);
    securityEventsMock.mockResolvedValue(mockEventsResponse);
    securityEventDetailsMock.mockResolvedValue(mockEventDetail);
    flagSecurityEntityMock.mockResolvedValueOnce({
      success: true,
      message: "Target entity flagged for review",
    });

    renderWithProviders(<AdminSecurity />);

    const inspectBtn = await screen.findByRole("button", { name: /inspect/i });
    await user.click(inspectBtn);

    expect(await screen.findByText("Security Event Investigation")).toBeInTheDocument();

    const openFlagBtn = screen.getByRole("button", { name: /Flag For Elevated Review/i });
    await user.click(openFlagBtn);

    const flagReasonInput = screen.getByPlaceholderText(/Justification for flagging/i);
    await user.type(flagReasonInput, "Syndicated spam posting patterns detected.");

    const flagOrgBtn = screen.getByRole("button", { name: /Flag Organization/i });
    await user.click(flagOrgBtn);

    await waitFor(() => {
      expect(flagSecurityEntityMock).toHaveBeenCalledWith("sec-event-1", {
        targetType: "organization",
        reason: "Syndicated spam posting patterns detected.",
      });
    });
  });
});
