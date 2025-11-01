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
import { initCommentsUI } from "../ui/comments.js";
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
} from "./interactions.js";
import { setCommentInactive } from "./comments.js";
import { emitCommentChangeEvent } from "./comment-events.js";
import {
  UI,
  PHASE_CAP,
  MOD,
  MIN_ROWS,
  Ids,
  SCHEMA_VERSION,
  ROW_HEIGHT,
  HEADER_HEIGHT,
} from "../data/constants.js";
import { makeRow, insertBlankRows } from "../data/rows.js";
import { createEmptyCommentMap } from "../data/comments.js";
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

function initA11y() {
  statusBar?.ensureLiveRegion();
}

// Core model + views
const model = {
  meta: {
    schema: SCHEMA_VERSION,
    projectName: "",
    interactionsMode: "AI",
    columnWidths: {},
    commentFilter: { viewKey: "actions" },
  },
  actions: [],
  inputs: [],
  modifiers: [],
  outcomes: [],
  modifierGroups: [],
  modifierConstraints: [],
  notes: {},
  comments: createEmptyCommentMap(),
  interactionsPairs: [],
  interactionsIndex: { mode: "AI", groups: [] },
  nextId: 1,
};

let activeView = "actions";
let paletteAPI = null;
let menusAPI = null;

// Grid & helpers
const sheet = document.getElementById("sheet"),
  cellsLayer = document.getElementById("cells"),
  spacer = document.getElementById("spacer"),
  colHdrs = document.getElementById("colHdrs"),
  rowHdrs = document.getElementById("rowHdrs"),
  editor = document.getElementById("editor"),
  statusEl = document.getElementById("status"),
  dragLine = document.getElementById("dragLine");
const projectNameEl = document.getElementById(Ids.projectName);
const undoMenuItem = document.getElementById(Ids.editUndo);
const redoMenuItem = document.getElementById(Ids.editRedo);
const commentToggleButton = document.getElementById(Ids.commentToggle);
const commentAddButton = document.getElementById(Ids.commentAdd);
const commentSidebar = document.getElementById(Ids.commentSidebar);
const commentCloseButton = document.getElementById(Ids.commentClose);
const commentList = document.getElementById(Ids.commentList);
const commentEmpty = document.getElementById(Ids.commentEmpty);
const commentEditor = document.getElementById(Ids.commentEditor);
const commentTextarea = document.getElementById(Ids.commentText);
const commentColorSelect = document.getElementById(Ids.commentColor);
const commentSaveButton = document.getElementById(Ids.commentSave);
const commentDeleteButton = document.getElementById(Ids.commentDelete);
const commentCancelButton = document.getElementById(Ids.commentCancel);
const commentSelectionLabel = document.getElementById(Ids.commentSelection);
const commentPrevButton = document.getElementById(Ids.commentPrev);
const commentNextButton = document.getElementById(Ids.commentNext);
const statusBar = initStatusBar(statusEl, { historyLimit: 100 });

const { openSettingsDialog } = createSettingsController({ statusBar });

const viewState = createViewStateController({
  getActiveView: () => activeView,
  model,
  VIEWS,
  buildInteractionPhaseColumns,
  Selection,
  MIN_ROWS,
  MOD,
  statusBar,
  getPaletteAPI: () => paletteAPI,
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
  getActiveView: () => activeView,
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
});

onSelectionChanged(() => render());

