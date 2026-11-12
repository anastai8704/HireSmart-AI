import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IntegrationsPage from "./IntegrationsPage";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  role: { value: "recruiter" },
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({
    user: { displayName: "Rohan Mehta" },
    role: mocks.role.value,
    organizationId: mocks.role.value === "candidate" ? null : "org1",
    organizations: [],
    membership: { role: "owner" },
    isAuthenticated: true,
    setOrganizationId: () => {},
  }),
}));

vi.mock("../../components/ui/useToast", () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

vi.mock("../../lib/api", () => ({
  integrationsApi: {
    googleStatus: (...args) => mocks.status(...args),
    googleConnect: (...args) => mocks.connect(...args),
    googleDisconnect: (...args) => mocks.disconnect(...args),
  },
}));

const renderPage = (entry = "/app/settings/integrations") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/settings/integrations" element={<IntegrationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.role.value = "recruiter";
  mocks.status.mockResolvedValue({ data: { configured: true, connected: false, status: "not_connected" } });
  mocks.connect.mockResolvedValue({ data: { url: "https://evil.example.com/oauth" } });
  mocks.disconnect.mockResolvedValue({ data: { connected: false } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Google Calendar settings at /app/settings/integrations", () => {
  it("shows setup required and disables Connect when the server is not configured", async () => {
    mocks.status.mockResolvedValue({ data: { configured: false, connected: false, status: "setup_required" } });
    renderPage();
    expect(await screen.findByText(/not set up on this server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect google calendar/i })).toBeDisabled();
    expect(screen.getByText("Setup required")).toBeInTheDocument();
  });

  it("shows connected status and offers disconnect with confirmation", async () => {
    mocks.status.mockResolvedValue({
      data: { configured: true, connected: true, status: "connected", connectedAt: "2026-10-01T10:00:00Z" },
    });
    renderPage();
    expect((await screen.findAllByText("Connected")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /disconnect google calendar/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/new interviews will not get google meet links/i);
    fireEvent.click(screen.getByRole("button", { name: /^disconnect$/i }));
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
  });

  it("asks for reconnection when Google no longer accepts the connection", async () => {
    mocks.status.mockResolvedValue({ data: { configured: true, connected: false, status: "reconnect_required" } });
    renderPage();
    expect(await screen.findByRole("button", { name: /reconnect google calendar/i })).toBeEnabled();
  });

  it("refuses to follow a sign-in address that is not Google's", async () => {
    const assign = vi.fn();
    const original = window.location;
    delete window.location;
    window.location = { assign };
    try {
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /connect google calendar/i }));
      await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1));
      expect(assign).not.toHaveBeenCalled();
    } finally {
      window.location = original;
    }
  });

  it("reports the outcome of the OAuth callback", async () => {
    renderPage("/app/settings/integrations?google=invalid_state");
    expect(await screen.findByText(/expired or was not valid/i)).toBeInTheDocument();
  });

  it("explains the calendar permission it asks for", async () => {
    renderPage();
    expect(await screen.findByText(/calendar\.events/)).toBeInTheDocument();
    expect(screen.getByText(/tokens are stored encrypted/i)).toBeInTheDocument();
  });

  it("does not call the recruiter-only status endpoint for candidates", async () => {
    mocks.role.value = "candidate";
    renderPage();
    expect(await screen.findByText(/integrations are for recruiters/i)).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
