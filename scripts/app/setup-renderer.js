import { sel, selection, SelectionNS, isRowSelected } from "./selection.js";
import { createGridRenderer } from "./grid-renderer.js";
import { noteKeyForPair, getInteractionsPair, describeInteractionInference } from "./interactions.js";
import { parsePhaseKey } from "../data/utils.js";
import { ROW_HEIGHT } from "../data/constants.js";

export function setupRenderer({ appContext, viewState, dom, getCell, modHelpers }) {
  const { model } = appContext;
  const { sheet, cellsLayer, spacer, colHdrs, rowHdrs } = dom;
  return createGridRenderer({
    sheet,
    cellsLayer,
    spacer,
    colHdrs,
    rowHdrs,
    selection,
    SelectionNS,
    sel,
    getActiveView: appContext.getActiveView,
    viewDef: viewState.viewDef,
    dataArray: viewState.dataArray,
    getRowCount: viewState.getRowCount,
    getCell,
    isRowSelected,
    model,
    rebuildInteractionPhaseColumns: viewState.rebuildInteractionPhaseColumns,
    noteKeyForPair,
    parsePhaseKey,
    ROW_HEIGHT,
    updateSelectionSnapshot: viewState.updateSelectionSnapshot,
    isModColumn: modHelpers.isModColumn,
    modIdFromKey: modHelpers.modIdFromKey,
    getInteractionsPair,
    describeInteractionInference,
    getCommentColors: () => model.meta.commentColors,
  });
}
