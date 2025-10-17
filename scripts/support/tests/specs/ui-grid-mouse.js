import { initGridMouse } from "../../../ui/grid-mouse.js";

function makeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, cb) {
      const arr = listeners.get(type) || [];
      arr.push(cb);
      listeners.set(type, arr);
    },
    removeEventListener(type, cb) {
      const arr = listeners.get(type) || [];
      const idx = arr.indexOf(cb);
      if (idx >= 0) {
        arr.splice(idx, 1);
        listeners.set(type, arr);
      }
    },
    contains(node) {
      return node && node._root === this;
    },
    dispatch(type, e) {
      const arr = listeners.get(type) || [];
      for (const cb of arr) cb(e);
    },
    scrollTop: 0,
    scrollLeft: 0,
  };
}

function makeCell(sheet, r, c) {
  return {
    _root: sheet,
    dataset: { r: String(r), c: String(c) },
    closest(sel) {
      return sel.includes("cell") || sel.includes("[data-r]") ? this : null;
    },
  };
}

function makeDeps() {
  const sheet = makeTarget();
  const rowHdrs = makeTarget();
  const editor = {};
  const deps = {
    sheet,
    rowHdrs,
    editor,
    sel: { r: 0, c: 0 },
    selection: {
      rows: new Set(),
      cols: new Set(),
      anchor: null,
      colAnchor: null,
      colsAll: false,
    },
    SelectionNS: {
      selectRow(r) {
        deps.selection.rows.clear();
        deps.selection.rows.add(r);
        deps.selection.anchor = r;
        deps.selection.colsAll = false;
        deps.selection.cols.clear();
        deps.selection.colAnchor = null;
      },
      extendTo(r) {
        const anchor = deps.selection.anchor ?? deps.sel.r;
        deps.selection.rows.clear();
        for (let i = Math.min(anchor, r); i <= Math.max(anchor, r); i++) {
          deps.selection.rows.add(i);
        }
        deps.selection.anchor = anchor;
        deps.selection.cols.clear();
        deps.selection.colAnchor = null;
      },
      setColsAll(v) {
        deps.selection.colsAll = !!v;
        if (v) deps.selection.cols.clear();
      },
      isAllCols() {
        return deps.selection.colsAll;
      },
    },
    isEditing: () => false,
    beginEdit: (r, c) => deps._began = [r, c],
    endEdit: () => {},
    render: () => deps._rendered++,
    ensureVisible: () => {},
    viewDef: () => ({ columns: [{ key: "name" }, { key: "mod:7" }] }),
    isModColumn: (col) => /^mod:/.test(col.key),
    setModForSelection: (idx) => (deps._toggled = idx),
    _began: null,
    _toggled: null,
    _rendered: 0,
  };
  return deps;
}

export function getUiGridMouseTests() {
  return [
    {
      name: "double-click on non-mod column begins edit",
      run(assert) {
        const deps = makeDeps();
        initGridMouse(deps);
        const cell = makeCell(deps.sheet, 3, 0);
        deps._began = null;
        deps.sheet.dispatch("mousedown", {
          button: 0,
          detail: 2,
          preventDefault() {},
          target: cell,
        });
        assert.deepStrictEqual(deps._began, [3, 0]);
      },
    },
    {
      name: "double-click on modifier column is suppressed",
      run(assert) {
        const deps = makeDeps();
        initGridMouse(deps);
        const cell = makeCell(deps.sheet, 3, 1);
        deps._began = null;
        deps.sheet.dispatch("mousedown", {
          button: 0,
          detail: 2,
          preventDefault() {},
          target: cell,
        });
        assert.strictEqual(deps._began, null);
      },
    },
    {
      name: "single click toggles modifier across selection",
      run(assert) {
        const deps = makeDeps();
        deps.selection.rows = new Set([2, 3, 4]);
        deps.selection.anchor = 2;
        initGridMouse(deps);
        const cell = makeCell(deps.sheet, 3, 1);
        deps._toggled = null;
        deps.sheet.dispatch("mousedown", {
          button: 0,
          detail: 1,
          preventDefault() {},
          target: cell,
          shiftKey: false,
        });
        assert.strictEqual(deps._toggled, 1);
      },
    },
    {
      name: "row header wheel forwards to sheet",
      run(assert) {
        const deps = makeDeps();
        initGridMouse(deps);
        const initialTop = deps.sheet.scrollTop;
        deps.rowHdrs.dispatch("wheel", {
          deltaY: 60,
          preventDefault() {},
        });
        assert.strictEqual(deps.sheet.scrollTop, initialTop + 60);
      },
    },
  ];
}
