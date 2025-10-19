import { snapshotModel } from "../../../data/mutation-runner.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getModelSnapshotTests() {
  return [
    {
      name: "deeply clones model data without sharing references",
      run(assert) {
        const fixture = makeModelFixture();
        const { model, addAction, addInput, addOutcome } = fixture;

        const action = addAction("Alpha", {
          flags: { primary: true },
          stack: [1, 2, 3],
        });
        const input = addInput("Mic");
        const outcome = addOutcome("Win", { weight: 2 });

        model.notes.example = {
          notes: "hello",
          extra: { trail: [outcome.id], deep: { flag: true } },
        };
        model.interactionsPairs = [
          { aId: action.id, iId: input.id, variantSig: "", kind: "AI" },
        ];
        model.nextId = 42;

        const snapshot = snapshotModel(model);

        assert.ok(snapshot.model !== model, "model object cloned");
        assert.deepStrictEqual(
          snapshot.model,
          model,
          "snapshot matches original structure",
        );
        assert.ok(
          snapshot.model.actions !== model.actions,
          "actions array cloned",
        );
        assert.ok(
          snapshot.model.actions[0] !== model.actions[0],
          "row objects cloned",
        );

        model.actions[0].name = "mutated";
        assert.ok(
          snapshot.model.actions[0].name !== model.actions[0].name,
          "changing model does not affect snapshot",
        );

        snapshot.model.notes.example.extra.trail.push(99);
        assert.strictEqual(
          model.notes.example.extra.trail.includes(99),
          false,
          "changing snapshot does not affect model",
        );
        assert.strictEqual(snapshot.model.nextId, 42, "nextId copied");
      },
    },
    {
      name: "can omit derived pairs and notes when requested",
      run(assert) {
        const fixture = makeModelFixture();
        const { model, addAction, addInput } = fixture;
        const action = addAction("Alpha");
        const input = addInput("Mic");
        model.interactionsPairs = [
          { aId: action.id, iId: input.id, variantSig: "", kind: "AI" },
        ];
        model.notes.foo = { notes: "hi" };
        model.nextId = Number.NaN;

        const snapshot = snapshotModel(model, {
          includeDerived: false,
          includeNotes: false,
        });

        assert.deepStrictEqual(
          snapshot.model.interactionsPairs,
          [],
          "derived pairs omitted",
        );
        assert.deepStrictEqual(snapshot.model.notes, {}, "notes omitted");
        assert.strictEqual(
          snapshot.model.nextId,
          1,
          "invalid nextId normalized",
        );
      },
    },
    {
      name: "clones optional attachments and label metadata",
      run(assert) {
        const fixture = makeModelFixture();
        const { model } = fixture;
        const attachments = { selection: { view: "actions", row: 3 } };

        const snapshot = snapshotModel(model, {
          label: "before edit",
          attachments,
        });

        assert.strictEqual(snapshot.label, "before edit", "label stored");
        assert.ok(
          snapshot.attachments !== attachments,
          "attachments cloned from input",
        );
        assert.deepStrictEqual(
          snapshot.attachments,
          { selection: { view: "actions", row: 3 } },
          "attachment content preserved",
        );

        attachments.selection.row = 7;
        assert.strictEqual(
          snapshot.attachments.selection.row,
          3,
          "later caller mutations do not leak into snapshot",
        );

        snapshot.attachments.selection.view = "inputs";
        assert.strictEqual(
          attachments.selection.view,
          "actions",
          "snapshot mutations do not affect caller attachments",
        );
      },
    },
  ];
}
