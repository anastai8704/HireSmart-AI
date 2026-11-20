import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminVerificationReview from "./AdminVerificationReview";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Platform Admin", email: "admin@hiresmart.ai" },
    role: "admin",
    organizations: [],
    organizationId: null,
    organization: null,
    membership: null,
    workspaceRole: "platform_admin",
    status: "authenticated",
    isAuthenticated: true,
    logout: () => {},
    setOrganizationId: () => {},
  }),
}));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("../../components/ui/useToast", () => ({
  useToast: () => mockToast,
}));

const mockDownloadBlob = vi.fn();
const mockAdminQueue = vi.fn();
const mockAdminCase = vi.fn();
const mockAdminRecordCheck = vi.fn();
const mockAdminRegistryCheck = vi.fn();
const mockAdminRequestChanges = vi.fn();
const mockAdminApprove = vi.fn();
const mockAdminReject = vi.fn();
const mockAdminSuspend = vi.fn();
const mockAdminRestore = vi.fn();
const mockAdminDownloadDocument = vi.fn();

vi.mock("../../lib/api", () => ({
  downloadBlob: (...args) => mockDownloadBlob(...args),
  adminApi: {
    overviewAnalytics: () =>
      Promise.resolve({
        data: {
          companies: {
            total: 24,
            pending: 4,
            underReview: 2,
            verified: 15,
            rejected: 2,
            suspended: 1,
          },
        },
      }),
  },
  verificationApi: {
    adminQueue: (...args) => mockAdminQueue(...args),
    adminCase: (...args) => mockAdminCase(...args),
    adminRecordCheck: (...args) => mockAdminRecordCheck(...args),
    adminRegistryCheck: (...args) => mockAdminRegistryCheck(...args),
    adminRequestChanges: (...args) => mockAdminRequestChanges(...args),
    adminApprove: (...args) => mockAdminApprove(...args),
    adminReject: (...args) => mockAdminReject(...args),
    adminSuspend: (...args) => mockAdminSuspend(...args),
    adminRestore: (...args) => mockAdminRestore(...args),
    adminDownloadDocument: (...args) => mockAdminDownloadDocument(...args),
  },
}));

