// Shared helpers for the browser suite. Demo accounts come from the seed; their password is only read from the
// environment (DEMO_PASSWORD), never written into the repository.
import { expect } from "@playwright/test";

export const DEMO = {
  admin: "tofu1180@gmail.com",
  recruiter: "2025mca150@gmail.com",
  candidate: "tanastai5018@gmail.com",
  bytescaleOwner: "amit.verma@bytescale.tech",
};

export const demoPassword = () => {
  const value = process.env.DEMO_PASSWORD;
  if (!value) throw new Error("DEMO_PASSWORD must be set to the value used to seed the E2E database.");
  return value;
};

export async function signIn(page, email, password = demoPassword()) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The plan badge in the app shell. Its text is the server-derived plan name and status. */
export const planBadge = (page) => page.getByTestId("plan-badge").first();

/** Waits for the recruiter workspace and returns its organization id from the URL. */
export async function recruiterOrgId(page) {
  await expect(page).toHaveURL(/\/app\/o\/[0-9a-f]{24}/);
  return page.url().match(/\/app\/o\/([0-9a-f]{24})/)[1];
}

/** Current time in Asia/Kolkata as a datetime-local value (YYYY-MM-DDTHH:mm), offset by the given minutes. */
export function istDateTimeLocal(minutesFromNow) {
  const ist = new Date(Date.now() + minutesFromNow * 60 * 1000 + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}
