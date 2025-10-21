import {
  ColumnKinds,
  setCellForKind,
  clearCellForKind,
} from "../../../data/column-kinds.js";
import { MOD } from "../../../data/constants.js";
import { canonicalizePayload } from "../../../app/clipboard-codec.js";
import { createGridCommands } from "../../../app/grid-commands.js";

export function getModStateTests() {
  return [
    {
      name: "glyph inputs map to modifier states",
      run(assert) {
        const row = { modSet: {} };
        const col = { key: "mod:7", kind: "modState" };

        ColumnKinds.modState.set({ row, col, MOD }, "✓");
        assert.strictEqual(
          row.modSet[7],
          MOD.ON,
          "checkmark glyph should map to ON",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "◐");
        assert.strictEqual(
          row.modSet[7],
          MOD.BYPASS,
          "partial glyph should map to BYPASS",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "off");
        assert.strictEqual(
          row.modSet[7],
          MOD.OFF,
          "off string should clear modifier",
        );
      },
    },
    {
      name: "selection-aware setter spreads modifier state across rows",
      run(assert) {
        const modifiers = [{ id: 3, name: "Mod" }];
        const rows = [
          { id: 1, name: "A", modSet: {} },
          { id: 2, name: "B", modSet: {} },
          { id: 3, name: "C", modSet: {} },
        ];
        const view = {
          columns: [
            { key: "name", kind: "text" },
            { key: "mod:3", kind: "modState" },
          ],
        };
        const selection = {
          rows: new Set([0, 1, 2]),
          cols: new Set([1]),
          anchor: 0,
          colAnchor: 1,
          colsAll: false,
        };
        const sel = { r: 0, c: 1 };
        const model = { actions: rows, modifiers };

        const kindCtx = ({ r, c, col, row, v } = {}) => ({
          r,
          c,
          col,
          row,
          v,
          model,
          MOD,
          viewDef: () => view,
        });

        const makeRow = () => ({ id: rows.length + 1, name: "", modSet: {} });

        const grid = createGridCommands({
          getActiveView: () => "actions",
          viewDef: () => view,
          dataArray: () => rows,
          selection,
          SelectionNS: {},
          SelectionCtl: {},
          sel,
          model,
          statusBar: null,
          runModelMutation: () => {},
          runModelTransaction: (_label, fn) => fn(),
          makeUndoConfig: () => ({ shouldRecord: () => true }),
          clearInteractionsSelection: () => {},
          isInteractionPhaseColumnActiveForRow: () => true,
          clearCellForKind,
          setCellForKind,
          kindCtx,
          makeRow,
          insertBlankRows: () => {},
          sanitizeModifierRulesAfterDeletion: () => {},
          setCell(r, c, value) {
            while (rows.length <= r) rows.push(makeRow());
            const row = rows[r];
            const col = view.columns[c];
            if (col?.kind) {
              setCellForKind(col.kind, kindCtx({ r, c, col, row, v: value }), value);
            } else if (col?.key) {
              row[col.key] = value;
            }
            return { view: "actions", changed: true, ensuredRows: 0 };
          },
          render: () => {},
          isModColumn: (col) => /^mod:/.test(String(col?.key || "")),
          parsePhaseKey: () => null,
        });

        grid.setCellSelectionAware(0, 1, MOD.BYPASS);

        for (const row of rows) {
          assert.strictEqual(
            row.modSet[3],
            MOD.BYPASS,
            "all selected rows should receive modifier state",
          );
        }
      },
    },
    {
      name: "selection-aware setter honors explicit column ranges",
      run(assert) {
        const modifiers = [
          { id: 3, name: "Alpha" },
          { id: 4, name: "Beta" },
        ];
        const rows = [
          { id: 1, name: "Row", modSet: {} },
          { id: 2, name: "Other", modSet: {} },
        ];
        const view = {
          columns: [
            { key: "mod:3", kind: "modState" },
            { key: "mod:4", kind: "modState" },
            { key: "name", kind: "text" },
          ],
        };
        const selection = {
          rows: new Set([0]),
          cols: new Set([0, 1]),
          anchor: 0,
          colAnchor: 0,
          colsAll: false,
        };
        const sel = { r: 0, c: 0 };
        const model = { actions: rows, modifiers };

        const kindCtx = ({ r, c, col, row, v } = {}) => ({
          r,
          c,
          col,
          row,
          v,
          model,
          MOD,
          viewDef: () => view,
        });

        const makeRow = () => ({ id: rows.length + 1, name: "", modSet: {} });

        const grid = createGridCommands({
          getActiveView: () => "actions",
          viewDef: () => view,
          dataArray: () => rows,
          selection,
          SelectionNS: {},
          SelectionCtl: {},
          sel,
          model,
          statusBar: null,
          runModelMutation: () => {},
          runModelTransaction: (_label, fn) => fn(),
          makeUndoConfig: () => ({ shouldRecord: () => true }),
          clearInteractionsSelection: () => {},
          isInteractionPhaseColumnActiveForRow: () => true,
          clearCellForKind,
          setCellForKind,
          kindCtx,
          makeRow,
          insertBlankRows: () => {},
          sanitizeModifierRulesAfterDeletion: () => {},
          setCell(r, c, value) {
            while (rows.length <= r) rows.push(makeRow());
            const row = rows[r];
            const col = view.columns[c];
            if (col?.kind) {
              setCellForKind(col.kind, kindCtx({ r, c, col, row, v: value }), value);
            } else if (col?.key) {
              row[col.key] = value;
            }
            return { view: "actions", changed: true, ensuredRows: 0 };
          },
          render: () => {},
          isModColumn: (col) => /^mod:/.test(String(col?.key || "")),
          parsePhaseKey: () => null,
        });

        grid.setCellSelectionAware(0, 0, MOD.ON);

        assert.strictEqual(rows[0].modSet[3], MOD.ON, "first column updated");
        assert.strictEqual(rows[0].modSet[4], MOD.ON, "second column updated");
        assert.ok(!rows[1].modSet[3], "other rows unchanged");
      },
    },
    {
      name: "structured modifier payloads round trip",
      run(assert) {
        const col = { key: "mod:5", kind: "modState" };
        const source = { modSet: { 5: MOD.ON } };
        const payload = ColumnKinds.modState.getStructured({ row: source, col, MOD });
        assert.deepStrictEqual(
          payload,
          { type: "modifierState", data: { value: MOD.ON } },
          "structured payload should reflect current value",
        );

        const clean = canonicalizePayload({
          type: "modifierState",
          data: { value: "2", ignored: true },
        });
        assert.deepStrictEqual(
          clean,
          { type: "modifierState", data: { value: MOD.BYPASS } },
          "canonicalizePayload should sanitize modifier state",
        );

        const target = { modSet: {} };
        const applied = ColumnKinds.modState.applyStructured(
          { row: target, col, MOD },
          clean,
        );
        assert.strictEqual(applied, true, "structured payload should apply to row");
        assert.strictEqual(
          target.modSet[5],
          MOD.BYPASS,
          "applied payload should update modifier value",
        );
      },
    },
  ];
}
