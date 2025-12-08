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
import { bootstrapEditingAndPersistence } from "./bootstrap-editing-and-persistence.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import { resetInferenceProfiles } from "./inference-profiles.js";
import { createAppContext } from "./app-root.js";
import { createViewController } from "./view-controller.js";
import { bootstrapGridRuntime } from "./bootstrap-grid-runtime.js";
import { bootstrapShell } from "./bootstrap-shell.js";
import { bootstrapInteractionsAndLifecycle } from "./bootstrap-interactions-and-lifecycle.js";

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

  const callSetActiveView = (...args) => setActiveView?.(...args);

  const {
    dom: { core: coreDom, sidebar: sidebarDom, tabs: tabsDom, projectNameEl },
    statusBar,
    menuItems,
    viewState,
    openSettingsDialog,
    wireMenus,
    lifecycle: { init: initShell, destroy: destroyShell },
  } = bootstrapShell({ appContext, ids: Ids, statusConfig: { historyLimit: 100 } });

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
    selectionListeners,
    selectionRenderDisposer,
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
      disposeSelectionRender: selectionRenderDisposer,
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

  const { undo, redo, getUndoState } = historyApi;
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

  const onModelReset = () => {
    resetInferenceProfiles();
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
    setActiveView: callSetActiveView,
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
      interactionActions,
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
    destroyEditingAndPersistence,
  });
}
