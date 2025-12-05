// App.js - the core of Vibelister, containing imports, wiring and rendering.

// Imports
import {
  isCanonicalStructuredPayload,
  makeGetStructuredCell,
  makeApplyStructuredCell,
} from "./clipboard-codec.js";
import {
  getCellForKind,
  setCellForKind,
  beginEditForKind,
  applyStructuredForKind,
  getStructuredForKind,
  clearCellForKind,
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
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
  clearInteractionsSelection,
  isInteractionPhaseColumnActiveForRow,
  getInteractionsPair,
  getInteractionsRowCount,
  describeInteractionInference,
} from "./interactions.js";
import { setCommentInactive } from "./comments.js";
import { emitCommentChangeEvent } from "./comment-events.js";
import {
  UI,
  PHASE_CAP,
  MOD,
  MIN_ROWS,
  Ids,
  ROW_HEIGHT,
  HEADER_HEIGHT,
} from "../data/constants.js";
import { makeRow, insertBlankRows } from "../data/rows.js";
import { sanitizeModifierRulesAfterDeletion } from "../data/deletion.js";
import {
  clamp,
  parsePhaseKey,
  parsePhasesSpec,
  formatPhasesSpec,
  visibleCols,
  visibleRows,
  colOffsets,
  colWidths,
} from "../data/utils.js";
import { createSettingsController } from "./settings-controller.js";
import { createDiagnosticsController } from "./diagnostics.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import { resetInferenceProfiles } from "./inference-profiles.js";
import {
  getCoreDomElements,
  getProjectNameElement,
} from "./dom-elements.js";
import { bootstrapMenus } from "./menus-bootstrap.js";
import { bootstrapSidebar } from "./sidebar-bootstrap.js";
import { bootstrapTabs } from "./tabs-bootstrap.js";
import { createAppContext } from "./app-root.js";
import { initSidebarControllers } from "./sidebar-wiring.js";
import { createViewController } from "./view-controller.js";
import { setupViewState } from "./setup-view-state.js";
import { setupRenderer } from "./setup-renderer.js";
import { setupHistory } from "./setup-history.js";
import { setupGridCommands } from "./setup-grid-commands.js";
import { setupDialogs } from "./setup-dialogs.js";
import { setupEditing } from "./setup-editing.js";
import { setupPersistence } from "./setup-persistence.js";
import { setupPalette } from "./setup-palette.js";
import { setupInteractionTools } from "./setup-interaction-tools.js";
import { setupInputHandlers } from "./setup-input-handlers.js";
import { setupChrome } from "./setup-chrome.js";

