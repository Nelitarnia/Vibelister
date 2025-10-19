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
  DEFAULT_OUTCOMES,
  SCHEMA_VERSION,
  ROW_HEIGHT,
  HEADER_HEIGHT,
} from "../data/constants.js";
import { makeRow, insertBlankRows } from "../data/rows.js";
import { sanitizeModifierRulesAfterDeletion } from "../data/deletion.js";
import { makeMutationRunner } from "../data/mutation-runner.js";
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

// Per-view UI state
const perViewState = {
  actions: { row: 0, col: 0, scrollTop: 0 },
  inputs: { row: 0, col: 0, scrollTop: 0 },
  modifiers: { row: 0, col: 0, scrollTop: 0 },
  outcomes: { row: 0, col: 0, scrollTop: 0 },
  interactions: { row: 0, col: 0, scrollTop: 0 },
};
function saveCurrentViewState() {
  const s = perViewState[activeView];
  if (!s) return;
  s.row = sel.r | 0;
  s.col = sel.c | 0;
  s.scrollTop = sheet.scrollTop | 0;
}
function restoreViewState(key) {
  const s = perViewState[key];
  if (!s) return { row: 0, col: 0, scrollTop: 0 };
  return s;
}

function rebuildInteractionPhaseColumns() {
  VIEWS.interactions.columns = buildInteractionPhaseColumns(
    model,
    Selection && Selection.cell ? Selection.cell.r : 0,
  );
  invalidateViewDef();
}

function kindCtx({ r, c, col, row, v } = {}) {
  return {
    r,
    c,
    v,
    col,
    row,
    model,
    viewDef,
    activeView,
    MOD,
    status: statusBar,
    paletteAPI,
    parsePhasesSpec,
    formatPhasesSpec,
    getInteractionsCell,
    setInteractionsCell,
    getStructuredCellInteractions,
    applyStructuredCellInteractions,
    wantPalette:
      activeView === "interactions" && paletteAPI?.wantsToHandleCell?.(),
  };
}

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
const statusBar = initStatusBar(statusEl, { historyLimit: 100 });

const { runModelMutation } = makeMutationRunner({
  model,
  rebuildActionColumnsFromModifiers,
  rebuildInteractionsInPlace,
  pruneNotesToValidPairs,
  invalidateViewDef,
  layout,
  render,
  status: statusBar,
});

const SETTINGS_STORAGE_KEY = "vl.userSettings";
const SETTINGS_FILE_NAME = "vibelister-settings.json";
const SETTINGS_FILE_KIND = "vibelister.settings";
const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_COLOR_KEYS = [
  "background",
  "toolbar",
  "text",
  "accent",
  "cell",
  "cellAlt",
];
const DEFAULT_UI_SETTINGS = {
  meta: { kind: SETTINGS_FILE_KIND, version: SETTINGS_SCHEMA_VERSION },
  colors: {
    background: "#0F1115",
    toolbar: "#141822",
    text: "#E6E6E6",
    accent: "#273152",
    cell: "#11151F",
    cellAlt: "#121826",
  },
};

function normalizeHexColor(raw, fallback) {
  if (!raw) return fallback;
  let s = String(raw).trim();
  if (!s) return fallback;
  if (s.startsWith("#")) s = s.slice(1);
  s = s.replace(/[^0-9a-fA-F]/g, "");
  if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
  if (s.length !== 6) return fallback;
  return "#" + s.toUpperCase();
}

function sanitizeUiSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const colors = src.colors && typeof src.colors === "object" ? src.colors : {};
  const meta = src.meta && typeof src.meta === "object" ? src.meta : {};
  const defaults = DEFAULT_UI_SETTINGS.colors;
  return {
    meta: {
      kind: SETTINGS_FILE_KIND,
      version: Number.isFinite(meta.version)
        ? meta.version | 0
        : SETTINGS_SCHEMA_VERSION,
    },
    colors: {
      background: normalizeHexColor(colors.background, defaults.background),
      toolbar: normalizeHexColor(colors.toolbar, defaults.toolbar),
      text: normalizeHexColor(colors.text, defaults.text),
      accent: normalizeHexColor(colors.accent, defaults.accent),
      cell: normalizeHexColor(colors.cell, defaults.cell),
      cellAlt: normalizeHexColor(colors.cellAlt, defaults.cellAlt),
    },
  };
}

