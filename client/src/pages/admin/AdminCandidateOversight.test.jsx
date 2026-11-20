import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsers } from "./AdminPages";

const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  flagUser: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  candidate360: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  adminApi: {
    users: (...args) => mocks.users(...args),
    flagUser: (...args) => mocks.flagUser(...args),
    suspend: (...args) => mocks.suspend(...args),
    reactivate: (...args) => mocks.reactivate(...args),
    candidate360: (...args) => mocks.candidate360(...args),
  },
  downloadBlob: vi.fn(),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

afterEach(cleanup);

describe("AdminUsers Component (Candidate Directory)", () => {
  const mockUsersResponse = {
    data: [
      {
        _id: "user_cand_1",
        name: "Priya Sharma",
        email: "priya@example.com",
        role: "candidate",
        accountStatus: "active",
        emailVerified: true,
        headline: "Staff Cloud Architect",
        location: "Bengaluru",
        skills: ["Go", "Kubernetes", "AWS"],
        createdAt: "2026-01-10T10:00:00.000Z",
      },
      {
        _id: "user_rec_2",
        name: "Vikram Mehta",
        email: "vikram@meridian.test",
        role: "recruiter",
        accountStatus: "active",
        emailVerified: true,
        createdAt: "2026-01-12T10:00:00.000Z",
      },
    ],
    meta: {
      total: 2,
      counts: {
        total: 2,
        candidates: 1,
        recruiters: 1,
        admins: 0,
        active: 2,
        suspended: 0,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.users.mockResolvedValue(mockUsersResponse);
    mocks.flagUser.mockResolvedValue({ data: { success: true } });
  });

  const renderComponent = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AdminUsers />
      </QueryClientProvider>
    );
  };

  it("renders candidate directory with KPI cards and candidate profile overview", async () => {
    renderComponent();

    // Check KPI cards
    expect(await screen.findByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("Candidates")).toBeInTheDocument();
    expect(screen.getByText("Recruiters")).toBeInTheDocument();
    expect(screen.getByText("Active Accounts")).toBeInTheDocument();

    // Check candidate row
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Staff Cloud Architect")).toBeInTheDocument();
    expect(screen.getByText("📍 Bengaluru")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();

    // Check action buttons for candidate
    expect(screen.getByRole("button", { name: /360° Profile/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resumes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Flag/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Suspend/i })[0]).toBeInTheDocument();
  });

  it("opens flag suspicious activity modal and submits flag note", async () => {
    renderComponent();

    const flagBtn = await screen.findByRole("button", { name: /Flag/i });
    fireEvent.click(flagBtn);

    expect(await screen.findByText(/Flag Suspicious Activity: Priya Sharma/i)).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Enter details of suspicious activity/i);
    fireEvent.change(textarea, { target: { value: "Duplicate identity suspected" } });

    const submitBtn = screen.getByRole("button", { name: /Record Flag/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mocks.flagUser).toHaveBeenCalledWith("user_cand_1", "Duplicate identity suspected");
    });
  });

  it("supports sorting and filtering", async () => {
    renderComponent();

    const sortInput = await screen.findByLabelText("Sort users");
    fireEvent.mouseDown(sortInput);
    const sortOption = await screen.findByRole("option", { name: "Oldest first" });
    fireEvent.mouseDown(sortOption);

    await waitFor(() => {
      expect(mocks.users).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "oldest" })
      );
    });

    const roleInput = screen.getByLabelText("Filter by role");
    fireEvent.mouseDown(roleInput);
    const roleOption = await screen.findByRole("option", { name: "Candidate" });
    fireEvent.mouseDown(roleOption);

    await waitFor(() => {
      expect(mocks.users).toHaveBeenCalledWith(
        expect.objectContaining({ role: "candidate" })
      );
    });
  });
});
