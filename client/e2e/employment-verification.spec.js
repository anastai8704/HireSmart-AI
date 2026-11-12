// Requirement 9 in the browser: the candidate reports joining; the candidate cannot verify their own report; an
// authorised company user verifies it; the candidate then sees the verified status.
import { test, expect } from "@playwright/test";
import { DEMO, recruiterOrgId, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("the candidate reports the start; the report is pending and cannot be self-verified", async ({ page }) => {
  await signIn(page, DEMO.candidate);
  await page.goto("/app/candidate/placements");
  const row = page.getByText(/Junior MERN Stack Engineer/i).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "I have started working here", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Save update", exact: true }).click();
  await expect(page.getByText(/Your update is recorded|waiting for verification/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Verify this change", exact: true })).toHaveCount(0);
});

test("a company owner verifies the pending change", async ({ page }) => {
  await signIn(page, DEMO.bytescaleOwner);
  const orgId = await recruiterOrgId(page);
  await page.goto(`/app/o/${orgId}/placements`);
  const row = page.getByRole("row").filter({ hasText: /Candidate|Anas Tai|Junior MERN/i }).filter({ hasText: /Awaiting|awaiting|Verify/i }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Verify this change", exact: true }).click();
  await expect(page.getByText(/Employment change verified/i).first()).toBeVisible({ timeout: 30_000 });
});

test("the candidate sees the verified employment status", async ({ page }) => {
  await signIn(page, DEMO.candidate);
  await page.goto("/app/candidate/placements");
  await expect(page.getByText(/Active, verified|verified/i).first()).toBeVisible({ timeout: 30_000 });
});
