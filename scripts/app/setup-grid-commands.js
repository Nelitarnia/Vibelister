import { sel, selection, SelectionCtl, SelectionNS } from "./selection.js";
import { createGridCommands } from "./grid-commands.js";
import {
  clearInteractionsSelection,
  getInteractionsPair,
  isInteractionPhaseColumnActiveForRow,
  noteKeyForPair,
} from "./interactions.js";
import { makeRow, insertBlankRows } from "../data/rows.js";
import { sanitizeModifierRulesAfterDeletion } from "../data/deletion.js";
import { clearCellForKind, setCellForKind } from "../data/column-kinds.js";
import { parsePhaseKey } from "../data/utils.js";

export function setupGridCommands({
  appContext,
  viewState,
  historyApi,
  rendererApi,
  statusBar,
  setCell,
  modHelpers,
}) {
  return createGridCommands({
    getActiveView: appContext.getActiveView,
    viewDef: viewState.viewDef,
    dataArray: viewState.dataArray,
    selection,
    SelectionNS,
    SelectionCtl,
    sel,
    model: appContext.model,
    statusBar,
    runModelMutation: historyApi.runModelMutation,
    runModelTransaction: historyApi.runModelTransaction,
    makeUndoConfig: historyApi.makeUndoConfig,
    clearInteractionsSelection,
    isInteractionPhaseColumnActiveForRow,
    clearCellForKind,
    setCellForKind,
    kindCtx: viewState.kindCtx,
    makeRow,
    insertBlankRows,
    sanitizeModifierRulesAfterDeletion,
    setCell,
    render: rendererApi.render,
    isModColumn: modHelpers.isModColumn,
    parsePhaseKey,
    noteKeyForPair,
    getInteractionsPair,
  });
}
