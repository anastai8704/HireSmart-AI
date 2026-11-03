import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ErrorCallout, HybridMatch, StatusPill } from "./Product";
describe("production AI result UI", () => {
  it("renders explainable score, confidence and limitations", () => {
    render(
      <MemoryRouter>
        <HybridMatch
          match={{
            overallScore: 72,
            confidence: 0.81,
            recommendation: "review",
            componentScores: { requiredSkills: { score: 80 }, semantic: { score: 64 } },
            matchedSkills: ["node"],
            missingRequiredSkills: ["kubernetes"],
            concerns: ["Missing evidence"],
            limitations: ["Decision-support score"],
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("81% confidence")).toBeInTheDocument();
    expect(screen.getByText("kubernetes")).toBeInTheDocument();
    expect(screen.getByText(/Decision-support/)).toBeInTheDocument();
  });
  it("exposes status text", () => {
    render(<StatusPill status="processing" />);
    // Labels are displayed human-first (capitalized) per the design system.
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });
  it("never presents an AI failure as success", () => {
    render(
      <ErrorCallout
        error={Object.assign(new Error("Provider timed out"), { requestId: "req-1" })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Provider timed out");
    expect(screen.queryByText(/completed successfully/i)).not.toBeInTheDocument();
  });
});
