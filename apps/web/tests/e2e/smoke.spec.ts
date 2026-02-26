import { expect, test } from "@playwright/test";

test("dashboard and lots routes load", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/lots");
  await expect(page.getByText("Daily Sync Upload (.xlsx)")).toBeVisible();
});
