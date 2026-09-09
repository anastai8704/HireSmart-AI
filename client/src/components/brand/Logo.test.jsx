import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Logo, LogoMark } from "./Logo";

afterEach(cleanup);

describe("Brand Logo Component", () => {
  it("renders dark tone brand logo asset by default", () => {
    render(<Logo />);
    const img = screen.getByRole("img", { name: /hiresmart ai/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/logo-full.svg");
    expect(img).toHaveAttribute("alt", "HireSmart AI");
  });

  it("renders light tone brand logo asset for dark surfaces", () => {
    render(<Logo tone="light" />);
    const img = screen.getByRole("img", { name: /hiresmart ai/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/logo-full-light.svg");
  });

  it("renders compact LogoMark when showWordmark is false", () => {
    render(<Logo showWordmark={false} markClassName="h-5 w-5" />);
    const mark = screen.getByRole("img", { name: /hiresmart ai/i });
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(mark).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("renders standalone LogoMark with custom title or aria-hidden", () => {
    const { rerender } = render(<LogoMark className="h-6 w-6" title="Custom Title" />);
    expect(screen.getByRole("img", { name: "Custom Title" })).toBeInTheDocument();

    rerender(<LogoMark className="h-6 w-6" title="" />);
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    expect(svgs[0]).toHaveAttribute("aria-hidden", "true");
  });
});
