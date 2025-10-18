import { insertBlankRows } from "../../../data/rows.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getRowInsertionTests() {
  return [
    {
      name: "inserts requested number of blank rows",
      run(assert) {
        const { model } = makeModelFixture();
        const target = model.actions;
        assert.strictEqual(target.length, 0, "fixture starts empty");

        const inserted = insertBlankRows(model, target, 0, 2);

        assert.strictEqual(target.length, 2, "array length reflects inserted rows");
        assert.strictEqual(inserted.length, 2, "helper returns inserted rows");
        assert.deepStrictEqual(
          target.slice(0, 2),
          inserted,
          "rows appear at requested index",
        );
      },
    },
    {
      name: "assigns unique ids when inserting rows",
      run(assert) {
        const { model } = makeModelFixture();
        const target = model.modifiers;

        const first = insertBlankRows(model, target, 0, 1)[0];
        const existingIds = new Set(target.map((row) => row.id));

        const inserted = insertBlankRows(model, target, 1, 4);
        const ids = inserted.map((row) => row.id);

        assert.strictEqual(
          new Set(ids).size,
          inserted.length,
          "every inserted row receives a unique id",
        );
        for (const id of ids) {
          assert.ok(!existingIds.has(id), "id was not reused from earlier rows");
        }
        assert.ok(
          ids.every((id) => typeof id === "number" && Number.isFinite(id)),
          "ids are numeric",
        );
        assert.strictEqual(
          model.nextId,
          Math.max(first.id, ...ids) + 1,
          "model.nextId advanced past last assigned id",
        );
      },
    },
  ];
}
