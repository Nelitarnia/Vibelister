// App.js - the core of Vibelister, containing imports, wiring and rendering.

// Imports
import { initGridKeys } from "../ui/grid-keys.js";
import { initGridMouse } from "../ui/grid-mouse.js";
import { initRowDrag } from "../ui/drag.js";
import { initMenus } from "../ui/menus.js";
import { createInteractionsOutline } from "../ui/interactions-outline.js";
import { initPalette } from "../ui/palette.js";
import { initColorPicker } from "../ui/color-picker.js";
import { initColumnResize } from "../ui/column-resize.js";
import { initStatusBar } from "../ui/status.js";
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
  isRowSelected,
  clearSelection,
} from "./selection.js";
import { createViewStateController } from "./view-state.js";
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
import { createHistoryController } from "./history.js";
import {
  clamp,
  parsePhaseKey,
  parsePhasesSpec,
  formatPhasesSpec,
  basenameNoExt,
  visibleCols,
  visibleRows,
  colOffsets,
  colWidths,
} from "../data/utils.js";
import { createEditingController } from "./editing-shortcuts.js";
import { createPersistenceController } from "./persistence.js";
import { createSettingsController } from "./settings-controller.js";
import { createGridCommands } from "./grid-commands.js";
import { createGridRenderer } from "./grid-renderer.js";
import { createDiagnosticsController } from "./diagnostics.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import { createProjectInfoController } from "./project-info-controller.js";
import { createCleanupController } from "./cleanup-controller.js";
import { createInferenceController } from "./inference-controller.js";
import { resetInferenceProfiles } from "./inference-profiles.js";
import { createInteractionBulkActions } from "./interaction-bulk-actions.js";
import {
  getCoreDomElements,
  getMenuDomElements,
  getProjectNameElement,
  getSidebarDomElements,
  getTabDomElements,
} from "./dom-elements.js";
import { createAppContext } from "./app-root.js";
import { initSidebarControllers } from "./sidebar-wiring.js";
import { createViewController } from "./view-controller.js";

function initA11y() {
  statusBar?.ensureLiveRegion();
}

// Core model + views
const appContext = createAppContext();
const { model, state } = appContext;
export { appContext };

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
const menuDom = getMenuDomElements(Ids);
const sidebarDom = getSidebarDomElements(Ids);
const tabDom = getTabDomElements(Ids);
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
const { undoMenuItem, redoMenuItem, commentToggleButton, tagToggleButton, commentAddButton } =
  menuDom;
const {
  sidePanel,
  sidePanelTitle,
  sidePanelCloseButton,
  commentPane,
  tagPane,
  tagForm,
  tagInput,
  tagSort,
  tagRenameButton,
  tagDeleteButton,
  tagList,
  tagEmpty,
  commentList,
  commentEmpty,
  commentEditor,
  commentTextarea,
  commentColorSelect,
  commentSaveButton,
  commentDeleteButton,
  commentCancelButton,
  commentSelectionLabel,
  commentPrevButton,
  commentNextButton,
  commentTabs,
  commentTabComments,
  commentTabCustomize,
  commentPageComments,
  commentPageCustomize,
  commentPaletteList,
  commentPaletteApply,
  commentPaletteReset,
  interactionToolsPane,
  interactionToolsToggle,
  interactionAcceptButton,
  interactionClearButton,
  interactionUncertainButton,
  interactionUncertaintyValue,
  interactionSourceValue,
  interactionUncertaintyDefault,
  interactionUncertaintyDefaultValue,
} = sidebarDom;
const { tabActions, tabInputs, tabModifiers, tabOutcomes, tabInteractions } = tabDom;
const statusBar = initStatusBar(statusEl, { historyLimit: 100 });

const { openSettingsDialog } = createSettingsController({ statusBar });

const viewState = createViewStateController({
  getActiveView: getActiveViewState,
  model,
  VIEWS,
  buildInteractionPhaseColumns,
  Selection,
  MIN_ROWS,
  MOD,
  statusBar,
  getPaletteAPI: () => state.paletteAPI,
  parsePhasesSpec,
  formatPhasesSpec,
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
});

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
  render,
  layout,
  ensureVisible,
  getColGeomFor,
} = createGridRenderer({
  sheet,
  cellsLayer,
  spacer,
  colHdrs,
  rowHdrs,
  selection,
  SelectionNS,
  sel,
  getActiveView: getActiveViewState,
  viewDef,
  dataArray,
  getRowCount,
  getCell,
  isRowSelected,
  model,
  rebuildInteractionPhaseColumns,
  noteKeyForPair,
  parsePhaseKey,
  ROW_HEIGHT,
  updateSelectionSnapshot,
  isModColumn,
  modIdFromKey,
  getInteractionsPair,
  describeInteractionInference,
  getCommentColors: () => model.meta.commentColors,
});

