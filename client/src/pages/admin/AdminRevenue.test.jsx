import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const revenueMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ adminApi: { revenue: revenueMock } }));

import AdminRevenue from "./AdminRevenue";

// Searchable dropdowns open on click and choose on option click (Requirement 12).
const pickOption = async (user, comboName, optionName) => {
  await user.click(screen.getByRole("combobox", { name: comboName }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: optionName }));
};


const summary = {
  total: { grossCaptured: 1600, refunds: 200, netRevenue: 1400, successfulPayments: 3, refundedPayments: 1 },
  test: { grossCaptured: 1200, refunds: 200, netRevenue: 1000, successfulPayments: 2, refundedPayments: 1 },
  live: { grossCaptured: 400, refunds: 0, netRevenue: 400, successfulPayments: 1, refundedPayments: 0 },
  failedPayments: 1,
  pendingAttempts: 1,
  rule: "Net = captured Razorpay payments minus refunds processed in range.",
};

const row = (over = {}) => ({
  id: "t1",
  transactionNumber: "TXN-1",
  subscriberType: "organization",
  organizationName: "Acme Hiring",
  planTier: "recruiter_pro",
  amount: 1000,
  currency: "INR",
  createdAt: "2026-10-01T10:00:00Z",
  refundStatus: "none",
  status: "captured",
  mode: "test",
  gatewayPaymentId: "pay_test_1",
  subscriptionId: "",
  verification: "verified",
  eligibleForRevenue: true,
  ...over,
});

const renderPage = (entry = "/app/admin/revenue") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <AdminRevenue />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  revenueMock.mockReset();
});

describe("Admin Revenue & Plans", () => {
  it("shows test and live net revenue separately, with the calculation rule", async () => {
    revenueMock.mockResolvedValue({ data: { summary, transactions: [row()] }, meta: { page: 1, pages: 1, total: 1 } });
    renderPage();

    expect(await screen.findByTestId("card-net-test")).toHaveTextContent("₹1,000");
    expect(screen.getByTestId("card-net-live")).toHaveTextContent("₹400");
    expect(screen.getByTestId("card-refunds")).toHaveTextContent("₹200");
    expect(screen.getByText(/Sandbox, failed and pending records are excluded/i)).toBeInTheDocument();
    expect(screen.getByText(summary.rule)).toBeInTheDocument();
  });

  it("lists the required columns for each payment", async () => {
    revenueMock.mockResolvedValue({
      data: {
        summary,
        transactions: [row({ refundStatus: "refunded", status: "refunded", mode: "live", subscriptionId: "sub_123" })],
      },
      meta: { page: 1, pages: 1, total: 1 },
    });
    renderPage();

    const table = await screen.findByRole("table", { name: /payment records/i });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent.trim());
    expect(headers).toEqual(
      expect.arrayContaining(["Subscriber", "Plan", "Payment ID", "Subscription ID", "Amount", "Date (IST)", "Payment", "Refund", "Mode", "Verification"]),
    );
    const rowEl = screen.getByTestId("revenue-row");
    expect(rowEl).toHaveTextContent("Acme Hiring");
    expect(rowEl).toHaveTextContent("pay_test_1");
    expect(rowEl).toHaveTextContent("sub_123");
    expect(rowEl).toHaveTextContent("Refunded");
    expect(rowEl).toHaveTextContent("Live");
    expect(rowEl).toHaveTextContent("Verified");
  });

  it("sends the mode filter to the server and resets to page one", async () => {
    const user = userEvent.setup();
    revenueMock.mockResolvedValue({ data: { summary, transactions: [row()] }, meta: { page: 1, pages: 1, total: 1 } });
    renderPage();
    await screen.findByTestId("revenue-row");

    await pickOption(user, "Mode", "Live");
    await waitFor(() =>
      expect(revenueMock).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "live", range: "30d", page: 1 })),
    );
  });

  it("offers no sandbox option, so sandbox captures cannot be filtered into view", async () => {
    const user = userEvent.setup();
    revenueMock.mockResolvedValue({ data: { summary, transactions: [] }, meta: { page: 1, pages: 1, total: 0 } });
    renderPage();
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    await user.click(mode);
    const values = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.dataset.value);
    expect(values).toEqual(["all", "test", "live"]);
  });

  it("refuses an incomplete custom date range without calling the server", async () => {
    const user = userEvent.setup();
    revenueMock.mockResolvedValue({ data: { summary, transactions: [] }, meta: { page: 1, pages: 1, total: 0 } });
    renderPage();
    await pickOption(user, "Date range", "Custom range");
    expect(await screen.findByRole("alert")).toHaveTextContent(/start and an end date/i);
    const callsAfterPresetChange = revenueMock.mock.calls.length;
    expect(revenueMock.mock.calls.length).toBe(callsAfterPresetChange);
  });

  it("opens with the filter a dashboard chart linked to (for example failed payments)", async () => {
    revenueMock.mockResolvedValue({ data: { summary, transactions: [] }, meta: { page: 1, pages: 1, total: 0 } });
    renderPage("/app/admin/revenue?status=failed");
    await waitFor(() => expect(revenueMock).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" })));
    expect(screen.getByRole("combobox", { name: "Payment status" })).toHaveValue("Failed");
  });

  it("ignores unknown filter values in the URL", async () => {
    revenueMock.mockResolvedValue({ data: { summary, transactions: [] }, meta: { page: 1, pages: 1, total: 0 } });
    renderPage("/app/admin/revenue?status=sandbox&mode=simulation");
    await waitFor(() => expect(revenueMock).toHaveBeenCalled());
    expect(revenueMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "all", mode: "all" }));
  });

  it("shows an empty state when no payment matches", async () => {
    revenueMock.mockResolvedValue({ data: { summary, transactions: [] }, meta: { page: 1, pages: 1, total: 0 } });
    renderPage();
    expect(await screen.findByText(/No payments in this view/i)).toBeInTheDocument();
  });
});
