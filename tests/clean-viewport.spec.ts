import { expect, test } from "@playwright/test";

test("clean viewport keeps only the restore toggle and attitude instrument visible", async ({ page }) => {
  await page.goto("/?autoplay=0");

  await page.getByRole("button", { name: "Get big" }).click();
  await page.getByRole("button", { name: "Hide buttons" }).click();

  await expect(page.getByRole("button", { name: "Show buttons" })).toBeVisible();
  await expect(page.locator(".scene-attitude-shell-clean")).toBeVisible();
  await expect(page.getByText("Attitude / horizon")).toBeVisible();
  await expect(page.locator(".scene-hud-status")).toHaveCount(0);
  await expect(page.getByText("Power draw")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Setup" })).toHaveCount(0);
});
