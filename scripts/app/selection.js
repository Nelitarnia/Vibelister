// selection.js — unified canonical selection state and controller

export const Selection = {
  cell: { r: 0, c: 0 },
  anchor: null,
  colAnchor: null,
  rows: new Set(),
  cols: new Set(),
  colsAll: false,
  horizontalMode: false,
};

export const sel = Selection.cell;
export const selection = Selection; // compatibility alias for existing tests/callers

const listeners = new Set();
export function onSelectionChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  listeners.forEach((cb) => {
    try {
      cb(Selection);
    } catch (_) {}
  });
}

export const SelectionCtl = {
  clear() {
    Selection.rows.clear();
    Selection.cols.clear();
    Selection.anchor = null;
    Selection.colAnchor = null;
    if (!Selection.horizontalMode) Selection.colsAll = false;
    emit();
  },

  selectRow(r) {
    this.clear();
    Selection.anchor = r;
    Selection.rows.add(r);
    Selection.colsAll = !!Selection.horizontalMode;
    Selection.cols.clear();
    Selection.colAnchor = null;
    emit();
  },

  extendRowsTo(r) {
    const a = Selection.anchor != null ? Selection.anchor : sel.r;
    this.clear();
    for (let i = Math.min(a, r); i <= Math.max(a, r); i += 1) Selection.rows.add(i);
    Selection.anchor = a;
    Selection.colsAll = !!Selection.horizontalMode;
    Selection.cols.clear();
    Selection.colAnchor = null;
    emit();
  },

  isRowSelected(r) {
    return Selection.rows.has(r);
  },

  setAllCols(v) {
    if (!v && Selection.horizontalMode) return;
    Selection.colsAll = !!v;
    emit();
  },

  isAllCols() {
    return !!Selection.colsAll;
  },

  startSingle(r, c) {
    this.clear();
    sel.r = r;
    sel.c = c;
    this.selectRow(r);
    Selection.cols.clear();
    Selection.cols.add(c);
    Selection.colAnchor = c;
  },

  extendBoxTo(r, c) {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    this.setAllCols(false);

    const rowAnchor = Selection.anchor != null ? Selection.anchor : sel.r;
    Selection.rows.clear();
    for (let ri = Math.min(rowAnchor, r); ri <= Math.max(rowAnchor, r); ri += 1)
      Selection.rows.add(ri);
    Selection.anchor = rowAnchor;

    const colAnchor = typeof Selection.colAnchor === "number" ? Selection.colAnchor : sel.c;
    Selection.cols.clear();
    for (let ci = Math.min(colAnchor, c); ci <= Math.max(colAnchor, c); ci += 1)
      Selection.cols.add(ci);
    Selection.colAnchor = colAnchor;

    sel.r = r;
    sel.c = c;
    emit();
  },

  toggleRow(r) {
    if (Selection.rows.has(r)) Selection.rows.delete(r);
    else Selection.rows.add(r);
    if (Selection.anchor == null) Selection.anchor = r;
    emit();
  },

  setActiveCell(r, c) {
    sel.r = r;
    sel.c = c;
    if (!Selection.colsAll && Selection.cols.size <= 1) {
      Selection.cols.clear();
      Selection.cols.add(c);
      Selection.colAnchor = c;
    }
    emit();
  },

  armAllCols(v = true) {
    this.setHorizontalMode(v);
  },

  clearAllColsFlag() {
    if (Selection.horizontalMode) return;
    this.setAllCols(false);
  },

  setHorizontalMode(enabled) {
    const next = !!enabled;
    if (Selection.horizontalMode === next) return;
    Selection.horizontalMode = next;
    if (next) {
      if (Selection.rows.size === 0) {
        Selection.rows.add(sel.r);
        Selection.anchor = sel.r;
      }
      this.setAllCols(true);
    } else {
      this.setAllCols(false);
    }
  },

  toggleHorizontalMode() {
    this.setHorizontalMode(!Selection.horizontalMode);
  },

  isHorizontalMode() {
    return !!Selection.horizontalMode;
  },

  applyHorizontalMode() {
    if (!Selection.horizontalMode) return;
    let changed = false;
    if (Selection.rows.size === 0) {
      Selection.rows.add(sel.r);
      Selection.anchor = sel.r;
      changed = true;
    }
    if (!Selection.colsAll) {
      Selection.colsAll = true;
      changed = true;
    }
    if (changed) emit();
  },

  selectedRows() {
    return Selection.rows.size ? Array.from(Selection.rows).sort((a, b) => a - b) : [sel.r];
  },
};

// Compatibility exports for legacy test/caller imports
export const SelectionNS = {
  clear: () => SelectionCtl.clear(),
  selectRow: (r) => SelectionCtl.selectRow(r),
  extendTo: (r) => SelectionCtl.extendRowsTo(r),
  isSelected: (r) => SelectionCtl.isRowSelected(r),
  setColsAll: (v) => SelectionCtl.setAllCols(v),
  isAllCols: () => SelectionCtl.isAllCols(),
};

export const clearSelection = () => SelectionCtl.clear();
export const selectSingleRow = (r) => SelectionCtl.selectRow(r);
export const extendSelectionTo = (r) => SelectionCtl.extendRowsTo(r);
export const isRowSelected = (r) => SelectionCtl.isRowSelected(r);
