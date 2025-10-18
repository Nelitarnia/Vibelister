import { initRowDrag } from "../../../ui/drag.js";

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
    dispatch(type, e) {
      const arr = listeners.get(type) || [];
      for (const cb of arr) cb(e);
    },
  };
}

export function getUiRowDragTests() {
  return [
    {
      name: "clicking selected row header keeps multi-selection intact",
      run(assert) {
        const rowHdrs = makeTarget();
        const selection = {
          rows: new Set([1, 2, 3]),
          anchor: 1,
          colsAll: false,
        };
        const sel = { r: 0 };
        let clearSelectionCalled = false;
        let renderCount = 0;

        const SelectionNS = {
          selectRow(r) {
            selection.rows.clear();
            selection.rows.add(r);
            selection.anchor = r;
            selection.colsAll = false;
          },
          extendTo(r) {
            const anchor = selection.anchor ?? sel.r;
            selection.rows.clear();
            for (let i = Math.min(anchor, r); i <= Math.max(anchor, r); i++) {
              selection.rows.add(i);
            }
            selection.anchor = anchor;
          },
          setColsAll(v) {
            selection.colsAll = !!v;
          },
          isSelected(r) {
            return selection.rows.has(r);
          },
        };

        initRowDrag({
          rowHdrs,
          sheet: {},
          dragLine: { style: {} },
          dataArray: () => [],
          getRowCount: () => 10,
          ensureMinRows: () => {},
          clamp: (v) => v,
          selection,
          sel,
          clearSelection() {
            clearSelectionCalled = true;
            selection.rows.clear();
            selection.anchor = null;
          },
          SelectionNS,
          render() {
            renderCount++;
          },
          layout: () => {},
          status: null,
          ROW_HEIGHT: 24,
          HEADER_HEIGHT: 24,
          isReorderableView: () => false,
        });

        const rh = { dataset: { r: "2" } };
        const eventTarget = {
          closest(sel) {
            if (sel === ".rhdr") return rh;
            return null;
          },
        };

        rowHdrs.dispatch("mousedown", {
          target: eventTarget,
          shiftKey: false,
        });

        assert.strictEqual(
          clearSelectionCalled,
          false,
          "clicking a selected row should not clear the existing selection",
        );
        assert.deepStrictEqual(
          Array.from(selection.rows).sort((a, b) => a - b),
          [1, 2, 3],
          "multi-row selection should remain intact",
        );
        assert.strictEqual(sel.r, 2, "active row should move to the clicked header");
        assert.strictEqual(renderCount, 1, "render should run once for the click");
      },
    },
  ];
}
