import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./safeUrl";

describe("safeHttpUrl", () => {
  it("keeps http and https links", () => {
    expect(safeHttpUrl("https://meet.example.com/room-1")).toBe("https://meet.example.com/room-1");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/");
  });

  it("drops script, data, and other non-web schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHttpUrl("ftp://example.com")).toBeUndefined();
  });

  it("drops empty and malformed values", () => {
    expect(safeHttpUrl("")).toBeUndefined();
    expect(safeHttpUrl("   ")).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl("not a url")).toBeUndefined();
  });
});
