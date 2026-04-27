import { expect } from "@playwright/test";

function exactNameRegex(label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(?:\\b|\\s|$)`);
}

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

export async function openMenubarMenu(page, menuName) {
  await page
    .getByRole("button", { name: exactNameRegex(menuName) })
    .first()
    .click();
}

export async function clickMenuItem(page, itemName) {
  const matcher = exactNameRegex(itemName);
  const menuItem = page.getByRole("menuitem", { name: matcher }).first();
  if (await menuItem.count()) {
    await menuItem.click();
    return;
  }
  await page.getByRole("button", { name: matcher }).first().click();
}

export async function expectStatusContains(page, text) {
  await expect(page.locator("#status")).toContainText(text);
}
