import {
  Selection,
  SelectionCtl,
  SelectionNS,
  sel,
} from "../../../app/selection.js";

function resetSelectionState() {
  SelectionCtl.setHorizontalMode(false);
  SelectionNS.clear();
  sel.r = 0;
  sel.c = 0;
}

export function getSelectionTests() {
  return [
    {
      name: "horizontal mode pins full rows until disabled",
      run(assert) {
        resetSelectionState();
        SelectionCtl.startSingle(2, 1);
        assert.strictEqual(Selection.horizontalMode, false);
        assert.strictEqual(Selection.colsAll, false);

        SelectionCtl.setHorizontalMode(true);
        assert.strictEqual(Selection.horizontalMode, true);
        assert.strictEqual(Selection.colsAll, true);
        assert.ok(
          Selection.rows.has(2),
          "row selection should include active row",
        );

        SelectionNS.setColsAll(false);
        assert.strictEqual(
          Selection.colsAll,
          true,
          "manual clear should be ignored while horizontal mode is active",
        );
        SelectionCtl.clearAllColsFlag();
        assert.strictEqual(
          Selection.colsAll,
          true,
          "clear flag should not disable horizontal mode",
        );

        SelectionCtl.setHorizontalMode(false);
        assert.strictEqual(Selection.horizontalMode, false);
        assert.strictEqual(Selection.colsAll, false);
        assert.ok(
          Selection.rows.has(2),
          "row membership remains after disabling mode",
        );
      },
    },
    {
      name: "applyHorizontalMode restores row coverage after clearing",
      run(assert) {
        resetSelectionState();
        SelectionCtl.startSingle(3, 0);
        SelectionCtl.setHorizontalMode(true);
        SelectionNS.clear();

        assert.strictEqual(Selection.rows.size, 0);

        sel.r = 3;
        SelectionCtl.applyHorizontalMode();
        assert.ok(
          Selection.rows.has(3),
          "active row should be re-added when mode reapplies",
        );
        assert.strictEqual(Selection.colsAll, true);
      },
    },
    {
      name: "column selection persists while horizontal mode is active",
      run(assert) {
        resetSelectionState();
        SelectionCtl.startSingle(1, 0);
        SelectionCtl.setHorizontalMode(true);

        SelectionCtl.startSingle(1, 4);
        assert.ok(Selection.cols.has(4));
        SelectionCtl.setHorizontalMode(false);
        assert.strictEqual(Selection.colsAll, false);
        assert.ok(
          Selection.cols.has(4),
          "underlying column selection should remain after exiting mode",
        );
      },
    },
  ];
}
