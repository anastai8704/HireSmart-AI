import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyProfileCard } from "./CompanyProfileCard";

const { authState, organizationApi, toast } = vi.hoisted(() => ({
  authState: {
    role: "recruiter",
    organizationId: "org-test-456",
    membership: { role: "admin" },
    user: { displayName: "Recruiter Admin", email: "admin@apex.test" },
  },
  organizationApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("../../lib/api", () => ({
  organizationApi,
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => toast,
}));

const mockOrg = (overrides = {}) => ({
  data: {
    _id: "org-test-456",
    name: "Apex Technologies",
    slug: "apex-technologies",
    industry: "Information Technology",
    size: "51-200",
    website: "https://apex.example.com",
    logo: "https://apex.example.com/logo.png",
    about: "Leading enterprise AI hiring automation platform.",
    timezone: "Asia/Kolkata",
    verificationStatus: "verified",
    businessEmail: "contact@apex.example.com",
    businessEmailVerifiedAt: "2026-11-01T10:00:00.000Z",
    phone: "+91 98765 43210",
    address: {
      street: "100 Innovation Blvd",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560100",
      country: "India",
    },
    registrationNumber: "U72200KA2024PTC123456",
    gstin: "29AAAAA0000A1Z5",
    businessType: "private_limited",
    authorizedRepresentative: {
      name: "Rohit Sharma",
      designation: "Director of HR",
    },
    ...overrides,
  },
});

const renderComponent = (props = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompanyProfileCard orgId="org-test-456" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("CompanyProfileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.membership = { role: "admin" };
    organizationApi.get.mockResolvedValue(mockOrg());
    organizationApi.update.mockResolvedValue({ data: { data: mockOrg().data } });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders company profile with pre-filled backend values", async () => {
    renderComponent();

    expect(await screen.findByDisplayValue("Apex Technologies")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://apex.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Information Technology")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Leading enterprise AI hiring automation platform."),
    ).toBeInTheDocument();

    // Registered legal identity fields
    expect(screen.getByText("U72200KA2024PTC123456")).toBeInTheDocument();
    expect(screen.getByText("29AAAAA0000A1Z5")).toBeInTheDocument();
    expect(screen.getByText("contact@apex.example.com")).toBeInTheDocument();
    expect(screen.getByText("Rohit Sharma")).toBeInTheDocument();
    expect(screen.getByText(/100 Innovation Blvd, Bengaluru, Karnataka, 560100, India/)).toBeInTheDocument();
  });

  it("handles live logo preview and image fallbacks", async () => {
    renderComponent();
    expect(await screen.findByTestId("logo-preview-box")).toBeInTheDocument();

    const logoImg = screen.getByRole("img", { name: /Apex Technologies logo/i });
    expect(logoImg).toHaveAttribute("src", "https://apex.example.com/logo.png");

    // Trigger error fallback
    fireEvent.error(logoImg);
    expect(screen.getByText("AT")).toBeInTheDocument();
  });

  it("tracks dirty state and disallows saving pristine forms", async () => {
    renderComponent();
    await screen.findByDisplayValue("Apex Technologies");

    const saveButton = screen.getByRole("button", { name: /Save Company Profile/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("Apex Technologies");
    fireEvent.change(nameInput, { target: { value: "Apex Technologies Global" } });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(saveButton).toBeEnabled();
  });

  it("allows discarding unsaved changes", async () => {
    renderComponent();
    await screen.findByDisplayValue("Apex Technologies");

    const nameInput = screen.getByDisplayValue("Apex Technologies");
    fireEvent.change(nameInput, { target: { value: "Apex Changed Name" } });

    const discardButton = screen.getByRole("button", { name: /Discard Changes/i });
    fireEvent.click(discardButton);

    expect(screen.getByDisplayValue("Apex Technologies")).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("submits updated organization profile and shows toast", async () => {
    renderComponent();
    await screen.findByDisplayValue("Apex Technologies");

    const nameInput = screen.getByDisplayValue("Apex Technologies");
    fireEvent.change(nameInput, { target: { value: "Apex Global Inc" } });

    const saveButton = screen.getByRole("button", { name: /Save Company Profile/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(organizationApi.update).toHaveBeenCalledWith(
        "org-test-456",
        expect.objectContaining({
          name: "Apex Global Inc",
          industry: "Information Technology",
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("Company profile saved successfully");
    });
  });

  it("validates company name length", async () => {
    renderComponent();
    await screen.findByDisplayValue("Apex Technologies");

    const nameInput = screen.getByDisplayValue("Apex Technologies");
    fireEvent.change(nameInput, { target: { value: "A" } });

    expect(
      screen.getByText("Company name must be at least 2 characters"),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /Save Company Profile/i });
    expect(saveButton).toBeDisabled();
  });

  it("renders read-only view and access warning for non-admin recruiters", async () => {
    authState.membership = { role: "recruiter" };
    renderComponent();

    expect(await screen.findByText("View-Only Mode")).toBeInTheDocument();
    expect(
      screen.getByText(/Only Organization Owners and Admins have permission/),
    ).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("Apex Technologies");
    expect(nameInput).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save Company Profile/i })).toBeNull();
  });
});
