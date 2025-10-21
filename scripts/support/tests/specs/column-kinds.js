import { beginEditForKind, setCellForKind } from "../../../data/column-kinds.js";

export function getColumnKindTests() {
  return [
    {
      name: "text beginEdit allows editing for blank seeded rows",
      run(assert) {
        const res = beginEditForKind("text", {
          activeView: "actions",
          row: undefined,
        });
        assert.ok(res?.useEditor, "blank grid rows should open the editor");
      },
    },
    {
      name: "text beginEdit still blocks interactions synthetic rows",
      run(assert) {
        const res = beginEditForKind("text", {
          activeView: "interactions",
          row: null,
        });
        assert.ok(res?.handled, "interactions rows remain read-only");
      },
    },
    {
      name: "refPick beginEdit respects inline palette handling",
      run(assert) {
        const res = beginEditForKind("refPick", {
          paletteAPI: { wantsToHandleCell: () => true },
          col: { entity: "outcome" },
        });
        assert.ok(res?.useEditor, "palette-aware refPick should keep editor flow");
      },
    },
    {
      name: "refPick beginEdit falls back to openReference when needed",
      run(assert) {
        let invoked = false;
        const res = beginEditForKind("refPick", {
          paletteAPI: {
            wantsToHandleCell: () => false,
            openReference: () => {
              invoked = true;
              return true;
            },
          },
          col: { entity: "outcome" },
        });
        assert.ok(invoked, "openReference should be invoked when inline mode missing");
        assert.ok(res?.handled, "successful openReference should consume beginEdit");
      },
    },
    {
      name: "refPick set stores selected outcome id",
      run(assert) {
        const row = { dualof: null };
        const col = { key: "dualof", entity: "outcome" };
        setCellForKind("refPick", { row, col }, 42);
        assert.strictEqual(
          row.dualof,
          42,
          "refPick should persist the chosen stable id",
        );
      },
    },
  ];
}
