// App.js - the core of Vibelister, containing imports, wiring and rendering.

// Imports
import { initGridKeys } from "../ui/grid-keys.js";
import { initGridMouse } from "../ui/grid-mouse.js";
import { initRowDrag } from "../ui/drag.js";
import { initMenus } from "../ui/menus.js";
import { initPalette } from "../ui/palette.js";
import { initColorPicker } from "../ui/color-picker.js";
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
} from "./interactions.js";
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
import { sanitizeModifierRulesAfterDeletion } from "../data/deletion.js";
import { createHistoryController } from "./history.js";
import {
  clamp,
  colWidths,
  colOffsets,
  visibleCols,
  visibleRows,
  parsePhaseKey,
  parsePhasesSpec,
  formatPhasesSpec,
  getPhaseLabel,
  basenameNoExt,
} from "../data/utils.js";
import { createEditingController } from "./editing-shortcuts.js";
import { createPersistenceController } from "./persistence.js";
import { createSettingsController } from "./settings-controller.js";
import { createGridCommands } from "./grid-commands.js";
onSelectionChanged(() => render());

function initA11y() {
  statusBar?.ensureLiveRegion();
}

// Core model + views
const model = {
  meta: { schema: SCHEMA_VERSION, projectName: "", interactionsMode: "AI" },
  actions: [],
  inputs: [],
  modifiers: [],
  outcomes: [],
  modifierGroups: [],
  modifierConstraints: [],
  notes: {},
  interactionsPairs: [],
  nextId: 1,
};

let activeView = "actions";
let paletteAPI = null;
let menusAPI = null;

// Grid & helpers
// Column geometry cache keyed by current columns reference
let _colGeomCache = { key: null, widths: null, offs: null, stamp: 0 };
function getColGeomFor(columns) {
  const key = columns || null;
  if (_colGeomCache.key === key && _colGeomCache.widths && _colGeomCache.offs)
    return _colGeomCache;
  const widths = colWidths(columns || []);
  const offs = colOffsets(widths);
  _colGeomCache = { key, widths, offs, stamp: (_colGeomCache.stamp | 0) + 1 };
  return _colGeomCache;
}
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
  makeUndoConfig,
  runModelMutation,
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
});

