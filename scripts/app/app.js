// App.js - the core of Vibelister, containing imports, wiring and rendering.

// Imports
import {
  isCanonicalStructuredPayload,
  makeGetStructuredCell,
  makeApplyStructuredCell,
} from "./clipboard-codec.js";
import { createGridCells } from "./grid-cells.js";
import {
  getCellForKind,
  setCellForKind,
  beginEditForKind,
  applyStructuredForKind,
  getStructuredForKind,
} from "../data/column-kinds.js";
import { MOD_STATE_ID } from "../data/mod-state.js";
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
import { setCommentInactive } from "./comments.js";
import { emitCommentChangeEvent } from "./comment-events.js";
import { ROW_HEIGHT, HEADER_HEIGHT, Ids } from "../data/constants.js";
import { makeRow } from "../data/rows.js";
import {
  clamp,
  parsePhasesSpec,
  visibleCols,
  visibleRows,
  colOffsets,
  colWidths,
} from "../data/utils.js";
import { createDiagnosticsController } from "./diagnostics.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import { resetInferenceProfiles } from "./inference-profiles.js";
import { createAppContext } from "./app-root.js";
import { initSidebarControllers } from "./sidebar-wiring.js";
import { createViewController } from "./view-controller.js";
import { bootstrapGridRuntime } from "./bootstrap-grid-runtime.js";
import { setupEditing } from "./setup-editing.js";
import { setupPersistence } from "./setup-persistence.js";
import { setupPalette } from "./setup-palette.js";
import { setupInputHandlers } from "./setup-input-handlers.js";
import { bootstrapShell } from "./bootstrap-shell.js";

