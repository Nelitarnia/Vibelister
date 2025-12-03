import { initPalette } from "../ui/palette.js";
import { initColorPicker } from "../ui/color-picker.js";

export function initPaletteFeature({
  dom,
  selection,
  getCell,
  getCellRect,
  getActiveView,
  viewDef,
  model,
  setCellSelectionAware,
  render,
  headerHeight,
  rowHeight,
  endEdit,
  moveSelectionForTab,
  moveSelectionForEnter,
  makeUndoConfig,
  beginUndoableTransaction,
  cellValueToPlainText,
}) {
  const paletteAPI = initPalette({
    editor: dom.editor,
    sheet: dom.sheet,
    getActiveView,
    viewDef,
    sel: selection,
    model,
    setCell: setCellSelectionAware,
    render,
    getCellRect,
    HEADER_HEIGHT: headerHeight,
    ROW_HEIGHT: rowHeight,
    endEdit,
    moveSelectionForTab,
    moveSelectionForEnter,
  });

  const colorPickerAPI = initColorPicker({
    parent: dom.editor?.parentElement || dom.sheet,
    sheet: dom.sheet,
    sel: selection,
    getCellRect,
    getColorValue: (r, c) => cellValueToPlainText(getCell(r, c)),
    setColorValue: (r, c, v) => setCellSelectionAware(r, c, v),
    render,
    makeUndoConfig,
    beginUndoableTransaction,
  });

  if (paletteAPI && colorPickerAPI) {
    const baseIsOpen =
      typeof paletteAPI.isOpen === "function"
        ? paletteAPI.isOpen.bind(paletteAPI)
        : () => false;
    if (typeof colorPickerAPI.openColor === "function")
      paletteAPI.openColor = colorPickerAPI.openColor;
    if (typeof colorPickerAPI.close === "function")
      paletteAPI.closeColor = colorPickerAPI.close;
    paletteAPI.isOpen = () => baseIsOpen() || !!colorPickerAPI.isOpen?.();
  }

  return { paletteAPI, colorPickerAPI };
}
