import { expect } from "@playwright/test";

function cellLocator(page, row, col) {
  return page
    .getByTestId("grid-visible-cells")
    .locator(`[data-r="${row}"][data-c="${col}"]`);
}

export async function selectCell(page, row, col) {
  const cell = cellLocator(page, row, col);
  await expect(cell).toBeVisible();
  await cell.click();
  return cell;
}

export async function editCell(page, row, col, value) {
  await selectCell(page, row, col);
  await page.keyboard.press("Enter");
  const editor = page.getByTestId("active-cell-editor");
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await page.keyboard.press("Enter");
  await expect(editor).toBeHidden();
}

export async function expectCellText(page, row, col, value) {
  await expect(cellLocator(page, row, col)).toContainText(value);
}

export async function expectCellEmpty(page, row, col) {
  await expect(cellLocator(page, row, col)).toHaveText("");
}
