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
    selection.rows.clear();
    selection.cols.clear();
    selection.anchor = null;
    selection.colAnchor = null;
    if (!selection.horizontalMode) selection.colsAll = false;
    emit();
  },
  selectRow(r) {
    this.clear();
    selection.anchor = r;
    selection.rows.add(r);
    selection.colsAll = !!selection.horizontalMode;
    selection.cols.clear();
    selection.colAnchor = null;
    emit();
  },
  extendTo(r) {
    const a = selection.anchor != null ? selection.anchor : sel.r;
    this.clear();
    const lo = Math.min(a, r),
      hi = Math.max(a, r);
    for (let i = lo; i <= hi; i++) selection.rows.add(i);
    selection.anchor = a;
    selection.colsAll = !!selection.horizontalMode;
    selection.cols.clear();
    selection.colAnchor = null;
    emit();
  },
  isSelected(r) {
    return selection.rows.has(r);
  },
  setColsAll(v) {
    if (!v && selection.horizontalMode) return;
    selection.colsAll = !!v;
    emit();
  },
  isAllCols() {
    return !!selection.colsAll;
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
  startSingle(r, c) {
    SelectionNS.clear();
    sel.r = r;
    sel.c = c;
    SelectionNS.selectRow(r);
    selection.cols.clear();
    selection.cols.add(c);
    selection.colAnchor = c;
    // SelectionNS.selectRow already emitted
  },
  extendRowsTo(r) {
    SelectionNS.extendTo(r);
  },
  toggleRow(r) {
    if (selection.rows.has(r)) selection.rows.delete(r);
    else selection.rows.add(r);
    if (selection.anchor == null) selection.anchor = r;
    emit();
  },
  setActiveCell(r, c) {
    sel.r = r;
    sel.c = c;
    if (!selection.colsAll && (!selection.cols || selection.cols.size <= 1)) {
      selection.cols.clear();
      selection.cols.add(c);
      selection.colAnchor = c;
    }
    emit();
  },
  armAllCols(v = true) {
    this.setHorizontalMode?.(v);
  },
  clearAllColsFlag() {
    if (selection.horizontalMode) return;
    if (SelectionNS.setColsAll) SelectionNS.setColsAll(false);
  },
  isAllCols() {
    return SelectionNS.isAllCols && SelectionNS.isAllCols();
  },
  setHorizontalMode(enabled) {
    const next = !!enabled;
    if (selection.horizontalMode === next) return;
    selection.horizontalMode = next;
    if (next) {
      if (!selection.rows || selection.rows.size === 0) {
        selection.rows.add(sel.r);
        selection.anchor = sel.r;
      }
      if (SelectionNS.setColsAll) SelectionNS.setColsAll(true);
      else {
        selection.colsAll = true;
        emit();
      }
    } else {
      if (SelectionNS.setColsAll) SelectionNS.setColsAll(false);
      else {
        selection.colsAll = false;
        emit();
      }
    }
  },
  toggleHorizontalMode() {
    this.setHorizontalMode?.(!selection.horizontalMode);
  },
  isHorizontalMode() {
    return !!selection.horizontalMode;
  },
  applyHorizontalMode() {
    if (!selection.horizontalMode) return;
    let changed = false;
    if (!selection.rows || selection.rows.size === 0) {
      selection.rows.add(sel.r);
      selection.anchor = sel.r;
      changed = true;
    }
    if (!selection.colsAll) {
      selection.colsAll = true;
      changed = true;
    }
    if (changed) emit();
  },
  selectedRows() {
    return selection.rows.size
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [sel.r];
  },
};
