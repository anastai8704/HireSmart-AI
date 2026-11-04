import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CompanyVerificationCard from "./CompanyVerificationCard";

const { authState, verificationApi } = vi.hoisted(() => ({
  authState: { membership: { role: "owner" } },
  verificationApi: {
    get: vi.fn(),
    submit: vi.fn(),
    sendBusinessEmailCode: vi.fn(),
    confirmBusinessEmailCode: vi.fn(),
    uploadDocument: vi.fn(),
  },
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

const pendingPayload = (overrides = {}) => ({
  data: {
    organization: {
      name: "Meridian Labs",
      verificationStatus: "under_review",
      businessEmail: "hr@meridian.example",
      website: "https://meridian.example",
      address: { city: "Pune", state: "Maharashtra", country: "India" },
      authorizedRepresentative: { name: "Asha Rao", designation: "HR Head" },
      businessType: "private_limited",
      // Internal fields must never reach the recruiter view. The card must not render them.
      riskScore: 80,
      riskFlags: [{ code: "DUPLICATE_REGISTRATION" }],
    },
    businessEmailVerified: false,
    documents: [{ id: "d1", type: "incorporation_certificate", fileName: "coi.pdf", mimeType: "application/pdf", size: 1200 }],
    case: {
      id: "c1",
      status: "under_review",
      changeRequest: null,
      decisionReason: "",
      pendingChecks: ["business_registration", "recruiter_identity"],
      manualVerificationRequired: true,
    },
    ...overrides,
  },
});

vi.mock("../../lib/api", () => ({ verificationApi }));

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompanyVerificationCard orgId="org1" />
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  verificationApi.get.mockReset();
  authState.membership = { role: "owner" };
});

describe("CompanyVerificationCard", () => {
  it("shows under-review status and the checks still needed, without internal risk data", async () => {
    verificationApi.get.mockResolvedValue(pendingPayload());
    renderCard();

    expect(await screen.findByText("Under review")).toBeTruthy();
    expect(screen.getByText(/Business registration confirmed/)).toBeTruthy();
    expect(screen.getByText(/Your own email confirmed/)).toBeTruthy();
    expect(screen.queryByText(/DUPLICATE_REGISTRATION/)).toBeNull();
    expect(screen.queryByText(/riskScore/)).toBeNull();
    expect(screen.getByText("coi.pdf")).toBeTruthy();
  });

  it("shows requested changes and the rejection reason from the case", async () => {
    verificationApi.get.mockResolvedValue(
      pendingPayload({
        case: {
          id: "c2",
          status: "under_review",
          changeRequest: { items: ["Upload the incorporation certificate"], requestedAt: "2026-11-04T10:00:00Z" },
          decisionReason: "",
          pendingChecks: [],
        },
      }),
    );
    renderCard();

    expect(await screen.findByText("Upload the incorporation certificate")).toBeTruthy();
    expect(screen.getByText(/needs more information/)).toBeTruthy();
  });

  it("offers resubmission after rejection with the reason the reviewer gave", async () => {
    verificationApi.get.mockResolvedValue(
      pendingPayload({
        organization: { ...pendingPayload().data.organization, verificationStatus: "rejected" },
        case: { id: "c3", status: "rejected", changeRequest: null, decisionReason: "Registration not confirmed", pendingChecks: [] },
      }),
    );
    renderCard();

    expect(await screen.findByText("Registration not confirmed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeTruthy();
  });

  it("renders nothing for members who cannot manage the company", async () => {
    authState.membership = { role: "recruiter" };
    verificationApi.get.mockResolvedValue(pendingPayload());
    const { container } = renderCard();

    await waitFor(() => expect(verificationApi.get).not.toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
