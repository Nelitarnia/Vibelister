import {
  noteKeyForPair,
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
  clearInteractionsCell,
  clearInteractionsSelection,
  isInteractionPhaseColumnActiveForRow,
} from "../../../app/interactions.js";
import { buildInteractionsPairs } from "../../../data/variants/variants.js";
import { makeModelFixture } from "./model-fixtures.js";

function plainCellText(value) {
  if (value && typeof value === "object" && typeof value.plainText === "string") {
    return value.plainText;
  }
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function cellSegments(value) {
  if (value && typeof value === "object" && Array.isArray(value.segments)) {
    return value.segments;
  }
  return null;
}

function makeInteractionsView() {
  return {
    columns: [
      { key: "action" },
      { key: "input" },
      { key: "p1:outcome" },
      { key: "p1:end" },
      { key: "notes" },
    ],
  };
}

export function getInteractionsTests() {
  return [
    {
      name: "stable ids required for outcome and end cells",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const status = {
          last: "",
          set(msg) {
            this.last = msg || "";
          },
        };
        const action = addAction("Aim");
        addInput("Tap");
        const outcome = addOutcome("Cancels");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        setInteractionsCell(model, status, viewDef, 0, 2, "free text");
        assert.ok(
          status.last.includes("Outcome") || status.last.includes("require"),
          "free text outcome rejected",
        );

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 2, outcome.id);
        const outcomeCell = getInteractionsCell(model, viewDef, 0, 2);
        assert.strictEqual(
          plainCellText(outcomeCell),
          "Cancels",
          "outcome id accepted",
        );

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 3, "EndString");
        assert.ok(status.last.includes("End"), "free text end rejected");

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 3, {
          endActionId: action.id,
          endVariantSig: "",
        });
        const endCell = getInteractionsCell(model, viewDef, 0, 3);
        assert.strictEqual(
          plainCellText(endCell),
          "Aim",
          "structured end payload accepted",
        );
      },
    },
    {
      name: "structured copy paste round trip",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Attack");
        addInput("Jab");
        const outcome = addOutcome("Hit");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, outcome.id);
        setInteractionsCell(model, { set() {} }, viewDef, 0, 3, {
          endActionId: action.id,
          endVariantSig: "",
        });

        const payloadOutcome = getStructuredCellInteractions(
          model,
          viewDef,
          0,
          2,
        );
        const payloadEnd = getStructuredCellInteractions(model, viewDef, 0, 3);
        assert.strictEqual(
          payloadOutcome?.type,
          "outcome",
          "structured outcome type",
        );
        assert.strictEqual(payloadOutcome?.data?.outcomeId, outcome.id);
        assert.strictEqual(payloadEnd?.type, "end", "structured end type");
        assert.strictEqual(payloadEnd?.data?.endActionId, action.id);

        addInput("Kick");
        buildInteractionsPairs(model);

        const applyOutcome = applyStructuredCellInteractions(
          (r, c, v) =>
            setInteractionsCell(model, { set() {} }, viewDef, r, c, v),
          viewDef,
          1,
          2,
          payloadOutcome,
          model,
        );
        assert.ok(applyOutcome, "outcome payload applied");

        const applyEnd = applyStructuredCellInteractions(
          (r, c, v) =>
            setInteractionsCell(model, { set() {} }, viewDef, r, c, v),
          viewDef,
          1,
          3,
          payloadEnd,
          model,
        );
        assert.ok(applyEnd, "end payload applied");

        const pastedOutcome = getInteractionsCell(model, viewDef, 1, 2);
        const pastedEnd = getInteractionsCell(model, viewDef, 1, 3);
        assert.strictEqual(
          plainCellText(pastedOutcome),
          "Hit",
          "pasted outcome visible",
        );
        assert.strictEqual(
          plainCellText(pastedEnd),
          "Attack",
          "pasted end visible",
        );
      },
    },
    {
      name: "AA phase 0 palette edits mirror and clear",
      run(assert) {
        const { model, addAction, addOutcome } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const left = addAction("Left");
        const right = addAction("Right");
        const win = addOutcome("Win");
        const lose = addOutcome("Lose");
        win.dualof = lose.id;
        lose.dualof = win.id;
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "rhsaction" },
            { key: "p0:outcome" },
          ],
        };
        const row = model.interactionsPairs.findIndex(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = model.interactionsPairs.findIndex(
          (pair) => pair.aId === right.id && pair.rhsActionId === left.id,
        );
        assert.ok(row >= 0 && mirrorRow >= 0, "expected AA pairs present");
        const status = { set() {} };

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        const mirroredAfterWin = getInteractionsCell(
          model,
          viewDef,
          mirrorRow,
          2,
        );
        assert.strictEqual(
          plainCellText(mirroredAfterWin),
          "Lose",
          "mirrored row reflects inverted outcome",
        );
        const mirrorKey = noteKeyForPair(
          model.interactionsPairs[mirrorRow],
          0,
        );
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note stores inverted outcome id",
        );

        setInteractionsCell(model, status, viewDef, row, 2, null);
        const mirroredAfterClear = getInteractionsCell(
          model,
          viewDef,
          mirrorRow,
          2,
        );
        assert.strictEqual(
          plainCellText(mirroredAfterClear),
          "",
          "clearing source row clears mirrored cell",
        );
        assert.ok(
          !model.notes[mirrorKey],
          "mirrored note entry removed when source cleared",
        );

        setInteractionsCell(model, status, viewDef, mirrorRow, 2, lose.id);
        const sourceAfterMirrorWrite = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterMirrorWrite),
          "Win",
          "mirrored write reflects inverted outcome on source row",
        );
        const sourceKey = noteKeyForPair(model.interactionsPairs[row], 0);
        assert.strictEqual(
          model.notes[sourceKey]?.outcomeId,
          win.id,
          "source note stores inverted outcome when mirror edited",
        );

        setInteractionsCell(model, status, viewDef, mirrorRow, 2, null);
        const sourceAfterMirrorClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterMirrorClear),
          "",
          "clearing mirrored row clears source cell",
        );
        assert.ok(
          !model.notes[sourceKey],
          "source note entry removed when mirror cleared",
        );
      },
    },
    {
      name: "AA phase 0 command clears mirror both directions",
      run(assert) {
        const { model, addAction, addOutcome } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const left = addAction("Left");
        const right = addAction("Right");
        const win = addOutcome("Win");
        const lose = addOutcome("Lose");
        win.dualof = lose.id;
        lose.dualof = win.id;
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "rhsaction" },
            { key: "p0:outcome" },
          ],
        };
        const row = model.interactionsPairs.findIndex(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = model.interactionsPairs.findIndex(
          (pair) => pair.aId === right.id && pair.rhsActionId === left.id,
        );
        assert.ok(row >= 0 && mirrorRow >= 0, "expected AA pairs present");
        const status = { set() {} };

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        const mirrorKey = noteKeyForPair(model.interactionsPairs[mirrorRow], 0);
        const sourceKey = noteKeyForPair(model.interactionsPairs[row], 0);
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note stores inverted outcome",
        );

        const cleared = clearInteractionsCell(model, viewDef, mirrorRow, 2);
        assert.ok(cleared, "clearInteractionsCell reports change");
        const sourceAfterCommandClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterCommandClear),
          "",
          "clearing mirrored row via command clears source cell",
        );
        assert.ok(
          !model.notes[sourceKey] && !model.notes[mirrorKey],
          "notes removed on both sides after command clear",
        );

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note restored for selection clear",
        );

        const selection = { rows: new Set([mirrorRow]) };
        const sel = { r: mirrorRow, c: 2 };
        const statusClear = { set() {} };
        const result = clearInteractionsSelection(
          model,
          viewDef,
          selection,
          sel,
          "clearActiveCell",
          statusClear,
          () => {},
        );
        assert.ok(result?.cleared > 0, "selection clear reports entries cleared");
        const sourceAfterSelectionClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterSelectionClear),
          "",
          "selection clear removes mirrored source cell",
        );
        assert.ok(
          !model.notes[sourceKey] && !model.notes[mirrorKey],
          "notes removed on both sides after selection clear",
        );
      },
    },
    {
      name: "phase availability respects action phases",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Attack");
        action.phases = { ids: [1], labels: {} };
        addInput("Light");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "p1:outcome" },
            { key: "p2:outcome" },
            { key: "p1:end" },
          ],
        };
        assert.ok(
          isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 0),
          "phase 1 outcome active",
        );
        assert.ok(
          !isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 1),
          "phase 2 outcome inactive",
        );
        assert.ok(
          isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 2),
          "phase 1 end active",
        );
      },
    },
    {
      name: "end display canonicalizes variant signatures",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const m1 = addModifier("Rise");
        const m2 = addModifier("Fall");
        m1.color2 = "#ff0000";
        m2.color2 = "#00ff00";
        const action = addAction("Lift", { [m1.id]: 1, [m2.id]: 1 });
        addInput("Up");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [{ key: "action" }, { key: "input" }, { key: "p1:end" }],
        };

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, {
          endActionId: action.id,
          endVariantSig: `${m2.id}+${m1.id}`,
        });
        const cell = getInteractionsCell(model, viewDef, 0, 2);
        const text = plainCellText(cell);
        assert.ok(
          /Lift \((Fall\+Rise|Rise\+Fall)\)/.test(text),
          "end column shows canonical modifier order",
        );
        const segments = cellSegments(cell);
        assert.ok(Array.isArray(segments) && segments.length >= 5, "segments emitted");
        const riseSegment = segments.find((seg) => seg.text === "Rise");
        const fallSegment = segments.find((seg) => seg.text === "Fall");
        assert.strictEqual(riseSegment?.foreground, "#ff0000", "Rise uses color2 foreground");
        assert.strictEqual(fallSegment?.foreground, "#00ff00", "Fall uses color2 foreground");
        const riseIndex = segments.indexOf(riseSegment);
        const fallIndex = segments.indexOf(fallSegment);
        assert.ok(riseIndex >= 0 && fallIndex > riseIndex, "modifier segments preserve canonical order");
      },
    },
  ];
}
