import {
  createEmptyCommentMap,
  makeCommentCellKey,
  makeCommentColumnKey,
  makeCommentRowKey,
  normalizeCommentsMap,
} from "../../../data/comments.js";
import {
  deleteComment,
  listCommentsForCell,
  listCommentsForView,
  setComment,
} from "../../../app/comments.js";
import { createGridCommands } from "../../../app/grid-commands.js";

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
    {
      name: "setComment stores payload and listCommentsForCell exposes metadata",
      run(assert) {
        const model = { comments: createEmptyCommentMap(["actions"]) };
        const viewDef = { key: "actions", columns: [{ key: "name" }] };
        const row = { id: 42, name: "Row" };
        const payload = { text: "hello" };

        const change = setComment(model, viewDef, row, viewDef.columns[0], payload);
        assert.ok(change, "setComment reports change");
        assert.strictEqual(change.type, "set");
        assert.strictEqual(change.rowId, "42");
        assert.strictEqual(change.columnKey, "name");
        assert.deepStrictEqual(model.comments.actions["42"].name, payload);

        const listed = listCommentsForCell(model, viewDef, row, viewDef.columns[0]);
        assert.deepStrictEqual(listed, [
          {
            type: "value",
            viewKey: "actions",
            rowId: "42",
            rowKey: "actions:42",
            columnKey: "name",
            cellKey: "actions:42|name",
            value: payload,
          },
        ]);
      },
    },
    {
      name: "listCommentsForView returns enriched entries",
      run(assert) {
        const model = {
          actions: [
            { id: 1, name: "Hero" },
            { id: 2, name: "Villain" },
          ],
          comments: createEmptyCommentMap(["actions"]),
        };
        const viewDef = {
          key: "actions",
          columns: [{ key: "name" }, { key: "notes" }],
        };

        setComment(model, viewDef, model.actions[0], viewDef.columns[0], { text: "primary" });
        setComment(model, viewDef, model.actions[1], viewDef.columns[1], { text: "secondary" });

        const entries = listCommentsForView(model, viewDef, { rows: model.actions });
        assert.strictEqual(entries.length, 2);
        assert.deepStrictEqual(
          entries.map(({ rowIndex, columnIndex, rowId, columnKey }) => ({
            rowIndex,
            columnIndex,
            rowId,
            columnKey,
          })),
          [
            { rowIndex: 0, columnIndex: 0, rowId: "1", columnKey: "name" },
            { rowIndex: 1, columnIndex: 1, rowId: "2", columnKey: "notes" },
          ],
        );
        assert.deepStrictEqual(entries[0].value, { text: "primary" });
      },
    },
    {
      name: "listCommentsForView tolerates orphaned coordinates",
      run(assert) {
        const model = { comments: createEmptyCommentMap(["actions"]) };
        const viewDef = { key: "actions", columns: [{ key: "name" }] };
        model.comments.actions["99"] = { ghost: { text: "lost" } };

        const entries = listCommentsForView(model, viewDef, { rows: [] });
        assert.strictEqual(entries.length, 1);
        const [entry] = entries;
        assert.strictEqual(entry.rowIndex, -1);
        assert.strictEqual(entry.columnIndex, -1);
        assert.strictEqual(entry.cellKey, "actions:99|ghost");
        assert.deepStrictEqual(entry.value, { text: "lost" });
      },
    },
    {
      name: "deleteComment removes column payload and row buckets",
      run(assert) {
        const model = { comments: createEmptyCommentMap(["actions"]) };
        const viewDef = { key: "actions", columns: [{ key: "name" }, { key: "notes" }] };
        const row = { id: 7 };
        setComment(model, viewDef, row, viewDef.columns[0], { text: "keep" });
        setComment(model, viewDef, row, viewDef.columns[1], { text: "drop" });

        const removal = deleteComment(model, viewDef, row, viewDef.columns[1]);
        assert.ok(removal, "deleteComment returns change");
        assert.strictEqual(removal.type, "delete");
        assert.deepStrictEqual(removal.previous, { text: "drop" });
        assert.ok(!model.comments.actions["7"].notes, "column entry removed");

        const rowRemoval = deleteComment(model, viewDef, row, null);
        assert.ok(rowRemoval, "row removal reported");
        assert.strictEqual(rowRemoval.type, "deleteRow");
        assert.deepStrictEqual(rowRemoval.previous, { name: { text: "keep" } });
        assert.ok(!model.comments.actions["7"], "row bucket removed");
      },
    },
    {
      name: "grid clearSelectedCells removes associated comments",
      run(assert) {
        const model = {
          actions: [{ id: 1, name: "Hero", notes: "memo" }],
          comments: createEmptyCommentMap(["actions"]),
        };
        const viewDef = () => ({
          key: "actions",
          columns: [
            { key: "name" },
            { key: "notes" },
          ],
        });
        const selection = { rows: new Set([0]), cols: new Set([1]), colsAll: false };
        const sel = { r: 0, c: 1 };
        const modelView = viewDef();
        setComment(model, modelView, model.actions[0], modelView.columns[1], {
          text: "attached",
        });

        const commands = createGridCommands({
          getActiveView: () => "actions",
          viewDef,
          dataArray: () => model.actions,
          selection,
          SelectionNS: { isAllCols: () => false, setColsAll: () => {} },
          SelectionCtl: {
            startSingle: () => {},
            extendRowsTo: () => {},
            clearAllColsFlag: () => {},
          },
          sel,
          model,
          statusBar: null,
          runModelMutation: (_label, mutate) => mutate(),
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          clearInteractionsSelection: () => ({ cleared: 0 }),
          isInteractionPhaseColumnActiveForRow: () => true,
          clearCellForKind: null,
          setCellForKind: () => {},
          kindCtx: () => ({}),
          makeRow: () => ({}),
          insertBlankRows: () => {},
          sanitizeModifierRulesAfterDeletion: () => {},
          setCell: () => ({ changed: false }),
          render: () => {},
          isModColumn: () => false,
          parsePhaseKey: () => null,
          noteKeyForPair: () => {},
          getInteractionsPair: () => {},
        });

        commands.clearSelectedCells();
        assert.deepStrictEqual(model.comments.actions["1"], undefined);
        assert.strictEqual(model.actions[0].notes, "");
      },
    },
    {
      name: "grid deleteSelectedRows clears row comments",
      run(assert) {
        const model = {
          actions: [
            { id: 1, name: "Keep" },
            { id: 2, name: "Drop" },
          ],
          comments: createEmptyCommentMap(["actions"]),
          nextId: 3,
          interactionsIndex: { groups: [] },
          interactionsPairs: [],
        };
        const viewDef = () => ({ key: "actions", columns: [{ key: "name" }] });
        const selection = { rows: new Set([1]), cols: new Set(), colsAll: false };
        const sel = { r: 1, c: 0 };
        const modelView = viewDef();
        setComment(model, modelView, model.actions[1], modelView.columns[0], {
          text: "row comment",
        });

        const commands = createGridCommands({
          getActiveView: () => "actions",
          viewDef,
          dataArray: () => model.actions,
          selection,
          SelectionNS: { isAllCols: () => false, setColsAll: () => {} },
          SelectionCtl: {
            startSingle: () => {},
            extendRowsTo: () => {},
            clearAllColsFlag: () => {},
          },
          sel,
          model,
          statusBar: null,
          runModelMutation: (_label, mutate) => mutate(),
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          clearInteractionsSelection: () => ({ cleared: 0 }),
          isInteractionPhaseColumnActiveForRow: () => true,
          clearCellForKind: null,
          setCellForKind: () => {},
          kindCtx: () => ({}),
          makeRow: () => ({ id: model.nextId++ }),
          insertBlankRows: () => {},
          sanitizeModifierRulesAfterDeletion: () => {},
          setCell: () => ({ changed: false }),
          render: () => {},
          isModColumn: () => false,
          parsePhaseKey: () => null,
          noteKeyForPair: () => {},
          getInteractionsPair: () => {},
        });

        commands.deleteSelectedRows();
        assert.ok(!model.comments.actions["2"], "row comments removed");
        assert.strictEqual(model.actions.length, 1, "row removed from array");
      },
    },
  ];
}
