import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CandidateOfferPanel, RecruiterOfferPanel } from "./OfferPanels";

afterEach(cleanup);

describe("RecruiterOfferPanel", () => {
  it("offers the issue form at interview stage and never a plain hire", () => {
    const onIssue = vi.fn();
    render(<RecruiterOfferPanel application={{ status: "interview", offer: { status: "none" } }} onIssue={onIssue} onHire={vi.fn()} />);
    expect(screen.getByRole("form", { name: "Issue offer" })).toBeTruthy();
    expect(screen.queryByText("Mark as Hired")).toBeNull();
  });

  it("submits the offer details with the issue action", () => {
    const onIssue = vi.fn();
    render(<RecruiterOfferPanel application={{ status: "interview", offer: { status: "none" } }} onIssue={onIssue} />);
    fireEvent.change(screen.getByLabelText(/Designation/), { target: { value: "Senior Engineer" } });
    fireEvent.change(screen.getByLabelText(/CTC/), { target: { value: "1800000" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue offer" }));
    expect(onIssue).toHaveBeenCalledWith({ designation: "Senior Engineer", ctc: 1800000 });
  });

  it("shows awaiting-response without any hire action while the offer is issued", () => {
    render(<RecruiterOfferPanel application={{ status: "offer", offer: { status: "issued", designation: "Engineer" } }} onHire={vi.fn()} />);
    expect(screen.getByText(/Awaiting the candidate/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as Hired" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Issue offer" })).toBeNull();
  });

  it("enables Mark as Hired only after the candidate accepted", () => {
    const onHire = vi.fn();
    render(<RecruiterOfferPanel application={{ status: "offer", offer: { status: "accepted", respondedAt: "2026-11-01T10:00:00Z" } }} onHire={onHire} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as Hired" }));
    expect(onHire).toHaveBeenCalledTimes(1);
  });

  it("lets the recruiter issue a new offer after a decline", () => {
    render(<RecruiterOfferPanel application={{ status: "offer", offer: { status: "declined", responseNote: "Not now" } }} onIssue={vi.fn()} />);
    expect(screen.getByText(/declined the previous offer/)).toBeTruthy();
    expect(screen.getByRole("form", { name: "Issue offer" })).toBeTruthy();
  });

  it("renders nothing for stages where offers do not apply", () => {
    const { container } = render(<RecruiterOfferPanel application={{ status: "submitted", offer: { status: "none" } }} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("CandidateOfferPanel", () => {
  it("lets the candidate accept or decline an issued offer", () => {
    const onRespond = vi.fn();
    render(<CandidateOfferPanel application={{ offer: { status: "issued", designation: "Engineer", ctc: 1200000 } }} onRespond={onRespond} />);
    expect(screen.getByText(/12,00,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(onRespond).toHaveBeenLastCalledWith({ response: "accept", note: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Decline offer" }));
    expect(onRespond).toHaveBeenLastCalledWith({ response: "decline", note: undefined });
  });

  it("does not show response buttons once answered", () => {
    render(<CandidateOfferPanel application={{ offer: { status: "accepted", respondedAt: "2026-11-01T10:00:00Z" } }} />);
    expect(screen.getByText("You accepted this offer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull();
  });

  it("shows nothing without an offer", () => {
    const { container } = render(<CandidateOfferPanel application={{ offer: { status: "none" } }} />);
    expect(container.innerHTML).toBe("");
  });
});
