import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminReports } from "./AdminReports";
import { AdminSettings } from "./AdminSettings";

const reportMock = vi.hoisted(() => vi.fn());
const reportExportCsvMock = vi.hoisted(() => vi.fn());
const platformSettingsMock = vi.hoisted(() => vi.fn());
const updatePlatformSettingsMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/api", () => ({
  adminApi: {
    report: reportMock,
    reportExportCsv: reportExportCsvMock,
    platformSettings: platformSettingsMock,
    updatePlatformSettings: updatePlatformSettingsMock,
    audit: auditMock,
  },
}));

vi.mock("../../lib/utils", async () => {
  const actual = await vi.importActual("../../lib/utils");
  return {
    ...actual,
    downloadBlob: vi.fn(),
  };
});

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

const mockReportData = {
  data: {
    type: "user_growth",
    label: "User and account growth",
    range: { preset: "30d", from: "2026-10-19", to: "2026-11-18" },
    timezone: "Asia/Kolkata",
    generatedAt: "2026-11-18T10:00:00.000Z",
    columns: [
      { key: "date", label: "Date (IST)" },
      { key: "candidates", label: "New Candidates" },
      { key: "recruiters", label: "New Recruiters" },
      { key: "total", label: "Total New Accounts" },
    ],
    rows: [
      { date: "2026-11-15", candidates: 12, recruiters: 3, total: 15 },
      { date: "2026-11-16", candidates: 8, recruiters: 2, total: 10 },
    ],
  },
};

