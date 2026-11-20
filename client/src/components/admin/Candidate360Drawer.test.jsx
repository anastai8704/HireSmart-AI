import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Candidate360Drawer from "./Candidate360Drawer";

const mocks = vi.hoisted(() => ({
  candidate360: vi.fn(),
  candidateResumeDownload: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  adminApi: {
    candidate360: (...args) => mocks.candidate360(...args),
    candidateResumeDownload: (...args) => mocks.candidateResumeDownload(...args),
  },
  downloadBlob: vi.fn(),
}));

vi.mock("../ui/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

afterEach(cleanup);

describe("Candidate360Drawer", () => {
  const mockData = {
    candidate: {
      id: "c1",
      name: "Priya Sharma",
      email: "priya@example.com",
      phone: "+91 9876543210",
      headline: "Senior Backend Developer",
      location: "Bengaluru",
      bio: "Experienced Node.js developer",
      skills: ["Node.js", "MongoDB", "Express"],
      accountStatus: "active",
      emailVerified: true,
      createdAt: "2026-01-15T10:00:00.000Z",
    },
    resumes: [
      { id: "r1", version: 1, originalName: "priya-cv.pdf", processingStatus: "ready", createdAt: "2026-01-16T10:00:00.000Z" },
    ],
    applications: [
      {
        id: "a1",
        jobTitle: "Lead Engineer",
        organizationName: "Meridian Tech",
        status: "interview",
        matchScore: 92,
        offer: { status: "issued", designation: "Lead Engineer", ctc: 2500000 },
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ],
    interviews: [
      {
        id: "i1",
        jobTitle: "Lead Engineer",
        organizationName: "Meridian Tech",
        round: 1,
        type: "Technical",
        status: "completed",
        scheduledStart: "2026-02-10T10:00:00.000Z",
        timezone: "Asia/Kolkata",
        meetingProvider: "google_meet",
      },
    ],
    placements: [
      {
        id: "p1",
        jobTitle: "Lead Engineer",
        organizationName: "Meridian Tech",
        status: "joined_pending_verification",
        isVerified: false,
        reportedBy: "candidate",
        joinedDate: "2026-03-01T00:00:00.000Z",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    mocks.candidate360.mockResolvedValue({ data: mockData });
  });

  it("renders candidate 360 overview and switches tabs", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Candidate360Drawer candidateId="c1" onClose={vi.fn()} />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Developer")).toBeInTheDocument();
    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(screen.getByText("Experienced Node.js developer")).toBeInTheDocument();

    // Check skills
    expect(screen.getByText("Node.js")).toBeInTheDocument();

    // Switch to Applications tab
    fireEvent.click(screen.getByRole("button", { name: /Applications \(1\)/i }));
    expect(await screen.findByText("Lead Engineer")).toBeInTheDocument();
    expect(screen.getByText("Meridian Tech")).toBeInTheDocument();
    expect(screen.getByText("92% Match")).toBeInTheDocument();

    // Switch to Employment & Placements tab
    fireEvent.click(screen.getByRole("button", { name: /Employment & Placements \(1\)/i }));
    expect(await screen.findByText(/Self-Reported \/ Awaiting Verification/i)).toBeInTheDocument();
  });
});
