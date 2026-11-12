// Static checks that every lazily imported page exists, every interview and integration route is declared, and every
// /app link in the navigation shell matches a declared route.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");

const app = read("App.jsx");
const shell = read("components/layout/AppShell.jsx");

// Declared route patterns, e.g. "/app/o/:organizationId/interviews/:interviewId".
const routePatterns = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const toRegex = (pattern) =>
  new RegExp(
    "^" +
      pattern
        .replace(/\*/g, ".*")
        .replace(/:[A-Za-z]+/g, "[^/]+")
        .replace(/\//g, "\\/") +
      "$",
  );

describe("imports in App.jsx resolve to real page files", () => {
  it("every import(\"./…\") path exists on disk", () => {
    const specs = [...app.matchAll(/import\("(\.\/[^"]+)"\)/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(20);
    for (const spec of specs) {
      const base = path.join(here, spec);
      const candidates = [`${base}.jsx`, `${base}.js`, base];
      expect(candidates.some((c) => fs.existsSync(c)), `missing module ${spec}`).toBe(true);
    }
  });

  it("every picked export name is exported by its module", () => {
    const picks = [...app.matchAll(/pick\(\(\) => import\("(\.\/[^"]+)"\), "([A-Za-z]+)"\)/g)];
    expect(picks.length).toBeGreaterThan(20);
    for (const [, spec, name] of picks) {
      const file = [`${path.join(here, spec)}.jsx`, `${path.join(here, spec)}.js`].find((c) => fs.existsSync(c));
      expect(file, `missing ${spec}`).toBeTruthy();
      const source = fs.readFileSync(file, "utf8");
      const exported =
        new RegExp(`export\\s+(const|function|class)\\s+${name}\\b`).test(source) ||
        new RegExp(`export\\s+\\{[^}]*\\b${name}\\b`).test(source) ||
        (name === "default" && /export default/.test(source));
      expect(exported, `${name} is not exported by ${spec}`).toBe(true);
    }
  });
});

describe("interview and integration routes are declared", () => {
  it.each([
    "/app/settings/integrations",
    "/app/o/:organizationId/interviews",
    "/app/o/:organizationId/interviews/schedule",
    "/app/o/:organizationId/interviews/:interviewId",
    "/app/candidate/interviews",
    "/app/candidate/interviews/:interviewId",
  ])("%s", (pattern) => {
    expect(routePatterns).toContain(pattern);
  });

  it("the static schedule route is declared (it must not be shadowed by :interviewId)", () => {
    expect(routePatterns.indexOf("/app/o/:organizationId/interviews/schedule")).toBeGreaterThan(-1);
    expect(toRegex("/app/o/:organizationId/interviews/:interviewId").test("/app/o/org1/interviews/schedule")).toBe(true);
  });
});

describe("navigation links resolve to declared routes", () => {
  const navLinks = [...shell.matchAll(/`(\/app\/[^`]*)`|"(\/app\/[^"]*)"/g)].map((m) => m[1] || m[2]);

  it("the shell declares navigation links", () => {
    expect(navLinks.length).toBeGreaterThan(10);
  });

  it("every /app link in AppShell matches a declared route", () => {
    const regexes = routePatterns.map(toRegex);
    for (const raw of navLinks) {
      const concrete = raw.replace(/\$\{[^}]+\}/g, "org1");
      const matched = regexes.some((rx) => rx.test(concrete));
      expect(matched, `navigation link ${raw} has no route`).toBe(true);
    }
  });
});

describe("admin revenue and placement routes (Requirements 8–9)", () => {
  it.each([
    "/app/admin/revenue",
    "/app/admin/placements",
    "/app/admin/placements/:placementId",
    "/app/candidate/placements",
    "/app/o/:organizationId/placements",
  ])("declares %s", (pattern) => {
    expect(routePatterns).toContain(pattern);
  });

  it("the Revenue & Plans and Placements nav links point at declared routes", () => {
    for (const link of ["/app/admin/revenue", "/app/admin/placements", "/app/candidate/placements"]) {
      expect(shell).toContain(`"${link}"`);
      expect(routePatterns.some((p) => toRegex(p).test(link))).toBe(true);
    }
  });
});
