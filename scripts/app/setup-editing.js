import { SelectionNS, SelectionCtl, selection, sel } from "./selection.js";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../data/constants.js";
import { createEditingController } from "./editing-shortcuts.js";

export function setupEditing({
  appContext,
  viewState,
  rendererApi,
  historyApi,
  gridApi,
  paletteApiRef,
  dom,
}) {
  return createEditingController({
    sheet: dom.sheet,
    editor: dom.editor,
    selection,
    sel,
    SelectionNS,
    SelectionCtl,
    viewDef: viewState.viewDef,
    dataArray: viewState.dataArray,
    getRowCount: viewState.getRowCount,
    getColGeomFor: rendererApi.getColGeomFor,
    ROW_HEIGHT,
    HEADER_HEIGHT,
    beginEditForKind: gridApi.beginEditForKind,
    kindCtx: viewState.kindCtx,
    getCell: gridApi.getCell,
    setCell: gridApi.setCell,
    runModelTransaction: historyApi.runModelTransaction,
    makeUndoConfig: historyApi.makeUndoConfig,
    isInteractionPhaseColumnActiveForRow: gridApi.isInteractionPhaseColumnActiveForRow,
    model: appContext.model,
    cloneValueForAssignment: gridApi.cloneValueForAssignment,
    getHorizontalTargetColumns: gridApi.getHorizontalTargetColumns,
    ensureVisible: rendererApi.ensureVisible,
    render: rendererApi.render,
    updateSelectionSnapshot: viewState.updateSelectionSnapshot,
    getActiveView: appContext.getActiveView,
    getPaletteAPI: paletteApiRef,
  });
}
