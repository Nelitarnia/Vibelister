// grid-mouse.js — central mouse interactions: cell selection & edit gestures (sheet-level)

export function initGridMouse(deps) {
  const {
    // layers
    sheet,
    rowHdrs,
    editor,
    // selection state
    sel,
    selection,
    SelectionNS,
    // app callbacks
    isEditing,
    beginEdit,
    endEdit,
    render,
    ensureVisible,
    // view helpers
    viewDef,
    isModColumn,
  } = deps;

  // Robust hit-testing: accept .cell OR any element with data-r/data-c inside the sheet
  function findCellEl(target) {
    if (!target || !sheet) return null;
    if (!(target === sheet || sheet.contains(target))) return null;
    return target.closest(".cell,[data-r][data-c]");
  }

  function onCellMouseDown(e) {
    if (e.button !== 0) return; // left click only
    const t = findCellEl(e.target);
    if (!t) return;

    const r = Number(t.dataset.r),
      c = Number(t.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const col = viewDef().columns[c];

    // Ensure the sheet regains focus so keyboard shortcuts go to the grid.
    if (sheet && typeof sheet.focus === "function") {
      sheet.focus({ preventScroll: true });
    }

    // Handle double-click first: begin edit on the clicked cell
    if (e.detail === 2) {
      // Ensure selection points to this cell, then edit
      sel.r = r;
      sel.c = c;
      ensureVisible(r, c);
      if (isEditing() && e.target !== editor) endEdit(true);
      e.preventDefault();
      beginEdit(r, c);
      return;
    }

    // Single-click path
    e.preventDefault(); // avoid native text selection

    // If editing and clicking outside editor (but inside sheet), commit; palette handles itself
    if (isEditing() && e.target !== editor) endEdit(true);

    // Clicking cells without Shift implies single-cell intent → disarm wide-selection
    if (!e.shiftKey && selection && selection.colsAll) {
      if (SelectionNS?.setColsAll) SelectionNS.setColsAll(false);
      else if (!selection.horizontalMode) selection.colsAll = false;
    }

    // Selection logic (single or extended)
    if (e.shiftKey) {
      if (SelectionNS?.setColsAll) SelectionNS.setColsAll(false);
      const rowAnchor = selection.anchor != null ? selection.anchor : sel.r;
      selection.rows.clear();
      const lo = Math.min(rowAnchor, r),
        hi = Math.max(rowAnchor, r);
      for (let i = lo; i <= hi; i++) selection.rows.add(i);
      selection.anchor = rowAnchor;

      const colAnchor =
        typeof selection.colAnchor === "number" ? selection.colAnchor : sel.c;
      if (selection.cols) selection.cols.clear();
      const clo = Math.min(colAnchor, c),
        chi = Math.max(colAnchor, c);
      for (let i = clo; i <= chi; i++) selection.cols && selection.cols.add(i);
      selection.colAnchor = colAnchor;
    } else {
      const clickInMulti = selection.rows.size > 1 && selection.rows.has(r);
      if (!clickInMulti) {
        // only collapse if click is outside the existing multi-selection
        selection.rows.clear();
        selection.rows.add(r);
        selection.anchor = r;
      }
      if (selection.cols) {
        selection.cols.clear();
        selection.cols.add(c);
      }
      selection.colAnchor = c;
    }
    sel.r = r;
    sel.c = c;
    ensureVisible(r, c);
    render();

  }

  function onCellDblClick(e) {
    const t = findCellEl(e.target);
    if (!t) return;
    const r = Number(t.dataset.r),
      c = Number(t.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const col = viewDef().columns[c];
    // We already handle double-click edit in mousedown (detail===2). Prevent native dblclick side-effects.
    e.preventDefault();
    if (isModColumn(col)) return; // no editor for mod columns
  }

  // Attach listeners at the sheet level so all child layers are covered
  sheet.addEventListener("mousedown", onCellMouseDown);
  sheet.addEventListener("dblclick", onCellDblClick);

  // Allow scrolling when mouse is over row headers
  let onRowHdrWheel = null;
  if (rowHdrs) {
    onRowHdrWheel = (e) => {
      // Mirror sheet scrolling even when pointer is over the header gutter
      e.preventDefault();
      if (!sheet) return;
      sheet.scrollTop += e.deltaY;
    };
    rowHdrs.addEventListener("wheel", onRowHdrWheel, { passive: false });
  }

  return () => {
    sheet.removeEventListener("mousedown", onCellMouseDown);
    sheet.removeEventListener("dblclick", onCellDblClick);
    if (rowHdrs && onRowHdrWheel)
      rowHdrs.removeEventListener("wheel", onRowHdrWheel);
  };
}
