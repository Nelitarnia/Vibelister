import {
  ColumnKinds,
  setCellForKind,
  clearCellForKind,
} from "../../../data/column-kinds.js";
import { MOD } from "../../../data/constants.js";
import {
  enumerateModStates,
  normalizeModStateValue,
} from "../../../data/mod-state.js";
import { canonicalizePayload } from "../../../app/clipboard-codec.js";
import { createGridCommands } from "../../../app/grid-commands.js";
import { initPalette } from "../../../ui/palette.js";

export function getModStateTests() {
  return [
    {
      name: "normalizeModStateValue maps glyphs, tokens, and bounds",
      run(assert) {
        const runtime = enumerateModStates(MOD);
        const fallback = runtime.defaultState.value;
        const normalize = (value) =>
          normalizeModStateValue(value, { runtime, fallback });

        assert.strictEqual(normalize("✖"), MOD.OFF, "glyph maps to OFF");
        assert.strictEqual(
          normalize("optional"),
          MOD.BYPASS,
          "token maps to BYPASS",
        );
        assert.strictEqual(normalize("ℜ"), MOD.REQUIRES, "glyph maps to requires");
        assert.strictEqual(normalize(true), MOD.ON, "boolean true maps to ON");
        assert.strictEqual(
          normalize(false),
          fallback,
          "boolean false returns fallback",
        );
        assert.strictEqual(normalize(null), fallback, "null returns fallback");
        assert.strictEqual(
          normalize(2.9),
          MOD.BYPASS,
          "numeric values truncate within range",
        );
        assert.strictEqual(
          normalize(99),
          fallback,
          "out of range numbers return fallback",
        );
        assert.strictEqual(
          normalize("not-a-mod"),
          fallback,
          "invalid strings return fallback",
        );
      },
    },
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

        ColumnKinds.modState.set({ row, col, MOD }, "✕");
        assert.strictEqual(
          row.modSet[7],
          MOD.OFF,
          "cross glyph should map to OFF",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "requires");
        assert.strictEqual(
          row.modSet[7],
          MOD.REQUIRES,
          "requires keyword should map to REQUIRES",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "ℜ");
        assert.strictEqual(
          row.modSet[7],
          MOD.REQUIRES,
          "script-r glyph should map to REQUIRES",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "!");
        assert.strictEqual(
          row.modSet[7],
          MOD.REQUIRES,
          "exclamation glyph should map to REQUIRES",
        );
      },
    },
    {
      name: "explicit off renders with sigil while empty cells stay blank",
      run(assert) {
        const row = { modSet: {} };
        const col = { key: "mod:9", kind: "modState" };

        assert.strictEqual(
          ColumnKinds.modState.get({ row, col, MOD }),
          "",
          "cells without explicit value should render blank",
        );

        ColumnKinds.modState.set({ row, col, MOD }, MOD.OFF);
        assert.ok(
          Object.prototype.hasOwnProperty.call(row.modSet, 9),
          "setting OFF should store explicit value",
        );
        assert.strictEqual(
          ColumnKinds.modState.get({ row, col, MOD }),
          "✕",
          "explicit OFF should render with cross sigil",
        );

        row.modSet[9] = MOD.REQUIRES;
        assert.strictEqual(
          ColumnKinds.modState.get({ row, col, MOD }),
          "ℜ",
          "requires state should render with its glyph",
        );

        ColumnKinds.modState.set({ row, col, MOD }, "");
        assert.strictEqual(
          ColumnKinds.modState.get({ row, col, MOD }),
          "",
          "blank input should clear explicit modifier state",
        );
        assert.ok(
          !Object.prototype.hasOwnProperty.call(row.modSet || {}, 9),
          "clearing should remove explicit entry",
        );
        assert.strictEqual(
          ColumnKinds.modState.getStructured({ row, col, MOD }),
          null,
          "cleared cells should omit structured payload",
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

        const requiresPayload = canonicalizePayload({
          type: "modifierState",
          data: { value: MOD.REQUIRES },
        });
        assert.deepStrictEqual(
          requiresPayload,
          { type: "modifierState", data: { value: MOD.REQUIRES } },
          "canonicalizePayload should preserve new modifier state",
        );

        const requiresTarget = { modSet: {} };
        ColumnKinds.modState.applyStructured(
          { row: requiresTarget, col, MOD },
          requiresPayload,
        );
        assert.strictEqual(
          requiresTarget.modSet[5],
          MOD.REQUIRES,
          "structured payload should support REQUIRES",
        );
      },
    },
    {
      name: "numeric outliers normalize to default state",
      run(assert) {
        const row = { modSet: {} };
        const col = { key: "mod:2", kind: "modState" };
        ColumnKinds.modState.set({ row, col, MOD }, 99);
        assert.strictEqual(
          row.modSet[2],
          MOD.OFF,
          "values above descriptor range should clamp to default",
        );
      },
    },
    {
      name: "modifier palette reflects descriptor states",
      run(assert) {
        const editor = {
          value: "",
          style: {},
          parentElement: {
            children: [],
            appendChild(node) {
              this.children.push(node);
              node.parentNode = this;
              return node;
            },
          },
          addEventListener: () => {},
          focus: () => {},
          setSelectionRange: () => {},
          select: () => {},
        };
        const sheet = { addEventListener: () => {} };
        const sel = { r: 0, c: 1 };
        const view = {
          columns: [
            { key: "name", kind: "text" },
            { key: "mod:1", kind: "modState" },
          ],
        };
        const model = {
          actions: [{ id: 1, name: "Action", modSet: { 1: MOD.REQUIRES } }],
          modifiers: [{ id: 1, name: "Mod" }],
        };

        function makeNode(tag) {
          return {
            tag,
            id: "",
            style: {},
            children: [],
            dataset: {},
            parentNode: null,
            appendChild(child) {
              if (child && child.__isFragment) {
                child.children.forEach((ch) => this.appendChild(ch));
                return child;
              }
              this.children.push(child);
              child.parentNode = this;
              return child;
            },
            setAttribute() {},
            removeAttribute() {},
            contains(target) {
              if (target === this) return true;
              return this.children.some((child) => child.contains?.(target));
            },
            get textContent() {
              return this._textContent || "";
            },
            set textContent(value) {
              this._textContent = String(value);
              if (this.children.length) {
                this.children.forEach((child) => {
                  if (child.setTextFromParent)
                    child.setTextFromParent(String(value));
                });
              }
            },
            setTextFromParent(value) {
              this._textContent = value;
            },
            get innerHTML() {
              return this._innerHTML || "";
            },
            set innerHTML(value) {
              this._innerHTML = String(value);
              if (value === "") {
                this.children = [];
              }
            },
          };
        }

        const doc = {
          createElement(tag) {
            const node = makeNode(tag);
            if (tag === "div" && node.id === "") node.id = "";
            return node;
          },
          createDocumentFragment() {
            return {
              __isFragment: true,
              children: [],
              appendChild(child) {
                this.children.push(child);
                return child;
              },
            };
          },
          addEventListener: () => {},
        };

        const palette = initPalette({
          editor,
          sheet,
          getActiveView: () => "actions",
          viewDef: () => view,
          sel,
          model,
          setCell: () => {},
          render: () => {},
          getCellRect: () => ({ left: 0, top: 0, width: 200, height: 26 }),
          HEADER_HEIGHT: 28,
          endEdit: () => {},
          moveSelectionForTab: () => {},
          moveSelectionForEnter: () => {},
          document: doc,
        });

        assert.ok(palette.wantsToHandleCell(), "modifier column should be handled");
        palette.openForCurrentCell({ r: 0, c: 1, focusEditor: false });

        const root = editor.parentElement.children.find((node) => node.id === "universalPalette");
        assert.ok(root, "palette root should be attached to editor parent");
        const list = root?.children?.[0];
        assert.ok(list, "palette list container should exist");

        const expectedStates = enumerateModStates(MOD).states;
        const optionNodes = list.children || [];
        assert.strictEqual(
          optionNodes.length,
          expectedStates.length,
          "palette should render an option for each state",
        );

        const requiresNode = optionNodes.find((node) => {
          const label = node.children?.[0] || node;
          return /Requires/.test(label.textContent || "");
        });
        assert.ok(requiresNode, "palette should include the Requires option");
      },
    },
  ];
}