export function createApp() {
  // Core model + views
  const appContext = createAppContext();
  const { model, state } = appContext;
  let setActiveView = null;
  let cycleView = null;
  let getActiveView = null;
  let toggleInteractionsMode = null;
  let runModelMutationRef = null;
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
  } = bootstrapShell({ appContext, ids: Ids, statusConfig: { historyLimit: 100 } });

  function callSetActiveView(key) {
    return appContext.setActiveView(key);
  }

  const getActiveViewState = appContext.getActiveView;

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
    saveCurrentViewState,
    restoreViewState,
    resetAllViewState,
    viewDef,
    invalidateViewDef,
    rebuildInteractionPhaseColumns,
    kindCtx,
    dataArray,
    getRowCount,
    updateSelectionSnapshot,
    updateScrollSnapshot,
  } = viewState;

  const {
    isModColumn,
    modIdFromKey,
    getCell,
    setCell,
    getStructuredCell,
    applyStructuredCell,
    cellValueToPlainText,
  } = createGridCells({
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

  function rebuildInteractionsInPlace() {
    // Rebuild pairs without changing the active view or selection
    buildInteractionsPairs(model);
    interactionsOutline?.refresh?.();
  }

  function pruneNotesToValidPairs() {
    // Build the full set of valid base keys using the same composer as Interactions
    // (phase suffixes are intentionally omitted for pruning)
    const validBase = new Set();
    const rowCount = getInteractionsRowCount(model);
    for (let r = 0; r < rowCount; r++) {
      const p = getInteractionsPair(model, r);
      if (!p) continue;
      try {
        // Primary (current) scheme
        const base = noteKeyForPair(p, undefined);
        if (base) validBase.add(base);

        // Back-compat: earlier keys that may exist in saved projects
        const sigA = canonicalSig(p.variantSig || "");
        if (!p.kind || p.kind === "AI") {
          // Legacy AI base key (pre-kind): aId|iId|sig
          validBase.add(`${p.aId}|${p.iId}|${sigA}`);
        } else if (p.kind === "AA") {
          const sigB = canonicalSig(p.rhsVariantSig || "");
          // Directed AA (current granular form)
          validBase.add(`aa|${p.aId}|${p.rhsActionId}|${sigA}|${sigB}`);
          // Older AA variants that may appear in notes (canonicalized id order, LHS-only sig)
          const lo = Math.min(Number(p.aId), Number(p.rhsActionId));
          const hi = Math.max(Number(p.aId), Number(p.rhsActionId));
          validBase.add(`aa|${lo}|${hi}|${sigA}`);
        }
      } catch (_) {
        /* ignore malformed pairs while pruning */
      }
    }

    function baseKeyOf(k) {
      const s = String(k || "");
      const i = s.indexOf("|p");
      return i >= 0 ? s.slice(0, i) : s;
    }

    for (const k in model.notes) {
      if (!validBase.has(baseKeyOf(k))) delete model.notes[k];
    }
  }

  const {
    rendererApi,
    selectionListeners: { onSelectionChanged: onSelectionChangedRender },
    interactionToolsApi,
    historyApi,
    mutationApi,
    dialogApi,
    gridCommandsApi,
  } = bootstrapGridRuntime({
    appContext,
    viewState,
    coreDom,
    selectionApi: {
      Selection,
      SelectionCtl,
      sel,
      onSelectionChanged,
      getActiveView: getActiveViewState,
    },
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
    setActiveView: callSetActiveView,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
  });

  const { render, layout, ensureVisible, getColGeomFor } = rendererApi;

  ({ interactionsOutline, createDoGenerate } = interactionToolsApi);

  const { undo, redo, getUndoState, clearHistory } = historyApi;
  const {
    runModelMutation,
    runModelTransaction,
    beginUndoableTransaction,
    makeUndoConfig,
  } = mutationApi;

  runModelMutationRef = runModelMutation;

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

  const { openProjectInfo, openCleanupDialog, openInferenceDialog, interactionActions } =
    dialogApi;

  const onSelectionChanged = onSelectionChangedRender;

  // Sidebars wired after view controller is created
  
  const editingController = setupEditing({
    appContext,
    viewState,
    rendererApi,
    historyApi,
    gridApi: {
      beginEditForKind,
      getCell,
      setCell,
      isInteractionPhaseColumnActiveForRow,
      cloneValueForAssignment,
      getHorizontalTargetColumns,
    },
    paletteApiRef: () => state.paletteAPI,
    dom: { sheet, editor },
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
  } = setupPersistence({
    appContext,
    historyApi,
    viewState,
    statusBar,
    dom: { projectNameEl },
    closeMenus: () => state.menusAPI?.closeAllMenus?.(),
    onModelReset: () => {
      resetInferenceProfiles();
      interactionsOutline?.refresh?.();
      state.tagUI?.refresh?.();
      state.commentsUI?.applyModelMetadata?.(model.meta);
      emitInteractionTagChangeEvent(null, { reason: "reset", force: true });
    },
  });
  
  const { runSelfTests } = createDiagnosticsController({
    model,
    statusBar,
    ensureSeedRows,
    rebuildActionColumnsFromModifiers,
    VIEWS,
    setActiveView: callSetActiveView,
    setCell,
  });
  
  const { paletteAPI } = setupPalette({
    appContext,
    viewState,
    rendererApi,
    gridApi: {
      getCell,
      setCellSelectionAware,
      cellValueToPlainText,
    },
    editingApi: {
      sel,
      getCellRect,
      endEdit,
      advanceSelectionAfterPaletteTab,
      moveSel,
    },
    historyApi,
    dom: { editor, sheet },
  });

  state.paletteAPI = paletteAPI;
  
  // Edit
  
  sheet.addEventListener("scroll", () => {
    // Persist scroll per view, then render on next frame
    updateScrollSnapshot(sheet.scrollTop | 0);
    window.requestAnimationFrame(() => {
      render();
    });
  });
  
  // Tabs & views
  ({ setActiveView, cycleView, getActiveView, toggleInteractionsMode } =
    createViewController({
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
    setActiveView: callSetActiveView,
    statusBar,
  });

  const {
    disposeMouse,
    disposeDrag,
    disposeKeys,
    disposeColumnResize,
  } = setupInputHandlers({
    dom: { cellsLayer, rowHdrs, sheet, editor, dragLine, colHdrs },
    selectionApi: { selection, sel, SelectionNS, SelectionCtl, clearSelection },
    editingApi: {
      isEditing,
      beginEdit,
      endEdit,
      moveSel,
      moveSelectionForTab,
    },
    viewApi: {
      viewDef,
      getRowCount,
      dataArray,
      getActiveView: getActiveViewState,
      setActiveView: callSetActiveView,
      cycleView,
      invalidateViewDef,
    },
    rendererApi: { render, layout, ensureVisible },
    gridApi: {
      setCell,
      setModForSelection,
      isModColumn,
      modIdFromKey,
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
      ROW_HEIGHT,
      HEADER_HEIGHT,
      clamp,
      deleteSelectedRows,
      clearSelectedCells,
      addRowsAbove,
      addRowsBelow,
      getCell,
      getPaletteAPI: () => state.paletteAPI,
      interactionsOutline,
      commentsUI: state.commentsUI,
      tagUI: state.tagUI,
      toggleInteractionToolsPane: () => state.toggleInteractionToolsPane?.(),
      interactionActions,
    },
    historyApi: { undo, redo },
    persistenceApi: { newProject, openFromDisk, saveToDisk },
    generationApi: { doGenerate, runSelfTests },
    clipboardApi: {
      getStructuredCell,
      applyStructuredCell,
      getCellCommentClipboardPayload,
      applyCellCommentClipboardPayload,
      cellValueToPlainText,
    },
    statusBar,
    toggleInteractionsMode,
  });
  
  ({
    sidePanelHost: state.sidePanelHost,
    commentsUI: state.commentsUI,
    tagManager: state.tagManager,
    tagUI: state.tagUI,
    interactionTools: state.interactionTools,
  } = initSidebarControllers({
    dom: sidebarDom,
    SelectionCtl,
    selection,
    sel,
    onSelectionChanged,
    getCellComments,
    setCellComment,
    deleteCellComment,
    getActiveView,
    setActiveView,
    viewDef,
    dataArray,
    render,
    statusBar,
    model,
    ensureVisible,
    VIEWS,
    noteKeyForPair,
    getInteractionsPair,
    runModelMutation,
    makeUndoConfig,
    interactionActions,
  }));

  state.toggleInteractionToolsPane = () => state.interactionTools?.toggle?.();
  // Initialize menus module (handles menu triggers & items)
  state.menusAPI = wireMenus({
    setActiveView,
    newProject,
    openFromDisk,
    saveToDisk,
    doGenerate,
    runSelfTests,
    model,
    openSettings: openSettingsDialog,
    openProjectInfo,
    openCleanup: openCleanupDialog,
    openInference: openInferenceDialog,
    addRowsAbove,
    addRowsBelow,
    clearCells: () => clearSelectedCells({}),
    deleteRows: () => deleteSelectedRows({ reason: "menu" }),
    undo,
    redo,
    getUndoState,
  });

  // Lightweight namespaces (non-invasive, for readability only)
  const ModelNS = { upgradeModelInPlace, ensureSeedRows, ensureMinRows, makeRow };
  const ViewsNS = {
    setActiveView,
    rebuildActionColumnsFromModifiers,
    viewDef,
    dataArray,
    getRowCount,
    visibleCols,
    visibleRows,
    colOffsets,
    colWidths,
  };
  const GridNS = {
    layout,
    render,
    ensureVisible,
    beginEdit,
    endEdit,
    endEditIfOpen,
    moveSel,
  };
  const MenusNS = {
    closeAllMenus: state.menusAPI.closeAllMenus,
    updateViewMenuRadios: state.menusAPI.updateViewMenuRadios,
  };
  const SelectionNS_Export = SelectionNS; // expose under namespaces index for discoverability
  const IONS = { openFromDisk, saveToDisk };
  const VariantsNS = {
    canonicalSig,
    doGenerate,
    compareVariantSig,
    sortIdsByUserOrder,
    modOrderMap,
  };
  
  function destroyApp() {
    destroyShell?.();
    disposeMouse?.();
    disposeDrag?.();
    disposeKeys?.();
    disposeColumnResize?.();
    state.interactionTools?.destroy?.();
    state.commentsUI?.destroy?.();
    state.tagUI?.destroy?.();
    state.paletteAPI?.destroy?.();
    state.menusAPI?.destroy?.();
    state.toggleInteractionToolsPane = null;
  }

  function initApp() {
    initShell?.();
    ensureSeedRows();
    layout();
    render();
    new ResizeObserver(() => render()).observe(sheet);
    setActiveView("actions");
    updateProjectNameWidget();
    if (location.hash.includes("test")) runSelfTests();
  }
  
  appContext.setLifecycle({
    init: initApp,
    destroy: destroyApp,
    setActiveView,
    cycleView,
    toggleInteractionsMode,
  });

  return {
    init: initApp,
    destroy: destroyApp,
    setActiveView,
    cycleView,
    toggleInteractionsMode,
    appContext,
    ModelNS,
    ViewsNS,
    GridNS,
    MenusNS,
    SelectionNS: SelectionNS_Export,
    IONS,
    VariantsNS,
  };
}
