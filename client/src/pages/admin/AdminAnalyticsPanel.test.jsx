import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminAnalyticsPanel } from "./AdminAnalyticsPanel";

const emptySeries = (days) => Array.from({ length: days }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count: 0, amount: 0 }));

const analytics = {
  range: { preset: "7d", from: "2026-10-30", to: "2026-11-05", days: 7, timezone: "Asia/Kolkata" },
  kpis: {
    candidatesTotal: 42,
    candidatesNew: 5,
    recruitersTotal: 9,
    recruitersNew: 1,
    companiesTotal: 4,
    companiesVerified: 2,
    companiesAwaitingVerification: 1,
    fraudReviewQueue: 0,
    suspendedAccounts: 0,
    activeJobs: 11,
    pendingJobApprovals: 3,
    jobPostings: 2,
    applications: 0,
    interviewsScheduled: 0,
    offersIssued: 0,
    candidatesHired: 0,
    confirmedEmployment: 0,
    hiringConversion: null,
    activePaidSubscriptions: 1,
    subscriptionConversion: 25,
    successfulPayments: 2,
    revenue: 1000,
    refunds: 1,
    failedPayments: 1,
  },
  definitions: {
    revenue: { label: "Net revenue", period: "range", definition: "Captured minus refunds." },
    candidatesTotal: { label: "Registered candidates", period: "as_of_now", definition: "Candidate accounts." },
  },
  series: {
    candidateRegistrations: emptySeries(7),
    jobPostings: emptySeries(7),
    paidSubscriptionsStarted: emptySeries(7),
    grossCapturedRevenue: emptySeries(7),
    refundsRevenue: emptySeries(7),
    failedPayments: emptySeries(7),
  },
  breakdowns: {
    funnel: [{ stage: "submitted", count: 0 }],
    stageDistribution: [],
    hiringOutcomes: [],
    companyVerification: [{ key: "verified", label: "Verified", count: 2 }],
    jobApproval: [],
  },
};

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <AdminAnalyticsPanel
        analytics={analytics}
        range={{ preset: "7d", from: "", to: "" }}
        onRangeChange={vi.fn()}
        customError={null}
        {...props}
      />
    </MemoryRouter>,
  );

describe("AdminAnalyticsPanel", () => {
  afterEach(cleanup);

  it("shows KPI values from the server response, formatted in INR where money", () => {
    renderPanel();
    expect(within(screen.getByTestId("kpi-candidatesTotal")).getByText("42")).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-revenue")).getByText("₹1,000")).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-candidatesTotal")).getByText("5 new in range")).toBeInTheDocument();
  });

  it("shows a dash, not zero, when a rate has no denominator", () => {
    renderPanel();
    expect(within(screen.getByTestId("kpi-hiringConversion")).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("kpi-subscriptionConversion")).getByText("25%")).toBeInTheDocument();
  });

  it("links drill-down cards to the matching admin pages", () => {
    renderPanel();
    expect(screen.getByRole("link", { name: /Pending job approvals: 3/ })).toHaveAttribute("href", "/app/admin/moderation");
    expect(screen.getByRole("link", { name: /Awaiting verification: 1/ })).toHaveAttribute("href", "/app/admin/verification");
    expect(screen.queryByRole("link", { name: /Applications/ })).toBeNull();
  });

  it("explains the definition of a card on hover", () => {
    renderPanel();
    expect(screen.getByTestId("kpi-revenue")).toHaveAttribute("title", "Captured minus refunds.");
  });

  it("shows empty states for charts without data, and keeps a data table for accessibility", () => {
    renderPanel();
    expect(screen.getByText("No revenue in this range")).toBeInTheDocument();
    expect(screen.getByText("No outcomes yet")).toBeInTheDocument();
    expect(screen.getAllByText("View data table").length).toBeGreaterThan(0);
  });

  it("switches presets and reveals custom date inputs", () => {
    const onRangeChange = vi.fn();
    renderPanel({ onRangeChange });
    fireEvent.click(screen.getByRole("button", { name: "Last 90 days" }));
    expect(onRangeChange).toHaveBeenLastCalledWith({ preset: "90d", from: "", to: "" });
  });

  it("shows the custom range validation message", () => {
    renderPanel({ range: { preset: "custom", from: "2026-11-05", to: "2026-11-01" }, customError: "The start date must be on or before the end date." });
    expect(screen.getByRole("alert")).toHaveTextContent("start date must be on or before");
    expect(screen.getByLabelText("From (IST)")).toBeInTheDocument();
  });
});
