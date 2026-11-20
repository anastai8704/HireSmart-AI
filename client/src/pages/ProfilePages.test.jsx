import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("../components/ui/useToast", () => ({ useToast: () => mockToast }));

const mockAuth = { user: null, role: "candidate", refresh: vi.fn() };
vi.mock("../context/useAuth", () => ({ useAuth: () => mockAuth }));

const api = vi.hoisted(() => ({
  userUpdateProfile: vi.fn().mockResolvedValue({ data: { data: {} } }),
  userUploadAvatar: vi.fn().mockResolvedValue({ data: { data: {} } }),
  userRemoveAvatar: vi.fn().mockResolvedValue({ data: { data: {} } }),
  candidateProfile: vi.fn().mockResolvedValue({ data: { user: {}, profile: null } }),
  candidateUpdateProfile: vi.fn().mockResolvedValue({ data: { data: {} } }),
  resumeList: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../lib/api", () => ({
  userApi: {
    updateProfile: (...args) => api.userUpdateProfile(...args),
    uploadAvatar: (...args) => api.userUploadAvatar(...args),
    removeAvatar: (...args) => api.userRemoveAvatar(...args),
  },
  candidateApi: {
    profile: (...args) => api.candidateProfile(...args),
    updateProfile: (...args) => api.candidateUpdateProfile(...args),
  },
  resumeApi: {
    list: (...args) => api.resumeList(...args),
  },
}));

import { ProfilePage } from "./ProfilePages";

const makeAuth = (role = "candidate", overrides = {}) => ({
  user: {
    _id: "user_1",
    displayName: "Jane Candidate",
    name: "Jane Candidate",
    email: "jane@example.com",
    role,
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    headline: "Senior Frontend Engineer",
    bio: "Passionate about performant UI and accessible web applications.",
    skills: ["React", "TypeScript", "Node.js"],
    socialLinks: {
      linkedin: "https://linkedin.com/in/janecandidate",
      github: "https://github.com/janecandidate",
      portfolio: "https://jane.dev",
    },
    companyName: "",
    department: "",
    hiringSpecializations: [],
    avatarUrl: null,
    pendingEmail: null,
    ...overrides,
  },
  role,
  refresh: vi.fn(),
});

const renderProfile = (role = "candidate", userOverrides = {}) => {
  const made = makeAuth(role, userOverrides);
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

beforeEach(() => {
  vi.clearAllMocks();
  api.userUpdateProfile.mockResolvedValue({ data: { data: {} } });
  api.candidateProfile.mockResolvedValue({
    data: {
      user: {},
      profile: {
        education: [
          { institution: "IIT Madras", degree: "B.Tech", fieldOfStudy: "Computer Science", startYear: 2016, endYear: 2020 },
        ],
        experience: [
          { company: "TechCorp", position: "Software Engineer", description: "Built scalable web apps", currentlyWorking: true },
        ],
        projects: [],
        certifications: [],
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        languages: ["English", "Hindi"],
      },
    },
  });
  api.resumeList.mockResolvedValue({
    data: [
      {
        id: "res_1",
        versionNumber: 2,
        fileName: "Jane_Resume_2026.pdf",
        processingStatus: "ready",
        atsScore: 88,
        createdAt: "2026-03-01T10:00:00Z",
      },
    ],
  });
});

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
    expect(screen.getByRole("link", { name: /Account Settings/i })).toHaveAttribute("href", "/app/settings");
    expect(screen.getByLabelText("GitHub")).toBeInTheDocument();
    expect(screen.queryByLabelText("Department")).not.toBeInTheDocument();
    expect(await screen.findByText("Your experience & credentials")).toBeInTheDocument();
  });
});

describe("Candidate Profile completion and resume association", () => {
  it("displays 100% profile completeness when all 7 criteria are met", async () => {
    renderProfile("candidate");
    expect(await screen.findByText("7 of 7 items complete")).toBeInTheDocument();
    expect(await screen.findByTestId("profile-completion-pct")).toHaveTextContent("100%");
  });

  it("computes partial profile completeness when fields are missing", async () => {
    // Missing bio and headline
    renderProfile("candidate", { headline: "", bio: "" });
    // 5 of 7 is 71%
    expect(await screen.findByText("5 of 7 items complete")).toBeInTheDocument();
    expect(await screen.findByTestId("profile-completion-pct")).toHaveTextContent("71%");
  });

  it("displays associated primary resume details and ATS readiness", async () => {
    renderProfile("candidate");
    expect(await screen.findByText("Primary Resume")).toBeInTheDocument();
    expect(await screen.findByText("Jane_Resume_2026.pdf")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("88% ATS score")).toBeInTheDocument();
  });

  it("displays an upload prompt when no resume is uploaded yet", async () => {
    api.resumeList.mockResolvedValueOnce({ data: [] });
    renderProfile("candidate");
    expect(await screen.findByText("No resume associated yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload in Resume Manager/i })).toHaveAttribute(
      "href",
      "/app/candidate/resumes",
    );
  });
});

describe("Candidate Profile editing and saving", () => {
  it("submits updated basic profile fields to userApi", async () => {
    const user = userEvent.setup();
    renderProfile("candidate");

    const headlineInput = screen.getByLabelText("Professional headline");
    await user.clear(headlineInput);
    await user.type(headlineInput, "Staff Frontend Architect");

    const saveBtn = screen.getByRole("button", { name: "Save profile" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.userUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: "Staff Frontend Architect",
        }),
      );
    });
    expect(mockToast.success).toHaveBeenCalledWith("Profile saved");
  });

  it("submits professional details to candidateApi", async () => {
    const user = userEvent.setup();
    renderProfile("candidate");

    expect(await screen.findByText("Your experience & credentials")).toBeInTheDocument();

    const cityInput = screen.getByLabelText("City");
    await user.clear(cityInput);
    await user.type(cityInput, "Hyderabad");

    const saveDetailsBtn = screen.getByRole("button", { name: "Save details" });
    await user.click(saveDetailsBtn);

    await waitFor(() => {
      expect(api.candidateUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          city: "Hyderabad",
          state: "Karnataka",
          country: "India",
        }),
      );
    });
    expect(mockToast.success).toHaveBeenCalledWith("Professional details saved");
  });

  it("renders an error callout if saving basic profile fails", async () => {
    api.userUpdateProfile.mockRejectedValueOnce(new Error("Network connection error"));
    const user = userEvent.setup();
    renderProfile("candidate");

    const saveBtn = screen.getByRole("button", { name: "Save profile" });
    await user.click(saveBtn);

    expect(await screen.findByText("Network connection error")).toBeInTheDocument();
  });
});
