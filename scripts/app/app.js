// App.js - the core of Vibelister, containing imports, wiring and rendering.

// Imports
import { createAppContext } from "./app-root.js";
import { createViewController } from "./view-controller.js";
import { bootstrapEditingAndPersistence } from "./bootstrap-editing-and-persistence.js";
import { bootstrapInteractionsAndLifecycle } from "./bootstrap-interactions-and-lifecycle.js";
import {
  VIEWS,
  rebuildActionColumnsFromModifiers,
  buildInteractionPhaseColumns,
} from "./views.js";
import {
  canonicalSig,
  sortIdsByUserOrder,
  compareVariantSig,
  modOrderMap,
  buildInteractionsPairs,
} from "../data/variants/variants.js";
import {
  Selection,
  sel,
  selection,
  SelectionNS,
  SelectionCtl,
  onSelectionChanged,
  clearSelection,
} from "./selection.js";
import {
  noteKeyForPair,
  isInteractionPhaseColumnActiveForRow,
  getInteractionsPair,
  getInteractionsRowCount,
} from "./interactions.js";
import { beginEditForKind } from "../data/column-kinds.js";
import { emitCommentChangeEvent } from "./comment-events.js";
import { ROW_HEIGHT, HEADER_HEIGHT } from "../data/constants.js";
import { makeRow } from "../data/rows.js";
import { clamp, visibleCols, visibleRows, colOffsets, colWidths } from "../data/utils.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import {
  createInferenceProfileStore,
  resetInferenceProfiles,
} from "./inference-profiles.js";
import { createInteractionMaintenance } from "./interaction-maintenance.js";
import { createShellCoordinator } from "./shell-coordinator.js";
import { createGridRuntimeCoordinator } from "./grid-runtime-coordinator.js";