const interactionsOutline = createInteractionsOutline({
  model,
  Selection,
  SelectionCtl,
  sel,
  getActiveView: () => activeView,
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
  getActiveView: () => activeView,
  setActiveView,
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
  getActiveView: () => activeView,
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

const commentsUI = initCommentsUI({
  toggleButton: commentToggleButton,
  addButton: commentAddButton,
  sidebar: commentSidebar,
  closeButton: commentCloseButton,
  listElement: commentList,
  emptyElement: commentEmpty,
  editorForm: commentEditor,
  textarea: commentTextarea,
  colorSelect: commentColorSelect,
  saveButton: commentSaveButton,
  deleteButton: commentDeleteButton,
  cancelButton: commentCancelButton,
  prevButton: commentPrevButton,
  nextButton: commentNextButton,
  selectionLabel: commentSelectionLabel,
  SelectionCtl,
  selection,
  sel,
  onSelectionChanged,
  getCellComments,
  setCellComment,
  deleteCellComment,
  getActiveView: () => activeView,
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
});

initColumnResize({
  container: colHdrs,
  model,
  getActiveView: () => activeView,
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
  if (activeView === "interactions") {
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
      if (activeView === "interactions") {
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
      } else if (activeView === "actions" && col?.key === "phases") {
        const before = row?.phases;
        row.phases = parsePhasesSpec(v);
        changed = changed || before !== row?.phases;
      } else if (col?.key) {
        const before = row[col.key];
        if (before !== v) changed = true;
        row[col.key] = v;
      }

      return {
        view: activeView,
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
  getActiveView: () => activeView,
  isCanonical: isCanonicalStructuredPayload,
});

const baseApplyStructuredCell = makeApplyStructuredCell({
  viewDef,
  dataArray,
  applyStructuredForKind,
  kindCtx,
  getActiveView: () => activeView,
});

function applyStructuredCell(r, c, payload) {
  const vd = viewDef();
  if (!vd) return false;
  const col = vd.columns?.[c];
  const arr = dataArray();
  const row = Array.isArray(arr) ? arr[r] : null;
  let wasBypassed = null;
  if (activeView !== "interactions" && col?.kind === "modState" && row) {
    wasBypassed = isModStateBypassed(row, col);
  }
  const applied = baseApplyStructuredCell(r, c, payload);
  if (
    applied &&
    activeView !== "interactions" &&
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
  getActiveView: () => activeView,
  getPaletteAPI: () => paletteAPI,
});

const {
  beginEdit,
  endEdit,
  endEditIfOpen,
  moveSel,
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
  setActiveView,
  updateProjectNameWidget,
  setProjectNameFromFile,
  getSuggestedName,
  closeMenus: () => menusAPI?.closeAllMenus?.(),
  onModelReset: () => interactionsOutline?.refresh?.(),
});

const { runSelfTests } = createDiagnosticsController({
  model,
  statusBar,
  ensureSeedRows,
  rebuildActionColumnsFromModifiers,
  VIEWS,
  setActiveView,
  setCell,
});

const disposeKeys = initGridKeys({
  // state & selectors
  isEditing,
  getActiveView: () => activeView,
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
  getPaletteAPI: () => paletteAPI,
  toggleInteractionsOutline: () => interactionsOutline?.toggle?.(),
  jumpToInteractionsAction: (delta) => interactionsOutline?.jumpToAction?.(delta),
  jumpToInteractionsVariant: (delta) =>
    interactionsOutline?.jumpToVariant?.(delta),
  toggleCommentsSidebar: () => commentsUI?.toggle?.(),
});

// Initialize palette (handles both Outcome and End cells)
paletteAPI = initPalette({
  editor,
  sheet,
  getActiveView: () => activeView,
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
if (!paletteAPI.openReference) {
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
    return false; // fall back to text editor if no specific picker exists
  };
}

if (paletteAPI && colorPickerAPI) {
  const baseIsOpen =
    typeof paletteAPI.isOpen === "function"
      ? paletteAPI.isOpen.bind(paletteAPI)
      : () => false;
  if (typeof colorPickerAPI.openColor === "function")
    paletteAPI.openColor = colorPickerAPI.openColor;
  if (typeof colorPickerAPI.close === "function")
    paletteAPI.closeColor = colorPickerAPI.close;
  paletteAPI.isOpen = () => baseIsOpen() || !!colorPickerAPI.isOpen?.();
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
    activeView === "actions" ||
    activeView === "inputs" ||
    activeView === "modifiers" ||
    activeView === "outcomes",
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
const tabActions = document.getElementById(Ids.tabActions),
  tabInputs = document.getElementById(Ids.tabInputs),
  tabModifiers = document.getElementById(Ids.tabModifiers),
  tabOutcomes = document.getElementById(Ids.tabOutcomes),
  tabInteractions = document.getElementById(Ids.tabInteractions);
function setActiveView(key) {
  endEditIfOpen(true);
  // Save state of current view before switching
  saveCurrentViewState({ sel, sheet });
  clearSelection();
  if (!(key in VIEWS)) return;
  activeView = key;
  interactionsOutline?.setActive?.(key === "interactions");
  invalidateViewDef();
  if (key === "actions") {
    rebuildActionColumnsFromModifiers(model);
    invalidateViewDef();
  }
  if (key === "interactions") {
    rebuildInteractionsInPlace();
    rebuildInteractionPhaseColumns();
  }
  if (tabActions) {
    tabActions.classList.toggle("active", key === "actions");
    tabActions.setAttribute("aria-selected", String(key === "actions"));
  }
  if (tabInputs) {
    tabInputs.classList.toggle("active", key === "inputs");
    tabInputs.setAttribute("aria-selected", String(key === "inputs"));
  }
  if (tabModifiers) {
    tabModifiers.classList.toggle("active", key === "modifiers");
    tabModifiers.setAttribute("aria-selected", String(key === "modifiers"));
  }
  if (tabOutcomes) {
    tabOutcomes.classList.toggle("active", key === "outcomes");
    tabOutcomes.setAttribute("aria-selected", String(key === "outcomes"));
  }
  if (tabInteractions) {
    tabInteractions.classList.toggle("active", key === "interactions");
    tabInteractions.setAttribute(
      "aria-selected",
      String(key === "interactions"),
    );
  }
  // Restore saved state (row/col/scroll) for the new view
  const st = restoreViewState(key);
  sel.r = clamp(st.row ?? sel.r, 0, Math.max(0, getRowCount() - 1));
  sel.c = clamp(st.col ?? sel.c, 0, Math.max(0, viewDef().columns.length - 1));
  selection.rows.clear();
  selection.rows.add(sel.r);
  selection.anchor = sel.r;

  layout();
  // Restore scrollTop after layout so spacer height is valid
  if (typeof st.scrollTop === "number") sheet.scrollTop = st.scrollTop;
  render();
  commentsUI?.refresh?.();
  const modeLabel =
    key === "interactions" ? ` [${model.meta?.interactionsMode || "AI"}]` : "";
  statusBar?.set(`View: ${viewDef().title}${modeLabel}`);
  menusAPI?.updateViewMenuRadios?.(key);
}
if (tabActions) tabActions.onclick = () => setActiveView("actions");
if (tabInputs) tabInputs.onclick = () => setActiveView("inputs");
if (tabModifiers) tabModifiers.onclick = () => setActiveView("modifiers");
if (tabOutcomes) tabOutcomes.onclick = () => setActiveView("outcomes");
if (tabInteractions)
  tabInteractions.onclick = () => setActiveView("interactions");

// Simple global toggle for Interactions mode (AI ↔ AA)
function toggleInteractionsMode() {
  const cur = (model.meta && model.meta.interactionsMode) || "AI";
  model.meta.interactionsMode = cur === "AI" ? "AA" : "AI";
  invalidateViewDef();
  if (activeView === "interactions") {
    rebuildInteractionsInPlace();
    rebuildInteractionPhaseColumns();
    layout();
    render();
    statusBar?.set(`Interactions mode: ${model.meta.interactionsMode}`);
  } else {
    statusBar?.set(`Interactions mode set to ${model.meta.interactionsMode}`);
  }
}

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
menusAPI = initMenus({
  Ids,
  setActiveView,
  newProject,
  openFromDisk,
  saveToDisk,
  doGenerate,
  runSelfTests,
  model,
  openSettings: openSettingsDialog,
  addRowsAbove,
  addRowsBelow,
  clearCells: () => clearSelectedCells({}),
  deleteRows: () => deleteSelectedRows({ reason: "menu" }),
  undo,
  redo,
  getUndoState,
});

// View order helpers
function getViewOrder() {
  const map = {
      [Ids.tabActions]: "actions",
      [Ids.tabInputs]: "inputs",
      [Ids.tabModifiers]: "modifiers",
      [Ids.tabOutcomes]: "outcomes",
      [Ids.tabInteractions]: "interactions",
    },
    btns = document.querySelectorAll(".tabs .tab"),
    order = [];
  btns.forEach((b) => {
    const k = map[b.id];
    if (k && VIEWS[k]) order.push(k);
  });
  return order.length ? order : Object.keys(VIEWS);
}
function cycleView(d) {
  const ord = getViewOrder(),
    i = Math.max(0, ord.indexOf(activeView)),
    next = (i + d + ord.length) % ord.length;
  setActiveView(ord[next]);
}

// Row reorder (drag row headers)
function isReorderableView() {
  return (
    activeView === "actions" ||
    activeView === "inputs" ||
    activeView === "modifiers" ||
    activeView === "outcomes"
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
  closeAllMenus: menusAPI.closeAllMenus,
  updateViewMenuRadios: menusAPI.updateViewMenuRadios,
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

// Boot
if (!sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "0");
initA11y();
ensureSeedRows();
layout();
render();
new ResizeObserver(() => render()).observe(sheet);
setActiveView("actions");
updateProjectNameWidget();
if (location.hash.includes("test")) runSelfTests();
