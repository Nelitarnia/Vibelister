import { createGridCells } from "./grid-cells.js";
import { bootstrapGridRuntime } from "./bootstrap-grid-runtime.js";
import {
  getCellForKind,
  setCellForKind,
  applyStructuredForKind,
  getStructuredForKind,
} from "../data/column-kinds.js";
import { MOD_STATE_ID } from "../data/mod-state.js";
import { makeRow } from "../data/rows.js";
import { parsePhasesSpec } from "../data/utils.js";
import { setCommentInactive } from "./comments.js";
import { emitCommentChangeEvent } from "./comment-events.js";
import { makeGetStructuredCell, makeApplyStructuredCell, isCanonicalStructuredPayload } from "./clipboard-codec.js";

export function createGridRuntimeCoordinator({
  appContext,
  viewState,
  coreDom,
  statusBar,
  menuItems,
  selectionApi,
  setActiveView,
  getActiveViewState,
  rebuildInteractionsInPlace,
  pruneNotesToValidPairs,
  createGridCellsImpl = createGridCells,
  bootstrapGridRuntimeImpl = bootstrapGridRuntime,
}) {
  const { model, state } = appContext;
  let runModelMutationRef = null;

  const {
    sheet,
    cellsLayer,
    spacer,
    colHdrs,
    rowHdrs,
    editor,
    dragLine,
  } = coreDom;

  const {
    viewDef,
    dataArray,
    kindCtx,
    getRowCount,
    updateSelectionSnapshot,
    updateScrollSnapshot,
    invalidateViewDef,
    rebuildInteractionPhaseColumns,
    saveCurrentViewState,
    restoreViewState,
    resetAllViewState,
  } = viewState;

  const {
    isModColumn,
    modIdFromKey,
    getCell,
    setCell,
    getStructuredCell,
    applyStructuredCell,
    cellValueToPlainText,
  } = createGridCellsImpl({
    viewDef,
    dataArray,
    kindCtx,
    state,
    model,
    runModelMutation: (...args) => runModelMutationRef?.(...args),
    setCellForKind,
    getCellForKind,
    makeRow,
    parsePhasesSpec,
    setCommentInactive,
    emitCommentChangeEvent,
    rebuildInteractionsInPlace,
    getStructuredForKind,
    applyStructuredForKind,
    getActiveView: getActiveViewState,
    makeGetStructuredCell,
    makeApplyStructuredCell,
    isCanonicalStructuredPayload,
    MOD_STATE_ID,
  });

  const modHelpers = { isModColumn, modIdFromKey };

  const runtime = bootstrapGridRuntimeImpl({
    appContext,
    viewState,
    coreDom,
    selectionApi: { ...selectionApi, getActiveView: getActiveViewState },
    gridCellsApi: {
      getCell,
      setCell,
      getStructuredCell,
      applyStructuredCell,
      cellValueToPlainText,
    },
    modHelpers,
    statusBar,
    menuItems,
    setActiveView,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
  });

  const { mutationApi } = runtime;
  runModelMutationRef = mutationApi.runModelMutation;

  return {
    ...runtime,
    gridCellsApi: { getCell, setCell, getStructuredCell, applyStructuredCell, cellValueToPlainText },
    modHelpers,
    viewStateApi: {
      updateSelectionSnapshot,
      updateScrollSnapshot,
      invalidateViewDef,
      rebuildInteractionPhaseColumns,
      saveCurrentViewState,
      restoreViewState,
      resetAllViewState,
      viewDef,
      dataArray,
      kindCtx,
      getRowCount,
    },
  };
}

export default createGridRuntimeCoordinator;