function isLikelySettingsPayload(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.meta && typeof raw.meta === "object") {
    if (raw.meta.kind === SETTINGS_FILE_KIND) return true;
  }
  const colors = raw.colors && typeof raw.colors === "object" ? raw.colors : null;
  if (!colors) return false;
  return SETTINGS_COLOR_KEYS.some((key) => typeof colors[key] === "string");
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings || {}));
}

function applySanitizedSettings(settings) {
  const root = document.documentElement;
  if (!root) return;
  const colors = (settings && settings.colors) || {};
  root.style.setProperty("--vl-color-background", colors.background);
  root.style.setProperty("--vl-color-toolbar", colors.toolbar);
  root.style.setProperty("--vl-color-text", colors.text);
  root.style.setProperty("--vl-color-accent", colors.accent);
  root.style.setProperty("--vl-color-cell", colors.cell);
  root.style.setProperty("--vl-color-cell-alt", colors.cellAlt);
}

function persistUserSettings(settings) {
  try {
    window.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

function loadStoredSettings() {
  try {
    const raw = window.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return sanitizeUiSettings(parsed);
    }
  } catch (_) {}
  return sanitizeUiSettings(DEFAULT_UI_SETTINGS);
}

function setUserSettings(next) {
  const sanitized = sanitizeUiSettings(next);
  applySanitizedSettings(sanitized);
  persistUserSettings(sanitized);
  return sanitized;
}

let userSettings = loadStoredSettings();
applySanitizedSettings(userSettings);

async function saveSettingsToDisk(settings, { as = false } = {}) {
  const data = sanitizeUiSettings(settings || userSettings);
  try {
    const m = await import("../data/fs.js");
    const { name } = await m.saveJson(data, {
      as,
      suggestedName: SETTINGS_FILE_NAME,
      handleKey: "settings",
    });
    statusBar?.set(as ? `Settings saved as: ${name}` : `Settings saved: ${name}`);
    return { name, data };
  } catch (e) {
    if (e?.name === "AbortError") {
      statusBar?.set("Settings save cancelled.");
    } else {
      statusBar?.set("Save settings failed: " + (e?.message || e));
    }
    return null;
  }
}

async function loadSettingsFromDisk() {
  try {
    const m = await import("../data/fs.js");
    const { data, name } = await m.openJson({ handleKey: "settings" });
    if (!isLikelySettingsPayload(data)) {
      m.forgetHandle?.("settings");
      statusBar?.set("Not a valid settings file.");
      return null;
    }
    userSettings = setUserSettings(data);
    statusBar?.set(`Settings loaded: ${name}`);
    return userSettings;
  } catch (e) {
    if (e?.name === "AbortError") {
      statusBar?.set("Settings load cancelled.");
    } else {
      statusBar?.set("Load settings failed: " + (e?.message || e));
    }
    return null;
  }
}

async function openSettingsDialog() {
  try {
    const mod = await import("../ui/settings.js");
    await mod.openSettingsDialog({
      settings: cloneSettings(userSettings),
      defaults: sanitizeUiSettings(DEFAULT_UI_SETTINGS),
      onApply(settings) {
        userSettings = setUserSettings(settings);
        return cloneSettings(userSettings);
      },
      onReset() {
        userSettings = setUserSettings(DEFAULT_UI_SETTINGS);
        return cloneSettings(userSettings);
      },
      onSave(settings, opts = {}) {
        return saveSettingsToDisk(settings, opts);
      },
      onLoad: async () => {
        const loaded = await loadSettingsFromDisk();
        return loaded ? cloneSettings(loaded) : null;
      },
    });
  } catch (e) {
    statusBar?.set("Open settings failed: " + (e?.message || e));
  }
}

function getCellRect(r, c) {
  const vd = viewDef();
  const cols = vd?.columns || [];
  if (!Number.isFinite(r) || !Number.isFinite(c))
    return { left: 0, top: 0, width: 0, height: ROW_HEIGHT };
  if (c < 0 || c >= cols.length)
    return { left: 0, top: 0, width: 0, height: ROW_HEIGHT };
  const geom = getColGeomFor(cols);
  const sheetLeft = sheet ? sheet.offsetLeft || 0 : 0;
  const sheetTop = sheet ? sheet.offsetTop || HEADER_HEIGHT : HEADER_HEIGHT;
  const left = sheetLeft + ((geom.offs?.[c] ?? 0) - sheet.scrollLeft);
  const top = sheetTop + r * ROW_HEIGHT - sheet.scrollTop;
  const width = geom.widths?.[c] ?? 0;
  return { left, top, width, height: ROW_HEIGHT };
}

let editing = false;
let shiftPressed = false;
let lastShiftTap = 0;
const DOUBLE_SHIFT_WINDOW_MS = 350;

function isEditableTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return !!el.isContentEditable;
}

