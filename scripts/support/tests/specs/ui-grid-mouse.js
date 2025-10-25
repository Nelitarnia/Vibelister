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
    SelectionCtl: {
      extendBoxTo(r, c) {
        deps._extended = (deps._extended || 0) + 1;
        deps.SelectionNS.setColsAll(false);
        const rowAnchor =
          deps.selection.anchor != null ? deps.selection.anchor : deps.sel.r;
        deps.selection.rows.clear();
        for (let i = Math.min(rowAnchor, r); i <= Math.max(rowAnchor, r); i++) {
          deps.selection.rows.add(i);
        }
        deps.selection.anchor = rowAnchor;
        const colAnchor =
          typeof deps.selection.colAnchor === "number"
            ? deps.selection.colAnchor
            : deps.sel.c;
        deps.selection.cols.clear();
        for (let i = Math.min(colAnchor, c); i <= Math.max(colAnchor, c); i++) {
          deps.selection.cols.add(i);
        }
        deps.selection.colAnchor = colAnchor;
        deps.sel.r = r;
        deps.sel.c = c;
      },
    },
    isEditing: () => false,
    beginEdit: (r, c) => (deps._began = [r, c]),
    endEdit: () => {},
    render: () => deps._rendered++,
    ensureVisible: () => {},
    viewDef: () => ({ columns: [{ key: "name" }, { key: "mod:7" }] }),
    isModColumn: (col) => /^mod:/.test(col.key),
    setModForSelection: (idx) => (deps._toggled = idx),
    _began: null,
    _toggled: null,
    _rendered: 0,
    _extended: 0,
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
      name: "shift-click extends box selection",
      run(assert) {
        const deps = makeDeps();
        deps.selection.rows = new Set([1]);
        deps.selection.anchor = 1;
        deps.selection.cols = new Set([0]);
        deps.selection.colAnchor = 0;
        deps.sel.r = 1;
        deps.sel.c = 0;
        initGridMouse(deps);
        const cell = makeCell(deps.sheet, 3, 2);
        deps.sheet.dispatch("mousedown", {
          button: 0,
          detail: 1,
          preventDefault() {},
          target: cell,
          shiftKey: true,
        });
        assert.strictEqual(deps._extended, 1, "extend helper should be used");
        assert.deepStrictEqual(
          Array.from(deps.selection.rows).sort((a, b) => a - b),
          [1, 2, 3],
          "rows should include anchor through clicked row",
        );
        assert.deepStrictEqual(
          Array.from(deps.selection.cols).sort((a, b) => a - b),
          [0, 1, 2],
          "cols should include anchor through clicked col",
        );
        assert.strictEqual(deps.sel.r, 3, "active row should follow click");
        assert.strictEqual(deps.sel.c, 2, "active col should follow click");
      },
    },
    {
      name: "double-click on modifier column begins edit",
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
        assert.deepStrictEqual(deps._began, [3, 1]);
      },
    },
    {
      name: "single click on modifier column only updates selection",
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
        assert.strictEqual(deps._toggled, null);
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
