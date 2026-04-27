import { expect } from "@playwright/test";

export async function bootstrapApp(page) {
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  await page.goto("/");
  await page.addStyleTag({
    content:
      "*,:before,:after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}",
  });
  await expect(page.getByTestId("grid-root")).toBeVisible();
}

export async function openMenuItem(page, menuName, itemName) {
  await page.getByRole("button", { name: new RegExp(`^${menuName}`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${itemName}`) }).click();
}

export async function expectStatusContains(page, text) {
  await expect(page.locator("#status")).toContainText(text);
}
