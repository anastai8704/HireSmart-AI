import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyProfileVerificationPage } from "./CompanyProfileVerificationPage";

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    role: "recruiter",
    organizationId: "org-test-123",
    membership: { role: "admin" },
    user: { displayName: "Recruiter One" },
  }),
}));

vi.mock("../../lib/api", () => ({
  verificationApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        organization: {
          verificationStatus: "verified",
          businessEmail: "hr@acme.com",
        },
      },
    }),
  },
  organizationApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        name: "Acme Corp",
        website: "https://acme.com",
        size: "51-200",
        industry: "Software",
      },
    }),
  },
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const renderPage = (initialEntry = "/app/o/org-test-123/verification") => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/app/o/:organizationId/verification"
            element={<CompanyProfileVerificationPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("CompanyProfileVerificationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with Verification tab actively selected by default", async () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /Company Profile & Verification/i }),
    ).toBeInTheDocument();

    const verificationTab = screen.getByRole("button", { name: /Verification/i });
    expect(verificationTab).toHaveAttribute("aria-current", "page");

    expect(screen.getByTestId("verification-tab-content")).toBeInTheDocument();
  });

  it("switches to Company Profile tab when clicked", async () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Organization sections" });
    const profileTab = within(nav).getByRole("button", { name: /^Company Profile$/i });
    fireEvent.click(profileTab);

    expect(profileTab).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("profile-tab-content")).toBeInTheDocument();
    expect(screen.queryByTestId("verification-tab-content")).not.toBeInTheDocument();
  });

  it("respects tab query parameter on direct navigation", async () => {
    renderPage("/app/o/org-test-123/verification?tab=profile");
    const nav = screen.getByRole("navigation", { name: "Organization sections" });
    const profileTab = within(nav).getByRole("button", { name: /^Company Profile$/i });
    expect(profileTab).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("profile-tab-content")).toBeInTheDocument();
  });
});
