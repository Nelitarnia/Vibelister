import { sanitizeRangePayload } from "../../../app/clipboard-codec.js";
import { createGridCommands } from "../../../app/grid-commands.js";
import { listCommentsForCell, setComment } from "../../../app/comments.js";
import { makeMutationRunner } from "../../../data/mutation-runner.js";
import { COMMENT_COLOR_PRESETS } from "../../../data/comment-colors.js";
import { makeModelFixture } from "./model-fixtures.js";

function createCommands(model, view, runner = null) {
  const selection = { rows: new Set(), cols: new Set(), colsAll: false };
  const sel = { r: 0, c: 0 };

  const makeUndoConfig = ({ label, shouldRecord, makeStatus }) => ({
    label,
    shouldRecord,
    captureAttachments: () => null,
    applyAttachments: () => {},
    makeStatus: makeStatus || (() => ""),
  });

  return createGridCommands({
    getActiveView: () => view.key,
    viewDef: () => view,
    dataArray: () => model.actions,
    selection,
    SelectionNS: {},
    SelectionCtl: {},
    sel,
    model,
    statusBar: { set() {} },
    runModelMutation: runner ? runner.runModelMutation.bind(runner) : () => ({}),
    runModelTransaction: runner
      ? runner.runModelTransaction.bind(runner)
      : (_label, fn) => fn(),
    makeUndoConfig,
    clearInteractionsSelection: () => {},
    isInteractionPhaseColumnActiveForRow: () => true,
    clearCellForKind: () => {},
    setCellForKind: () => {},
    kindCtx: () => ({}),
    makeRow: () => ({}),
    insertBlankRows: () => {},
    sanitizeModifierRulesAfterDeletion: () => {},
    setCell: () => {},
    render: () => {},
    isModColumn: () => false,
    parsePhaseKey: () => null,
    noteKeyForPair: () => null,
    getInteractionsPair: () => null,
  });
}

const SAMPLE_COLOR = COMMENT_COLOR_PRESETS[0]?.id || "crimson";
const SECONDARY_COLOR = COMMENT_COLOR_PRESETS[1]?.id || SAMPLE_COLOR;

export function getClipboardTests() {
  return [
    {
      name: "range payload retains comment entries",
      run(assert) {
        const payload = {
          version: 1,
          view: "actions",
          columns: [{ key: "name" }],
          cells: [
            [
              {
                colKey: "name",
                comment: {
                  type: "comment",
                  data: { value: { text: "hello", color: SAMPLE_COLOR } },
                },
              },
            ],
          ],
        };

        const sanitized = sanitizeRangePayload(payload);
        assert.ok(sanitized, "range payload should sanitize");
        const cell = sanitized.cells[0][0];
        assert.deepStrictEqual(
          cell.comment,
          {
            type: "comment",
            data: { value: { text: "hello", color: SAMPLE_COLOR } },
          },
          "comment payload should round-trip through sanitizer",
        );
      },
    },
    {
      name: "comment clipboard payload applies to destination cell",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const rowA = addAction("One");
        const rowB = addAction("Two");
        const view = {
          key: "actions",
          columns: [{ key: "name" }, { key: "notes" }],
        };
        const column = view.columns[1];

        setComment(model, view, rowA, column, { text: "copied", color: SAMPLE_COLOR });

        const originalDocument = globalThis.document;
        globalThis.document = { dispatchEvent() {} };
        try {
          const commands = createCommands(model, view);

          const payload = commands.getCellCommentClipboardPayload(0, 1, {
            view: "actions",
            viewDef: view,
          });
          assert.ok(payload, "clipboard payload should exist for comment");

          const change = commands.applyCellCommentClipboardPayload(1, 1, payload, {
            view: "actions",
            viewDef: view,
          });
          assert.ok(change, "applying clipboard payload should report change");

          const destEntries = listCommentsForCell(model, view, rowB, column);
          assert.strictEqual(destEntries.length, 1, "destination comment recorded");
          assert.deepStrictEqual(destEntries[0].value, {
            text: "copied",
            color: SAMPLE_COLOR,
          });
        } finally {
          if (originalDocument === undefined) delete globalThis.document;
          else globalThis.document = originalDocument;
        }
      },
    },
    {
      name: "comment paste participates in undo and redo",
      run(assert) {
        const { model, addAction } = makeModelFixture();
        const rowA = addAction("Alpha");
        const rowB = addAction("Beta");
        const view = {
          key: "actions",
          columns: [{ key: "name" }, { key: "notes" }],
        };
        const column = view.columns[1];

        setComment(model, view, rowA, column, {
          text: "history",
          color: SECONDARY_COLOR,
        });

        const runner = makeMutationRunner({
          model,
          rebuildActionColumnsFromModifiers: () => {},
          rebuildInteractionsInPlace: () => {},
          pruneNotesToValidPairs: () => {},
          invalidateViewDef: () => {},
          layout: () => {},
          render: () => {},
          status: { set() {} },
          historyLimit: 10,
        });

        const originalDocument = globalThis.document;
        globalThis.document = { dispatchEvent() {} };
        try {
          const commands = createCommands(model, view, runner);

          const payload = commands.getCellCommentClipboardPayload(0, 1, {
            view: "actions",
            viewDef: view,
          });
          assert.ok(payload, "source clipboard payload should exist");

          runner.runModelTransaction(
            "pasteCells",
            () => {
              const change = commands.applyCellCommentClipboardPayload(1, 1, payload, {
                view: "actions",
                viewDef: view,
              });
              return {
                changed: !!change,
                appliedCount: change ? 1 : 0,
                attemptedCells: 1,
                rejectedCount: 0,
              };
            },
            {
              render: false,
              undo: {
                label: "paste",
                shouldRecord: (res) => !!res?.changed,
                captureAttachments: () => null,
                applyAttachments: () => {},
                makeStatus: () => "",
              },
            },
          );

          let destEntries = listCommentsForCell(model, view, rowB, column);
          assert.strictEqual(destEntries.length, 1, "comment applied during paste");
          assert.deepStrictEqual(destEntries[0].value, {
            text: "history",
            color: SECONDARY_COLOR,
          });

          assert.strictEqual(runner.undo(), true, "undo succeeds");
          destEntries = listCommentsForCell(model, view, rowB, column);
          assert.strictEqual(destEntries.length, 0, "comment removed after undo");

          assert.strictEqual(runner.redo(), true, "redo succeeds");
          destEntries = listCommentsForCell(model, view, rowB, column);
          assert.strictEqual(destEntries.length, 1, "comment restored after redo");
          assert.deepStrictEqual(destEntries[0].value, {
            text: "history",
            color: SECONDARY_COLOR,
          });
        } finally {
          if (originalDocument === undefined) delete globalThis.document;
          else globalThis.document = originalDocument;
        }
      },
    },
  ];
}