const mockSettingsData = {
  data: {
    key: "global",
    general: {
      platformName: "HireSmart-AI",
      supportEmail: "support@hiresmart.ai",
      systemTimezone: "Asia/Kolkata",
      maintenanceMode: false,
      maintenanceMessage: "Scheduled maintenance in progress.",
    },
    registration: {
      allowCandidateSignup: true,
      allowRecruiterSignup: true,
      requireEmailVerification: true,
      defaultUserStatus: "active",
    },
    moderation: {
      autoApproveVerifiedOrgs: true,
      requireManualApprovalNewOrgs: true,
      maxJobsPerDayPerOrg: 50,
    },
    subscriptions: {
      currency: "INR",
      trialDays: 14,
      enforcementMode: "soft_cap",
    },
    notifications: {
      systemSenderEmail: "noreply@hiresmart.ai",
      alertPlatformAdminsOnCriticalRisk: true,
    },
    security: {
      sessionTimeoutMinutes: 120,
      maxFailedLoginsBeforeLockout: 5,
      lockoutDurationMinutes: 30,
      minPasswordLength: 8,
    },
    features: {
      aiResumeParsing: true,
      aiInterviewTranscripts: true,
      fraudRiskDetection: true,
      googleCalendarSync: true,
    },
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

describe("AdminReports Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders reports overview, metric cards, and table data", async () => {
    reportMock.mockResolvedValue(mockReportData);

    renderWithProviders(<AdminReports />);

    expect(await screen.findByText("Reports & Data Exports")).toBeInTheDocument();
    await waitFor(() => {
      expect(reportMock).toHaveBeenCalled();
    });
    expect(screen.getByText("User Growth")).toBeInTheDocument();
    expect(screen.getByText("Candidate Registrations")).toBeInTheDocument();
    expect(screen.getByText("Company Verification")).toBeInTheDocument();
    expect(screen.getByText("Cash Revenue (Daily)")).toBeInTheDocument();

    // Table headers & rows
    expect(await screen.findByText("Date (IST)")).toBeInTheDocument();
    expect(screen.getByText("New Candidates")).toBeInTheDocument();
    expect(screen.getByText("New Recruiters")).toBeInTheDocument();
    expect(await screen.findByText("2026-11-15")).toBeInTheDocument();
    expect(await screen.findByText("2026-11-16")).toBeInTheDocument();
  });

  it("triggers CSV export mutation when Export CSV is clicked", async () => {
    const user = userEvent.setup();
    reportMock.mockResolvedValue(mockReportData);
    reportExportCsvMock.mockResolvedValueOnce(new Blob(["test,data"], { type: "text/csv" }));

    renderWithProviders(<AdminReports />);

    expect(await screen.findByText("2026-11-15")).toBeInTheDocument();
    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    expect(exportBtn).not.toBeDisabled();
    await user.click(exportBtn);

    await waitFor(() => {
      expect(reportExportCsvMock).toHaveBeenCalledWith("user_growth", { range: "30d" });
    });
  });

  it("switches to financial report and displays environment mode filters", async () => {
    const user = userEvent.setup();
    reportMock.mockResolvedValue({
      data: {
        type: "payments",
        label: "Payments",
        range: { preset: "30d", from: "2026-10-19", to: "2026-11-18" },
        columns: [
          { key: "transactionNumber", label: "Transaction" },
          { key: "mode", label: "Environment Mode" },
          { key: "amount", label: "Amount" },
        ],
        rows: [{ transactionNumber: "TXN-001", mode: "test", amount: 4999 }],
      },
    });

    renderWithProviders(<AdminReports />);

    const paymentsReportBtn = await screen.findByRole("button", { name: /Transaction Ledger/i });
    await user.click(paymentsReportBtn);

    expect(await screen.findByText("Environment:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^TEST$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^LIVE$/i })).toBeInTheDocument();
  });
});

describe("AdminSettings Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders platform settings sections and loads general config", async () => {
    platformSettingsMock.mockResolvedValueOnce(mockSettingsData);

    renderWithProviders(<AdminSettings />);

    expect(await screen.findByText("Platform Settings & Governance")).toBeInTheDocument();
    expect(screen.getByText("General & Branding")).toBeInTheDocument();
    expect(screen.getByText("Registration Policies")).toBeInTheDocument();
    expect(screen.getByText("Job Moderation")).toBeInTheDocument();
    expect(screen.getByText("Subscriptions & Plans")).toBeInTheDocument();
    expect(screen.getByText("Security & Sessions")).toBeInTheDocument();
    expect(screen.getByText("Feature Flags")).toBeInTheDocument();

    expect(screen.getByDisplayValue("HireSmart-AI")).toBeInTheDocument();
    expect(screen.getByDisplayValue("support@hiresmart.ai")).toBeInTheDocument();
  });

  it("navigates to security section and saves configuration", async () => {
    const user = userEvent.setup();
    platformSettingsMock.mockResolvedValue(mockSettingsData);
    updatePlatformSettingsMock.mockResolvedValueOnce({
      success: true,
      message: "Platform settings saved successfully",
      data: mockSettingsData.data,
    });

    renderWithProviders(<AdminSettings />);

    const secNavBtn = await screen.findByRole("button", { name: /Security & Sessions/i });
    await user.click(secNavBtn);

    expect(await screen.findByText("Session Timeout (Minutes)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();

    const saveSecBtn = screen.getByRole("button", { name: /Save Security Policies/i });
    await user.click(saveSecBtn);

    await waitFor(() => {
      expect(updatePlatformSettingsMock).toHaveBeenCalledWith({
        security: expect.objectContaining({
          sessionTimeoutMinutes: 120,
          maxFailedLoginsBeforeLockout: 5,
        }),
      });
    });
  });

  it("opens confirmation modal with required justification for high-impact maintenance toggle", async () => {
    const user = userEvent.setup();
    platformSettingsMock.mockResolvedValue(mockSettingsData);
    updatePlatformSettingsMock.mockResolvedValueOnce({
      success: true,
      message: "Platform settings saved successfully",
      data: { ...mockSettingsData.data, general: { ...mockSettingsData.data.general, maintenanceMode: true } },
    });

    renderWithProviders(<AdminSettings />);

    // Toggle maintenance mode
    const toggleBtn = await screen.findByRole("button", { name: /Toggle maintenance mode/i });
    await user.click(toggleBtn);

    const saveBtn = screen.getByRole("button", { name: /Save General Settings/i });
    await user.click(saveBtn);

    // Modal appears
    expect(await screen.findByText("Confirm Maintenance Mode Toggle")).toBeInTheDocument();
    expect(screen.getByText(/Mandatory Change Justification/i)).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/Provide justification for this platform policy change/i);
    fireEvent.change(reasonInput, { target: { value: "Emergency scheduled database migration." } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm & Apply Change/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(updatePlatformSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "Emergency scheduled database migration.",
        })
      );
    });
  });
});
