// Requirement 2: payment history filters, cursor pagination and honest mode labels.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoicesFn = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({ subscriptionApi: { invoices: (...args) => invoicesFn(...args) } }));

import { PaymentHistory } from "./PaymentHistory";

const row = (id, over = {}) => ({
  _id: id,
  transactionNumber: `TXN-${id}`,
  createdAt: "2026-10-10T06:00:00.000Z",
  planTier: "recruiter_growth",
  amount: 2499,
  status: "captured",
  mode: "test",
  eligibleForRevenue: true,
  ...over,
});

const renderHistory = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaymentHistory queryKeyBase={["test-payments"]} organizationId="org1" plans={[{ tier: "recruiter_growth", name: "Growth" }]} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  invoicesFn.mockReset();
});
afterEach(() => cleanup());

describe("PaymentHistory", () => {
  it("labels each payment by its real state and mode", async () => {
    invoicesFn.mockResolvedValue({
      data: [
        row("a"),
        row("b", { status: "refunded", mode: "live" }),
        row("c", { status: "failed", mode: "simulation", amount: 999 }),
      ],
      meta: { hasMore: false, nextCursor: null, count: 3 },
    });
    renderHistory();
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Test Mode")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Paid")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Live Mode")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Refunded")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Failed")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Sandbox/)).toBeInTheDocument();
  });

  it("applies the status and IST date filters on the server query", async () => {
    const user = userEvent.setup();
    invoicesFn.mockResolvedValue({ data: [], meta: { hasMore: false, count: 0 } });
    renderHistory();
    await screen.findByText("No payments yet");

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "failed");
    await user.type(screen.getByLabelText("From (IST)"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(invoicesFn).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", from: "2026-11-01", limit: 10 }), "org1"),
    );
    expect(await screen.findByText("No payments match these filters")).toBeInTheDocument();
  });

  it("rejects an end date before the start date without querying", async () => {
    const user = userEvent.setup();
    invoicesFn.mockResolvedValue({ data: [], meta: { hasMore: false, count: 0 } });
    renderHistory();
    await screen.findByText("No payments yet");
    const callsBefore = invoicesFn.mock.calls.length;
    await user.type(screen.getByLabelText("From (IST)"), "2026-11-10");
    await user.type(screen.getByLabelText("To (IST)"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/end date must be on or after/)).toBeInTheDocument();
    expect(invoicesFn.mock.calls.length).toBe(callsBefore);
  });

  it("loads the next page with the server cursor", async () => {
    const user = userEvent.setup();
    invoicesFn
      .mockResolvedValueOnce({ data: [row("p1")], meta: { hasMore: true, nextCursor: "cursor-1", count: 1, total: 2 } })
      .mockResolvedValueOnce({ data: [row("p2")], meta: { hasMore: false, nextCursor: null, count: 1, total: 2 } });
    renderHistory();
    await screen.findByText("Showing 1 of 2 payments");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(invoicesFn).toHaveBeenLastCalledWith(expect.objectContaining({ after: "cursor-1" }), "org1"));
    expect(await screen.findByText("Showing 2 of 2 payments")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an error state, not an empty list, when the request fails", async () => {
    invoicesFn.mockRejectedValue(new Error("Server unavailable"));
    renderHistory();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Server unavailable|Something went wrong/);
    expect(screen.queryByText("No payments yet")).not.toBeInTheDocument();
  });

  it("sends the search term to the server and shows the gateway payment id", async () => {
    invoicesFn.mockResolvedValue({
      data: [row("a", { gatewayPaymentId: "pay_TEST123", invoiceNumber: "INV-7" })],
      meta: { hasMore: false, nextCursor: null, count: 1 },
    });
    renderHistory();
    const table = await screen.findByRole("table");
    expect(within(table).getByTestId("payment-id")).toHaveTextContent("pay_TEST123");
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: /search payment id/i }), "pay_TEST");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(invoicesFn).toHaveBeenLastCalledWith(expect.objectContaining({ q: "pay_TEST" }), "org1"),
    );
  });

  it("shows 'Not yet issued' when no gateway payment id exists", async () => {
    invoicesFn.mockResolvedValue({
      data: [row("b", { status: "failed", mode: "simulation" })],
      meta: { hasMore: false, nextCursor: null, count: 1 },
    });
    renderHistory();
    const table = await screen.findByRole("table");
    expect(within(table).getByTestId("payment-id")).toHaveTextContent("Not yet issued");
  });
});
