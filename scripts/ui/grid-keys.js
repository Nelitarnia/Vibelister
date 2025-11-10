// grid-keys.js - Keyboard navigation for the grid + app-level shortcuts.
// Exported as an initializer so App.js can pass dependencies explicitly.

import {
  MIME_CELL,
  MIME_RANGE,
  readRangeFromEvent,
  readStructuredFromEvent,
  writeRangeToEvent,
  writeStructuredToEvent,
} from "../app/clipboard-codec.js";
import { isInteractionPhaseColumnActiveForRow } from "../app/interactions.js";

export function computeDestinationIndices(options = {}) {
  const {
    sourceCount,
    selectionSet,
    anchor,
    limit,
    allFlag = false,
    fullRange = null,
  } = options;
  if (!Number.isFinite(sourceCount) || sourceCount <= 0) return [];
  const last = Math.max(0, (limit || 0) - 1);
  if (allFlag && Array.isArray(fullRange) && fullRange.length) {
    const out = [];
    for (let i = 0; i < sourceCount && i < fullRange.length; i++) {
      const idx = fullRange[i];
      if (Number.isFinite(idx) && idx <= last) out.push(idx);
    }
    return out;
  }
  const sorted =
    selectionSet && selectionSet.size
      ? Array.from(selectionSet).sort((a, b) => a - b)
      : null;
  let pruned = null;
  if (sorted && sorted.length) {
    pruned = [];
    for (const idx of sorted) {
      if (Number.isFinite(idx) && idx <= last) pruned.push(idx);
    }
    if (pruned.length >= sourceCount) return pruned;
  }
  let start = null;
  if (pruned && pruned.length) start = pruned[0];
  else if (sorted && sorted.length) start = sorted[0];
  else if (Number.isFinite(anchor)) start = anchor;
  else start = 0;
  const base = Number.isFinite(start) ? start : 0;
  const out = [];
  for (let i = 0; i < sourceCount; i++) {
    const idx = base + i;
    if (idx > last) break;
    if (idx >= 0) out.push(idx);
  }
  return out;
}

