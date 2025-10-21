import { beginEditForKind } from "../../../data/column-kinds.js";

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
  ];
}