const renderWithRouter = (ui, path = "/app/admin/verification") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/admin/verification" element={<AdminVerificationReview />} />
          <Route path="/app/admin/verification/:caseId" element={<AdminVerificationReview />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockCaseData = {
  case: {
    id: "case-apex-101",
    status: "under_review",
    assessment: "in_progress",
    risk: { level: "medium", score: 45, requiresManualReview: true },
    recommendedNextAction: "Verify GSTIN matching with central tax registry.",
    riskDisclaimer: "Risk signals are investigative flags, not automated proof of fraud.",
    submittedAt: "2026-11-15T10:00:00.000Z",
    updatedAt: "2026-11-17T14:30:00.000Z",
    riskIndicators: [
      {
        code: "SUSPICIOUS_DOMAIN_AGE",
        severity: "medium",
        explanation: "Website domain was registered less than 30 days ago.",
      },
    ],
    duplicateCandidates: [
      {
        organization: { id: "org-legacy-9", name: "Apex Labs Private Limited", verificationStatus: "verified" },
        reasons: ["normalizedRegistrationNumber match", "normalizedGstin match"],
      },
    ],
    evidence: [
      {
        _id: "ev-1",
        type: "business_registration",
        result: "match",
        method: "mca_registry",
        recordedAt: "2026-11-16T11:00:00.000Z",
        note: "Company active on MCA portal with matching directors.",
      },
    ],
    statusHistory: [
      {
        from: "pending",
        to: "under_review",
        action: "review_started",
        at: "2026-11-16T09:00:00.000Z",
        reason: "Review started by platform admin",
      },
    ],
  },
  organization: {
    id: "org-apex-1",
    name: "Apex Cybernetics India Pvt Ltd",
    businessEmail: "compliance@apexcyber.in",
    businessEmailVerifiedAt: "2026-11-15T10:05:00.000Z",
    phone: "+91 9876543210",
    registrationNumber: "U72200MH2022PTC384729",
    gstin: "27AABCA1234F1Z5",
    businessType: "private_limited",
    website: "https://apexcyber.in",
    address: {
      street: "Plot 42, Sector 18, Electronic City",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560100",
      country: "India",
    },
    authorizedRepresentative: {
      name: "Rajesh Kumar",
      designation: "Managing Director",
    },
  },
  owner: {
    name: "Rajesh Kumar",
    email: "rajesh@apexcyber.in",
    phone: "+91 9876543210",
  },
  documents: [
    {
      id: "doc-cin-1",
      fileName: "Apex_Certificate_Of_Incorporation.pdf",
      type: "incorporation_certificate",
      size: 524288,
      uploadedAt: "2026-11-15T10:02:00.000Z",
    },
  ],
};

describe("Phase 4B: Admin Verification Dashboard & Governance", () => {
  it("renders the 6 status KPI cards on the verification dashboard", async () => {
    mockAdminQueue.mockResolvedValue({
      data: [
        {
          id: "case-apex-101",
          organization: { name: "Apex Cybernetics", businessType: "private_limited" },
          submittedAt: "2026-11-15T10:00:00.000Z",
          risk: { level: "low", requiresManualReview: false },
          missing: [],
          duplicateCount: 0,
        },
      ],
    });

    renderWithRouter(<AdminVerificationReview />);

    // Verify 6 Status KPI cards
    expect(await screen.findByText("Company Verification")).toBeInTheDocument();
    expect(screen.getByText("Total Organizations")).toBeInTheDocument();
    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Verified Employers")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();

    // Verify case in list
    expect(await screen.findByText("Apex Cybernetics")).toBeInTheDocument();
    expect(screen.getByText("private limited")).toBeInTheDocument();
    expect(screen.getByText("Review Case")).toBeInTheDocument();
  });

  it("renders company profile, registration details, and allows document download", async () => {
    mockAdminCase.mockResolvedValue({ data: mockCaseData });
    mockAdminDownloadDocument.mockResolvedValue(new Blob(["mock pdf"], { type: "application/pdf" }));

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    expect(await screen.findByText("Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    expect(screen.getByText("U72200MH2022PTC384729")).toBeInTheDocument();
    expect(screen.getByText("27AABCA1234F1Z5")).toBeInTheDocument();
    expect(screen.getByText("compliance@apexcyber.in")).toBeInTheDocument();
    expect(screen.getByText("Rajesh Kumar (Managing Director)")).toBeInTheDocument();
    expect(screen.getByText(/Plot 42, Sector 18, Electronic City/)).toBeInTheDocument();

    // Check Document download
    expect(screen.getByText("Apex_Certificate_Of_Incorporation.pdf")).toBeInTheDocument();
    const downloadBtn = screen.getByRole("button", { name: "Download" });
    fireEvent.click(downloadBtn);

    expect(mockAdminDownloadDocument).toHaveBeenCalledWith("doc-cin-1");
  });

  it("displays risk signals and duplicate company warnings as review signals", async () => {
    mockAdminCase.mockResolvedValue({ data: mockCaseData });

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    expect(await screen.findByText("Risk Signals")).toBeInTheDocument();
    expect(screen.getByText("SUSPICIOUS_DOMAIN_AGE")).toBeInTheDocument();
    expect(screen.getByText("Website domain was registered less than 30 days ago.")).toBeInTheDocument();

    expect(screen.getByText("Possible Duplicates")).toBeInTheDocument();
    expect(screen.getByText("Apex Labs Private Limited")).toBeInTheDocument();
    expect(screen.getByText(/normalizedRegistrationNumber match/)).toBeInTheDocument();
  });

  it("opens confirmation modal and enforces mandatory reason when rejecting a company", async () => {
    mockAdminCase.mockResolvedValue({ data: mockCaseData });
    mockAdminReject.mockResolvedValue({ data: { success: true } });

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    const rejectBtn = await screen.findByRole("button", { name: "Reject company" });
    fireEvent.click(rejectBtn);

    // Modal opens
    expect(await screen.findByText("Reject Company Verification: Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });

    // Confirm is initially disabled due to empty mandatory reason
    expect(confirmBtn).toBeDisabled();

    // Fill valid mandatory reason
    const textarea = screen.getByLabelText(/Reason \(Required/i);
    fireEvent.change(textarea, { target: { value: "GSTIN number does not match registered entity name" } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockAdminReject).toHaveBeenCalledWith(
        "case-apex-101",
        "GSTIN number does not match registered entity name",
      );
    });
  });

  it("opens confirmation modal and enforces mandatory reason when suspending a verified company", async () => {
    const verifiedCase = {
      ...mockCaseData,
      case: { ...mockCaseData.case, status: "verified" },
    };
    mockAdminCase.mockResolvedValue({ data: verifiedCase });
    mockAdminSuspend.mockResolvedValue({ data: { success: true } });

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    const suspendBtn = await screen.findByRole("button", { name: "Suspend company" });
    fireEvent.click(suspendBtn);

    expect(await screen.findByText("Suspend Company Authorization: Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    expect(confirmBtn).toBeDisabled();

    const textarea = screen.getByLabelText(/Reason \(Required/i);
    fireEvent.change(textarea, { target: { value: "Repeated violation of platform recruitment standards" } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mockAdminSuspend).toHaveBeenCalledWith(
        "case-apex-101",
        "Repeated violation of platform recruitment standards",
      );
    });
  });

  it("allows approving company verification with optional review notes", async () => {
    mockAdminCase.mockResolvedValue({ data: mockCaseData });
    mockAdminApprove.mockResolvedValue({ data: { success: true } });

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    const approveBtn = await screen.findByRole("button", { name: "Approve company" });
    fireEvent.click(approveBtn);

    expect(await screen.findByText("Approve Company Verification: Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Review Notes \(Optional\)/i);
    fireEvent.change(textarea, { target: { value: "Verified with Ministry of Corporate Affairs MCA portal." } });

    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockAdminApprove).toHaveBeenCalledWith(
        "case-apex-101",
        "Verified with Ministry of Corporate Affairs MCA portal.",
      );
    });
  });

  it("allows requesting changes with specified checklist items", async () => {
    mockAdminCase.mockResolvedValue({ data: mockCaseData });
    mockAdminRequestChanges.mockResolvedValue({ data: { success: true } });

    renderWithRouter(<AdminVerificationReview />, "/app/admin/verification/case-apex-101");

    const requestBtn = await screen.findByRole("button", { name: "Request changes" });
    fireEvent.click(requestBtn);

    expect(await screen.findByText("Request Verification Changes from Apex Cybernetics India Pvt Ltd")).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Required Changes \(one item per line\)/i);
    fireEvent.change(textarea, {
      target: { value: "Upload clear copy of Certificate of Incorporation\nProvide company PAN document" },
    });

    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockAdminRequestChanges).toHaveBeenCalledWith("case-apex-101", [
        "Upload clear copy of Certificate of Incorporation",
        "Provide company PAN document",
      ]);
    });
  });
});