export function createApp() {
  // Core model + views
  const appContext = createAppContext();
  const { model, state } = appContext;
  const inferenceProfiles = createInferenceProfileStore();
  model.inferenceProfiles = inferenceProfiles;
  appContext.inferenceProfiles = inferenceProfiles;
  let setActiveView = null;
  let cycleView = null;
  let getActiveView = null;
  let toggleInteractionsMode = null;
  let interactionsOutline = null;
  let createDoGenerate = null;

  const {
    dom: { core: coreDom, sidebar: sidebarDom, tabs: tabsDom, projectNameEl },
    statusBar,
    menuItems,
    viewState,
    openSettingsDialog,
    wireMenus,
    lifecycle: { init: initShell, destroy: destroyShell },
  } = createShellCoordinator({ appContext });

  const getActiveViewState = appContext.getActiveView;

  const { rebuildInteractionsInPlace, pruneNotesToValidPairs } = createInteractionMaintenance({
    model,
    buildInteractionsPairs,
    getInteractionsOutline: () => interactionsOutline,
    getInteractionsRowCount,
    getInteractionsPair,
    noteKeyForPair,
    canonicalSigImpl: canonicalSig,
  });

  const {
    gridCellsApi,
    modHelpers,
    rendererApi,
    selectionListeners,
    selectionRenderDisposer,
    interactionToolsApi,
    historyApi,
    mutationApi,
    dialogApi,
    gridCommandsApi,
    viewStateApi,
  } = createGridRuntimeCoordinator({
    appContext,
    viewState,
    coreDom,
    statusBar,
    menuItems,
    selectionApi: { Selection, SelectionCtl, selection, sel, onSelectionChanged },
    setActiveView: (...args) => setActiveView?.(...args),
    getActiveViewState,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
  });

  const { sheet, cellsLayer, spacer, colHdrs, rowHdrs, editor, dragLine } = coreDom;

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
  } = viewStateApi;

  const { getCell, setCell, getStructuredCell, applyStructuredCell, cellValueToPlainText } =
    gridCellsApi;

  const { render, layout, ensureVisible } = rendererApi;

  ({ interactionsOutline, createDoGenerate } = interactionToolsApi);
  const { createDiagnosticsActions } = interactionToolsApi;

  const { undo, redo, getUndoState } = historyApi;
  const { runModelMutation, runModelTransaction, beginUndoableTransaction, makeUndoConfig } =
    mutationApi;

  const {
    cloneValueForAssignment,
    getHorizontalTargetColumns,
    setModForSelection,
    addRowsAbove,
    addRowsBelow,
    clearSelectedCells,
    deleteSelectedRows,
    setCellSelectionAware,
    setCellComment,
    deleteCellComment,
    getCellComments,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
  } = gridCommandsApi;

  const { openProjectInfo, openCleanupDialog, openInferenceDialog, interactionActions } = dialogApi;
  const diagnosticsActions =
    typeof createDiagnosticsActions === "function" ? createDiagnosticsActions({ statusBar }) : {};
  const combinedInteractionActions = { ...interactionActions, ...diagnosticsActions };

  const onModelReset = () => {
    resetInferenceProfiles(inferenceProfiles);
    interactionsOutline?.refresh?.();
    state.tagUI?.refresh?.();
    state.commentsUI?.applyModelMetadata?.(model.meta);
    emitInteractionTagChangeEvent(null, { reason: "reset", force: true });
  };

  const {
    editingController,
    persistenceApi,
    diagnosticsApi,
    getPaletteAPI,
    destroy: destroyEditingAndPersistence,
  } = bootstrapEditingAndPersistence({
    appContext,
    viewState,
    rendererApi,
    historyApi,
    statusBar,
    dom: { sheet, editor, projectNameEl },
    gridApi: {
      beginEditForKind,
      getCell,
      setCell,
      isInteractionPhaseColumnActiveForRow,
      cloneValueForAssignment,
      getHorizontalTargetColumns,
      setCellSelectionAware,
      cellValueToPlainText,
    },
    closeMenus: () => state.menusAPI?.closeAllMenus?.(),
    onModelReset,
    rebuildActionColumnsFromModifiers,
    VIEWS,
    setActiveView: (...args) => setActiveView?.(...args),
  });

  const {
    beginEdit,
    endEdit,
    endEditIfOpen,
    moveSel,
    moveSelectionForTab,
    advanceSelectionAfterPaletteTab,
    getCellRect,
    isEditing,
  } = editingController;

  const {
    newProject,
    openFromDisk,
    saveToDisk,
    ensureMinRows,
    ensureSeedRows,
    upgradeModelInPlace,
    updateProjectNameWidget,
    setProjectNameFromFile,
    getSuggestedName,
  } = persistenceApi;

  const { runSelfTests } = diagnosticsApi;

  // Edit

  const handleScroll = () => {
    // Persist scroll per view, then render on next frame
    updateScrollSnapshot(sheet.scrollTop | 0);
    window.requestAnimationFrame(() => {
      render();
    });
  };

  sheet.addEventListener("scroll", handleScroll);

  // Tabs & views
  ({ setActiveView, cycleView, getActiveView, toggleInteractionsMode } = createViewController({
    tabs: tabsDom,
    sheet,
    sel,
    selection,
    saveCurrentViewState,
    restoreViewState,
    clearSelection,
    endEditIfOpen,
    VIEWS,
    interactionsOutline,
    invalidateViewDef,
    rebuildActionColumnsFromModifiers,
    rebuildInteractionsInPlace,
    rebuildInteractionPhaseColumns,
    layout,
    render,
    statusBar,
    menusAPIRef: () => state.menusAPI,
    getRowCount,
    viewDef,
    clamp,
    model,
    getActiveViewState: () => state.activeView,
    setActiveViewState: (key) => (state.activeView = key),
    getCommentsUI: () => state.commentsUI,
  }));

  const doGenerate = createDoGenerate({
    rebuildActionColumnsFromModifiers,
    invalidateViewDef,
    buildInteractionsPairs,
    setActiveView,
    statusBar,
  });

  return bootstrapInteractionsAndLifecycle({
    appContext,
    shellApi: {
      dom: {
        cellsLayer,
        rowHdrs,
        sheet,
        editor,
        dragLine,
        colHdrs,
        sidebar: sidebarDom,
      },
      statusBar,
      wireMenus,
      initShell,
      destroyShell,
    },
    selectionApi: {
      selection,
      sel,
      SelectionNS,
      SelectionCtl,
      clearSelection,
      onSelectionChanged: selectionListeners.onSelectionChanged,
      disposeSelectionRender: selectionRenderDisposer,
    },
    editingApi: {
      isEditing,
      beginEdit,
      endEdit,
      endEditIfOpen,
      moveSel,
      moveSelectionForTab,
    },
    viewApi: {
      viewDef,
      dataArray,
      getRowCount,
      getActiveView,
      setActiveView,
      cycleView,
      invalidateViewDef,
    },
    rendererApi: { render, layout, ensureVisible },
    gridApi: {
      setCell,
      setModForSelection,
      isModColumn: modHelpers.isModColumn,
      modIdFromKey: modHelpers.modIdFromKey,
      getHorizontalTargetColumns,
      cloneValueForAssignment,
    },
    modelApi: {
      model,
      runModelMutation,
      runModelTransaction,
      beginUndoableTransaction,
      makeUndoConfig,
      ensureMinRows,
      ensureSeedRows,
      ROW_HEIGHT,
      HEADER_HEIGHT,
      clamp,
      deleteSelectedRows,
      clearSelectedCells,
      addRowsAbove,
      addRowsBelow,
      getCell,
      getPaletteAPI,
      interactionsOutline,
      interactionActions: combinedInteractionActions,
      commentsUI: state.commentsUI,
      tagUI: state.tagUI,
      upgradeModelInPlace,
      makeRow,
    },
    historyApi: { undo, redo, getUndoState },
    persistenceApi: { newProject, openFromDisk, saveToDisk, updateProjectNameWidget },
    generationApi: { doGenerate, runSelfTests },
    clipboardApi: {
      getStructuredCell,
      applyStructuredCell,
      getCellCommentClipboardPayload,
      applyCellCommentClipboardPayload,
      cellValueToPlainText,
    },
    menuApi: { openSettingsDialog, openProjectInfo, openCleanupDialog, openInferenceDialog },
    sidebarApi: { getCellComments, setCellComment, deleteCellComment, noteKeyForPair, getInteractionsPair },
    variantApi: { canonicalSig, compareVariantSig, sortIdsByUserOrder, modOrderMap },
    viewsMeta: {
      VIEWS,
      visibleCols,
      visibleRows,
      colOffsets,
      colWidths,
      rebuildActionColumnsFromModifiers,
    },
    interactionsApi: { toggleInteractionsMode },
    handleScroll,
    destroyEditingAndPersistence,
  });
}
