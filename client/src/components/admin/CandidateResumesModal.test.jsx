// Requirement 9: admin resume visibility is read-only, lists real versions and downloads through the audited endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ candidateResumes: vi.fn(), candidateResumeDownload: vi.fn() }));
const utils = vi.hoisted(() => ({ downloadBlob: vi.fn() }));

vi.mock("../../lib/api", () => ({ adminApi: api }));
vi.mock("../../lib/utils", async (importOriginal) => ({ ...(await importOriginal()), downloadBlob: utils.downloadBlob }));
vi.mock("../ui/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { CandidateResumesModal } from "./CandidateResumesModal";

const candidate = { _id: "c1", name: "Asha Rao", email: "asha@example.com" };
const versions = [
  { id: "v2", version: 2, originalName: "asha-2026.pdf", size: 204800, processingStatus: "ready", createdAt: "2026-10-01T06:00:00Z" },
  { id: "v1", version: 1, originalName: "asha-2025.pdf", size: 102400, processingStatus: "failed", createdAt: "2025-05-01T06:00:00Z" },
];

const renderModal = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CandidateResumesModal candidate={candidate} onClose={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.candidateResumes.mockReset().mockResolvedValue({ data: versions });
  api.candidateResumeDownload.mockReset().mockResolvedValue({ data: new Blob(["%PDF"]) });
  utils.downloadBlob.mockReset();
});
afterEach(() => cleanup());

describe("CandidateResumesModal", () => {
  it("states that access is audited and lists every version with its status", async () => {
    renderModal();
    expect(await screen.findByRole("list", { name: "Resume versions" })).toBeInTheDocument();
    expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument();
    expect(screen.getByText("asha-2026.pdf")).toBeInTheDocument();
    expect(screen.getByText("asha-2025.pdf")).toBeInTheDocument();
    expect(api.candidateResumes).toHaveBeenCalledWith("c1");
  });

  it("downloads a version through the audited endpoint with its ids", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByRole("button", { name: "Download asha-2026.pdf" }));
    await waitFor(() => expect(api.candidateResumeDownload).toHaveBeenCalledWith("c1", "v2"));
    expect(utils.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "asha-2026.pdf");
  });

  it("says so when the candidate has no resume", async () => {
    api.candidateResumes.mockResolvedValue({ data: [] });
    renderModal();
    expect(await screen.findByText("No resumes uploaded")).toBeInTheDocument();
  });

  it("shows an error, not an empty list, when the request is denied or fails", async () => {
    api.candidateResumes.mockRejectedValue(new Error("Forbidden"));
    renderModal();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No resumes uploaded")).not.toBeInTheDocument();
  });
});
