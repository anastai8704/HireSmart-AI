// Requirement 18: sign-in for Admin, Recruiter and Candidate; Free and Paid access as shown in the app shell.
import { test, expect } from "@playwright/test";
import { DEMO, demoPassword, planBadge, recruiterOrgId, signIn } from "./helpers";

test("Admin signs in to the platform console", async ({ page }) => {
  await signIn(page, DEMO.admin);
  await expect(page).toHaveURL(/\/app\/admin/);
  await expect(page.getByRole("link", { name: /Revenue/i }).first()).toBeVisible();
});

test("Recruiter signs in to the company workspace with the Enterprise plan badge", async ({ page }) => {
  await signIn(page, DEMO.recruiter);
  await recruiterOrgId(page);
  await expect(planBadge(page)).toContainText(/Enterprise/i);
});

test("Candidate signs in to the candidate workspace with the Career Plus badge", async ({ page }) => {
  await signIn(page, DEMO.candidate);
  await expect(page).toHaveURL(/\/app\/candidate/);
  await expect(planBadge(page)).toContainText(/Career Plus/i);
});

test("a wrong password is refused and the user stays on the sign-in page", async ({ page }) => {
  await signIn(page, DEMO.candidate, `${demoPassword()}-wrong`);
  await expect(page.getByRole("alert").or(page.getByText(/invalid|incorrect|wrong/i)).first()).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("a new candidate registers on the Free plan (no paid plan shown)", async ({ page }) => {
  const email = `free-candidate-${Date.now()}@e2e.example.com`;
  await page.goto("/auth/register/candidate");
  await page.getByLabel("Full name", { exact: true }).fill("Free Candidate");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(`Free-Candidate-${Date.now()}-Pass`);
  await page.getByLabel(/I agree to the Terms/).check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
  await expect(planBadge(page)).toContainText(/Free/i);
  await expect(planBadge(page)).not.toContainText(/Career Plus/i);
});

test("a new company registers on the Free plan with the Free recruiter badge", async ({ page }) => {
  const email = `free-recruiter-${Date.now()}@e2e.example.com`;
  await page.goto("/auth/register/recruiter");
  await page.getByLabel("Full name", { exact: true }).fill("Free Recruiter");
  await page.getByLabel("Work email", { exact: true }).fill(email);
  await page.getByLabel("Company name", { exact: true }).fill(`E2E Free Co ${Date.now()}`);
  await page.getByLabel("Password", { exact: true }).fill(`Free-Recruiter-${Date.now()}-Pass`);
  await page.getByLabel(/I agree to the Terms/).check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await recruiterOrgId(page);
  await expect(planBadge(page)).toContainText(/Free/i);
  await expect(planBadge(page)).not.toContainText(/Enterprise|Growth|Starter/i);
});