export function initGridKeys(deps) {
  // (clipboard-enhanced)
  const {
    // state & selectors
    isEditing, // () => boolean
    getActiveView, // () => string
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
    // deletion
    deleteRows,
    clearCells,
    addRowsAbove,
    addRowsBelow,
    // NEW: model & cell text getter for clipboard ops
    model,
    getCellText,
    getStructuredCell,
    applyStructuredCell,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
    status,
    undo,
    redo,
    getPaletteAPI,
    toggleInteractionsOutline,
    jumpToInteractionsAction,
    jumpToInteractionsVariant,
    toggleCommentsSidebar,
    toggleTagsSidebar,
    window: winOverride,
    document: docOverride,
    navigator: navOverride,
  } = deps;

  const win = winOverride || globalThis.window;
  const doc = docOverride || globalThis.document;
  const nav = navOverride || globalThis.navigator;

  function setStatusMessage(message) {
    if (!message) return;
    if (status && typeof status.set === "function") {
      status.set(message);
    }
  }

  function formatTypeName(value) {
    if (value == null) return "";
    const spaced = String(value)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[:/_-]+/g, " ")
      .trim();
    if (!spaced) return "";
    return spaced
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function describeCellForStatus(cell) {
    if (!cell || typeof cell !== "object") return "";
    if (cell.structured && typeof cell.structured.type === "string")
      return formatTypeName(cell.structured.type);
    if (cell.colKind) return formatTypeName(cell.colKind);
    if (cell.colKey) return formatTypeName(cell.colKey);
    return "";
  }

  function buildCopyStatus(rows, cols, cells) {
    const rowCount = rows.length;
    const colCount = cols.length;
    const total = rowCount * colCount;
    if (!total) return "";
    if (total === 1) {
      const label = describeCellForStatus(cells[0]?.[0]);
      return label ? `Copied ${label} cell.` : "Copied cell.";
    }
    const typeSet = new Set();
    for (const row of cells) {
      for (const cell of row) {
        const label = describeCellForStatus(cell);
        if (label) typeSet.add(label);
      }
    }
    let suffix = "";
    if (typeSet.size) {
      const list = Array.from(typeSet);
      const shown = list.slice(0, 3);
      suffix = ` (types: ${shown.join(", ")}${list.length > 3 ? ", …" : ""})`;
    }
    return `Copied ${rowCount}×${colCount} cells${suffix}.`;
  }

  function isColorKind(col) {
    const kind = col && col.kind;
    if (kind == null) return false;
    return String(kind).toLowerCase() === "color";
  }

  const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

  function isColorPickerContext(ae) {
    const root = doc?.getElementById?.("vlColorPicker");
    if (!root || root.getAttribute("data-open") !== "true") return false;
    return !!(ae && root.contains(ae));
  }
  function isValidColorValue(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (trimmed === "") return true; // allow clearing via empty paste
    return HEX_COLOR_RE.test(trimmed);
  }

  function isTypingInEditable(ae) {
    return (
      ae &&
      ae !== editor &&
      (ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.isContentEditable)
    );
  }

  function gridIsEditing() {
    try {
      return !!isEditing();
    } catch {
      return !!(editor && editor.style.display !== "none");
    }
  }

  function onGridKeyDown(e) {
    if (doc?.querySelector?.('[aria-modal="true"]')) return; // respect modals
    const ae = doc?.activeElement || null;
    if (isColorPickerContext(ae)) return;
    if (isTypingInEditable(ae)) return;

    function paletteIsOpen() {
      if (typeof getPaletteAPI !== "function") return false;
      try {
        const palette = getPaletteAPI();
        if (!palette) return false;
        if (typeof palette.isOpen === "function") return !!palette.isOpen();
      } catch (_) {
        /* ignore palette lookup issues */
      }
      return false;
    }

    // Clear multi-selection with Escape when not editing
    if (!gridIsEditing() && e.key === "Escape" && selection.rows.size > 0) {
      clearSelection();
      render();
      return;
    }

    const isBackspace =
      e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey;
    const isDelete = e.key === "Delete";

    if (!gridIsEditing() && isBackspace) {
      e.preventDefault();
      if (typeof clearCells === "function") {
        const mode =
          getActiveView && getActiveView() === "interactions"
            ? e.shiftKey
              ? "clearAllEditable"
              : "clearActiveCell"
            : undefined;
        clearCells({ mode });
      }
      return;
    }

    if (!gridIsEditing() && isDelete) {
      e.preventDefault();
      if (getActiveView && getActiveView() === "interactions") {
        if (typeof clearCells === "function") {
          clearCells({
            mode: e.shiftKey ? "clearAllEditable" : "clearActiveCell",
            reason: "deleteAttempt",
          });
        }
      } else if (typeof deleteRows === "function") {
        deleteRows();
      }
      return;
    }

    const metaLike = e.metaKey || e.ctrlKey;
    if (metaLike && !e.altKey) {
      const keyLower = String(e.key || "").toLowerCase();
      if (keyLower === "z") {
        if (!gridIsEditing()) {
          e.preventDefault();
          if (e.shiftKey) {
            if (typeof redo === "function") redo();
          } else if (typeof undo === "function") {
            undo();
          }
        }
        return;
      }
      if (keyLower === "y") {
        if (!gridIsEditing()) {
          e.preventDefault();
          if (typeof redo === "function") redo();
        }
        return;
      }
    }

    if (
      !gridIsEditing() &&
      e.shiftKey &&
      e.altKey &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      if (getActiveView && getActiveView() === "interactions") {
        e.preventDefault();
        if (typeof jumpToInteractionsVariant === "function") {
          const delta = e.key === "ArrowUp" ? -1 : 1;
          jumpToInteractionsVariant(delta);
        }
        return;
      }
    }

    if (
      !gridIsEditing() &&
      e.shiftKey &&
      !e.altKey &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      if (getActiveView && getActiveView() === "interactions") {
        e.preventDefault();
        if (typeof jumpToInteractionsAction === "function") {
          const delta = e.key === "ArrowUp" ? -1 : 1;
          jumpToInteractionsAction(delta);
        }
        return;
      }
    }

    if (
      !gridIsEditing() &&
      !e.shiftKey &&
      !e.altKey &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "ArrowRight" || e.key === "ArrowLeft")
    ) {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const target = findNextContentColumn(sel.r, sel.c, dir);
      const delta = Number.isFinite(target) ? target - sel.c : 0;
      if (delta !== 0) moveSel(0, delta);
      return;
    }

    // In-cell editing mode
    if (gridIsEditing()) {
      if (paletteIsOpen()) {
        return;
      }
      let keyDef;
      // If editing the Interactions → Outcome cell, defer Enter/Escape to the palette handler in App.js
      try {
        keyDef = viewDef().columns[sel.c];
        const cellKey = keyDef && keyDef.key;
        if (
          getActiveView() === "interactions" &&
          cellKey &&
          (cellKey === "result" ||
            (String(cellKey).startsWith("p") &&
              String(cellKey).endsWith(":outcome")) ||
            (String(cellKey).startsWith("p") &&
              String(cellKey).endsWith(":end")))
        ) {
          return;
        }
      } catch {}
      if (getActiveView() === "actions" && isModColumn(keyDef)) {
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        endEdit(true);
        moveSel(1, 0, false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        endEdit(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        endEdit(true);
        if (typeof moveSelectionForTab === "function") {
          moveSelectionForTab(e.shiftKey, { collapseSelection: false });
        } else {
          const maxC = viewDef().columns.length - 1;
          let r = sel.r;
          let c = sel.c;
          if (e.shiftKey) {
            if (c > 0) c--;
            else {
              c = maxC;
              r = Math.max(0, r - 1);
            }
          } else if (c < maxC) c++;
          else {
            c = 0;
            r = Math.min(getRowCount() - 1, r + 1);
          }
          sel.r = r;
          sel.c = c;
          ensureVisible(sel.r, sel.c);
          render();
        }
        return;
      }
      return;
    }

    // ----- MODIFIER COLUMNS: keyboard shortcuts -----
    const col = viewDef().columns[sel.c];
    if (getActiveView() === "actions" && isModColumn(col)) {
      if (e.key === " ") {
        e.preventDefault();
        beginEdit(sel.r, sel.c);
        return;
      }
      if (e.altKey && (e.key === "0" || e.key === "1" || e.key === "2")) {
        e.preventDefault();
        const target = Number(e.key);
        if (selection.rows.size > 1) setModForSelection(sel.c, target);
        else setCell(sel.r, sel.c, target);
        render();
        return;
      }
    }

    // ----- Generic editing / navigation (non-mod cells) -----
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      beginEdit(sel.r, sel.c);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && e.key === "ArrowLeft") {
      e.preventDefault();
      moveSel(0, -1);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && e.key === "ArrowRight") {
      e.preventDefault();
      moveSel(0, 1);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && e.key === "ArrowUp") {
      e.preventDefault();
      moveSel(-1, 0);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && e.key === "ArrowDown") {
      e.preventDefault();
      moveSel(1, 0);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (typeof moveSelectionForTab === "function")
        moveSelectionForTab(e.shiftKey);
      else moveSel(0, e.shiftKey ? -1 : 1);
      return;
    }

    // Type-to-edit ONLY on non-mod columns
    if (
      !isModColumn(col) &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      beginEdit(sel.r, sel.c);
      editor.value = "";
    }
  }

  function onShortcutKeyDown(e) {
    const platform = typeof nav?.platform === "string" ? nav.platform : "";
    const isMac = platform.includes("Mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const keyRaw = e.key;
    const keyLower = String(keyRaw || "").toLowerCase();
    const plusLike =
      keyRaw === "=" ||
      keyRaw === "+" ||
      keyRaw === "Add" ||
      keyLower === "add";

    if (mod && keyLower === "s") {
      e.preventDefault();
      saveToDisk(false);
      return;
    }
    if (mod && plusLike && e.altKey) {
      if (e.shiftKey) {
        if (typeof addRowsBelow === "function") {
          e.preventDefault();
          addRowsBelow();
          return;
        }
      } else if (typeof addRowsAbove === "function") {
        e.preventDefault();
        addRowsAbove();
        return;
      }
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      if (typeof toggleInteractionsOutline === "function") {
        toggleInteractionsOutline();
      }
      return;
    }
    if (
      mod &&
      e.shiftKey &&
      keyLower === "l" &&
      typeof toggleCommentsSidebar === "function"
    ) {
      e.preventDefault();
      toggleCommentsSidebar();
      return;
    }
    if (
      mod &&
      e.shiftKey &&
      keyLower === "x" &&
      typeof toggleTagsSidebar === "function"
    ) {
      e.preventDefault();
      toggleTagsSidebar();
      return;
    }
    if (mod && keyLower === "o") {
      e.preventDefault();
      openFromDisk();
      return;
    }
    if (mod && keyLower === "n") {
      e.preventDefault();
      newProject();
      return;
    }
    if (e.altKey && (e.key === "g" || e.key === "G")) {
      e.preventDefault();
      doGenerate();
      return;
    }
    if (e.altKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      runSelfTests();
      return;
    }
    if (
      mod &&
      e.shiftKey &&
      !e.altKey &&
      (e.key === "ArrowRight" || e.key === "ArrowLeft")
    ) {
      if (editor.style.display !== "none") return; // don't cycle while editing
      e.preventDefault();
      cycleView(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
  }

  win?.addEventListener?.("keydown", onGridKeyDown, true); // capture: grid first
  win?.addEventListener?.("keydown", onShortcutKeyDown); // bubble: plays nice
  // ---- Clipboard: generic structured refs for any stable-ID cell ----

  function isInteractions() {
    return getActiveView() === "interactions";
  }
  function getCellKey(r, c) {
    const cd = viewDef().columns[c];
    return cd && cd.key;
  }

  function getColumnCount() {
    const cols = viewDef()?.columns;
    return Array.isArray(cols) ? cols.length : 0;
  }

  function cellHasContent(r, c) {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
    const total = getColumnCount();
    if (!total) return false;
    if (c < 0 || c >= total) return false;
    if (typeof getCellText === "function") {
      try {
        const raw = getCellText(r, c);
        if (raw == null) return false;
        const text = typeof raw === "string" ? raw : String(raw);
        return text.trim() !== "";
      } catch (_) {
        return false;
      }
    }
    if (typeof dataArray === "function") {
      try {
        const rows = dataArray();
        if (!Array.isArray(rows)) return false;
        const row = rows[r];
        if (Array.isArray(row)) {
          const value = row[c];
          if (value == null) return false;
          return typeof value === "string" ? value.trim() !== "" : true;
        }
        if (row && typeof row === "object") {
          const key = getCellKey(r, c);
          if (key == null) return false;
          if (!Object.prototype.hasOwnProperty.call(row, key)) return false;
          const value = row[key];
          if (value == null) return false;
          return typeof value === "string" ? value.trim() !== "" : true;
        }
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  function findNextContentColumn(r, startC, dir) {
    const total = getColumnCount();
    if (!total) return Number.isFinite(startC) ? startC : 0;
    const current = Number.isFinite(startC)
      ? Math.min(Math.max(Math.floor(startC), 0), total - 1)
      : dir > 0
      ? 0
      : total - 1;
    const step = dir > 0 ? 1 : -1;
    let c = current + step;
    while (c >= 0 && c < total) {
      if (cellHasContent(r, c)) return c;
      c += step;
    }
    return dir > 0 ? total - 1 : 0;
  }

  function getSelectedRowsList() {
    if (selection && selection.rows && selection.rows.size) {
      return Array.from(selection.rows).sort((a, b) => a - b);
    }
    return [sel.r];
  }

  function getSelectedColsList() {
    const cols = (viewDef() && viewDef().columns) || [];
    if (selection && selection.cols && selection.cols.size) {
      return Array.from(selection.cols).sort((a, b) => a - b);
    }
    if (selection && selection.colsAll) {
      return cols.map((_, idx) => idx);
    }
    return [sel.c];
  }

  function gatherSelectionData(rows, cols) {
    const vd = viewDef();
    const colDefs = (vd && vd.columns) || [];
    const out = [];
    let hasStructured = false;
    let hasComments = false;
    for (const r of rows) {
      const row = [];
      for (const c of cols) {
        const col = colDefs[c];
        const text =
          typeof getCellText === "function"
            ? String(getCellText(r, c) ?? "")
            : "";
        const structured =
          typeof getStructuredCell === "function"
            ? getStructuredCell(r, c)
            : null;
        if (structured) hasStructured = true;
        const commentPayload =
          typeof getCellCommentClipboardPayload === "function"
            ? getCellCommentClipboardPayload(r, c, {
                view:
                  typeof getActiveView === "function"
                    ? getActiveView()
                    : undefined,
                viewDef: vd,
              })
            : null;
        if (commentPayload) hasComments = true;
        row.push({
          text,
          structured,
          comment: commentPayload,
          colKey:
            col && Object.prototype.hasOwnProperty.call(col, "key")
              ? col.key
              : null,
          colKind:
            col && Object.prototype.hasOwnProperty.call(col, "kind")
              ? col.kind
              : null,
        });
      }
      out.push(row);
    }
    return { cells: out, hasStructured, hasComments };
  }

  function buildPlainTextFromCells(cells) {
    return cells
      .map((row) => row.map((cell) => cell.text ?? "").join("\t"))
      .join("\n");
  }

  function makeRangePayloadFromCells(cols, cells) {
    const vd = viewDef();
    const colDefs = (vd && vd.columns) || [];
    const activeView =
      typeof getActiveView === "function" ? getActiveView() : null;
    return {
      view: activeView,
      columns: cols.map((idx) => {
        const col = colDefs[idx];
        return {
          key:
            col && Object.prototype.hasOwnProperty.call(col, "key")
              ? col.key
              : null,
          kind:
            col && Object.prototype.hasOwnProperty.call(col, "kind")
              ? col.kind
              : null,
        };
      }),
      cells: cells.map((row) =>
        row.map((cell) => {
          const payload = {};
          if (cell.colKey != null) payload.colKey = cell.colKey;
          if (cell.colKind != null) payload.colKind = cell.colKind;
          if (cell.structured) payload.structured = cell.structured;
          if (cell.comment) payload.comment = cell.comment;
          return payload;
        }),
      ),
    };
  }

  function parsePlainTextMatrix(txt) {
    const normalized = String(txt || "").replace(/\r\n?/g, "\n");
    const parts = normalized.split("\n");
    if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
    const rows = parts.length ? parts : ["" /* ensure at least one row */];
    return rows.map((row) => row.split("\t"));
  }

  function interactionsColumnActiveForRow(r, c) {
    if (
      typeof getActiveView === "function" &&
      getActiveView() !== "interactions"
    )
      return true;
    try {
      const vd = viewDef();
      return isInteractionPhaseColumnActiveForRow(model, vd, r, c);
    } catch {
      return true;
    }
  }

  function columnsCompatible(meta, col) {
    if (!meta || !col) return false;
    if (
      meta.colKey != null &&
      col.key != null &&
      String(meta.colKey) === String(col.key)
    )
      return true;
    if (
      meta.colKind != null &&
      col.kind != null &&
      String(meta.colKind) === String(col.kind)
    )
      return true;
    return !meta.colKey && !meta.colKind;
  }

  function onCopy(e) {
    if (doc?.querySelector?.('[aria-modal="true"]')) return;
    const ae = doc?.activeElement || null;
    if (isTypingInEditable(ae)) return;
    if (gridIsEditing()) return;

    const rows = getSelectedRowsList();
    const cols = getSelectedColsList();
    const { cells, hasStructured, hasComments } = gatherSelectionData(rows, cols);
    const text = buildPlainTextFromCells(cells);
    e.preventDefault();
    try {
      e.clipboardData.setData("text/plain", text);
    } catch {}

    const rangePayload = makeRangePayloadFromCells(cols, cells);
    const wroteRange = writeRangeToEvent(e, rangePayload);
    if (rows.length === 1 && cols.length === 1) {
      const single = cells[0] && cells[0][0] ? cells[0][0] : null;
      if (single?.structured) {
        writeStructuredToEvent(e, single.structured);
      } else if (single?.comment) {
        writeStructuredToEvent(e, single.comment);
      }
    }

    console.debug(
      "[copy] rows=",
      rows,
      "cols=",
      cols,
      "structured=",
      hasStructured,
      "comments=",
      hasComments,
      "rangeWritten=",
      wroteRange,
      "types after=",
      Array.from(e.clipboardData.types || []),
    );
    setStatusMessage(buildCopyStatus(rows, cols, cells));
  }

  function onPaste(e) {
    if (doc?.querySelector?.('[aria-modal="true"]')) return;
    const ae = doc?.activeElement || null;
    if (isTypingInEditable(ae)) return;

    e.preventDefault();

    const vd = viewDef();
    const colDefs = (vd && vd.columns) || [];
    const totalCols = colDefs.length;
    const rowCount =
      typeof getRowCount === "function" ? Number(getRowCount()) : null;
    const rowLimit = Number.isFinite(rowCount) ? rowCount : null;

    const rowsSel = getSelectedRowsList();
    const colsSel = getSelectedColsList();
    const rowAnchor = rowsSel.length ? rowsSel[0] : sel.r;
    const colAnchor = colsSel.length ? colsSel[0] : sel.c;

    const rangePayload = readRangeFromEvent(e);
    const structuredCells = rangePayload ? rangePayload.cells || [] : [];
    const structuredHeight = structuredCells.length;
    const structuredWidth = structuredCells.reduce(
      (max, row) => Math.max(max, row.length || 0),
      0,
    );

    let payload = null;
    if (!rangePayload) {
      payload = readStructuredFromEvent(e);
    }

    const txt = e.clipboardData.getData("text/plain") || "";
    const textMatrix = parsePlainTextMatrix(txt);
    const textHeight = textMatrix.length;
    const textWidth = textMatrix.reduce(
      (max, row) => Math.max(max, row.length || 0),
      0,
    );

    const sourceHeight = Math.max(structuredHeight, textHeight, 1);
    const sourceWidth = Math.max(structuredWidth, textWidth, 1);

    let destRows = computeDestinationIndices({
      sourceCount: sourceHeight,
      selectionSet: selection && selection.rows,
      anchor: rowAnchor,
      limit:
        rowLimit != null && rowLimit > 0 ? rowLimit : rowAnchor + sourceHeight,
    });
    if (!destRows.length) destRows.push(rowAnchor);
    if (rowLimit != null) {
      destRows = destRows.filter((r) => r < rowLimit);
      if (!destRows.length)
        destRows.push(Math.max(0, Math.min(rowAnchor, rowLimit - 1)));
    }

    const fullColumnRange = colDefs.map((_, idx) => idx);
    let destCols = computeDestinationIndices({
      sourceCount: sourceWidth,
      selectionSet: selection && selection.cols,
      anchor: colAnchor,
      limit: totalCols > 0 ? totalCols : colAnchor + sourceWidth,
      allFlag: selection && selection.colsAll,
      fullRange: fullColumnRange,
    });
    if (!destCols.length) destCols.push(colAnchor);
    if (totalCols > 0) {
      destCols = destCols.filter((c) => c < totalCols);
      if (!destCols.length)
        destCols.push(Math.max(0, Math.min(colAnchor, totalCols - 1)));
    }
    if (selection && selection.colsAll) {
      destCols = fullColumnRange.slice(
        0,
        totalCols > 0 ? totalCols : fullColumnRange.length,
      );
    }

    console.debug(
      "[paste] source size=",
      { h: sourceHeight, w: sourceWidth },
      "dest rows=",
      destRows,
      "dest cols=",
      destCols,
      "range?",
      !!rangePayload,
    );

    const performPaste = () => {
      let changed = false;
      let appliedCount = 0;
      let rejectedCount = 0;
      let attemptedCells = 0;

      for (let i = 0; i < destRows.length; i++) {
        const r = destRows[i];
        if (!Number.isFinite(r) || r < 0) continue;
        if (rowLimit != null && r >= rowLimit) continue;
        const textRow = textMatrix[textHeight > 0 ? i % textHeight : 0] || [];
        const structuredRow =
          structuredCells[structuredHeight > 0 ? i % structuredHeight : 0] ||
          [];
        for (let j = 0; j < destCols.length; j++) {
          const c = destCols[j];
          if (!Number.isFinite(c) || c < 0) continue;
          if (totalCols > 0 && c >= totalCols) continue;
          if (
            selection &&
            selection.colsAll &&
            !interactionsColumnActiveForRow(r, c)
          )
            continue;
          const textIndex = textWidth > 0 ? j % textWidth : 0;
          const structuredIndex =
            structuredWidth > 0 ? j % structuredWidth : -1;
          const textValue =
            textWidth > 0 && textRow.length
              ? String(textRow[textIndex] ?? "")
              : "";
          const meta =
            structuredIndex >= 0
              ? structuredRow[structuredIndex] || null
              : null;
          attemptedCells++;

          const col = colDefs[c];
          const colIsColor = isColorKind(col);
          const normalizedText = colIsColor ? textValue.trim() : textValue;
          const hasTextGetter = typeof getCellText === "function";
          const beforeText = hasTextGetter
            ? String(getCellText(r, c) ?? "")
            : null;

          let structuredApplied = false;
          let typeRejected = false;
          let cellChanged = false;

          if (
            meta &&
            meta.structured &&
            typeof applyStructuredCell === "function"
          ) {
            if (columnsCompatible(meta, col)) {
              structuredApplied = !!applyStructuredCell(r, c, meta.structured);
              if (!structuredApplied) typeRejected = true;
            } else {
              typeRejected = true;
            }
          } else if (
            !meta?.structured &&
            payload &&
            payload.type !== "comment" &&
            typeof applyStructuredCell === "function"
          ) {
            structuredApplied = !!applyStructuredCell(r, c, payload);
            if (!structuredApplied) typeRejected = true;
          }

          if (structuredApplied) {
            changed = true;
            cellChanged = true;
          } else if (typeof setCell === "function") {
            if (
              colIsColor &&
              normalizedText &&
              !isValidColorValue(normalizedText)
            ) {
              typeRejected = true;
            } else {
              const nextValue = colIsColor ? normalizedText : textValue;
              const comparableBefore = hasTextGetter ? beforeText : null;
              const comparableNext = hasTextGetter
                ? String(nextValue ?? "")
                : null;
              if (!hasTextGetter || comparableBefore !== comparableNext) {
                setCell(r, c, nextValue);
                const afterText = hasTextGetter
                  ? String(getCellText(r, c) ?? "")
                  : null;
                if (!hasTextGetter || afterText !== beforeText) {
                  changed = true;
                  cellChanged = true;
                }
              }
            }
          }

          const commentPayload =
            (meta && meta.comment) ||
            (payload && payload.type === "comment" ? payload : null);
          if (
            commentPayload &&
            typeof applyCellCommentClipboardPayload === "function"
          ) {
            const commentChange = applyCellCommentClipboardPayload(r, c, commentPayload, {
              view:
                typeof getActiveView === "function" ? getActiveView() : undefined,
              viewDef: vd,
            });
            if (commentChange) {
              changed = true;
              cellChanged = true;
            }
          }

          if (typeRejected) rejectedCount++;
          if (cellChanged) appliedCount++;
        }
      }

      return { changed, appliedCount, rejectedCount, attemptedCells };
    };

    const useUndoConfig =
      typeof makeUndoConfig === "function"
        ? makeUndoConfig({
            label: "paste",
            shouldRecord: (res) => !!res?.changed,
          })
        : undefined;

    const summary =
      typeof runModelTransaction === "function"
        ? runModelTransaction("pasteCells", performPaste, {
            render: (res) => !!res?.changed,
            undo: useUndoConfig,
          })
        : (() => {
            const result = performPaste();
            if (result?.changed) render();
            return result;
          })();

    const changed = !!summary?.changed;
    const appliedCount = summary?.appliedCount ?? 0;
    const attemptedCells = summary?.attemptedCells ?? 0;
    const rejectedCount = summary?.rejectedCount ?? 0;

    let pasteMessage = "";
    if (attemptedCells === 0) pasteMessage = "Nothing to paste.";
    else if (appliedCount === 0 && rejectedCount === 0)
      pasteMessage = "Paste made no changes.";
    else if (appliedCount > 0 && rejectedCount === 0)
      pasteMessage = `Pasted ${appliedCount} cell${appliedCount === 1 ? "" : "s"}.`;
    else if (appliedCount > 0 && rejectedCount > 0)
      pasteMessage = `Pasted ${appliedCount} of ${attemptedCells} cell${
        attemptedCells === 1 ? "" : "s"
      } (${rejectedCount} rejected for type mismatch).`;
    else if (appliedCount === 0 && rejectedCount > 0)
      pasteMessage = `Paste rejected for ${rejectedCount} cell${
        rejectedCount === 1 ? "" : "s"
      }.`;

    setStatusMessage(pasteMessage);
  }

  win?.addEventListener?.("copy", onCopy, true);
  win?.addEventListener?.("paste", onPaste, true);

  // Return disposer for future use (optional)
  return () => {
    win?.removeEventListener?.("keydown", onGridKeyDown, true);
    win?.removeEventListener?.("keydown", onShortcutKeyDown);
    win?.removeEventListener?.("copy", onCopy, true);
    win?.removeEventListener?.("paste", onPaste, true);
  };
}
