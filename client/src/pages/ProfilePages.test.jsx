import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../context/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("../components/ui/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../lib/api", () => ({
  userApi: {
    updateProfile: vi.fn().mockResolvedValue({ data: { data: {} } }),
    uploadAvatar: vi.fn().mockResolvedValue({ data: { data: {} } }),
    removeAvatar: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  candidateApi: {
    profile: vi.fn().mockResolvedValue({ data: { user: {}, profile: null } }),
    updateProfile: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
}));
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ProfilePage } from "./ProfilePages";

const mockAuth = { user: null, refresh: vi.fn() };

const makeAuth = (role) => ({
  user: {
    _id: "user_1",
    name: "Test User",
    email: "test@example.com",
    role,
    phone: "",
    location: "Ahmedabad, India",
    headline: "",
    bio: "",
    skills: [],
    socialLinks: { linkedin: "", github: "", portfolio: "" },
    companyName: "",
    department: "",
    hiringSpecializations: [],
    avatarUrl: null,
    pendingEmail: null,
  },
  role,
  refresh: vi.fn(),
});

const renderProfile = (role) => {
  const made = makeAuth(role);
  mockAuth.user = made.user;
  mockAuth.role = role;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/profile"]}>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
});

describe("ProfilePage role awareness", () => {
  it("shows the recruiter company context without developer fields", () => {
    renderProfile("recruiter");
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
    expect(screen.getByLabelText("Hiring specializations")).toBeInTheDocument();
    expect(screen.getByLabelText("Company website")).toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Skills")).not.toBeInTheDocument();
  });

  it("shows the admin identity profile without candidate or recruiter fields", () => {
    renderProfile("admin");
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getAllByLabelText("LinkedIn").length).toBeGreaterThan(0);
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Department")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hiring specializations")).not.toBeInTheDocument();
  });

  it("shows candidate fields including GitHub and the details panel", async () => {
    renderProfile("candidate");
    expect(screen.getByLabelText("GitHub")).toBeInTheDocument();
    expect(screen.queryByLabelText("Department")).not.toBeInTheDocument();
    expect(await screen.findByText("Professional details")).toBeInTheDocument();
  });
});
