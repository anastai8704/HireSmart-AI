// Requirements 3, 5 and 6 in the browser: the recruiter schedules a job-first interview, the candidate cannot join
// until the recruiter starts it, and then can join.
import { test, expect } from "@playwright/test";
import { DEMO, istDateTimeLocal, recruiterOrgId, signIn } from "./helpers";

const TITLE = `E2E Technical Round ${Date.now()}`;
const MEETING = "https://meet.example.com/e2e-hiresmart-room";

test.describe.configure({ mode: "serial" });

test("recruiter schedules an interview: job first, then only that job's applications", async ({ page }) => {
  await signIn(page, DEMO.recruiter);
  const orgId = await recruiterOrgId(page);
  await page.goto(`/app/o/${orgId}/interviews/schedule`);

  await page.getByLabel("Search jobs", { exact: true }).fill("Software Engineer Intern");
  await page.getByLabel(/Software Engineer Intern/).first().check();

  await expect(page.getByRole("heading", { name: /Choose a candidate for this job/ })).toBeVisible();
  await page.getByLabel("Search candidates for this job", { exact: true }).fill("Anas");
  await page.getByLabel(/Anas Tai/).first().check();

  await page.getByLabel("Interview title", { exact: true }).fill(TITLE);
  await page.getByLabel("Starts", { exact: true }).fill(istDateTimeLocal(3));
  await page.getByLabel("Ends", { exact: true }).fill(istDateTimeLocal(48));
  await page.getByLabel("Meeting link (optional, manual)", { exact: true }).fill(MEETING);
  await page.getByRole("button", { name: "Schedule and send invitation", exact: true }).click();

  await expect(page.getByText(/scheduled|invitation sent|Interview/i).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`/app/o/${orgId}/interviews`);
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 30_000 });
});

test("before the recruiter starts, the candidate sees the interview but cannot join", async ({ page }) => {
  await signIn(page, DEMO.candidate);
  await page.goto("/app/candidate/interviews");
  const card = page.getByText(TITLE).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const join = page.getByRole("button", { name: "Join interview", exact: true }).first();
  await expect(join).toBeDisabled();
  await expect(page.getByText(/recruiter has started|not started|waiting/i).first()).toBeVisible();
});

test("the recruiter starts the interview; the candidate can then join", async ({ page }) => {
  await signIn(page, DEMO.recruiter);
  const orgId = await recruiterOrgId(page);
  await page.goto(`/app/o/${orgId}/interviews`);
  await page.getByText(TITLE).first().click();
  await page.getByRole("button", { name: "Start interview", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Start interview", exact: true }).click();
  await expect(page.getByText(/Started|in progress/i).first()).toBeVisible({ timeout: 30_000 });

  await page.context().clearCookies();
  await signIn(page, DEMO.candidate);
  await page.goto("/app/candidate/interviews");
  const join = page.getByRole("button", { name: "Join interview", exact: true }).first();
  await expect(join).toBeEnabled({ timeout: 30_000 });
  await join.click();
  await expect(page.getByText(/blocked|could not|cannot join/i)).toHaveCount(0);
});
