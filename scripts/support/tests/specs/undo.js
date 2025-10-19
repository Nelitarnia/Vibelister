import { makeMutationRunner } from "../../../data/mutation-runner.js";
import { clearInteractionsSelection, noteKeyForPair } from "../../../app/interactions.js";
import { makeModelFixture } from "./model-fixtures.js";

function createRunner(model, statusLog = []) {
  return makeMutationRunner({
    model,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    pruneNotesToValidPairs: () => {},
    invalidateViewDef: () => {},
    layout: () => {},
    render: () => {},
    status: {
      set(message) {
        statusLog.push(message);
      },
    },
    historyLimit: 20,
  });
}

export function getUndoTests() {
  return [
    {
      name: "undo and redo restore cell edits",
      run(assert) {
        const log = [];
        const { model, addAction } = makeModelFixture();
        const row = addAction("Hero");
        const findRow = () => model.actions.find((r) => r.id === row.id);
        const runner = createRunner(model, log);

        runner.runModelMutation(
          "editName",
          () => {
            const current = findRow();
            const before = current?.name;
            if (current) current.name = "Villain";
            return { before, after: current?.name, changed: before !== current?.name };
          },
          {
            undo: {
              label: "name edit",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
              makeStatus: ({ direction }) =>
                direction === "undo" ? "undid" : "redid",
            },
          },
        );

        assert.strictEqual(findRow()?.name, "Villain");
        assert.ok(runner.getUndoState().canUndo, "history entry recorded");

        assert.strictEqual(runner.undo(), true, "undo succeeds");
        assert.strictEqual(findRow()?.name, "Hero", "name reverted after undo");
        assert.strictEqual(log.at(-1), "undid", "status message for undo emitted");
        assert.ok(runner.getUndoState().canRedo, "redo available after undo");

        assert.strictEqual(runner.redo(), true, "redo succeeds");
        assert.strictEqual(findRow()?.name, "Villain", "name restored after redo");
        assert.strictEqual(log.at(-1), "redid", "status message for redo emitted");
      },
    },
    {
      name: "paste transactions record undo entries",
      run(assert) {
        const log = [];
        const { model, addAction } = makeModelFixture();
        const rowA = addAction("One");
        const rowB = addAction("Two");
        const runner = createRunner(model, log);

        const findRow = (row) => model.actions.find((r) => r.id === row.id);

        runner.runModelMutation(
          "editRowA",
          () => {
            const current = findRow(rowA);
            const before = current?.name;
            if (current) current.name = "Edited";
            const changed = before !== current?.name;
            return { before, after: current?.name, changed };
          },
          {
            undo: {
              label: "cell edit",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
              makeStatus: ({ direction }) => direction,
            },
          },
        );

        runner.runModelTransaction(
          "pasteCells",
          () => {
            const current = findRow(rowB);
            const before = current?.name;
            if (current) current.name = "Pasted";
            const changed = before !== current?.name;
            return {
              changed,
              appliedCount: changed ? 1 : 0,
              attemptedCells: 1,
              rejectedCount: 0,
            };
          },
          {
            render: (res) => !!res?.changed,
            undo: {
              label: "paste",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
              makeStatus: ({ direction, context }) =>
                `${direction}:${context?.result?.appliedCount ?? 0}`,
            },
          },
        );

        assert.strictEqual(findRow(rowA)?.name, "Edited", "row A retains edit");
        assert.strictEqual(findRow(rowB)?.name, "Pasted", "row B reflects paste");

        const stateAfterPaste = runner.getUndoState();
        assert.ok(stateAfterPaste.canUndo, "undo available after paste");
        assert.strictEqual(stateAfterPaste.undoLabel, "paste", "paste at top of history");

        assert.strictEqual(runner.undo(), true, "undo succeeds");
        assert.strictEqual(findRow(rowB)?.name, "Two", "row B reverted after undo");
        assert.strictEqual(
          findRow(rowA)?.name,
          "Edited",
          "row A edit preserved after undoing paste",
        );
        assert.strictEqual(log.at(-1), "undo:1", "status message indicates undo");

        const stateAfterUndo = runner.getUndoState();
        assert.strictEqual(stateAfterUndo.undoLabel, "cell edit", "prior entry exposed");
        assert.ok(stateAfterUndo.canRedo, "redo available after undo");

        assert.strictEqual(runner.redo(), true, "redo succeeds");
        assert.strictEqual(findRow(rowB)?.name, "Pasted", "row B restored after redo");
        assert.strictEqual(log.at(-1), "redo:1", "status message indicates redo");

        const stateAfterRedo = runner.getUndoState();
        assert.strictEqual(stateAfterRedo.undoLabel, "paste", "paste restored to top");
      },
    },
    {
      name: "redo history is cleared after new change",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const row = addAction("Alpha");
        const runner = createRunner(model);

        const findRow = () => model.actions.find((r) => r.id === row.id);

        runner.runModelMutation(
          "editName",
          () => {
            const current = findRow();
            const before = current?.name;
            if (current) current.name = "Beta";
            return { before, after: current?.name, changed: before !== current?.name };
          },
          {
            undo: {
              label: "name edit",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
            },
          },
        );

        runner.undo();
        assert.ok(runner.getUndoState().canRedo, "redo available before new change");

        runner.runModelMutation(
          "editNameAgain",
          () => {
            const current = findRow();
            if (current) current.name = "Gamma";
            return { changed: true };
          },
          {
            undo: {
              label: "name edit",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
            },
          },
        );

        assert.strictEqual(findRow()?.name, "Gamma", "latest change applied");
        const state = runner.getUndoState();
        assert.ok(!state.canRedo, "redo cleared after new change");
        assert.ok(state.canUndo, "undo remains available");
      },
    },
    {
      name: "clearHistory empties undo and redo stacks",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const row = addAction("Start");
        const runner = createRunner(model);

        const findRow = () => model.actions.find((r) => r.id === row.id);

        runner.runModelMutation(
          "rename",
          () => {
            const current = findRow();
            if (current) current.name = "Next";
            return { changed: true };
          },
          {
            undo: {
              label: "rename",
              shouldRecord: (res) => !!res?.changed,
              captureAttachments: () => null,
            },
          },
        );

        assert.ok(runner.getUndoState().canUndo, "history populated");
        runner.clearHistory();
        const state = runner.getUndoState();
        assert.ok(!state.canUndo, "undo cleared after reset");
        assert.ok(!state.canRedo, "redo cleared after reset");
        assert.strictEqual(runner.undo(), false, "undo returns false when empty");
      },
    },
    {
      name: "undo restores inserted rows",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const base = addAction("One");
        const findRowById = (id) => model.actions.find((r) => r.id === id);
        const runner = createRunner(model);

        let insertedId = null;
        runner.runModelMutation(
          "insertRow",
          () => {
            const row = { id: model.nextId++, name: "Two", color: "", color2: "", notes: "" };
            model.actions.splice(0, 0, row);
            insertedId = row.id;
            return { insertedId: row.id };
          },
          {
            undo: {
              label: "insert row",
              shouldRecord: (res) => res?.insertedId != null,
              captureAttachments: () => null,
            },
          },
        );

        assert.strictEqual(model.actions[0].id, insertedId, "row inserted at start");
        runner.undo();
        assert.ok(
          model.actions[0]?.id !== insertedId,
          "row removed after undo",
        );
        runner.redo();
        assert.strictEqual(model.actions[0]?.id, insertedId, "row restored after redo");
        assert.strictEqual(findRowById(base.id)?.id, base.id, "existing row preserved");
      },
    },
    {
      name: "undo restores deleted rows",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const a = addAction("One");
        const b = addAction("Two");
        const c = addAction("Three");
        const runner = createRunner(model);

        runner.runModelMutation(
          "deleteRows",
          () => {
            const removed = model.actions.splice(1, 1);
            return { removedIds: removed.map((row) => row.id) };
          },
          {
            undo: {
              label: "delete rows",
              shouldRecord: (res) => Array.isArray(res?.removedIds) && res.removedIds.length > 0,
              captureAttachments: () => null,
            },
          },
        );

        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [a.id, c.id],
          "row removed after delete",
        );

        runner.undo();
        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [a.id, b.id, c.id],
          "all rows restored after undo",
        );

        runner.redo();
        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [a.id, c.id],
          "redo removes row again",
        );
      },
    },
    {
      name: "undo restores row reorder",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const a = addAction("One");
        const b = addAction("Two");
        const c = addAction("Three");
        const runner = createRunner(model);

        runner.runModelMutation(
          "reorderRows",
          () => {
            const [first] = model.actions.splice(0, 1);
            model.actions.splice(2, 0, first);
            return { movedId: first?.id, from: 0, to: 2 };
          },
          {
            undo: {
              label: "row reorder",
              shouldRecord: (res) => res?.movedId != null,
              captureAttachments: () => null,
            },
          },
        );

        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [b.id, c.id, a.id],
          "row moved to end after reorder",
        );

        runner.undo();
        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [a.id, b.id, c.id],
          "original order restored after undo",
        );

        runner.redo();
        assert.deepStrictEqual(
          model.actions.map((row) => row.id),
          [b.id, c.id, a.id],
          "redo reapplies reorder",
        );
      },
    },
    {
      name: "undo restores cleared interactions entries",
      run(assert) {
        const statusLog = [];
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Hero");
        const input = addInput("Torch");
        model.interactionsPairs = [
          { aId: action.id, iId: input.id, variantSig: "", kind: "AI" },
        ];
        const noteKey = noteKeyForPair(model.interactionsPairs[0], undefined);
        model.notes[noteKey] = { notes: "Keep me" };
        const runner = createRunner(model, statusLog);

        const selection = { rows: new Set([0]) };
        const sel = { r: 0, c: 0 };
        const viewDef = { columns: [{ key: "notes" }] };
        const status = { set(message) { statusLog.push(message); } };

        runner.runModelMutation(
          "clearInteractions",
          () =>
            clearInteractionsSelection(
              model,
              viewDef,
              selection,
              sel,
              "clearActiveCell",
              status,
              () => {},
            ),
          {
            undo: {
              label: "clear interactions",
              shouldRecord: (res) => (res?.cleared ?? 0) > 0,
              captureAttachments: () => null,
            },
          },
        );

        assert.strictEqual(model.notes[noteKey], undefined, "note cleared by mutation");

        runner.undo();
        assert.strictEqual(
          model.notes[noteKey]?.notes,
          "Keep me",
          "note restored after undo",
        );

        runner.redo();
        assert.strictEqual(model.notes[noteKey], undefined, "redo clears note again");
      },
    },
  ];
}
