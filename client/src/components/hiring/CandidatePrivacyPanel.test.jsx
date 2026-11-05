import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { candidateApi } = vi.hoisted(() => ({ candidateApi: { updateProfile: vi.fn() } }));
vi.mock("../../lib/api", () => ({ candidateApi }));
vi.mock("../ui/useToast", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));

import { CandidatePrivacyPanel } from "./CandidatePrivacyPanel";

const renderPanel = (profile) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CandidatePrivacyPanel profile={profile} />
    </QueryClientProvider>,
  );

describe("CandidatePrivacyPanel", () => {
  beforeEach(() => candidateApi.updateProfile.mockReset().mockResolvedValue({}));
  afterEach(cleanup);

  it("starts with everything closed for recruiters", () => {
    renderPanel({});
    expect(screen.getByLabelText("Show my phone number to recruiters where I have applied").checked).toBe(false);
    expect(screen.getByLabelText("I want to share my current employment details").checked).toBe(false);
    expect(screen.getByLabelText("Employer").disabled).toBe(true);
  });

  it("saves only the explicit choices, with employment marked as candidate-reported", async () => {
    renderPanel({});
    fireEvent.click(screen.getByLabelText("I want to share my current employment details"));
    fireEvent.change(screen.getByLabelText("Employer"), { target: { value: " Acme " } });
    fireEvent.click(screen.getByRole("button", { name: "Save privacy settings" }));
    await waitFor(() => expect(candidateApi.updateProfile).toHaveBeenCalledTimes(1));
    expect(candidateApi.updateProfile).toHaveBeenCalledWith({
      employmentStatus: "unspecified",
      currentEmployment: { disclosed: true, employer: "Acme", designation: "" },
      privacy: { sharePhoneWithRecruiters: false, shareCurrentEmployment: false },
    });
  });
});
