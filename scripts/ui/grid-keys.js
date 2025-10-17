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
    // deletion
    deleteSelection,
    // NEW: model & cell text getter for clipboard ops
    model,
    getCellText,
    getStructuredCell,
    applyStructuredCell,
  } = deps;

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
    if (document.querySelector('[aria-modal="true"]')) return; // respect modals
    const ae = document.activeElement;
    if (isTypingInEditable(ae)) return;

    // Clear multi-selection with Escape when not editing
    if (!gridIsEditing() && e.key === "Escape" && selection.rows.size > 0) {
      clearSelection();
      render();
      return;
    }

    // Global delete (when not editing a cell)
    if (
      !gridIsEditing() &&
      (e.key === "Delete" ||
        (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey))
    ) {
      e.preventDefault();
      if (typeof deleteSelection === "function") {
        if (getActiveView && getActiveView() === "interactions") {
          // Shift+Delete (or Shift+Backspace) → clear all editable cells in selection
          // Delete → clear active editable column across selection
          deleteSelection({
            mode: e.shiftKey ? "clearAllEditable" : "clearActiveCell",
          });
        } else {
          deleteSelection();
        }
      }
      return;
    }

    // In-cell editing mode
    if (gridIsEditing()) {
      // If editing the Interactions → Outcome cell, defer Enter/Escape to the palette handler in App.js
      try {
        const keyDef = viewDef().columns[sel.c];
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
        const maxC = viewDef().columns.length - 1;
        let r = sel.r,
          c = sel.c;
        if (e.shiftKey) {
          if (c > 0) c--;
          else {
            c = maxC;
            r = Math.max(0, r - 1);
          }
        } else {
          if (c < maxC) c++;
          else {
            c = 0;
            r = Math.min(getRowCount() - 1, r + 1);
          }
        }
        sel.r = r;
        sel.c = c;
        ensureVisible(sel.r, sel.c);
        render();
        return;
      }
      return;
    }

    // ----- MODIFIER COLUMNS: handle first (tri-state) -----
    const col = viewDef().columns[sel.c];
    if (getActiveView() === "actions" && isModColumn(col)) {
      // Cycle: OFF→ON→BYPASS→OFF on Enter / Space / X / F2
      if (
        e.key === " " ||
        e.key.toLowerCase() === "x" ||
        e.key === "Enter" ||
        e.key === "F2"
      ) {
        e.preventDefault();
        if (selection.rows.size > 1)
          setModForSelection(sel.c, undefined); // batch cycle using active row's next
        else setCell(sel.r, sel.c, undefined); // single cycle
        render();
        return;
      }
      // Optional explicit sets: Alt+0/1/2 → OFF/ON/BYPASS
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
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveSel(0, -1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveSel(0, 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSel(-1, 0);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSel(1, 0);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveSel(0, e.shiftKey ? -1 : 1);
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
    const isMac = navigator.platform.includes("Mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveToDisk(false);
      return;
    }
    if (mod && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openFromDisk();
      return;
    }
    if (mod && e.key.toLowerCase() === "n") {
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
    if (mod && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      if (editor.style.display !== "none") return; // don't cycle while editing
      e.preventDefault();
      cycleView(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
  }

  window.addEventListener("keydown", onGridKeyDown, true); // capture: grid first
  window.addEventListener("keydown", onShortcutKeyDown); // bubble: plays nice
  // ---- Clipboard: generic structured refs for any stable-ID cell ----

  function isInteractions() {
    return getActiveView() === "interactions";
  }
  function getCellKey(r, c) {
    const cd = viewDef().columns[c];
    return cd && cd.key;
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
        row.push({
          text,
          structured,
          colKey: col && Object.prototype.hasOwnProperty.call(col, "key")
            ? col.key
            : null,
          colKind: col && Object.prototype.hasOwnProperty.call(col, "kind")
            ? col.kind
            : null,
        });
      }
      out.push(row);
    }
    return { cells: out, hasStructured };
  }

  function buildPlainTextFromCells(cells) {
    return cells
      .map((row) => row.map((cell) => cell.text ?? "").join("\t"))
      .join("\n");
  }

  function makeRangePayloadFromCells(cols, cells) {
    const vd = viewDef();
    const colDefs = (vd && vd.columns) || [];
    const activeView = typeof getActiveView === "function" ? getActiveView() : null;
    return {
      view: activeView,
      columns: cols.map((idx) => {
        const col = colDefs[idx];
        return {
          key: col && Object.prototype.hasOwnProperty.call(col, "key")
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

  function computeDestinationIndices(options) {
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
    if (sorted && sorted.length >= sourceCount) {
      const out = [];
      for (let i = 0; i < sourceCount; i++) {
        const idx = sorted[i];
        if (Number.isFinite(idx) && idx <= last) out.push(idx);
      }
      return out;
    }
    const start = sorted && sorted.length ? sorted[0] : anchor;
    const out = [];
    const base = Number.isFinite(start) ? start : 0;
    for (let i = 0; i < sourceCount; i++) {
      const idx = base + i;
      if (idx > last) break;
      if (idx >= 0) out.push(idx);
    }
    return out;
  }

  function columnsCompatible(meta, col) {
    if (!meta || !col) return false;
    if (meta.colKey != null && col.key != null && String(meta.colKey) === String(col.key))
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
    if (document.querySelector('[aria-modal="true"]')) return;
    const ae = document.activeElement;
    if (isTypingInEditable(ae)) return;
    if (gridIsEditing()) return;

    const rows = getSelectedRowsList();
    const cols = getSelectedColsList();
    const { cells, hasStructured } = gatherSelectionData(rows, cols);
    const text = buildPlainTextFromCells(cells);
    e.preventDefault();
    try {
      e.clipboardData.setData("text/plain", text);
    } catch {}

    const rangePayload = makeRangePayloadFromCells(cols, cells);
    const wroteRange = writeRangeToEvent(e, rangePayload);
    if (hasStructured && rows.length === 1 && cols.length === 1) {
      const structured = cells[0] && cells[0][0] ? cells[0][0].structured : null;
      if (structured) writeStructuredToEvent(e, structured);
    }

    console.debug(
      "[copy] rows=",
      rows,
      "cols=",
      cols,
      "structured=",
      hasStructured,
      "rangeWritten=",
      wroteRange,
      "types after=",
      Array.from(e.clipboardData.types || []),
    );
  }

  function onPaste(e) {
    if (document.querySelector('[aria-modal="true"]')) return;
    const ae = document.activeElement;
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
      limit: rowLimit != null && rowLimit > 0 ? rowLimit : rowAnchor + sourceHeight,
    });
    if (!destRows.length) destRows.push(rowAnchor);
    if (rowLimit != null) {
      destRows = destRows.filter((r) => r < rowLimit);
      if (!destRows.length)
        destRows.push(Math.max(0, Math.min(rowAnchor, rowLimit - 1)));
    }

    let destCols = computeDestinationIndices({
      sourceCount: sourceWidth,
      selectionSet: selection && selection.cols,
      anchor: colAnchor,
      limit: totalCols > 0 ? totalCols : colAnchor + sourceWidth,
      allFlag: selection && selection.colsAll,
      fullRange: colDefs.map((_, idx) => idx),
    });
    if (!destCols.length) destCols.push(colAnchor);
    if (totalCols > 0) {
      destCols = destCols.filter((c) => c < totalCols);
      if (!destCols.length)
        destCols.push(Math.max(0, Math.min(colAnchor, totalCols - 1)));
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

    let changed = false;

    for (let i = 0; i < destRows.length; i++) {
      const r = destRows[i];
      if (!Number.isFinite(r) || r < 0) continue;
      if (rowLimit != null && r >= rowLimit) continue;
      const textRow = textMatrix[i] || [];
      const structuredRow = structuredCells[i] || [];
      for (let j = 0; j < destCols.length; j++) {
        const c = destCols[j];
        if (!Number.isFinite(c) || c < 0) continue;
        if (totalCols > 0 && c >= totalCols) continue;

        const textValue =
          j < textRow.length ? String(textRow[j] ?? "") : "";
        const meta = structuredRow[j] || null;

        let applied = false;
        if (meta && meta.structured && typeof applyStructuredCell === "function") {
          const col = colDefs[c];
          if (columnsCompatible(meta, col)) {
            applied = !!applyStructuredCell(r, c, meta.structured);
          }
        } else if (payload && typeof applyStructuredCell === "function") {
          applied = !!applyStructuredCell(r, c, payload);
        }

        if (!applied && typeof setCell === "function") {
          setCell(r, c, textValue);
          changed = true;
        } else if (applied) {
          changed = true;
        }
      }
    }

    if (changed) render();
  }

  window.addEventListener("copy", onCopy, true);
  window.addEventListener("paste", onPaste, true);

  // Return disposer for future use (optional)
  return () => {
    window.removeEventListener("keydown", onGridKeyDown, true);
    window.removeEventListener("keydown", onShortcutKeyDown);
    window.removeEventListener("copy", onCopy, true);
    window.removeEventListener("paste", onPaste, true);
  };
}
