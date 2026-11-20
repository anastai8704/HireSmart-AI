import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DatePicker from "./DatePicker";

afterEach(() => cleanup());

describe("DatePicker", () => {
  it("renders with placeholder and formatted date", () => {
    render(<DatePicker value="2026-11-15" placeholder="Select a date" />);
    expect(screen.getByText("15 Nov 2026")).toBeInTheDocument();
  });

  it("renders with empty value and custom placeholder", () => {
    render(<DatePicker value="" placeholder="Pick start date" />);
    expect(screen.getByText("Pick start date")).toBeInTheDocument();
  });

  it("opens popover on click and selects a day", () => {
    const handleChange = vi.fn();
    render(<DatePicker value="2026-11-15" onChange={handleChange} />);
    
    // Open calendar by clicking trigger
    const trigger = screen.getByRole("button", { name: /15 Nov 2026/i });
    fireEvent.click(trigger);

    // Look for day 20 button in the calendar grid
    const day20 = screen.getByRole("button", { name: "20" });
    fireEvent.click(day20);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: "2026-11-20" }),
      })
    );
  });

  it("supports clear button to reset date", () => {
    const handleChange = vi.fn();
    render(<DatePicker value="2026-11-15" onChange={handleChange} />);

    const clearBtn = screen.getByRole("button", { name: /clear date/i });
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ value: "" }),
      })
    );
  });
});
