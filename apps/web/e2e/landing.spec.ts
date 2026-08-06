import { expect, test } from "@playwright/test";

test("landing page explains the read-only product boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A diagnosis your on-call can verify." })).toBeVisible();
  await expect(page.getByText("Fail-closed execution")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
});
