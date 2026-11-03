import { describe, expect, it, vi } from "vitest";
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ register: vi.fn() }) }));
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RegisterPage } from "./AuthPages";
describe("registration form", () => {
  it("enforces production password and consent rules before calling the API", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/auth/register/candidate"]}>
        <Routes>
          <Route path="/auth/register/:intent" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Full name"), "A");
    await user.type(screen.getByLabelText("Work email"), "invalid");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 12 characters")).toBeInTheDocument();
    expect(screen.getByText("Accept the terms to continue")).toBeInTheDocument();
  });
});
