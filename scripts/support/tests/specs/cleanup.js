import { createCleanupController, CLEANUP_ACTION_IDS } from "../../../app/cleanup-controller.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getCleanupTests() {
  return [
    {
      name: "removes notes for unreachable variants",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Attack");
        const input = addInput("Button");
        const validKey = `ai|${action.id}|${input.id}|`;
        const invalidKey = `ai|${action.id}|${input.id}|999`;
        model.notes[validKey] = { notes: "keep" };
        model.notes[invalidKey] = { notes: "remove" };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const result = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanNotes],
          apply: true,
        });
        assert.strictEqual(result.totalRemoved, 1, "should remove a single note");
        assert.ok(model.notes[validKey], "valid note should remain");
        assert.ok(!model.notes[invalidKey], "invalid note removed");
      },
    },
    {
      name: "removes phase notes with invalid end variants",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Attack");
        const finish = addAction("Finish");
        const input = addInput("Button");
        const baseKey = `ai|${action.id}|${input.id}|`;
        const phaseKey = `${baseKey}|p0`;
        model.notes[baseKey] = { notes: "keep" };
        model.notes[phaseKey] = {
          notes: "phase", 
          endActionId: finish.id,
          endVariantSig: `${finish.id + 100}`,
        };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const result = controller.runCleanup({
          actionIds: [
            CLEANUP_ACTION_IDS.orphanNotes,
            CLEANUP_ACTION_IDS.orphanEndVariants,
          ],
          apply: true,
        });
        assert.strictEqual(result.totalRemoved, 1, "only the invalid phase note removed");
        assert.ok(model.notes[baseKey], "base note remains");
        assert.ok(!model.notes[phaseKey], "phase note deleted");
      },
    },
  ];
}
