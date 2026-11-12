// Requirements 8, 15 and 16 in the browser: the Admin reads Revenue & Plans and placements; a lapsed paid period falls
// back to the Free plan without deleting data; the plan is restored afterwards.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { DEMO, planBadge, signIn } from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, "..", "..", "server");
const subscription = (action) =>
  execFileSync(process.execPath, [path.join("scripts", "e2e-subscription.js"), action, DEMO.candidate], {
    cwd: serverDir,
    env: { ...process.env, E2E_MONGO_URI: process.env.E2E_MONGO_URI || "mongodb://127.0.0.1:27017/hiresmart_e2e" },
    encoding: "utf8",
  });

test("Admin opens Revenue & Plans and the placements list", async ({ page }) => {
  await signIn(page, DEMO.admin);
  await page.goto("/app/admin/revenue");
  await expect(page.getByRole("heading", { name: "Revenue & Plans", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto("/app/admin/placements");
  await expect(page.getByRole("heading", { name: "Placements & employment", exact: true })).toBeVisible({ timeout: 30_000 });
});

test("a lapsed Career Plus period falls back to Free and keeps the data; renewing restores it", async ({ page }) => {
  subscription("expire");
  try {
    await signIn(page, DEMO.candidate);
    await expect(page).toHaveURL(/\/app\/candidate/);
    await expect(planBadge(page)).toContainText(/expired|free/i, { timeout: 30_000 });
    await expect(planBadge(page)).not.toContainText(/^Career Plus,\s*active/i);
    await page.goto("/app/candidate/placements");
    await expect(page.getByText(/Junior MERN Stack Engineer/i).first()).toBeVisible();
  } finally {
    subscription("restore");
  }
  await page.reload();
  await expect(planBadge(page)).toContainText(/Career Plus/i, { timeout: 30_000 });
});
