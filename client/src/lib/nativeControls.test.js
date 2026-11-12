// Requirement 12 guard: every dropdown uses the shared accessible combobox. A native <select> is only allowed
// with a documented reason, listed here. The list is empty today, so any new native select fails this test.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_NATIVE_SELECT = []; // file paths relative to src/, each needs a reason in docs/ACCESSIBILITY.md

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

describe("dropdown controls (Requirement 12)", () => {
  it("no source file renders a native <select> outside the documented allow-list", () => {
    // npm test runs in client/, so src is resolved from there.
    const root = resolve("src");
    const offenders = walk(root)
      .map((file) => ({ file: file.slice(root.length + 1).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }))
      .filter(({ text }) => /<select[\s>]/.test(text))
      .map(({ file }) => file)
      .filter((file) => !ALLOWED_NATIVE_SELECT.includes(file));
    expect(offenders).toEqual([]);
  });
});
