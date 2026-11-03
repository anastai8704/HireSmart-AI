import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../context/useAuth", () => ({ useAuth: () => mockAuth }));
vi.mock("../components/ui/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../lib/api", () => ({
  notificationApi: {
    list: vi.fn(),
    read: vi.fn(),
    markUnread: vi.fn(),
    readAll: vi.fn(),
    preferences: vi.fn(),
  },
  userApi: { updateNotificationPrefs: vi.fn() },
  authApi: {},
  downloadBlob: vi.fn(),
}));
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { notificationApi, userApi } from "../lib/api";
import { NotificationsPage, PrefsSection } from "./SystemPages";

const mockAuth = { user: null, role: "recruiter", organizationId: "org_1" };

const withProvider = (ui) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const RECRUITER_TEMPLATE = {
  data: {
    role: "recruiter",
    groups: [
      {
        key: "jobs",
        label: "Jobs",
        description: "Jobs.",
        alwaysOn: false,
        events: [
          {
            key: "job_submitted_for_approval",
            label: "Job submitted for approval",
            description: "Submitted.",
            alwaysOn: false,
            channels: { inApp: true, email: false, push: false },
            current: { inApp: true, email: false },
          },
        ],
      },
      {
        key: "security",
        label: "Account & Security",
        description: "Security.",
        alwaysOn: true,
        events: [
          {
            key: "password_changed",
            label: "Password changes",
            description: "Changes.",
            alwaysOn: true,
            channels: { inApp: true, email: true, push: false },
            current: { inApp: true, email: true },
          },
        ],
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrefsSection (role-aware notification preferences)", () => {
  it("renders the backend catalog with channel switches and always-on rows", async () => {
    mockAuth.user = { _id: "u1", role: "recruiter" };
    notificationApi.preferences.mockResolvedValue(RECRUITER_TEMPLATE);
    withProvider(<PrefsSection />);

    expect(await screen.findByText("Job submitted for approval")).toBeInTheDocument();
    expect(screen.getByText("Not by email")).toBeInTheDocument();
    expect(screen.getAllByText("Always on").length).toBeGreaterThan(0);

    // Toggling the in-app switch persists through the real preferences API.
    userApi.updateNotificationPrefs.mockResolvedValue({ data: { notificationPrefs: {} } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "Job submitted for approval in-app" }));
    expect(userApi.updateNotificationPrefs).toHaveBeenCalledWith({
      events: { job_submitted_for_approval: { inApp: false } },
    });
  });
});

describe("NotificationsPage (center)", () => {
  const ITEMS = {
    data: [
        {
          _id: "n1",
          type: "new_application",
          category: "candidates",
          title: "New application: Backend role",
          message: "Ari applied for Backend role.",
          resourceType: "application",
          resourceId: "app1",
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          _id: "n2",
          type: "password_changed",
          category: "security",
          title: "Password changed",
          message: "Your password was changed.",
          resourceType: "user",
          resourceId: "u1",
          readAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
    ],
    meta: {},
  };

  it("groups notifications with unread badges and read/unread controls", async () => {
    mockAuth.user = { _id: "u1", role: "recruiter" };
    notificationApi.list.mockResolvedValue(ITEMS);
    notificationApi.preferences.mockResolvedValue(RECRUITER_TEMPLATE);
    withProvider(<NotificationsPage />);

    // Grouped sections appear with per-group unread badges.
    expect(await screen.findByRole("heading", { name: /Candidates/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Account & Security/i })).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
    // Header shows the total unread count.
    expect(screen.getByText("1 unread")).toBeInTheDocument();

    // Read item offers mark-as-unread; unread item offers mark-as-read.
    expect(
      screen.getByRole("button", { name: "Mark as unread: Password changed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark as read: New application: Backend role" }),
    ).toBeInTheDocument();
    // Entity link resolves from the resource type.
    expect(screen.getByText("View →")).toBeInTheDocument();
  });

  it("shows the empty state when there are no notifications", async () => {
    mockAuth.user = { _id: "u1", role: "recruiter" };
    notificationApi.list.mockResolvedValue({ data: [], meta: {} });
    notificationApi.preferences.mockResolvedValue(RECRUITER_TEMPLATE);
    withProvider(<NotificationsPage />);
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });
});
