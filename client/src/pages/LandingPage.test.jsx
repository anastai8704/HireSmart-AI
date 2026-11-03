import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../lib/api", () => ({
  companiesApi: { list: vi.fn() },
}));
vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, role: null, organizationId: null }),
}));

import { companiesApi } from "../lib/api";
import { LandingPage } from "./LandingPage";

let locationSpy = "";
const LocationSpy = () => {
  const location = useLocation();
  useEffect(() => {
    locationSpy = `${location.pathname}${location.search}`;
  }, [location]);
  return null;
};

const renderLanding = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/jobs" element={<LocationSpy />} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(cleanup);

beforeEach(() => {
  locationSpy = "";
  companiesApi.list.mockReset();
  companiesApi.list.mockResolvedValue({
    data: [{ id: "c1", name: "Acme Labs", slug: "acme-labs", industry: "Software", openRoles: 4 }],
    meta: { count: 1 },
  });
});

describe("landing page copy", () => {
  it("explains both sides of the platform in plain language", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find the right job.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hire the right people.");
    expect(
      screen.getByText(/Search jobs, check your resume, and understand why a role matches/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search jobs/i })).toBeInTheDocument();
    // Primary CTAs are offered in dedicated action sections (e.g. bottom conversion CTA).
    expect(screen.getByRole("link", { name: /find a job/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /hire talent/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("no longer uses jargon-heavy marketing claims", () => {
    const { container } = renderLanding();
    const copy = container.textContent;
    for (const phrase of [
      "evidence-backed",
      "opaque",
      "autonomous",
      "tenant isolation",
      "revocable sessions",
      "versioned resumes",
      "inspectable",
    ]) {
      expect(copy.toLowerCase(), `still contains "${phrase}"`).not.toContain(phrase);
    }
  });

  it("states that people make the final hiring decision", () => {
    renderLanding();
    expect(
      screen.getByText(/AI helps you understand the match — people make the final decision\./),
    ).toBeInTheDocument();
  });
});

describe("landing page search", () => {
  it("sends the form to the public jobs route", async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.type(screen.getByLabelText("What job are you looking for?"), "python developer");
    await user.type(screen.getByLabelText("Where?"), "Mumbai");
    await user.selectOptions(screen.getByLabelText("Work mode"), "remote");
    await user.click(screen.getByRole("button", { name: /search jobs/i }));
    await waitFor(() =>
      expect(locationSpy).toBe("/jobs?query=python+developer&location=Mumbai&workplaceMode=remote"),
    );
  });

  it("offers popular searches that link to real filters", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "Remote" })).toHaveAttribute(
      "href",
      "/jobs?workplaceMode=remote",
    );
    expect(screen.getByRole("link", { name: "Mumbai" })).toHaveAttribute(
      "href",
      "/jobs?location=Mumbai",
    );
  });
});

describe("landing page companies", () => {
  it("renders companies returned by the API", async () => {
    renderLanding();
    expect(await screen.findByText("Acme Labs")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /acme labs/i });
    expect(card).toHaveTextContent("4 open roles");
    expect(card).toHaveTextContent("Software");
    expect(card).toHaveAttribute("href", "/companies/acme-labs");
    expect(screen.getByRole("link", { name: /view all companies/i })).toHaveAttribute(
      "href",
      "/companies",
    );
  });

  it("shows an empty state instead of fake companies", async () => {
    companiesApi.list.mockResolvedValue({ data: [], meta: { count: 0 } });
    renderLanding();
    expect(await screen.findByText("No companies to show yet")).toBeInTheDocument();
    expect(screen.queryByText("Acme Labs")).not.toBeInTheDocument();
  });

  it("shows a retry state when the request fails", async () => {
    companiesApi.list.mockRejectedValue(new Error("Network error"));
    renderLanding();
    expect(await screen.findByText("We couldn't load companies right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