onSelectionChanged(() => render());

const interactionsOutline = createInteractionsOutline({
  model,
  Selection,
  SelectionCtl,
  sel,
  getActiveView: getActiveViewState,
  ensureVisible,
  render,
  layout,
  sheet,
  onSelectionChanged,
});
interactionsOutline?.refresh?.();

const {
  makeUndoConfig,
  runModelMutation,
  beginUndoableTransaction,
  runModelTransaction,
  undo,
  redo,
  getUndoState,
  clearHistory,
} = createHistoryController({
  model,
  viewDef,
  getActiveView: getActiveViewState,
  setActiveView: callSetActiveView,
  selectionCursor: sel,
  SelectionCtl,
  ensureVisible,
  VIEWS,
  statusBar,
  undoMenuItem,
  redoMenuItem,
  rebuildActionColumnsFromModifiers,
  rebuildInteractionsInPlace,
  pruneNotesToValidPairs,
  invalidateViewDef,
  layout,
  render,
  historyLimit: 200,
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
} = createGridCommands({
  getActiveView: getActiveViewState,
  viewDef,
  dataArray,
  selection,
  SelectionNS,
  SelectionCtl,
  sel,
  model,
  statusBar,
  runModelMutation,
  runModelTransaction,
  makeUndoConfig,
  clearInteractionsSelection,
  isInteractionPhaseColumnActiveForRow,
  clearCellForKind,
  setCellForKind,
  kindCtx,
  makeRow,
  insertBlankRows,
  sanitizeModifierRulesAfterDeletion,
  setCell,
  render,
  isModColumn,
  parsePhaseKey,
  noteKeyForPair,
  getInteractionsPair,
});

const { openProjectInfoDialog: openProjectInfo } = createProjectInfoController({
  model,
  runModelMutation,
  makeUndoConfig,
  statusBar,
});

const { openCleanupDialog } = createCleanupController({
  model,
  runModelMutation,
  makeUndoConfig,
  statusBar,
});

const { openInferenceDialog } = createInferenceController({
  model,
  selection,
  sel,
  getActiveView: getActiveViewState,
  viewDef,
  statusBar,
  runModelMutation,
  makeUndoConfig,
  getInteractionsPair,
  getInteractionsRowCount,
});

const interactionActions = createInteractionBulkActions({
  model,
  selection,
  sel,
  getActiveView: getActiveViewState,
  viewDef,
  statusBar,
  runModelMutation,
  makeUndoConfig,
  getInteractionsPair,
});

// Sidebars wired after view controller is created

initColumnResize({
  container: colHdrs,
  sheet,
  model,
  getActiveView: getActiveViewState,
  viewDef,
  runModelMutation,
  beginUndoableTransaction,
  makeUndoConfig,
  invalidateViewDef,
  layout,
  render,
});

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

const editingController = createEditingController({
  sheet,
  editor,
  selection,
  sel,
  SelectionNS,
  SelectionCtl,
  viewDef,
  dataArray,
  getRowCount,
  getColGeomFor,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  beginEditForKind,
  kindCtx,
  getCell,
  setCell,
  runModelTransaction,
  makeUndoConfig,
  isInteractionPhaseColumnActiveForRow,
  model,
  cloneValueForAssignment,
  getHorizontalTargetColumns,
  ensureVisible,
  render,
  updateSelectionSnapshot,
  getActiveView: getActiveViewState,
  getPaletteAPI: () => state.paletteAPI,
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
} = createPersistenceController({
  model,
  statusBar,
  clearHistory,
  resetAllViewState,
  sel,
  setActiveView: callSetActiveView,
  updateProjectNameWidget,
  setProjectNameFromFile,
  getSuggestedName,
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

// Initialize palette (handles both Outcome and End cells)
state.paletteAPI = initPalette({
  editor,
  sheet,
  getActiveView: getActiveViewState,
  viewDef,
  sel,
  model,
  setCell: setCellSelectionAware,
  render,
  getCellRect,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  endEdit,
  moveSelectionForTab: advanceSelectionAfterPaletteTab,
  moveSelectionForEnter: () => moveSel(1, 0, false),
});

const colorPickerAPI = initColorPicker({
  parent: editor?.parentElement || sheet,
  sheet,
  sel,
  getCellRect,
  getColorValue: (r, c) => cellValueToPlainText(getCell(r, c)),
  setColorValue: (r, c, v) => setCellSelectionAware(r, c, v),
  render,
  makeUndoConfig,
  beginUndoableTransaction,
});

// Adapter: unify palette entrypoints for refPick columns
if (!state.paletteAPI.openReference) {
  state.paletteAPI.openReference = ({ entity, target } = {}) => {
    try {
      if (entity === "outcome") {
        if (typeof state.paletteAPI.openOutcome === "function") {
          return !!state.paletteAPI.openOutcome(target);
        }
        if (typeof state.paletteAPI.openForCurrentCell === "function") {
          return !!state.paletteAPI.openForCurrentCell({
            r: target?.r,
            c: target?.c,
            initialText: target?.initialText,
            focusEditor: target?.focusEditor !== false,
          });
        }
        return false;
      }
      if (entity === "action" && typeof state.paletteAPI.openAction === "function")
        return !!state.paletteAPI.openAction(target);
      if (entity === "input" && typeof state.paletteAPI.openInput === "function")
        return !!state.paletteAPI.openInput(target);
    } catch (_) {
      /* noop */
    }
    return false; // fall back to text editor if no specific picker exists
  };
}

if (state.paletteAPI && colorPickerAPI) {
  const baseIsOpen =
    typeof state.paletteAPI.isOpen === "function"
      ? state.paletteAPI.isOpen.bind(state.paletteAPI)
      : () => false;
  if (typeof colorPickerAPI.openColor === "function")
    state.paletteAPI.openColor = colorPickerAPI.openColor;
  if (typeof colorPickerAPI.close === "function")
    state.paletteAPI.closeColor = colorPickerAPI.close;
  state.paletteAPI.isOpen = () => baseIsOpen() || !!colorPickerAPI.isOpen?.();
}

// Mouse
const disposeMouse = initGridMouse({
  cellsLayer,
  rowHdrs,
  sheet,
  editor,
  sel,
  selection,
  SelectionNS,
  SelectionCtl,
  isEditing,
  beginEdit,
  endEdit,
  render,
  ensureVisible,
  viewDef,
  isModColumn,
  dataArray,
  modIdFromKey,
  setCell,
  setModForSelection,
});

// Row drag-reorder on headers
const disposeDrag = initRowDrag({
  rowHdrs,
  sheet,
  dragLine,
  dataArray,
  getRowCount,
  ensureMinRows,
  clamp,
  selection,
  sel,
  clearSelection,
  SelectionNS,
  render,
  layout,
  runModelMutation,
  status: statusBar,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  isReorderableView: () =>
    state.activeView === "actions" ||
    state.activeView === "inputs" ||
    state.activeView === "modifiers" ||
    state.activeView === "outcomes",
  makeUndoConfig,
});

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
    tabs: { tabActions, tabInputs, tabModifiers, tabOutcomes, tabInteractions },
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

const disposeKeys = initGridKeys({
  // state & selectors
  isEditing,
  getActiveView: getActiveViewState,
  selection,
  sel,

  // DOM/controls
  editor,

  // grid APIs
  clearSelection,
  render,
  beginEdit,
  endEdit,
  moveSel,
  moveSelectionForTab,
  ensureVisible,

  viewDef,
  getRowCount,
  dataArray,
  isModColumn,
  modIdFromKey,
  setModForSelection,
  setCell,
  runModelTransaction,
  makeUndoConfig,

  // app-level actions
  cycleView,
  saveToDisk,
  openFromDisk,
  newProject,
  doGenerate,
  runSelfTests,
  deleteRows: deleteSelectedRows,
  clearCells: clearSelectedCells,
  addRowsAbove,
  addRowsBelow,

  // clipboard helpers
  model,
  getCellText: (r, c) => cellValueToPlainText(getCell(r, c)),
  getStructuredCell,
  applyStructuredCell,
  getCellCommentClipboardPayload,
  applyCellCommentClipboardPayload,
  status: statusBar,
  undo,
  redo,
  getPaletteAPI: () => state.paletteAPI,
  toggleInteractionsOutline: () => interactionsOutline?.toggle?.(),
  jumpToInteractionsAction: (delta) => interactionsOutline?.jumpToAction?.(delta),
  jumpToInteractionsVariant: (delta) =>
    interactionsOutline?.jumpToVariant?.(delta),
  toggleCommentsSidebar: () => state.commentsUI?.toggle?.(),
  toggleTagsSidebar: () => state.tagUI?.toggle?.(),
  openInferenceSidebar: () => state.toggleInteractionToolsPane?.(),
  acceptInferred: () => interactionActions?.acceptInferred?.(),
});

({
  sidePanelHost: state.sidePanelHost,
  commentsUI: state.commentsUI,
  tagManager: state.tagManager,
  tagUI: state.tagUI,
  interactionTools: state.interactionTools,
} = initSidebarControllers({
  dom: {
    sidePanel,
    sidePanelTitle,
    sidePanelCloseButton,
    commentPane,
    tagPane,
    tagForm,
    tagInput,
    tagSort,
    tagRenameButton,
    tagDeleteButton,
    tagList,
    tagEmpty,
    commentList,
    commentEmpty,
    commentEditor,
    commentTextarea,
    commentColorSelect,
    commentSaveButton,
    commentDeleteButton,
    commentCancelButton,
    commentSelectionLabel,
    commentPrevButton,
    commentNextButton,
    commentTabs,
    commentTabComments,
    commentTabCustomize,
    commentPageComments,
    commentPageCustomize,
    commentPaletteList,
    commentPaletteApply,
    commentPaletteReset,
    commentToggleButton,
    commentAddButton,
    tagToggleButton,
    interactionToolsPane,
    interactionToolsToggle,
    interactionAcceptButton,
    interactionClearButton,
    interactionUncertainButton,
  interactionUncertaintyValue,
  interactionSourceValue,
  interactionUncertaintyDefault,
  interactionUncertaintyDefaultValue,
  },
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

// Keyboard: Ctrl+Shift+A toggles Interactions mode
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
    e.preventDefault();
    toggleInteractionsMode();
  }
});

async function doGenerate() {
  rebuildActionColumnsFromModifiers(model);
  invalidateViewDef();
  const { actionsCount, inputsCount, pairsCount, capped, cappedActions } =
    buildInteractionsPairs(model);
  interactionsOutline?.refresh?.();
  setActiveView("interactions");
  sel.r = 0;
  sel.c = 0;
  layout();
  render();
  const genSummary =
    `Generated Interactions: ${actionsCount} actions × ${inputsCount} inputs = ${pairsCount} rows.` +
    (capped ? ` (Note: ${cappedActions} action(s) hit variant cap)` : "");
  statusBar?.set(genSummary);
}

// Project name widget & helpers
function setProjectNameFromFile(name) {
  const base = basenameNoExt(name);
  if (base) {
    model.meta.projectName = base;
    updateProjectNameWidget();
  }
}
function updateProjectNameWidget() {
  const w = projectNameEl;
  if (!w) return;
  if (w.value !== (model.meta?.projectName || ""))
    w.value = model.meta?.projectName || "";
  if (!w._bound) {
    w.addEventListener("input", () => {
      model.meta.projectName = w.value.trim();
    });
    w._bound = true;
  }
}
function getSuggestedName() {
  const n = String(model.meta.projectName || "").trim();
  return (n ? n : "project") + ".json";
}

// Initialize menus module (handles menu triggers & items)
state.menusAPI = initMenus({
  Ids,
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

// Row reorder (drag row headers)
function isReorderableView() {
  return (
    state.activeView === "actions" ||
    state.activeView === "inputs" ||
    state.activeView === "modifiers" ||
    state.activeView === "outcomes"
  );
}

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
  state.interactionTools?.destroy?.();
  state.commentsUI?.destroy?.();
  state.tagUI?.destroy?.();
  state.paletteAPI?.destroy?.();
  state.menusAPI?.destroy?.();
  state.toggleInteractionToolsPane = null;
}

export function initApp() {
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

initApp();
