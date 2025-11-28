import { createCleanupController, CLEANUP_ACTION_IDS } from "../../../app/cleanup-controller.js";
import { MOD_STATE_ID } from "../../../data/mod-state.js";
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
    {
      name: "retains bypass-only notes unless opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const mod = addModifier("Bypasser");
        const action = addAction("Attack", { [mod.id]: MOD_STATE_ID.BYPASS });
        const input = addInput("Button");
        const bypassKey = `ai|${action.id}|${input.id}|${mod.id}`;
        model.notes[bypassKey] = { notes: "bypass" };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const defaultRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanNotes],
          apply: true,
        });
        assert.strictEqual(defaultRun.totalRemoved, 0, "bypass note should be preserved");
        assert.ok(model.notes[bypassKey], "note remains when bypass is excluded");
        const forcedRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanNotes],
          apply: true,
          includeBypassed: true,
        });
        assert.strictEqual(forcedRun.totalRemoved, 1, "note removed when bypass is included");
        assert.ok(!model.notes[bypassKey], "note deleted when opt-in flag is set");
      },
    },
    {
      name: "retains bypass-only end variants unless opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const finishMod = addModifier("Finish Bypass");
        const start = addAction("Start");
        const finish = addAction("Finish", { [finishMod.id]: MOD_STATE_ID.BYPASS });
        const input = addInput("Button");
        const baseKey = `ai|${start.id}|${input.id}|`;
        model.notes[baseKey] = {
          notes: "phase",
          endActionId: finish.id,
          endVariantSig: `${finishMod.id}`,
        };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const defaultRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanEndVariants],
          apply: true,
        });
        assert.strictEqual(defaultRun.totalRemoved, 0, "end variant note preserved by default");
        assert.ok(model.notes[baseKey], "note remains when bypass flag is off");
        const forcedRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanEndVariants],
          apply: true,
          includeBypassed: true,
        });
        assert.strictEqual(forcedRun.totalRemoved, 1, "end variant removed when bypass opt-in");
        assert.ok(!model.notes[baseKey], "note deleted after bypass cleanup");
      },
    },
    {
      name: "retains bypass-only interaction comments unless opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const mod = addModifier("Bypass");
        const action = addAction("Attack", { [mod.id]: MOD_STATE_ID.BYPASS });
        const input = addInput("Button");
        const rowId = `ai|${action.id}|${input.id}|${mod.id}`;
        model.comments.interactions[rowId] = {
          default: { value: "keep" },
        };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const defaultRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanComments],
          apply: true,
        });
        assert.strictEqual(
          defaultRun.totalRemoved,
          0,
          "bypass comment row should be preserved by default",
        );
        assert.ok(
          model.comments.interactions[rowId],
          "comment remains when bypass cleanup is off",
        );
        const forcedRun = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanComments],
          apply: true,
          includeBypassed: true,
        });
        assert.strictEqual(forcedRun.totalRemoved, 1, "comment removed when bypass included");
        assert.ok(!model.comments.interactions[rowId], "comment deleted after opt-in run");
      },
    },
    {
      name: "removes notes and comments for inactive phases",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Phased");
        action.phases = { ids: [0], labels: {} };
        const input = addInput("Button");
        const outcome = addOutcome("Win");
        const baseKey = `ai|${action.id}|${input.id}|`;
        const allowedKey = `${baseKey}|p0`;
        const blockedKey = `${baseKey}|p2`;
        model.notes[allowedKey] = { outcomeId: outcome.id };
        model.notes[blockedKey] = { outcomeId: outcome.id, tags: ["off"] };
        model.comments.interactions[blockedKey] = {
          default: { value: "phase comment" },
        };
        const controller = createCleanupController({
          model,
          runModelMutation: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
        });
        const noPhaseCleanup = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.orphanNotes],
          apply: true,
        });
        assert.strictEqual(
          noPhaseCleanup.totalRemoved,
          0,
          "phase overflow ignored when action is not selected",
        );
        assert.ok(model.notes[blockedKey], "inactive phase note remains by default");
        assert.ok(
          model.comments.interactions[blockedKey],
          "inactive phase comment remains by default",
        );
        const phaseCleanup = controller.runCleanup({
          actionIds: [CLEANUP_ACTION_IDS.phaseOverflowNotes],
          apply: true,
        });
        assert.strictEqual(
          phaseCleanup.totalRemoved,
          2,
          "removes the phase-specific note and its comment",
        );
        assert.ok(model.notes[allowedKey], "allowed phase note is preserved");
        assert.ok(!model.notes[blockedKey], "disallowed phase note removed");
        assert.ok(!model.comments.interactions[blockedKey], "phase comment removed");
      },
    },
  ];
}
