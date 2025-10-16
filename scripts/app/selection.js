// selection.js — unified selection state, controller, and event bus

// ---- Core state
export const Selection = {
  cell: { r: 0, c: 0 },
  anchor: null,
  rows: new Set(),
  colsAll: false,
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
    selection.anchor = null;
    selection.colsAll = false;
    emit();
  },
  selectRow(r) {
    this.clear();
    selection.anchor = r;
    selection.rows.add(r);
    selection.colsAll = false;
    emit();
  },
  extendTo(r) {
    const a = selection.anchor != null ? selection.anchor : sel.r;
    this.clear();
    const lo = Math.min(a, r),
      hi = Math.max(a, r);
    for (let i = lo; i <= hi; i++) selection.rows.add(i);
    selection.anchor = a;
    selection.colsAll = false;
    emit();
  },
  isSelected(r) {
    return selection.rows.has(r);
  },
  setColsAll(v) {
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
    emit();
  },
  armAllCols(v = true) {
    SelectionNS.setColsAll && SelectionNS.setColsAll(!!v);
  },
  clearAllColsFlag() {
    if (SelectionNS.setColsAll) SelectionNS.setColsAll(false);
  },
  isAllCols() {
    return SelectionNS.isAllCols && SelectionNS.isAllCols();
  },
  selectedRows() {
    return selection.rows.size
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [sel.r];
  },
};