// Global outside-click (capture) handler to commit the editor once per page load
document.addEventListener(
  "mousedown",
  (e) => {
    if (!editing) return;
    const inSheet = !!(
      sheet &&
      (e.target === sheet || sheet.contains(e.target))
    );
    if (inSheet) return;
    try {
      if (paletteAPI?.isOpen?.()) return;
    } catch (_) {}
    if (e.target === editor) return;
    endEdit(true);
  },
  true,
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Shift") {
      const target = e.target;
      const inEditable = isEditableTarget(target);
      if (!shiftPressed && !editing && !inEditable) {
        const now = Date.now();
        if (lastShiftTap && now - lastShiftTap <= DOUBLE_SHIFT_WINDOW_MS) {
          SelectionCtl.toggleHorizontalMode?.();
          lastShiftTap = 0;
        }
      }
      shiftPressed = true;
    }
  },
  true,
);

document.addEventListener(
  "keyup",
  (e) => {
    if (e.key === "Shift") {
      shiftPressed = false;
      const target = e.target;
      const inEditable = isEditableTarget(target);
      lastShiftTap = !editing && !inEditable ? Date.now() : 0;
    }
  },
  true,
);

window.addEventListener("blur", () => {
  shiftPressed = false;
  lastShiftTap = 0;
});

function dataArray() {
  if (activeView === "actions") return model.actions;
  if (activeView === "inputs") return model.inputs;
  if (activeView === "modifiers") return model.modifiers;
  if (activeView === "outcomes") return model.outcomes;
  return [];
}

// Cache viewDef result to avoid recomputation within a render/layout pass
let cachedViewDef = null;
let cachedViewKey = null;
let cachedViewColumns = null;
let cachedInteractionsMode = null;

function viewDef() {
  const base = VIEWS[activeView];
  if (!base) return base;
  const mode = String(model.meta?.interactionsMode || "AI").toUpperCase();
  const columns = base.columns;

  if (
    cachedViewDef &&
    cachedViewKey === activeView &&
    cachedViewColumns === columns &&
    (activeView !== "interactions" || cachedInteractionsMode === mode)
  ) {
    return cachedViewDef;
  }

  let result = base;
  if (activeView === "interactions") {
    const cols = Array.isArray(columns)
      ? columns.filter((col) => {
          if (!col || col.hiddenWhen == null) return true;
          const h = col.hiddenWhen;
          if (Array.isArray(h)) {
            const H = h.map((x) => String(x).toUpperCase());
            return !H.includes(mode);
          }
          return String(h).toUpperCase() !== mode;
        })
      : columns;
    result = { ...base, columns: cols };
  }

  cachedViewDef = result;
  cachedViewKey = activeView;
  cachedViewColumns = columns;
  cachedInteractionsMode = mode;
  return result;
}

function invalidateViewDef() {
  cachedViewDef = null;
  cachedViewKey = null;
  cachedViewColumns = null;
  cachedInteractionsMode = null;
}
function isModColumn(c) {
  return !!c && typeof c.key === "string" && c.key.startsWith("mod:");
}
function modIdFromKey(k) {
  const s = String(k || "");
  const i = s.indexOf(":");
  return i >= 0 ? Number(s.slice(i + 1)) : NaN;
}