function isModColumn(c) {
  return !!c && typeof c.key === "string" && c.key.startsWith("mod:");
}
function modIdFromKey(k) {
  const s = String(k || "");
  const i = s.indexOf(":");
  return i >= 0 ? Number(s.slice(i + 1)) : NaN;
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

function setCell(r, c, v) {
  const vd = viewDef();
  const col = vd.columns[c];

  return runModelMutation(
    "setCell",
    () => {
      // Interactions: route by kind; default to meta-kind
      if (activeView === "interactions") {
        const k = String(col?.kind || "interactions");
        const ctx = kindCtx({ r, c, col, row: null, v });
        const wrote = setCellForKind(k, ctx, v);
        return {
          view: "interactions",
          changed: wrote !== false,
          ensuredRows: 0,
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
        setCellForKind(col.kind, kindCtx({ r, c, col, row, v }), v);
        changed = true;
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
      };
    },
    {
      layout: (res) => (res?.ensuredRows ?? 0) > 0,
      render: true,
    },
  );
}

// Deletion & regeneration helpers
function rebuildInteractionsInPlace() {
  // Rebuild pairs without changing the active view or selection
  buildInteractionsPairs(model);
}

function pruneNotesToValidPairs() {
  // Build the full set of valid base keys using the same composer as Interactions
  // (phase suffixes are intentionally omitted for pruning)
  const validBase = new Set();
  for (const p of model.interactionsPairs || []) {
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

const applyStructuredCell = makeApplyStructuredCell({
  viewDef,
  dataArray,
  applyStructuredForKind,
  kindCtx,
  getActiveView: () => activeView,
});

// Render
function layout() {
  const cols = viewDef().columns;
  const { widths } = getColGeomFor(cols);
  const totalW = widths.reduce((a, b) => a + b, 0),
    totalH = getRowCount() * ROW_HEIGHT;
  spacer.style.width = totalW + "px";
  spacer.style.height = totalH + "px";
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

  // clipboard helpers
  model,
  getCellText: (r, c) => getCell(r, c),
  getStructuredCell,
  applyStructuredCell,
  status: statusBar,
  undo,
  redo,
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
  HEADER_HEIGHT,
  ROW_HEIGHT,
  endEdit,
  moveSelectionForTab: advanceSelectionAfterPaletteTab,
});

const colorPickerAPI = initColorPicker({
  parent: editor?.parentElement || sheet,
  sheet,
  sel,
  getCellRect,
  getColorValue: (r, c) => getCell(r, c),
  setColorValue: (r, c, v) => setCellSelectionAware(r, c, v),
  render,
});

// Adapter: unify palette entrypoints for refPick columns
if (!paletteAPI.openReference) {
  paletteAPI.openReference = ({ entity, target }) => {
    try {
      if (entity === "outcome" && typeof paletteAPI.openOutcome === "function")
        return paletteAPI.openOutcome(target);
      if (entity === "action" && typeof paletteAPI.openAction === "function")
        return paletteAPI.openAction(target);
      if (entity === "input" && typeof paletteAPI.openInput === "function")
        return paletteAPI.openInput(target);
    } catch (_) {
      /* noop */
    }
    return undefined; // fall back to text editor if no specific picker exists
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

const DEFAULT_CELL_TEXT_COLOR = "#e6e6e6";

function normalizeColorValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

function parseHexColor(value) {
  const s = normalizeColorValue(value);
  if (!s || s[0] !== "#") return null;
  const hex = s.slice(1);
  if (hex.length !== 3 && hex.length !== 6) return null;
  const expand =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function channelToLinear(c) {
  const s = c / 255;
  if (s <= 0.03928) return s / 12.92;
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

function autoTextColor(background, fallback = DEFAULT_CELL_TEXT_COLOR) {
  const rgb = parseHexColor(background);
  if (!rgb) return fallback;
  const [r, g, b] = rgb;
  const L =
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b);
  return L > 0.5 ? "#000000" : "#ffffff";
}

function getEntityCollection(entity) {
  const key = String(entity || "").toLowerCase();
  if (key === "action") return model.actions || [];
  if (key === "input") return model.inputs || [];
  if (key === "modifier") return model.modifiers || [];
  if (key === "outcome") return model.outcomes || [];
  return null;
}

function getEntityColorsFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const bg = normalizeColorValue(row.color || row.color1 || "");
  const rawFg = normalizeColorValue(row.color2 || row.fontColor || "");
  const info = {};
  if (bg) info.background = bg;
  if (rawFg) info.foreground = rawFg;
  if (bg && !rawFg)
    info.foreground = autoTextColor(bg, DEFAULT_CELL_TEXT_COLOR);
  return Object.keys(info).length ? info : null;
}

function getEntityColors(entity, id) {
  if (id == null) return null;
  const arr = getEntityCollection(entity);
  if (!arr || !arr.length) return null;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  const row = arr.find((x) => (x?.id | 0) === (numId | 0));
  if (!row) return null;
  return getEntityColorsFromRow(row);
}

function computeColorPreviewForColorColumn(row, key) {
  if (!row || typeof row !== "object") return null;
  const value = normalizeColorValue(row[key]);
  if (!value) return null;
  const info = { title: value };
  if (String(key) === "color2") {
    info.foreground = value;
    const baseBg = normalizeColorValue(row.color);
    if (baseBg) info.background = baseBg;
  } else {
    info.background = value;
    const textColor = normalizeColorValue(row.color2);
    info.foreground =
      textColor || autoTextColor(value, DEFAULT_CELL_TEXT_COLOR);
    info.textOverride = "";
  }
  return info;
}

function computeCellColors(r, c, col, row) {
  if (!col) return null;
  const kind = String(col.kind || "").toLowerCase();
  if (kind === "color") {
    if (activeView === "interactions") return null;
    return computeColorPreviewForColorColumn(row, col.key);
  }

  if (activeView === "interactions") {
    const pair = model.interactionsPairs?.[r];
    if (!pair) return null;

    if (kind === "refro" || kind === "refpick") {
      const entityKey = String(col.entity || "").toLowerCase();
      let id = null;
      if (entityKey === "action") {
        const keyL = String(col.key || "").toLowerCase();
        if (
          keyL === "rhsaction" ||
          keyL === "rhsactionid" ||
          keyL === "rhsactionname"
        )
          id = pair.rhsActionId;
        else id = pair.aId;
      } else if (entityKey === "input") {
        id = pair.iId;
      }
      if (id == null) return null;
      return getEntityColors(col.entity, id);
    }

    if (kind === "interactions") {
      const pk = parsePhaseKey(col.key);
      if (!pk) return null;
      const note = model.notes?.[noteKeyForPair(pair, pk.p)] || {};
      if (pk.field === "outcome") {
        const info = getEntityColors("outcome", note.outcomeId);
        return info || null;
      }
      if (pk.field === "end") {
        const info = getEntityColors("action", note.endActionId);
        return info || null;
      }
      return null;
    }

    return null;
  }

  if (isModColumn(col)) {
    const modId = modIdFromKey(col.key);
    if (!Number.isFinite(modId)) return null;
    return getEntityColors("modifier", modId);
  }

  if (kind === "refro" || kind === "refpick") {
    const id = row?.[col.key];
    return getEntityColors(col.entity, id);
  }

  return null;
}

function applyCellColors(el, info) {
  if (!info) {
    el.style.background = "";
    el.style.color = "";
    return;
  }
  if (Object.prototype.hasOwnProperty.call(info, "background")) {
    el.style.background = info.background || "";
  } else {
    el.style.background = "";
  }
  if (Object.prototype.hasOwnProperty.call(info, "foreground")) {
    el.style.color = info.foreground || "";
  } else {
    el.style.color = "";
  }
}

function render() {
  updateSelectionSnapshot({ row: sel.r, col: sel.c });
  if (activeView === "interactions") {
    rebuildInteractionPhaseColumns();
  }
  const vw = sheet.clientWidth,
    vh = sheet.clientHeight;
  const sl = sheet.scrollLeft,
    st = sheet.scrollTop;

  // Use geometry cache keyed by current columns identity
  const cols = viewDef().columns;
  const { widths, offs } = getColGeomFor(cols);
  const vc = visibleCols(offs, sl, vw, cols.length),
    vr = visibleRows(st, vh, ROW_HEIGHT, getRowCount());

  colHdrs.style.transform = `translateX(${-sl}px)`;
  rowHdrs.style.transform = `translateY(${-st}px)`;

  // Column headers
  colHdrs.innerHTML = "";
  const hf = document.createDocumentFragment();
  for (let c = vc.start; c <= vc.end; c++) {
    const d = document.createElement("div");
    d.className = "hdr";
    d.style.left = offs[c] + "px";
    d.style.width = widths[c] + "px";
    d.style.top = "0px";
    const col = cols[c];
    const t = col.title;
    let tooltip = t;
    if (activeView === "interactions") {
      const mode = (model.meta && model.meta.interactionsMode) || "AI";
      tooltip = `${t} — Interactions Mode: ${mode}`;
    }
    d.textContent = t;
    d.title = tooltip;
    hf.appendChild(d);
  }
  colHdrs.appendChild(hf);

  // Row headers
  rowHdrs.innerHTML = "";
  const rf = document.createDocumentFragment();
  for (let r = vr.start; r <= vr.end; r++) {
    const d = document.createElement("div");
    d.className = "rhdr";
    const top = r * ROW_HEIGHT;
    d.style.top = top + "px";
    d.dataset.r = r;
    let label = String(r + 1);
    {
      const colsAll =
        (SelectionNS && SelectionNS.isAllCols && SelectionNS.isAllCols()) ||
        !!selection.colsAll;
      if (isRowSelected(r) && colsAll) label += " ↔";
    }
    d.textContent = label;
    if (isRowSelected(r)) {
      d.style.background = "#26344d";
      d.style.color = "#e6eefc";
    }
    rf.appendChild(d);
  }
  rowHdrs.appendChild(rf);

  // Cells — pooled rendering to avoid create/destroy churn
  const visibleColsCount = vc.end - vc.start + 1;
  const visibleRowsCount = vr.end - vr.start + 1;
  const need = visibleColsCount * visibleRowsCount;

  window.__cellPool = window.__cellPool || [];
  const cellPool = window.__cellPool;
  while (cellPool.length < need) {
    const d = document.createElement("div");
    d.className = "cell";
    cellsLayer.appendChild(d);
    cellPool.push(d);
  }
  for (let i = need; i < cellPool.length; i++) {
    const d = cellPool[i];
    if (d.style.display !== "none") d.style.display = "none";
  }

  const rows = activeView === "interactions" ? null : dataArray();
  let k = 0;
  for (let r = vr.start; r <= vr.end; r++) {
    const top = r * ROW_HEIGHT;
    const row = rows ? rows[r] : null;
    for (let c = vc.start; c <= vc.end; c++) {
      const left = offs[c],
        w = widths[c];
      const d = cellPool[k++];
      if (d.style.display !== "") d.style.display = "";
      d.style.left = left + "px";
      d.style.top = top + "px";
      d.style.width = w + "px";
      d.style.height = ROW_HEIGHT + "px";
      d.dataset.r = r;
      d.dataset.c = c;
      d.textContent = getCell(r, c);
      const col = cols[c];
      const colorInfo = computeCellColors(r, c, col, row);
      if (
        colorInfo &&
        Object.prototype.hasOwnProperty.call(colorInfo, "textOverride")
      )
        d.textContent = colorInfo.textOverride;
      applyCellColors(d, colorInfo);
      d.title = colorInfo && colorInfo.title ? colorInfo.title : "";
      if (r % 2 === 1) d.classList.add("alt");
      else d.classList.remove("alt");
      const isMultiSelection =
        (selection.rows && selection.rows.size > 1) ||
        (selection.cols && selection.cols.size > 1) ||
        !!selection.colsAll;
      let inRange = false;
      if (isMultiSelection) {
        const inRow = selection.rows && selection.rows.has(r);
        const inCol = selection.colsAll
          ? true
          : selection.cols && selection.cols.size
            ? selection.cols.has(c)
            : c === sel.c;
        inRange = !!(inRow && inCol);
      }
      if (inRange) d.classList.add("range-selected");
      else d.classList.remove("range-selected");
      if (r === sel.r && c === sel.c) d.classList.add("selected");
      else d.classList.remove("selected");
      d.style.opacity = "";
      if (activeView === "interactions") {
        const colKey = cols[c] && cols[c].key;
        if (colKey) {
          const s = String(colKey);
          const i = s.indexOf(":");
          if (s[0] === "p" && i > 1) {
            const pNum = Number(s.slice(1, i));
            const field = s.slice(i + 1);
            if (
              (field === "outcome" || field === "end") &&
              Number.isFinite(pNum)
            ) {
              const pair = model.interactionsPairs[r];
              if (pair) {
                const a = model.actions.find((x) => x.id === pair.aId);
                const ids = a && a.phases && a.phases.ids ? a.phases.ids : [];
                if (ids.length && ids.indexOf(pNum) === -1) {
                  d.style.opacity = "0.6";
                }
              }
            }
          }
        }
      }
    }
  }
}

function ensureVisible(r, c) {
  const { offs } = getColGeomFor(viewDef().columns);
  const vw = sheet.clientWidth,
    vh = sheet.clientHeight,
    cl = offs[c],
    cr = offs[c + 1],
    ct = r * ROW_HEIGHT,
    cb = ct + ROW_HEIGHT;
  if (cl < sheet.scrollLeft) sheet.scrollLeft = cl;
  if (cr > sheet.scrollLeft + vw) sheet.scrollLeft = cr - vw;
  if (ct < sheet.scrollTop) sheet.scrollTop = ct;
  if (cb > sheet.scrollTop + vh) sheet.scrollTop = cb - vh;
}

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

// Tests lazy-loader
function runSelfTests() {
  const start = performance.now();
  Promise.all([
    import("../data/variants/variants.js"),
    import("./interactions.js"),
    import("../support/tests/tests.js"),
    import("../support/tests/tests-ui.js").catch(() => ({ default: null })),
    import("../ui/grid-mouse.js"),
  ])
    .then(([v, inter, m, uiTests, ui]) => {
      const api = {
        // core data
        model,
        ensureSeedRows,
        // variants / views
        buildInteractionsPairs: v.buildInteractionsPairs,
        rebuildActionColumnsFromModifiers,
        VIEWS,
        setActiveView,
        // cells
        setCell,
        // interactions helpers
        noteKeyForPair: inter.noteKeyForPair,
        getInteractionsCell: inter.getInteractionsCell,
        setInteractionsCell: inter.setInteractionsCell,
        getStructuredCellInteractions: inter.getStructuredCellInteractions,
        applyStructuredCellInteractions: inter.applyStructuredCellInteractions,
      };

      // Run model-level tests
      try {
        const run = m.runSelfTests || m.default;
        if (typeof run === "function") run(api);
      } catch (err) {
        console.error("[tests] runSelfTests(model) failed:", err);
      }

      // Run UI interaction tests if present
      try {
        const runUi =
          (uiTests && (uiTests.runUiTests || uiTests.default)) || null;
        if (runUi && typeof runUi === "function") runUi(ui);
      } catch (err) {
        console.error("[tests] runUiTests failed:", err);
      }

      const ms = Math.round(performance.now() - start);
      statusBar?.set(`Self-tests executed in ${ms} ms`);
    })
    .catch((err) => {
      console.error("Failed to load tests", err);
      statusBar?.set("Self-tests failed to load.");
    });
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