export function createApp() {
  // Core model + views
  const appContext = createAppContext();
  const { model, state } = appContext;
  let setActiveView = null;
  let cycleView = null;
  let getActiveView = null;
  let toggleInteractionsMode = null;
  
  function callSetActiveView(key) {
    return appContext.setActiveView(key);
  }
  
  const getActiveViewState = appContext.getActiveView;
  
  // DOM
  const coreDom = getCoreDomElements();
  const menusDom = bootstrapMenus(Ids);
  const sidebarDom = bootstrapSidebar(Ids);
  const tabsDom = bootstrapTabs(Ids);
  const projectNameEl = getProjectNameElement(Ids);
  const {
    sheet,
    cellsLayer,
    spacer,
    colHdrs,
    rowHdrs,
    editor,
    statusEl,
    dragLine,
  } = coreDom;
  const { statusBar, initA11y, wireMenus } = setupChrome({
    statusEl,
    menusDom,
    statusConfig: { historyLimit: 100 },
  });
  const menuItems = menusDom.items;
  
  const { openSettingsDialog } = createSettingsController({ statusBar });
  
  const viewState = setupViewState({ appContext, statusBar });
  
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

  const modHelpers = { isModColumn, modIdFromKey };

  const rendererApi = setupRenderer({
    appContext,
    viewState,
    dom: { sheet, cellsLayer, spacer, colHdrs, rowHdrs },
    getCell,
    modHelpers,
  });

  const { render, layout, ensureVisible, getColGeomFor } = rendererApi;

  onSelectionChanged(() => render());
  const { interactionsOutline, createDoGenerate } = setupInteractionTools({
    model,
    selectionApi: {
      Selection,
      SelectionCtl,
      sel,
      getActiveView: getActiveViewState,
      ensureVisible,
      onSelectionChanged,
    },
    rendererApi: { render, sheet },
    layoutApi: { layout },
  });
  
  const historyApi = setupHistory({
    appContext,
    viewState,
    rendererApi,
    menuItems,
    statusBar,
    setActiveView: callSetActiveView,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
  });
  
  const {
    makeUndoConfig,
    runModelMutation,
    beginUndoableTransaction,
    runModelTransaction,
    undo,
    redo,
    getUndoState,
    clearHistory,
  } = historyApi;
  
  const gridCommandsApi = setupGridCommands({
    appContext,
    viewState,
    historyApi,
    rendererApi,
    statusBar,
    setCell,
    modHelpers,
  });
  
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
  
  const {
    openProjectInfo,
    openCleanupDialog,
    openInferenceDialog,
    interactionActions,
  } = setupDialogs({
    appContext,
    viewState,
    historyApi,
    statusBar,
  });
  
  // Sidebars wired after view controller is created
  
  function isModColumn(c) {
    return !!c && typeof c.key === "string" && c.key.startsWith("mod:");
  }
  function modIdFromKey(k) {
    const s = String(k || "");
    const i = s.indexOf(":");
    return i >= 0 ? Number(s.slice(i + 1)) : NaN;
  }
  
  function isModStateBypassed(row, col) {
    if (!row || !col) return false;
    const id = modIdFromKey(col.key);
    if (!Number.isFinite(id)) return false;
    const raw = row?.modSet?.[id];
    return Number(raw) === MOD_STATE_ID.BYPASS;
  }
  
  // User-defined modifier order (row order in Modifiers view)
  function getCell(r, c) {
    const vd = viewDef();
    const col = vd.columns[c];
    // Interactions: trust `col.kind` when provided; else default to the meta-kind
    if (state.activeView === "interactions") {
      const k = String(col?.kind || "");
      if (k === "interactions") {
        return getCellForKind("interactions", kindCtx({ r, c, col, row: null }));
      }
      if (k) {
        // Identity columns (refRO/refPick) can render without a per-row object
        return getCellForKind(k, kindCtx({ r, c, col, row: null }));
      }
      // No kind specified → safest to use interactions logic
      return getCellForKind("interactions", kindCtx({ r, c, col, row: null }));
    }
    // Non-Interactions: use column kinds when present
    if (col && col.kind) {
      const arr = dataArray();
      const row = arr ? arr[r] : null;
      return getCellForKind(col.kind, kindCtx({ r, c, col, row }));
    }
    return "";
  }
  
  function cellValueToPlainText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") {
      if (typeof value.plainText === "string") return value.plainText;
      if (Array.isArray(value.segments)) {
        return value.segments
          .map((seg) => (seg && seg.text != null ? String(seg.text) : ""))
          .join("");
      }
      if (typeof value.text === "string") return value.text;
      if (typeof value.value === "string") return value.value;
    }
    return "";
  }
  
  function setCell(r, c, v) {
    const vd = viewDef();
    const col = vd.columns[c];
  
    let shouldRebuildInteractions = false;
    const result = runModelMutation(
      "setCell",
      () => {
        const commentChanges = [];
        // Interactions: route by kind; default to meta-kind
        if (state.activeView === "interactions") {
          const k = String(col?.kind || "interactions");
          const ctx = kindCtx({ r, c, col, row: null, v });
          const wrote = setCellForKind(k, ctx, v);
          return {
            view: "interactions",
            changed: wrote !== false,
            ensuredRows: 0,
            commentChanges,
          };
        }
  
        // Non-Interactions: ensure row exists
        const arr = dataArray();
        const beforeLen = arr.length;
        while (arr.length <= r) arr.push(makeRow(model));
        const row = arr[r];
  
        let changed = false;
  
        // Kind-backed columns
        if (col && col.kind) {
          let wasBypassed = null;
          if (col.kind === "modState") {
            wasBypassed = isModStateBypassed(row, col);
          }
          setCellForKind(col.kind, kindCtx({ r, c, col, row, v }), v);
          changed = true;
          if (col.kind === "modState") {
            const isBypassed = isModStateBypassed(row, col);
            if (wasBypassed !== isBypassed) {
              const change = setCommentInactive(model, vd, row, col, isBypassed);
              if (change) {
                commentChanges.push({
                  change,
                  target: { vd, rowIdentity: row, column: col },
                });
              }
              shouldRebuildInteractions = true;
            }
          }
        } else if (state.activeView === "actions" && col?.key === "phases") {
          const before = row?.phases;
          row.phases = parsePhasesSpec(v);
          changed = changed || before !== row?.phases;
        } else if (col?.key) {
          const before = row[col.key];
          if (before !== v) changed = true;
          row[col.key] = v;
        }
  
        return {
          view: state.activeView,
          changed,
          ensuredRows: arr.length - beforeLen,
          commentChanges,
        };
      },
      {
        layout: (res) => (res?.ensuredRows ?? 0) > 0,
        render: true,
      },
    );
    if (shouldRebuildInteractions) {
      rebuildInteractionsInPlace();
    }
    if (result?.commentChanges?.length) {
      for (const entry of result.commentChanges) {
        if (!entry?.change) continue;
        emitCommentChangeEvent(entry.change, entry.target || {});
      }
    } else if (shouldRebuildInteractions) {
      emitCommentChangeEvent(null, { viewKey: "interactions", force: true });
    }
    return result;
  }
  
  // Deletion & regeneration helpers
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
  
  // Remove deleted modifier ids from groups/constraints; drop now-invalid rules.
  // Generic structured-cell helpers for clipboard (stable ID aware)
  const getStructuredCell = makeGetStructuredCell({
    viewDef,
    dataArray,
    getStructuredForKind,
    kindCtx,
    getActiveView: getActiveViewState,
    isCanonical: isCanonicalStructuredPayload,
  });
  
  const baseApplyStructuredCell = makeApplyStructuredCell({
    viewDef,
    dataArray,
    applyStructuredForKind,
    kindCtx,
    getActiveView: getActiveViewState,
  });
  
  function applyStructuredCell(r, c, payload) {
    const vd = viewDef();
    if (!vd) return false;
    const col = vd.columns?.[c];
    const arr = dataArray();
    const row = Array.isArray(arr) ? arr[r] : null;
    let wasBypassed = null;
    if (state.activeView !== "interactions" && col?.kind === "modState" && row) {
      wasBypassed = isModStateBypassed(row, col);
    }
    const applied = baseApplyStructuredCell(r, c, payload);
    if (
      applied &&
      state.activeView !== "interactions" &&
      col?.kind === "modState" &&
      row
    ) {
      const isBypassed = isModStateBypassed(row, col);
      if (wasBypassed !== isBypassed) {
        const change = setCommentInactive(model, vd, row, col, isBypassed);
        rebuildInteractionsInPlace();
        if (change) {
          emitCommentChangeEvent(change, { vd, rowIdentity: row, column: col });
        } else {
          emitCommentChangeEvent(null, {
            vd,
            rowIdentity: row,
            column: col,
            force: true,
            viewKey: "interactions",
          });
        }
      }
    }
    return applied;
  }
  
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
    if (!sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "0");
    initA11y();
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
    disposeInteractions,
  };
}