// User-defined modifier order (row order in Modifiers view)
function getRowCount() {
  if (activeView === "interactions") {
    const len = model.interactionsPairs ? model.interactionsPairs.length : 0;
    return Math.max(len + 1, MIN_ROWS.interactionsBase);
  }
  const len = dataArray().length;
  return Math.max(len + MIN_ROWS.pad, MIN_ROWS.floor);
}

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

  // Interactions: route by kind; default to meta-kind
  if (activeView === "interactions") {
    const k = String(col?.kind || "interactions");
    const ctx = kindCtx({ r, c, col, row: null, v });
    setCellForKind(k, ctx, v);
    return;
  }

  // Non-Interactions: ensure row exists
  const arr = dataArray();
  while (arr.length <= r) arr.push(makeRow(model));
  const row = arr[r];

  // Kind-backed columns
  if (col && col.kind) {
    setCellForKind(col.kind, kindCtx({ r, c, col, row, v }), v);
    return;
  }

  // Actions: phases parser
  if (activeView === "actions" && col?.key === "phases") {
    row.phases = parsePhasesSpec(v);
    return;
  }

  // Default assignment (defensive)
  if (col?.key) row[col.key] = v;
}

function cloneValueForAssignment(value) {
  if (!value || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (_) {}
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    if (Array.isArray(value)) return value.slice();
    return { ...value };
  }
}

function columnsHorizontallyCompatible(sourceCol, targetCol, viewKey) {
  if (!targetCol) return false;
  if (sourceCol === targetCol) return true;
  if (viewKey === "interactions") {
    const sourcePk = parsePhaseKey(sourceCol?.key);
    const targetPk = parsePhaseKey(targetCol?.key);
    if (sourcePk && targetPk) return sourcePk.field === targetPk.field;
    if (sourceCol?.key === "notes" && targetCol?.key === "notes") return true;
    return false;
  }
  const sourceKind = sourceCol?.kind;
  const targetKind = targetCol?.kind;
  if (sourceKind && targetKind && String(sourceKind) === String(targetKind)) return true;
  if (
    sourceCol?.key != null &&
    targetCol?.key != null &&
    String(sourceCol.key) === String(targetCol.key)
  )
    return true;
  return false;
}

function getHorizontalTargetColumns(colIndex) {
  const vd = viewDef();
  const cols = vd?.columns || [];
  const sourceCol = cols[colIndex];
  if (!sourceCol) return [];
  const out = [];
  for (let i = 0; i < cols.length; i++) {
    if (columnsHorizontallyCompatible(sourceCol, cols[i], activeView)) out.push(i);
  }
  return out;
}

