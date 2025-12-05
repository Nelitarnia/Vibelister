import { HEADER_HEIGHT, ROW_HEIGHT } from "../data/constants.js";
import { initPalette } from "../ui/palette.js";
import { initColorPicker } from "../ui/color-picker.js";

export function setupPalette({
  appContext,
  viewState,
  rendererApi,
  gridApi,
  editingApi,
  historyApi,
  dom,
}) {
  const paletteAPI = initPalette({
    editor: dom.editor,
    sheet: dom.sheet,
    getActiveView: appContext.getActiveView,
    viewDef: viewState.viewDef,
    sel: editingApi.sel,
    model: appContext.model,
    setCell: gridApi.setCellSelectionAware,
    render: rendererApi.render,
    getCellRect: editingApi.getCellRect,
    HEADER_HEIGHT,
    ROW_HEIGHT,
    endEdit: editingApi.endEdit,
    moveSelectionForTab: editingApi.advanceSelectionAfterPaletteTab,
    moveSelectionForEnter: () => editingApi.moveSel(1, 0, false),
  });

  const colorPickerAPI = initColorPicker({
    parent: dom.editor?.parentElement || dom.sheet,
    sheet: dom.sheet,
    sel: editingApi.sel,
    getCellRect: editingApi.getCellRect,
    getColorValue: (r, c) => gridApi.cellValueToPlainText(gridApi.getCell(r, c)),
    setColorValue: (r, c, v) => gridApi.setCellSelectionAware(r, c, v),
    render: rendererApi.render,
    makeUndoConfig: historyApi.makeUndoConfig,
    beginUndoableTransaction: historyApi.beginUndoableTransaction,
  });

  if (paletteAPI && colorPickerAPI) {
    const baseIsOpen =
      typeof paletteAPI.isOpen === "function" ? paletteAPI.isOpen.bind(paletteAPI) : () => false;
    if (typeof colorPickerAPI.openColor === "function") paletteAPI.openColor = colorPickerAPI.openColor;
    if (typeof colorPickerAPI.close === "function") paletteAPI.closeColor = colorPickerAPI.close;
    paletteAPI.isOpen = () => baseIsOpen() || !!colorPickerAPI.isOpen?.();
  }

  if (paletteAPI && !paletteAPI.openReference) {
    paletteAPI.openReference = ({ entity, target } = {}) => {
      try {
        if (entity === "outcome") {
          if (typeof paletteAPI.openOutcome === "function") {
            return !!paletteAPI.openOutcome(target);
          }
          if (typeof paletteAPI.openForCurrentCell === "function") {
            return !!paletteAPI.openForCurrentCell({
              r: target?.r,
              c: target?.c,
              initialText: target?.initialText,
              focusEditor: target?.focusEditor !== false,
            });
          }
          return false;
        }
        if (entity === "action" && typeof paletteAPI.openAction === "function")
          return !!paletteAPI.openAction(target);
        if (entity === "input" && typeof paletteAPI.openInput === "function")
          return !!paletteAPI.openInput(target);
      } catch (_) {
        /* noop */
      }
      return false;
    };
  }

  return { paletteAPI, colorPickerAPI };
}
