// selection.js — unified selection state, controller, and event bus

// ---- Core state
export const Selection = {
  cell: { r: 0, c: 0 },
  anchor: null,
  colAnchor: null,
  rows: new Set(),
  cols: new Set(),
  colsAll: false,
  horizontalMode: false,
};
export const sel = Selection.cell; // convenience alias {r,c}
export const selection = Selection; // legacy alias for callers

// ---- Change listeners
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

// ---- Namespace-style mutators (compatible with old call sites)
export const SelectionNS = {
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
  extendTo(r) {
    const a = Selection.anchor != null ? Selection.anchor : sel.r;
    this.clear();
    const lo = Math.min(a, r);
    const hi = Math.max(a, r);
    for (let i = lo; i <= hi; i++) Selection.rows.add(i);
    Selection.anchor = a;
    Selection.colsAll = !!Selection.horizontalMode;
    Selection.cols.clear();
    Selection.colAnchor = null;
    emit();
  },
  isSelected(r) {
    return Selection.rows.has(r);
  },
  setColsAll(v) {
    if (!v && Selection.horizontalMode) return;
    Selection.colsAll = !!v;
    emit();
  },
  isAllCols() {
    return !!Selection.colsAll;
  },
};

// Thin wrappers to preserve legacy call sites
export function clearSelection() {
  SelectionNS.clear();
}
export function selectSingleRow(r) {
  SelectionNS.selectRow(r);
}
export function extendSelectionTo(r) {
  SelectionNS.extendTo(r);
}
export function isRowSelected(r) {
  return SelectionNS.isSelected(r);
}

// ---- Controller API (higher-level intents)
export const SelectionCtl = {
  // canonical controller methods
  clear() {
    SelectionNS.clear();
  },
  selectRow(r) {
    SelectionNS.selectRow(r);
  },
  extendRowsTo(r) {
    SelectionNS.extendTo(r);
  },
  isRowSelected(r) {
    return SelectionNS.isSelected(r);
  },
  setAllCols(v) {
    SelectionNS.setColsAll(v);
  },
  isAllCols() {
    return SelectionNS.isAllCols();
  },

  startSingle(r, c) {
    this.clear();
    sel.r = r;
    sel.c = c;
    this.selectRow(r);
    Selection.cols.clear();
    Selection.cols.add(c);
    Selection.colAnchor = c;
    // selectRow already emitted
  },
  extendBoxTo(r, c) {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    this.setAllCols(false);

    const rowAnchor = Selection.anchor != null ? Selection.anchor : sel.r;
    Selection.rows.clear();
    const rLo = Math.min(rowAnchor, r);
    const rHi = Math.max(rowAnchor, r);
    for (let ri = rLo; ri <= rHi; ri++) Selection.rows.add(ri);
    Selection.anchor = rowAnchor;

    const colAnchor =
      typeof Selection.colAnchor === "number" ? Selection.colAnchor : sel.c;
    Selection.cols.clear();
    const cLo = Math.min(colAnchor, c);
    const cHi = Math.max(colAnchor, c);
    for (let ci = cLo; ci <= cHi; ci++) Selection.cols.add(ci);
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
    return Selection.rows.size
      ? Array.from(Selection.rows).sort((a, b) => a - b)
      : [sel.r];
  },
};
