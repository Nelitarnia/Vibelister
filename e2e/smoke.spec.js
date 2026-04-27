import { test, expect } from "@playwright/test";
import {
  bootstrapApp,
  expectStatusContains,
  clickMenuItem,
  openMenubarMenu,
} from "./helpers/app-helpers.js";
import {
  editCell,
  expectCellEmpty,
  expectCellText,
} from "./helpers/grid-helpers.js";

test.beforeEach(async ({ page }) => {
  await bootstrapApp(page);
});

test("app loads with default Actions sheet usable", async ({ page }) => {
  await expect(
    page.getByRole("tab", { name: "Actions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await editCell(page, 0, 0, "Jump");
  await expectCellText(page, 0, 0, "Jump");
});

test("core grid data entry/edit persists in visible grid", async ({ page }) => {
  await editCell(page, 1, 0, "Attack");
  await expectCellText(page, 1, 0, "Attack");
  await editCell(page, 1, 0, "Defend");
  await expectCellText(page, 1, 0, "Defend");
});

test("generate interactions switches to interaction view and reports success", async ({
  page,
}) => {
  await editCell(page, 0, 0, "Action A");
  await editCell(page, 0, 1, "Input B");
  await openMenubarMenu(page, "Tools");
  await clickMenuItem(page, "Generate Interactions");
  await expect(
    page.getByRole("tab", { name: "Interactions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expectStatusContains(page, "Generated Interactions");
  await expect(
    page.getByTestId("grid-visible-cells").locator('[data-r="0"]').first(),
  ).toBeVisible();
});

test("undo/redo works after mutation", async ({ page }) => {
  await editCell(page, 2, 0, "Before Undo");
  await openMenubarMenu(page, "Edit");
  await clickMenuItem(page, "Undo");
  await expectCellEmpty(page, 2, 0);
  await openMenubarMenu(page, "Edit");
  await clickMenuItem(page, "Redo");
  await expectCellText(page, 2, 0, "Before Undo");
});

test("inference dialog opens and closes", async ({ page }) => {
  await openMenubarMenu(page, "Tools");
  await clickMenuItem(page, "Inference");
  await expect(page.getByTestId("inference-dialog-root")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("inference-dialog-root")).toHaveCount(0);
});

test("cleanup dialog opens and closes", async ({ page }) => {
  await openMenubarMenu(page, "Tools");
  await clickMenuItem(page, "Clean Up");
  await expect(page.getByTestId("cleanup-dialog-root")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("cleanup-dialog-root")).toHaveCount(0);
});

test("export json and import roundtrip restores edited value", async ({
  page,
}) => {
  await editCell(page, 0, 0, "Roundtrip Value");

  const downloadPromise = page.waitForEvent("download");
  await openMenubarMenu(page, "File");
  await clickMenuItem(page, "Export JSON");
  const download = await downloadPromise;
  const savePath = test.info().outputPath("roundtrip-project.json");
  await download.saveAs(savePath);

  await openMenubarMenu(page, "File");
  await clickMenuItem(page, "New");
  await expectCellEmpty(page, 0, 0);

  const chooserPromise = page.waitForEvent("filechooser");
  await openMenubarMenu(page, "File");
  await clickMenuItem(page, "Open");
  const chooser = await chooserPromise;
  await chooser.setFiles(savePath);

  await expectCellText(page, 0, 0, "Roundtrip Value");
  await expectStatusContains(page, "Opened:");
});
