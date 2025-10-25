import { clamp } from "../data/utils.js";

function toPlainText(value) {
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

export function createEditingController({
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
  getActiveView,
  getPaletteAPI,
  document: doc = globalThis.document,
  window: win = globalThis.window,
}) {
  let editing = false;
  let shiftPressed = false;
  let lastShiftTap = 0;
  const DOUBLE_SHIFT_WINDOW_MS = 200;

  function getPalette() {
    return typeof getPaletteAPI === "function" ? getPaletteAPI() : null;
  }

  function currentView() {
    return typeof getActiveView === "function" ? getActiveView() : "actions";
  }

  function isEditableTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    return !!el.isContentEditable;
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
    const scrollLeft = sheet ? sheet.scrollLeft || 0 : 0;
    const scrollTop = sheet ? sheet.scrollTop || 0 : 0;
    const left = sheetLeft + ((geom.offs?.[c] ?? 0) - scrollLeft);
    const top = sheetTop + r * ROW_HEIGHT - scrollTop;
    const width = geom.widths?.[c] ?? 0;
    return { left, top, width, height: ROW_HEIGHT };
  }

  function beginEdit(r, c) {
    const palette = getPalette();
    if (palette?.closeColor) palette.closeColor();
    if (SelectionNS?.setColsAll) SelectionNS.setColsAll(false);
    const activeView = currentView();
    const vd = viewDef();
    const col = vd.columns?.[c];
    if (activeView === "interactions") {
      const kind = String(col?.kind || "");
      const kindToUse = kind || "interactions";
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
    if (editor) {
      editor.style.left = rect.left + "px";
      editor.style.top = rect.top + "px";
      editor.style.width = Math.max(40, rect.width) + "px";
      editor.style.height = rect.height + "px";
      editor.value = toPlainText(getCell(r, c));
      editor.style.display = "block";
    }
    editing = true;
    if (palette && palette.wantsToHandleCell && palette.wantsToHandleCell()) {
      palette.openForCurrentCell(
        {
          left: rect.left,
          top: rect.top,
          width: Math.max(200, rect.width),
        },
        (editor && editor.value) || "",
      );
    }
    if (editor) {
      editor.focus();
      editor.select();
    }
  }

  function endEdit(commit = true) {
    if (!editing) return;
    const palette = getPalette();
    const value = editor ? editor.value : "";
    if (editor) editor.style.display = "none";
    editing = false;
    if (!commit) {
      render();
      return;
    }
    const activeView = currentView();
    runModelTransaction(
      "endEditCommit",
      () => {
        let changedCells = 0;
        const touchedRows = new Set();
        const touchedCols = new Set();
        const rows =
          selection.rows.size > 1
            ? Array.from(selection.rows).sort((a, b) => a - b)
            : [sel.r];
        const vd = viewDef();
        let targetCols = selection.colsAll
          ? getHorizontalTargetColumns(sel.c)
          : [sel.c];
        if (!targetCols || !targetCols.length) targetCols = [sel.c];
        for (const rowIndex of rows) {
          for (const colIndex of targetCols) {
            if (!Number.isFinite(colIndex)) continue;
            if (
              selection.colsAll &&
              activeView === "interactions" &&
              !isInteractionPhaseColumnActiveForRow(model, vd, rowIndex, colIndex)
            ) {
              continue;
            }
            const result = setCell(
              rowIndex,
              colIndex,
              cloneValueForAssignment(value),
            );
            if (result && result.changed) {
              changedCells++;
              touchedRows.add(rowIndex);
              touchedCols.add(colIndex);
            }
          }
        }
        return {
          changedCells,
          touchedRows: Array.from(touchedRows).sort((a, b) => a - b),
          touchedCols: Array.from(touchedCols).sort((a, b) => a - b),
          view: activeView,
        };
      },
      {
        render: true,
        undo: makeUndoConfig({
          label: "cell edit",
          shouldRecord: (res) => (res?.changedCells ?? 0) > 0,
        }),
      },
    );
    if (palette?.closeColor) palette.closeColor();
  }

  function endEditIfOpen(commit = true) {
    if (editing) endEdit(commit);
    const palette = getPalette();
    if (palette?.closeColor) palette.closeColor();
  }

  function advanceSelectionAfterPaletteTab(shift) {
    const cols = viewDef()?.columns || [];
    if (!cols.length) return;
    const maxC = cols.length - 1;
    let nextR = sel.r;
    let nextC = sel.c;
    if (shift) {
      if (nextC > 0) nextC--;
      else {
        nextC = maxC;
        nextR = Math.max(0, nextR - 1);
      }
    } else {
      if (nextC < maxC) nextC++;
      else {
        nextC = 0;
        nextR = Math.min(getRowCount() - 1, nextR + 1);
      }
    }
    sel.r = nextR;
    sel.c = nextC;
    ensureVisible(sel.r, sel.c);
    render();
  }

  function moveSel(dr, dc, edit = false) {
    const cols = viewDef()?.columns || [];
    const maxC = cols.length ? cols.length - 1 : 0;
    const nextR = clamp(sel.r + dr, 0, getRowCount() - 1);
    const nextC = clamp(sel.c + dc, 0, maxC);
    const useBoxExtend = shiftPressed && SelectionCtl?.extendBoxTo;
    if (useBoxExtend) {
      SelectionCtl.extendBoxTo(nextR, nextC);
    } else {
      if (SelectionNS?.setColsAll) SelectionNS.setColsAll(false);
      SelectionCtl?.startSingle?.(nextR, nextC);
    }
    updateSelectionSnapshot?.({ row: sel.r, col: sel.c });
    SelectionCtl?.applyHorizontalMode?.();
    ensureVisible(sel.r, sel.c);
    render();
    if (edit) beginEdit(sel.r, sel.c);
  }

  function isEditing() {
    return editing;
  }

  function handleDocumentMouseDown(e) {
    if (!editing) return;
    if (!doc || !editor) return;
    const inSheet = !!(sheet && (e.target === sheet || sheet.contains(e.target)));
    if (inSheet) return;
    const palette = getPalette();
    try {
      if (palette?.isOpen?.()) return;
    } catch (_) {
      /* ignore */
    }
    if (e.target === editor) return;
    endEdit(true);
  }

  function handleShiftKeydown(e) {
    if (e.key !== "Shift") return;
    const target = e.target;
    const inEditable = isEditableTarget(target);
    if (!shiftPressed && !editing && !inEditable) {
      const now = Date.now();
      if (lastShiftTap && now - lastShiftTap <= DOUBLE_SHIFT_WINDOW_MS) {
        SelectionCtl?.toggleHorizontalMode?.();
        lastShiftTap = 0;
      }
    }
    shiftPressed = true;
  }

  function handleShiftKeyup(e) {
    if (e.key !== "Shift") return;
    shiftPressed = false;
    const target = e.target;
    const inEditable = isEditableTarget(target);
    lastShiftTap = !editing && !inEditable ? Date.now() : 0;
  }

  function handleWindowBlur() {
    shiftPressed = false;
    lastShiftTap = 0;
  }

  if (doc) {
    doc.addEventListener("mousedown", handleDocumentMouseDown, true);
    doc.addEventListener("keydown", handleShiftKeydown, true);
    doc.addEventListener("keyup", handleShiftKeyup, true);
  }
  if (win) {
    win.addEventListener("blur", handleWindowBlur);
  }

  function dispose() {
    if (doc) {
      doc.removeEventListener("mousedown", handleDocumentMouseDown, true);
      doc.removeEventListener("keydown", handleShiftKeydown, true);
      doc.removeEventListener("keyup", handleShiftKeyup, true);
    }
    if (win) win.removeEventListener("blur", handleWindowBlur);
  }

  return {
    beginEdit,
    endEdit,
    endEditIfOpen,
    advanceSelectionAfterPaletteTab,
    moveSel,
    getCellRect,
    isEditing,
    dispose,
  };
}
