import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("../components/ui/useToast", () => ({ useToast: () => mockToast }));

const mockLogout = vi.fn();
const mockAuth = {
  user: {
    _id: "u_cand",
    displayName: "Alex Candidate",
    email: "alex@example.com",
    phone: "+91 91234 56789",
    role: "candidate",
    pendingEmail: null,
  },
  role: "candidate",
  organizationId: null,
  refresh: vi.fn(),
  logout: mockLogout,
};
vi.mock("../context/useAuth", () => ({ useAuth: () => mockAuth }));

const api = vi.hoisted(() => ({
  userUpdateProfile: vi.fn().mockResolvedValue({ data: {} }),
  userRemove: vi.fn().mockResolvedValue({ data: {} }),
  authChangeEmail: vi.fn().mockResolvedValue({ data: {} }),
  authChangePassword: vi.fn().mockResolvedValue({ data: {} }),
  authSessions: vi.fn().mockResolvedValue({
    data: [
      { id: "s1", current: true, userAgent: "Chrome on macOS", lastUsedAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
      { id: "s2", current: false, userAgent: "Firefox on Windows", lastUsedAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
    ],
  }),
  authRevokeSession: vi.fn().mockResolvedValue({ data: {} }),
  authSecurity: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../lib/api", () => ({
  userApi: {
    updateProfile: (...args) => api.userUpdateProfile(...args),
    remove: (...args) => api.userRemove(...args),
    exportData: vi.fn(),
  },
  authApi: {
    changeEmail: (...args) => api.authChangeEmail(...args),
    changePassword: (...args) => api.authChangePassword(...args),
    sessions: (...args) => api.authSessions(...args),
    revokeSession: (...args) => api.authRevokeSession(...args),
    security: (...args) => api.authSecurity(...args),
  },
  notificationApi: {
    preferences: vi.fn().mockResolvedValue({ data: { groups: [] } }),
  },
  downloadBlob: vi.fn(),
}));

import { SettingsPage } from "./SystemPages";

const renderSettings = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/settings"]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SettingsPage Candidate settings", () => {
  it("renders account information and allows editing display name and phone", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("alex@example.com")).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Display name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alex Updated");

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.userUpdateProfile).toHaveBeenCalledWith({
        name: "Alex Updated",
        phone: "+91 91234 56789",
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Account information saved");
  });

  it("submits change email request with valid email format", async () => {
    const user = userEvent.setup();
    renderSettings();

    const emailInput = screen.getByLabelText("New email address");
    await user.type(emailInput, "alex.new@example.com");

    const changeEmailBtn = screen.getByRole("button", { name: "Change Email" });
    expect(changeEmailBtn).not.toBeDisabled();
    await user.click(changeEmailBtn);

    await waitFor(() => {
      expect(api.authChangeEmail).toHaveBeenCalledWith("alex.new@example.com");
    });
    expect(mockToast.success).toHaveBeenCalledWith("Confirmation email sent to alex.new@example.com");
  });

  it("enforces 12-character minimum and password match in Security section", async () => {
    const user = userEvent.setup();
    renderSettings();

    // Navigate to Security tab
    const securityTab = screen.getByRole("button", { name: /Security/i });
    await user.click(securityTab);

    expect(await screen.findByRole("heading", { name: "Change password" })).toBeInTheDocument();

    const currentPw = screen.getByLabelText("Current password");
    const newPw = screen.getByLabelText("New password");
    const confirmPw = screen.getByLabelText("Confirm new password");
    const updateBtn = screen.getByRole("button", { name: "Update Password" });

    // Button disabled initially
    expect(updateBtn).toBeDisabled();

    // Short password (< 12 chars)
    await user.type(currentPw, "OldSecretPass123");
    await user.type(newPw, "short");
    await user.type(confirmPw, "short");
    expect(updateBtn).toBeDisabled();

    // Mismatched password
    await user.clear(newPw);
    await user.clear(confirmPw);
    await user.type(newPw, "ValidSecretPassword123!");
    await user.type(confirmPw, "DifferentPassword123!");
    expect(updateBtn).toBeDisabled();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();

    // Valid matching password (>= 12 chars)
    await user.clear(confirmPw);
    await user.type(confirmPw, "ValidSecretPassword123!");
    expect(updateBtn).not.toBeDisabled();

    await user.click(updateBtn);
    await waitFor(() => {
      expect(api.authChangePassword).toHaveBeenCalledWith({
        currentPassword: "OldSecretPass123",
        newPassword: "ValidSecretPassword123!",
      });
    });
    expect(mockToast.success).toHaveBeenCalledWith("Password updated");
  });

  it("lists active sessions and allows revoking non-current session", async () => {
    const user = userEvent.setup();
    renderSettings();

    const securityTab = screen.getByRole("button", { name: /Security/i });
    await user.click(securityTab);

    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("Firefox on Windows")).toBeInTheDocument();

    const revokeBtn = screen.getByRole("button", { name: "Revoke" });
    await user.click(revokeBtn);

    await waitFor(() => {
      expect(api.authRevokeSession).toHaveBeenCalledWith("s2", expect.anything());
    });
    expect(mockToast.success).toHaveBeenCalledWith("Session revoked");
  });

  it("shows Danger Zone with account deletion confirmation dialog", async () => {
    const user = userEvent.setup();
    renderSettings();

    const dangerTab = screen.getByRole("button", { name: /Danger zone/i });
    await user.click(dangerTab);

    expect(await screen.findByRole("heading", { name: "Delete account" })).toBeInTheDocument();

    const requestDeleteBtn = screen.getByRole("button", { name: "Request deletion" });
    expect(requestDeleteBtn).toHaveClass("bg-danger-600");
    expect(requestDeleteBtn).toHaveClass("text-white");
    await user.click(requestDeleteBtn);

    // Modal opens
    expect(screen.getByRole("heading", { name: "Request account deletion?" })).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole("button", { name: "I understand — delete my account" });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(api.userRemove).toHaveBeenCalledWith("Requested from account settings");
    });
    expect(mockLogout).toHaveBeenCalled();
  });

  it("renders sub-navigation tabs linking Settings overview, My Profile and Integrations", async () => {
    renderSettings();

    const nav = screen.getByRole("navigation", { name: "Settings navigation" });
    const overviewTab = within(nav).getByRole("link", { name: /Settings Overview/i });
    const profileTab = within(nav).getByRole("link", { name: /My Profile/i });
    const integrationsTab = within(nav).getByRole("link", { name: /^Integrations$/i });

    expect(overviewTab).toHaveAttribute("aria-current", "page");
    expect(overviewTab).toHaveAttribute("href", "/app/settings");
    expect(profileTab).toHaveAttribute("href", "/app/profile");
    expect(integrationsTab).toHaveAttribute("href", "/app/settings/integrations");
  });

  it("renders Connected Tools & Integrations card and supports Integrations left nav item", async () => {
    const user = userEvent.setup();
    renderSettings();

    // Check card in Account tab
    expect(screen.getByRole("heading", { name: "Connected Tools & Integrations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage Integrations →/i })).toHaveAttribute(
      "href",
      "/app/settings/integrations",
    );

    // Switch to Integrations section in left nav
    const integrationsBtn = screen.getByRole("button", { name: /Integrations/i });
    await user.click(integrationsBtn);

    expect(screen.getByRole("heading", { name: "Integrations & Video Tools" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Integrations Panel →/i })).toHaveAttribute(
      "href",
      "/app/settings/integrations",
    );
  });
});
