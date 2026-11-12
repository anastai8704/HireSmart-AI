// Requirement 17: the plan query follows the signed-in subscriber and the active workspace.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockAuth = { current: {} };
const currentMock = vi.fn();

vi.mock("../context/useAuth", () => ({ useAuth: () => mockAuth.current }));
vi.mock("../lib/api", () => ({ subscriptionApi: { current: (...args) => currentMock(...args) } }));

import { usePlanEntitlement } from "./usePlanEntitlement";

const wrapper = ({ children }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

const growthEntitlement = {
  planName: "Growth",
  status: "active",
  paid: true,
  reason: "active",
  periodEnd: "2026-12-20T00:00:00.000Z",
  cancelAtPeriodEnd: false,
};

beforeEach(() => {
  currentMock.mockReset();
  currentMock.mockResolvedValue({ data: { entitlement: growthEntitlement, billingState: {} } });
});
afterEach(() => cleanup());

describe("usePlanEntitlement", () => {
  it("asks for the recruiter workspace the user is currently in", async () => {
    mockAuth.current = { isAuthenticated: true, role: "recruiter", user: { role: "recruiter" }, organizationId: "org1" };
    const { result } = renderHook(() => usePlanEntitlement(), { wrapper });
    await waitFor(() => expect(result.current.badge?.label).toBe("Growth"));
    expect(currentMock).toHaveBeenCalledWith("org1");
    expect(result.current.badge.tone).toBe("paid");
  });

  it("queries the candidate plan without a workspace", async () => {
    mockAuth.current = { isAuthenticated: true, role: "candidate", user: { role: "candidate" }, organizationId: null };
    const { result } = renderHook(() => usePlanEntitlement(), { wrapper });
    await waitFor(() => expect(result.current.badge).not.toBeNull());
    expect(currentMock).toHaveBeenCalledWith(undefined);
  });

  it("makes no request for platform admins, who have no plan", () => {
    mockAuth.current = { isAuthenticated: true, role: "admin", user: { role: "admin" }, organizationId: null };
    const { result } = renderHook(() => usePlanEntitlement(), { wrapper });
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.badge).toBeNull();
    expect(currentMock).not.toHaveBeenCalled();
  });

  it("makes no request while signed out", () => {
    mockAuth.current = { isAuthenticated: false, user: null, organizationId: null };
    renderHook(() => usePlanEntitlement(), { wrapper });
    expect(currentMock).not.toHaveBeenCalled();
  });

  it("does not guess a plan when the request fails", async () => {
    currentMock.mockRejectedValue(new Error("down"));
    mockAuth.current = { isAuthenticated: true, role: "recruiter", user: { role: "recruiter" }, organizationId: "org1" };
    const { result } = renderHook(() => usePlanEntitlement(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.badge.tone).toBe("loading");
    expect(result.current.badge.paidInForce).toBe(false);
  });
});
