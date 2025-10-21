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
        let receivedTarget = null;
        const row = { dualof: 7 };
        const model = { outcomes: [{ id: 7, name: "Final Victory" }] };
        const res = beginEditForKind("refPick", {
          paletteAPI: {
            wantsToHandleCell: () => false,
            openReference: ({ target }) => {
              invoked = true;
              receivedTarget = target;
              return true;
            },
          },
          row,
          model,
          col: { entity: "outcome", key: "dualof" },
        });
        assert.ok(invoked, "openReference should be invoked when inline mode missing");
        assert.ok(receivedTarget, "openReference should receive a target payload");
        assert.strictEqual(
          receivedTarget.initialText,
          "Final Victory",
          "fallback should provide a display label for the current value",
        );
        assert.ok(res?.handled, "successful openReference should consume beginEdit");
      },
    },
    {
      name: "refPick beginEdit falls back to openForCurrentCell when openReference missing",
      run(assert) {
        let invoked = false;
        const row = { dualof: 5 };
        const model = { outcomes: [{ id: 5, name: "Radiant Dawn" }] };
        const res = beginEditForKind("refPick", {
          r: 3,
          c: 2,
          row,
          model,
          col: { entity: "outcome", key: "dualof" },
          paletteAPI: {
            wantsToHandleCell: () => false,
            openForCurrentCell: (args) => {
              invoked = true;
              assert.deepStrictEqual(
                { r: args.r, c: args.c },
                { r: 3, c: 2 },
                "openForCurrentCell should receive the requested coordinates",
              );
              assert.strictEqual(
                args.initialText,
                "Radiant Dawn",
                "openForCurrentCell fallback should get the lookup name",
              );
              return true;
            },
          },
        });
        assert.ok(
          invoked,
          "openForCurrentCell should be invoked when openReference is unavailable",
        );
        assert.ok(res?.handled, "successful openForCurrentCell fallback should consume beginEdit");
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