// Exact-set helper for modifier columns across a selection
function setModForSelection(colIndex, target) {
  const col = viewDef().columns[colIndex];
  if (!isModColumn(col)) return;
  const arr = dataArray();
  const rows =
    selection.rows.size > 1
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [sel.r];
  runModelMutation(
    "setModForSelection",
    () => {
      // Determine the next state from the active row using the kind handler
      let next;
      {
        const r0 = sel.r;
        while (arr.length <= r0) arr.push(makeRow(model));
        const row0 = arr[r0];
        if (!row0.modSet || typeof row0.modSet !== "object") row0.modSet = {};
        // If undefined → cycle; boolean → ON/OFF; number → clamp handled by kind
        next = target;
      }
      for (const r of rows) {
        while (arr.length <= r) arr.push(makeRow(model));
        const row = arr[r];
        if (!row.modSet || typeof row.modSet !== "object") row.modSet = {};
        setCellForKind(
          "modTriState",
          kindCtx({ r, c: colIndex, col, row, v: next }),
          next,
        );
      }
      return { rowsUpdated: rows.length };
    },
    { render: true },
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
function addRows(where) {
  if (activeView === "interactions") {
    statusBar?.set("Row insertion is not available in Interactions view.");
    return;
  }

  const arr = dataArray();
  if (!arr) return;

  const rows = selection.rows.size
    ? Array.from(selection.rows).sort((a, b) => a - b)
    : [Number.isFinite(sel.r) ? sel.r : 0];
  const count = rows.length;
  if (!count) return;

  const normalized = rows
    .map((r) => (Number.isFinite(r) ? r : 0))
    .map((r) => (r < 0 ? 0 : r));
  const minRow = normalized.reduce(
    (min, r) => (r < min ? r : min),
    normalized[0] ?? 0,
  );
  const maxRow = normalized.reduce(
    (max, r) => (r > max ? r : max),
    normalized[0] ?? 0,
  );

  let insertIndex = where === "above" ? minRow : maxRow + 1;
  insertIndex = Math.max(0, Math.min(insertIndex, arr.length));

  const whereWord = where === "above" ? "above" : "below";

  runModelMutation(
    "addRows",
    () => {
      insertBlankRows(model, arr, insertIndex, count);
      return {
        insertIndex,
        count,
        whereWord,
        requiresModifiersRebuild: activeView === "modifiers" && count > 0,
      };
    },
    {
      rebuildActionColumns: (res) => res?.requiresModifiersRebuild,
      rebuildInteractions: true,
      pruneNotes: true,
      after: (res) => {
        const cols = viewDef().columns || [];
        const targetCol = cols.length
          ? Math.max(0, Math.min(sel.c ?? 0, cols.length - 1))
          : 0;

        SelectionCtl.startSingle(res.insertIndex, targetCol);
        if (res.count > 1)
          SelectionCtl.extendRowsTo(res.insertIndex + res.count - 1);
        SelectionCtl.clearAllColsFlag?.();
      },
      layout: true,
      render: true,
      status: (res) => {
        const noun = res.count === 1 ? "row" : "rows";
        return `Inserted ${res.count} ${noun} ${res.whereWord} selection.`;
      },
    },
  );
}

function addRowsAbove() {
  addRows("above");
}

function addRowsBelow() {
  addRows("below");
}

function clearSelectedCells(options = {}) {
  const { mode: requestedMode, reason } = options || {};

  if (activeView === "interactions") {
    const mode =
      requestedMode ||
      (SelectionNS.isAllCols && SelectionNS.isAllCols()
        ? "clearAllEditable"
        : "clearActiveCell");
    const extras =
      reason === "deleteAttempt" || reason === "menu"
        ? { statusHint: "Interactions are generated; rows can't be deleted." }
        : undefined;
    clearInteractionsSelection(
      model,
      viewDef(),
      selection,
      sel,
      mode,
      statusBar,
      render,
      extras,
    );
    if (mode === "clearAllEditable" && SelectionNS.setColsAll)
      SelectionNS.setColsAll(false);
    return;
  }

  const arr = dataArray();
  if (!arr || !arr.length) {
    if (statusBar?.set) statusBar.set("Nothing to clear.");
    else if (statusBar) statusBar.textContent = "Nothing to clear.";
    return;
  }

  const rows =
    selection.rows.size > 0
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [sel.r];
  const vd = viewDef();
  let colsToClear;
  if (selection.colsAll) colsToClear = vd.columns.map((_, idx) => idx);
  else if (selection.cols && selection.cols.size)
    colsToClear = Array.from(selection.cols).sort((a, b) => a - b);
  else colsToClear = [sel.c];

  colsToClear = colsToClear.filter(
    (c) => Number.isFinite(c) && c >= 0 && c < vd.columns.length,
  );

  runModelMutation(
    "clearSelectedCells",
    () => {
      let cleared = 0;
      for (const r of rows) {
        if (!Number.isFinite(r) || r < 0 || r >= arr.length) continue;
        const row = arr[r];
        if (!row) continue;
        for (const c of colsToClear) {
          const col = vd.columns[c];
          if (!col) continue;
          if (
            selection.colsAll &&
            activeView === "interactions" &&
            !isInteractionPhaseColumnActiveForRow(model, vd, r, c, col)
          )
            continue;
          let changed = false;
          if (col.kind)
            changed = clearCellForKind(col.kind, kindCtx({ r, c, col, row }));
          else if (col.key) {
            const before = row[col.key];
            const hadValue = !(before == null || before === "");
            if (hadValue) {
              row[col.key] = "";
              changed = true;
            }
          }
          if (changed) cleared++;
        }
      }
      return { cleared };
    },
    {
      rebuildInteractions: (res) => (res?.cleared ?? 0) > 0,
      pruneNotes: (res) => (res?.cleared ?? 0) > 0,
      render: (res) => (res?.cleared ?? 0) > 0,
      status: (res) => {
        const cleared = res?.cleared ?? 0;
        if (cleared > 0) {
          const noun = cleared === 1 ? "cell" : "cells";
          return `Cleared ${cleared} ${noun}.`;
        }
        return "Nothing to clear.";
      },
    },
  );
}

function deleteSelectedRows(options = {}) {
  if (activeView === "interactions") {
    clearSelectedCells({
      mode: options?.mode,
      reason: options?.reason || "deleteAttempt",
    });
    return;
  }

  // Non-interactions views: delete whole rows as before
  const arr = dataArray();
  if (!arr || !arr.length) return;

  const rows = selection.rows.size > 0 ? Array.from(selection.rows) : [sel.r];
  rows.sort((a, b) => b - a); // delete bottom-up

  runModelMutation(
    "deleteSelectedRows",
    () => {
      const deletedIds = [];
      for (const r of rows) {
        const row = arr[r];
        if (!row) continue;
        deletedIds.push(row.id);
        arr.splice(r, 1);
      }

      const needsModifierRebuild =
        activeView === "modifiers" && deletedIds.length > 0;
      if (needsModifierRebuild) {
        for (const a of model.actions) {
          if (!a.modSet) continue;
          for (const id of deletedIds) delete a.modSet[id];
        }
      }

      const last = Math.max(
        0,
        Math.min(arr.length - 1, rows[rows.length - 1] ?? 0),
      );

      return { deletedIds, needsModifierRebuild, last };
    },
    {
      rebuildActionColumns: (res) => res?.needsModifierRebuild,
      rebuildInteractions: true,
      pruneNotes: true,
      after: (res) => {
        const last = res?.last ?? 0;
        if (res?.needsModifierRebuild && res?.deletedIds?.length) {
          sanitizeModifierRulesAfterDeletion(model, res.deletedIds);
        }
        selection.rows.clear();
        selection.rows.add(last);
        selection.anchor = last;
        sel.r = last;
        sel.c = Math.min(sel.c, Math.max(0, viewDef().columns.length - 1));
      },
      layout: true,
      render: true,
      status: (res) => {
        const count = res?.deletedIds?.length ?? 0;
        const noun = count === 1 ? "row" : "rows";
        return `Deleted ${count} ${noun} from ${viewDef().title}.`;
      },
    },
  );
}

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
const disposeKeys = initGridKeys({
  // state & selectors
  isEditing: () => editing,
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
});

// Selection-aware setter so palette applies to all selected rows in Interactions
function setCellSelectionAware(r, c, v) {
  const rowsSet = selection.rows;
  const hasMultiSelection = rowsSet && rowsSet.size > 1 && rowsSet.has(r);
  const vd = viewDef();
  const col = vd?.columns?.[c];
  const isColorColumn = String(col?.kind || "").toLowerCase() === "color";
  const shouldSpreadDown =
    hasMultiSelection &&
    ((activeView === "interactions" && c === sel.c) || isColorColumn);

  const targetRows = shouldSpreadDown
    ? Array.from(rowsSet).sort((a, b) => a - b)
    : [r];

  let targetCols = selection.colsAll
    ? getHorizontalTargetColumns(c)
    : [c];
  if (!targetCols || !targetCols.length) targetCols = [c];

  const needsSpread = shouldSpreadDown || selection.colsAll;
  if (!needsSpread) {
    setCell(r, c, v);
    return;
  }

  for (const rr of targetRows) {
    if (!Number.isFinite(rr)) continue;
    for (const cc of targetCols) {
      if (!Number.isFinite(cc)) continue;
      if (!selection.colsAll && cc !== c) continue;
      if (
        selection.colsAll &&
        activeView === "interactions" &&
        !isInteractionPhaseColumnActiveForRow(model, vd, rr, cc)
      )
        continue;
      setCell(rr, cc, cloneValueForAssignment(v));
    }
  }
  render();
}

// Initialize palette (handles both Outcome and End cells)
const paletteAPI = initPalette({
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
  isEditing: () => editing,
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
  if (bg && !rawFg) info.foreground = autoTextColor(bg, DEFAULT_CELL_TEXT_COLOR);
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
    info.foreground = textColor || autoTextColor(value, DEFAULT_CELL_TEXT_COLOR);
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
        if (keyL === "rhsaction" || keyL === "rhsactionid" || keyL === "rhsactionname")
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
  const s = perViewState[activeView];
  if (s) {
    s.row = sel.r;
    s.col = sel.c;
  }
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
      if (colorInfo && Object.prototype.hasOwnProperty.call(colorInfo, "textOverride"))
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
function beginEdit(r, c) {
  if (paletteAPI?.closeColor) paletteAPI.closeColor();
  if (SelectionNS.setColsAll) SelectionNS.setColsAll(false);
  const col = viewDef().columns[c];
  if (activeView === "interactions") {
    const k = String(col?.kind || "");
    const kindToUse = k || "interactions";
    const res = beginEditForKind(kindToUse, kindCtx({ r, c, col, row: null }));
    if (res?.handled) {
      render();
      return;
    }
    if (!res?.useEditor) {
      render();
      return;
    }
  } else if (col && col.kind) {
    const arr = dataArray();
    const row = arr ? arr[r] : null;
    const res = beginEditForKind(col.kind, kindCtx({ r, c, col, row }));
    if (res?.handled) {
      render();
      return;
    }
    if (!res?.useEditor) {
      render();
      return;
    }
  }
  const rect = getCellRect(r, c);
  editor.style.left = rect.left + "px";
  editor.style.top = rect.top + "px";
  editor.style.width = Math.max(40, rect.width) + "px";
  editor.style.height = rect.height + "px";
  editor.value = getCell(r, c);
  editor.style.display = "block";
  editing = true;
  // If palette-capable cell, open the universal palette next to the editor
  if (
    activeView === "interactions" &&
    paletteAPI &&
    paletteAPI.wantsToHandleCell &&
    paletteAPI.wantsToHandleCell()
  ) {
    paletteAPI.openForCurrentCell(
      {
        left: rect.left,
        top: rect.top,
        width: Math.max(200, rect.width),
      },
      editor.value || "",
    );
    // TODO: enable for other views.
  }
  editor.focus();
  editor.select();
}
function endEdit(commit = true) {
  if (!editing) return;
  const val = editor.value;
  editor.style.display = "none";
  editing = false;

  if (commit) {
    const rows =
      selection.rows.size > 1
        ? Array.from(selection.rows).sort((a, b) => a - b)
        : [sel.r];
    const vd = viewDef();
    let targetCols = selection.colsAll
      ? getHorizontalTargetColumns(sel.c)
      : [sel.c];
    if (!targetCols || !targetCols.length) targetCols = [sel.c];
    for (const r of rows) {
      for (const cIdx of targetCols) {
        if (!Number.isFinite(cIdx)) continue;
        if (
          selection.colsAll &&
          activeView === "interactions" &&
          !isInteractionPhaseColumnActiveForRow(model, vd, r, cIdx)
        )
          continue;
        setCell(r, cIdx, cloneValueForAssignment(val));
      }
    }
  }
  render();
}

function endEditIfOpen(commit = true) {
  if (editing) endEdit(commit);
  if (paletteAPI?.closeColor) paletteAPI.closeColor();
}
function moveSel(dr, dc, edit = false) {
  // Any keyboard navigation implies single-cell intent → disarm row-wide selection
  if (!shiftPressed && SelectionNS.setColsAll) SelectionNS.setColsAll(false);
  const maxC = viewDef().columns.length - 1;
  const nextR = clamp(sel.r + dr, 0, getRowCount() - 1);
  const nextC = clamp(sel.c + dc, 0, maxC);
  SelectionCtl.startSingle(nextR, nextC);
  // Persist per-view row/col
  const s = perViewState[activeView];
  if (s) {
    s.row = sel.r;
    s.col = sel.c;
  }
  SelectionCtl.applyHorizontalMode?.();
  ensureVisible(sel.r, sel.c);
  render();
  if (edit) beginEdit(sel.r, sel.c);
}
sheet.addEventListener("scroll", () => {
  // Persist scroll per view, then render on next frame
  const s = perViewState[activeView];
  if (s) s.scrollTop = sheet.scrollTop | 0;
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
  saveCurrentViewState();
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
  menusAPI.updateViewMenuRadios(key);
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

// Initialize menus module (handles menu triggers & items)
const menusAPI = initMenus({
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
});

// Save/Load/New
function newProject() {
  Object.assign(model, {
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
  });
  // Reset per-view state for a clean slate
  for (const k in perViewState)
    perViewState[k] = { row: 0, col: 0, scrollTop: 0 };
  sel.r = 0;
  sel.c = 0;
  ensureSeedRows();
  setActiveView("actions");
  updateProjectNameWidget();
  statusBar?.set("New project created (Actions view).");
}

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
function getSuggestedName(projectName = "") {
  const n = String(model.meta.projectName || "").trim();
  return (n ? n : "project") + ".json";
}

// Disk-based (lazy-loaded) file operations (Chromium gets FS API, others fallback)
async function openFromDisk() {
  menusAPI.closeAllMenus && menusAPI.closeAllMenus();
  try {
    const m = await import("../data/fs.js");
    const { data, name } = await m.openJson();
    upgradeModelInPlace(data);
    Object.assign(model, data);
    ensureSeedRows();
    // Reset per-view state to top-of-sheet when opening a file
    for (const k in perViewState)
      perViewState[k] = { row: 0, col: 0, scrollTop: 0 };
    setActiveView("actions");
    setProjectNameFromFile(name);
    statusBar?.set(
      `Opened: ${name} (${model.actions.length} actions, ${model.inputs.length} inputs)`,
    );
  } catch (e) {
    statusBar?.set("Open failed: " + (e?.message || e));
  }
}

async function saveToDisk(as = false) {
  menusAPI.closeAllMenus && menusAPI.closeAllMenus();
  try {
    const m = await import("../data/fs.js");
    const { name } = await m.saveJson(model, {
      as,
      suggestedName: getSuggestedName(),
    });
    statusBar?.set(as ? `Saved As: ${name}` : `Saved: ${name}`);
  } catch (e) {
    statusBar?.set("Save failed: " + (e?.message || e));
  }
}

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

// Migrations/Seeding
function upgradeModelInPlace(o) {
  if (!o.meta) o.meta = { schema: 0, projectName: "", interactionsMode: "AI" };
  if (typeof o.meta.projectName !== "string") o.meta.projectName = "";
  if (
    !("interactionsMode" in o.meta) ||
    (o.meta.interactionsMode !== "AI" && o.meta.interactionsMode !== "AA")
  ) {
    o.meta.interactionsMode = "AI";
  }
  if (!Array.isArray(o.actions)) o.actions = [];
  if (!Array.isArray(o.inputs)) o.inputs = [];
  if (!Array.isArray(o.modifiers)) o.modifiers = [];
  if (!Array.isArray(o.outcomes)) o.outcomes = [];
  if (!Array.isArray(o.modifierGroups)) o.modifierGroups = [];
  if (!Array.isArray(o.modifierConstraints)) o.modifierConstraints = [];
  if (!o.notes || typeof o.notes !== "object") o.notes = {};
  if (!Array.isArray(o.interactionsPairs)) o.interactionsPairs = [];
  let maxId = 0;
  for (const r of o.actions) {
    if (typeof r.id !== "number") r.id = ++maxId;
    else maxId = Math.max(maxId, r.id);
    if (!r.modSet || typeof r.modSet !== "object") r.modSet = {};
    // Migrate boolean modSet → numeric tri-state 0/1/2
    for (const k in r.modSet) {
      const v = r.modSet[k];
      if (v === true) r.modSet[k] = MOD.ON;
      else if (v === false || v == null) r.modSet[k] = MOD.OFF;
      else if (typeof v === "number")
        r.modSet[k] = Math.max(0, Math.min(2, v | 0));
      else r.modSet[k] = MOD.OFF;
    }
  }
  for (const r of o.inputs) {
    if (typeof r.id !== "number") r.id = ++maxId;
    else maxId = Math.max(maxId, r.id);
  }
  for (const r of o.modifiers) {
    if (typeof r.id !== "number") r.id = ++maxId;
    else maxId = Math.max(maxId, r.id);
  }
  for (const r of o.outcomes) {
    if (typeof r.id !== "number") r.id = ++maxId;
    else maxId = Math.max(maxId, r.id);
  }
  if (!Number.isFinite(o.nextId)) o.nextId = maxId + 1;
  else o.nextId = Math.max(o.nextId, maxId + 1);
  o.meta.schema = SCHEMA_VERSION;
}
function ensureMinRows(arr, n) {
  while (arr.length < n) arr.push(makeRow(model));
}
function ensureSeedRows() {
  const N = 20;
  ensureMinRows(model.actions, N);
  ensureMinRows(model.inputs, N);
  ensureMinRows(model.modifiers, N);
  // Seed outcomes only if empty, using the user's canonical list
  if (!model.outcomes || !model.outcomes.length) {
    for (const name of DEFAULT_OUTCOMES) {
      model.outcomes.push({
        id: model.nextId++,
        name,
        color: "",
        color2: "",
        notes: "",
      });
    }
  }
  ensureMinRows(model.outcomes, Math.max(DEFAULT_OUTCOMES.length + 10, 20));
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
