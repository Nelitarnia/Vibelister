import {
  createEmptyCommentMap,
  makeCommentCellKey,
  makeCommentColumnKey,
  makeCommentRowKey,
  normalizeCommentsMap,
} from "../../../data/comments.js";

export function getCommentTests() {
  return [
    {
      name: "normalizeCommentsMap preserves view buckets",
      run(assert) {
        const raw = {
          actions: { 1: { text: "A" }, " 2 ": { text: "B" } },
          inputs: [{ ignore: true }],
          custom: { note: "keep" },
        };
        const normalized = normalizeCommentsMap(raw, ["actions", "inputs"]);
        assert.deepStrictEqual(normalized, {
          actions: { "1": { text: "A" }, "2": { text: "B" } },
          inputs: {},
          custom: { note: "keep" },
        });
      },
    },
    {
      name: "comment keys compose view, row, and column",
      run(assert) {
        const viewDef = {
          key: "actions",
          columns: [
            { key: "name", title: "Action Name" },
            { title: "Other Notes" },
          ],
        };

        const rowKey = makeCommentRowKey("actions", 42);
        assert.strictEqual(rowKey, "actions:42");

        const columnKey = makeCommentColumnKey(viewDef, 0);
        assert.strictEqual(columnKey, "name");

        const composed = makeCommentCellKey(viewDef, viewDef.columns[1], "007");
        assert.strictEqual(composed, "actions:7|title:Other Notes");

        const json = JSON.stringify({ [composed]: { text: "hi" } });
        assert.strictEqual(
          json,
          '{"actions:7|title:Other Notes":{"text":"hi"}}',
          "cell keys should serialize directly",
        );
      },
    },
    {
      name: "createEmptyCommentMap seeds requested views",
      run(assert) {
        const store = createEmptyCommentMap(["actions", "modifiers"]);
        assert.deepStrictEqual(store, { actions: {}, modifiers: {} });
      },
    },
  ];
}
