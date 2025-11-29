import {
  createEmptyCommentMap,
  makeCommentCellKey,
  makeCommentColumnKey,
  makeCommentRowKey,
  normalizeCommentsMap,
} from "../../../data/comments.js";
import {
  COMMENT_COLOR_PRESETS,
  normalizeCommentColorPalette,
} from "../../../data/comment-colors.js";
import {
  deleteComment,
  listCommentsForCell,
  listCommentsForView,
  removeInteractionsCommentsForActionIds,
  setComment,
  setCommentInactive,
} from "../../../app/comments.js";
import { createGridCommands } from "../../../app/grid-commands.js";
import { createGridRenderer } from "../../../app/grid-renderer.js";
import { initCommentsUI } from "../../../ui/comments.js";

const SAMPLE_COLOR = COMMENT_COLOR_PRESETS[0]?.id || "crimson";
const SECONDARY_COLOR = COMMENT_COLOR_PRESETS[1]?.id || SAMPLE_COLOR;

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
        const payload = { text: "hello", color: SAMPLE_COLOR };

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
            rowMeta: null,
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

        setComment(model, viewDef, model.actions[0], viewDef.columns[0], {
          text: "primary",
          color: SAMPLE_COLOR,
        });
        setComment(model, viewDef, model.actions[1], viewDef.columns[1], {
          text: "secondary",
          color: SECONDARY_COLOR,
        });

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
        assert.deepStrictEqual(entries[0].value, {
          text: "primary",
          color: SAMPLE_COLOR,
        });
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
    {
      name: "setCommentInactive toggles inactive state",
      run(assert) {
        const model = {
          actions: [{ id: 1, name: "Bypass" }],
          comments: createEmptyCommentMap(["actions"]),
        };
        const viewDef = { key: "actions", columns: [{ key: "name" }] };
        const row = model.actions[0];
        setComment(model, viewDef, row, viewDef.columns[0], { text: "note" });

        const change = setCommentInactive(model, viewDef, row, viewDef.columns[0], true);
        assert.ok(change, "inactive change recorded");
        assert.strictEqual(
          model.comments.actions["1"].name.inactive,
          true,
          "comment marked inactive",
        );

        const revert = setCommentInactive(model, viewDef, row, viewDef.columns[0], false);
        assert.ok(revert, "reactivation change recorded");
        assert.ok(
          !model.comments.actions["1"].name.inactive,
          "inactive flag removed",
        );
      },
    },
    {
      name: "removeInteractionsCommentsForActionIds prunes matching rows",
      run(assert) {
        const model = {
          comments: createEmptyCommentMap(["interactions"]),
        };
        const viewDef = { key: "interactions", columns: [{ key: "notes" }] };
        setComment(
          model,
          viewDef,
          { commentRowId: "ai|1|10|sig" },
          viewDef.columns[0],
          { text: "keep?" },
        );
        setComment(
          model,
          viewDef,
          { commentRowId: "ai|2|10|sig" },
          viewDef.columns[0],
          { text: "stay" },
        );

        const removed = removeInteractionsCommentsForActionIds(model, [1]);
        assert.strictEqual(Array.isArray(removed), true, "returns array");
        assert.strictEqual(removed.length, 1, "one comment row removed");
        assert.strictEqual(
          model.comments.interactions["ai|1|10|sig"],
          undefined,
          "matching row deleted",
        );
        assert.ok(
          model.comments.interactions["ai|2|10|sig"],
          "non-matching row retained",
        );
      },
    },
    {
      name: "grid renderer uses active comment palette for badges",
      run(assert) {
        class GridStubElement {
          constructor(tag, isFragment = false) {
            this.tag = tag;
            this.isFragment = isFragment;
            this.children = [];
            this.parentNode = null;
            this.parentElement = null;
            this.dataset = {};
            this.style = {};
            this.className = "";
            this._textContent = "";
            this._isConnected = true;
            this._classSet = new Set();
            this.attributes = {};
            this._offsetWidth = 0;
          }

          appendChild(child) {
            if (!child) return child;
            if (child.isFragment) {
              child.children.forEach((node) => this.appendChild(node));
              return child;
            }
            this.children.push(child);
            child.parentNode = this;
            child.parentElement = this;
            child._isConnected = true;
            return child;
          }

          insertBefore(child, reference) {
            if (!child) return child;
            const idx = reference ? this.children.indexOf(reference) : -1;
            if (idx >= 0) this.children.splice(idx, 0, child);
            else this.children.push(child);
            child.parentNode = this;
            child.parentElement = this;
            child._isConnected = true;
            return child;
          }

          removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) this.children.splice(idx, 1);
            child.parentNode = null;
            child.parentElement = null;
            child._isConnected = false;
            return child;
          }

          set textContent(value) {
            this.children = [];
            this._textContent = value == null ? "" : String(value);
          }

          get textContent() {
            return this._textContent;
          }

          setAttribute(name, value) {
            this.attributes[name] = String(value);
          }

          removeAttribute(name) {
            delete this.attributes[name];
          }

          get firstChild() {
            return this.children[0] || null;
          }

          get previousSibling() {
            if (!this.parentNode) return null;
            const idx = this.parentNode.children.indexOf(this);
            return idx > 0 ? this.parentNode.children[idx - 1] : null;
          }

          get classList() {
            return {
              add: (...tokens) => tokens.forEach((t) => this._classSet.add(t)),
              remove: (...tokens) => tokens.forEach((t) => this._classSet.delete(t)),
              contains: (token) => this._classSet.has(token),
            };
          }

          get offsetWidth() {
            return this._offsetWidth;
          }

          set offsetWidth(value) {
            this._offsetWidth = Number.isFinite(value) ? value : 0;
          }

          get isConnected() {
            return this._isConnected;
          }
        }

        const previousDocument = globalThis.document;
        const previousWindow = globalThis.window;
        const documentStub = {
          createElement: (tag) => new GridStubElement(tag),
          createDocumentFragment: () => new GridStubElement("#fragment", true),
        };

        globalThis.document = documentStub;
        globalThis.window = { __cellPool: [] };

        try {
          const sheet = new GridStubElement("div");
          sheet.clientWidth = 240;
          sheet.clientHeight = 160;
          sheet.scrollLeft = 0;
          sheet.scrollTop = 0;
          sheet.scrollWidth = 240;
          sheet.scrollHeight = 160;

          const cellsLayer = new GridStubElement("div");
          const spacer = new GridStubElement("div");
          const colHdrs = new GridStubElement("div");
          const rowHdrs = new GridStubElement("div");

          const ROW_HEIGHT = 26;
          const selection = { rows: new Set(), cols: new Set(), colsAll: false };
          const SelectionNS = { isAllCols: () => false };
          const sel = { r: 0, c: 0 };

          const palette = normalizeCommentColorPalette([
            {
              id: "sunset",
              badgeBackground: "rgb(10, 20, 30)",
              badgeBorder: "rgb(40, 50, 60)",
              badgeText: "rgb(70, 80, 90)",
            },
          ]);

          const model = {
            meta: { commentColors: palette },
            comments: createEmptyCommentMap(["actions"]),
            actions: [{ id: 1, name: "Row" }],
            inputs: [],
            modifiers: [],
            outcomes: [],
          };

          model.comments.actions["1"] = { name: { text: "hi", color: "sunset" } };

          const viewDef = () => ({
            key: "actions",
            columns: [{ key: "name", title: "Name", width: 120 }],
          });

          const renderer = createGridRenderer({
            sheet,
            cellsLayer,
            spacer,
            colHdrs,
            rowHdrs,
            selection,
            SelectionNS,
            sel,
            getActiveView: () => "actions",
            viewDef,
            dataArray: () => model.actions,
            getRowCount: () => model.actions.length,
            getCell: (r, c) => {
              const col = viewDef().columns[c];
              const row = model.actions[r];
              return row && col ? row[col.key] : undefined;
            },
            isRowSelected: () => false,
            model,
            rebuildInteractionPhaseColumns: () => {},
            noteKeyForPair: () => null,
            parsePhaseKey: () => null,
            ROW_HEIGHT,
            updateSelectionSnapshot: () => {},
            isModColumn: () => false,
            modIdFromKey: () => null,
            getInteractionsPair: () => null,
            getCommentColors: () => model.meta.commentColors,
          });

          renderer.layout();
          renderer.render();

          const cell = cellsLayer.children[0];
          const badge = cell?._commentBadge;

          assert.ok(badge, "badge should be created for commented cell");
          assert.strictEqual(badge.dataset.color, "sunset");
          assert.strictEqual(badge.style.background, "rgb(10, 20, 30)");
          assert.strictEqual(badge.style.borderColor, "rgb(40, 50, 60)");
          assert.strictEqual(badge.style.color, "rgb(70, 80, 90)");
        } finally {
          if (previousDocument === undefined) delete globalThis.document;
          else globalThis.document = previousDocument;

          if (previousWindow === undefined) delete globalThis.window;
          else globalThis.window = previousWindow;
        }
      },
    },
    {
      name: "comments UI initializes color selector from filter metadata",
      run(assert) {
        class StubElement {
          constructor(tag) {
            this.tag = tag;
            this.children = [];
            this.dataset = {};
            this.style = { setProperty: () => {}, removeProperty: () => {} };
            this.attributes = {};
            this.listeners = new Map();
            this._textContent = "";
            this.value = "";
          }

          appendChild(child) {
            if (child) {
              this.children.push(child);
            }
            return child;
          }

          removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) {
              this.children.splice(idx, 1);
            }
            return child;
          }

          get firstChild() {
            return this.children[0] || null;
          }

          get options() {
            return this.children;
          }

          set textContent(value) {
            this._textContent = value == null ? "" : String(value);
          }

          get textContent() {
            return this._textContent;
          }

          setAttribute(name, value) {
            this.attributes[name] = String(value);
          }

          removeAttribute(name) {
            delete this.attributes[name];
          }

          addEventListener(type, cb) {
            this.listeners.set(type, cb);
          }

          removeEventListener(type) {
            this.listeners.delete(type);
          }
        }

        const commentColors = normalizeCommentColorPalette([
          { id: "sunset", swatch: "#f97316" },
          { id: "ocean", swatch: "#2563eb" },
        ]);

        const model = {
          meta: {},
          comments: createEmptyCommentMap(["actions"]),
          actions: [],
          inputs: [],
          modifiers: [],
          outcomes: [],
        };

        const metadata = {
          commentColors,
          commentFilter: { viewKey: "actions", colorIds: ["ocean"] },
        };

        const sidebar = new StubElement("div");
        const toggleButton = new StubElement("button");
        const colorSelect = new StubElement("select");

        const previousDocument = globalThis.document;
        const documentStub = {
          createElement: (tag) => new StubElement(tag),
          createDocumentFragment: (tag) => new StubElement(tag ?? "fragment"),
          addEventListener: () => {},
          removeEventListener: () => {},
        };

        globalThis.document = documentStub;

        try {
          const commentsUI = initCommentsUI({
            sidebar,
            toggleButton,
            colorSelect,
            selection: { rows: new Set(), cols: new Set(), colsAll: false },
            sel: { r: 0, c: 0 },
            getCellComments: () => [],
            getActiveView: () => "actions",
            viewDef: () => ({ key: "actions", columns: [{ key: "name", title: "Name" }] }),
            dataArray: () => model.actions,
            model,
          });

          commentsUI.applyModelMetadata(metadata);

          assert.strictEqual(colorSelect.value, "ocean");
          assert.deepStrictEqual(commentsUI.getFilter().colorIds, ["ocean"]);
        } finally {
          if (previousDocument === undefined) delete globalThis.document;
          else globalThis.document = previousDocument;
        }
      },
    },
  ];
}
