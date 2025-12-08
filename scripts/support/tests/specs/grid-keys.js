import { computeDestinationIndices, initGridKeys } from "../../../ui/grid-keys.js";
import { initPalette } from "../../../ui/palette.js";
import { MIME_RANGE } from "../../../app/clipboard-codec.js";
import { createInteractionsOutline } from "../../../ui/interactions-outline.js";
import {
  selection as globalSelection,
  sel as globalSel,
  SelectionNS as globalSelectionNS,
  SelectionCtl as globalSelectionCtl,
} from "../../../app/selection.js";

function resetSelectionState() {
  globalSelection.rows.clear();
  globalSelection.cols.clear();
  globalSelection.anchor = null;
  globalSelection.colAnchor = null;
  globalSelection.colsAll = false;
  globalSelection.horizontalMode = false;
  globalSel.r = 0;
  globalSel.c = 0;
}

export function getGridKeysTests() {
  return [
    {
      name: "computeDestinationIndices repeats across explicit selection",
      run(assert) {
        const selection = new Set([2, 3, 4]);
        const dest = computeDestinationIndices({
          sourceCount: 1,
          selectionSet: selection,
          anchor: 2,
          limit: 20,
        });
        assert.deepStrictEqual(
          dest,
          [2, 3, 4],
          "single-cell paste should cover entire selection",
        );
      },
    },
    {
      name: "Ctrl+Shift+O toggles outline when filter is focused",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex((entry) => entry.cb === cb && entry.capture === !!capture);
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const filterInput = {
          tagName: "INPUT",
          contains(node) {
            return node === this;
          },
        };
        const outlinePanel = {
          querySelector(selector) {
            if (selector === '[data-role="filter"]') return filterInput;
            return null;
          },
        };
        const documentStub = {
          querySelector: () => null,
          getElementById(id) {
            if (id === "interactionsOutline") return outlinePanel;
            return { getAttribute: () => "false", contains: () => false };
          },
          activeElement: filterInput,
        };
        const navigatorStub = { platform: "Test" };

        const selection = {
          rows: new Set(),
          cols: new Set(),
          colsAll: false,
          horizontalMode: false,
        };
        const sel = { r: 0, c: 0 };

        let toggles = 0;
        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "interactions",
          selection,
          sel,
          editor: { style: { display: "none" } },
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          moveSelectionForTab: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {
            toggles += 1;
          },
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const shortcutListener = keyListeners.find((entry) => !entry.capture);
          assert.ok(shortcutListener, "shortcut listener should be registered");

          const event = {
            key: "O",
            keyLower: "o",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
          };

          shortcutListener.cb(event);

          assert.strictEqual(toggles, 1, "Ctrl+Shift+O should toggle outline from filter");
          assert.strictEqual(event.prevented, true, "toggle shortcut should prevent default");
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "computeDestinationIndices falls back when selection is small",
      run(assert) {
        const selection = new Set([5]);
        const dest = computeDestinationIndices({
          sourceCount: 3,
          selectionSet: selection,
          anchor: 5,
          limit: 20,
        });
        assert.deepStrictEqual(
          dest,
          [5, 6, 7],
          "insufficient selection should expand from anchor",
        );
      },
    },
    {
      name: "grid paste lets textarea handle native behavior",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const editor = {
          style: { display: "block" },
          tagName: "TEXTAREA",
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: editor,
        };

        const navigatorStub = { platform: "Test" };

        const selection = {
          rows: new Set([1, 2]),
          cols: new Set([0]),
          colsAll: false,
          horizontalMode: false,
        };
        const sel = { r: 3, c: 4 };

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "outcomes",
          selection,
          sel,
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          moveSelectionForTab: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => ({ changed: false }),
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          getCellCommentClipboardPayload: () => null,
          applyCellCommentClipboardPayload: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => ({ isOpen: () => false }),
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          toggleTagsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const pasteListeners = listeners.get("paste") || [];
          const captureListener = pasteListeners.find((entry) => entry.capture);
          assert.ok(captureListener, "paste handler should be registered in capture phase");

          const rowsBefore = Array.from(selection.rows);
          const colsBefore = Array.from(selection.cols);
          const selBefore = { ...sel };

          const event = {
            clipboardData: {
              getData: () => "",
              types: [],
            },
            preventDefault() {
              this.prevented = true;
            },
            prevented: false,
          };

          captureListener.cb(event);

          assert.strictEqual(
            event.prevented,
            false,
            "paste handler should allow native textarea paste",
          );
          assert.deepStrictEqual(
            Array.from(selection.rows),
            rowsBefore,
            "row selection should not be mutated when editor handles paste",
          );
          assert.deepStrictEqual(
            Array.from(selection.cols),
            colsBefore,
            "column selection should remain unchanged during native paste",
          );
          assert.deepStrictEqual(
            sel,
            selBefore,
            "selection anchor should remain unchanged when editor is active",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "action references paste into end columns",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          activeElement: null,
        };

        const selection = {
          rows: new Set(),
          cols: new Set(),
          colsAll: false,
          horizontalMode: false,
        };
        const sel = { r: 0, c: 1 };

        const view = {
          key: "interactions",
          columns: [
            { key: "action", kind: "refRO", entity: "action" },
            { key: "p0:end", kind: "interactions" },
          ],
        };

        const statusMessages = [];
        const appliedPayloads = [];

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "interactions",
          selection,
          sel,
          editor: {},
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          moveSelectionForTab: () => {},
          ensureVisible: () => {},
          viewDef: () => view,
          getRowCount: () => 1,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: (_label, fn) => fn(),
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: (_r, _c, payload) => {
            appliedPayloads.push(payload);
            return true;
          },
          getCellCommentClipboardPayload: () => null,
          applyCellCommentClipboardPayload: () => false,
          status: { set: (msg) => statusMessages.push(msg) },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => ({ isOpen: () => false }),
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          toggleTagsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: { platform: "" },
        });

        try {
          const pasteListener = (listeners.get("paste") || []).find(
            (entry) => entry.capture,
          )?.cb;
          assert.ok(pasteListener, "paste listener registered");

          const structuredRange = {
            version: 1,
            cells: [
              [
                {
                  colKey: "action",
                  colKind: "refRO",
                  structured: { type: "action", data: { id: 7, variantSig: "v1" } },
                },
              ],
            ],
          };

          const event = {
            clipboardData: {
              getData(type) {
                if (type === MIME_RANGE) return JSON.stringify(structuredRange);
                return "";
              },
              types: [MIME_RANGE, "text/plain"],
            },
            preventDefault() {
              this.prevented = true;
            },
            prevented: false,
          };

          pasteListener(event);

          assert.ok(event.prevented, "paste handler should prevent default paste");
          assert.deepStrictEqual(
            appliedPayloads,
            [{ type: "action", data: { id: 7, variantSig: "v1" } }],
            "action payload forwarded to structured paste handler",
          );
          assert.ok(
            statusMessages.some((msg) => msg.startsWith("Pasted 1 cell")),
            "paste reports applied cell",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "grid keydown defers Enter when palette is open",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: null,
        };

        const navigatorStub = { platform: "Test" };

        const editor = { style: { display: "block" } };
        documentStub.activeElement = editor;

        let endEditCalls = 0;
        let moveSelCalls = 0;

        const dispose = initGridKeys({
          isEditing: () => true,
          getActiveView: () => "outcomes",
          selection: { rows: new Set(), cols: new Set() },
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {
            endEditCalls += 1;
          },
          moveSel: () => {
            moveSelCalls += 1;
          },
          ensureVisible: () => {},
          viewDef: () => ({ columns: [{ key: "dualof", kind: "refPick" }] }),
          getRowCount: () => 1,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => ({
            isOpen: () => true,
          }),
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          assert.ok(captureListener, "grid keydown listener should be registered");

          const event = {
            key: "Enter",
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
            prevented: false,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
          };

          captureListener.cb(event);

          assert.strictEqual(
            endEditCalls,
            0,
            "grid handler should defer Enter when palette is open",
          );
          assert.strictEqual(
            moveSelCalls,
            0,
            "selection movement should also defer to palette",
          );
          assert.strictEqual(
            event.prevented,
            false,
            "grid handler should not consume the event before palette",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "type-to-edit keeps initial character when palette starts empty",
      async run(assert) {
        class FakeElement {
          constructor(tag) {
            this.tagName = String(tag || "div").toUpperCase();
            this.children = [];
            this.style = {};
            this.dataset = {};
            this.parentElement = null;
            this.offsetParent = null;
            this.offsetHeight = 0;
            this.scrollHeight = 0;
            this.textContent = "";
          }

          appendChild(child) {
            if (!child) return child;
            child.parentElement = this;
            child.offsetParent = this;
            this.children.push(child);
            return child;
          }

          setAttribute() {}

          removeAttribute() {}

          getBoundingClientRect() {
            return { top: 0, bottom: 400 };
          }
        }

        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          activeElement: { tagName: "DIV" },
          querySelector: () => null,
          getElementById: () => null,
          createElement(tag) {
            return new FakeElement(tag);
          },
          createDocumentFragment() {
            return {
              children: [],
              appendChild(child) {
                this.children.push(child);
                return child;
              },
            };
          },
        };

        const editorParent = new FakeElement("div");
        editorParent.getBoundingClientRect = () => ({ top: 0, bottom: 400 });

        const editorListeners = new Map();
        const editor = {
          style: { display: "none" },
          value: "",
          selectionStart: 0,
          selectionEnd: 0,
          parentElement: editorParent,
          offsetHeight: 24,
          focus() {
            documentStub.activeElement = this;
          },
          setSelectionRange(start, end) {
            this.selectionStart = start;
            this.selectionEnd = end;
          },
          select() {
            this.selectionStart = 0;
            this.selectionEnd = this.value.length;
          },
          addEventListener(type, cb) {
            const arr = editorListeners.get(type) || [];
            arr.push(cb);
            editorListeners.set(type, arr);
          },
          removeEventListener(type, cb) {
            const arr = editorListeners.get(type) || [];
            const idx = arr.indexOf(cb);
            if (idx >= 0) arr.splice(idx, 1);
            editorListeners.set(type, arr);
          },
        };

        const sheet = new FakeElement("div");
        sheet.addEventListener = () => {};
        sheet.removeEventListener = () => {};
        sheet.getBoundingClientRect = () => ({ top: 0, bottom: 400 });

        const sel = { r: 0, c: 0 };

        const palette = initPalette({
          editor,
          sheet,
          getActiveView: () => "outcomes",
          viewDef: () => ({ columns: [{ key: "dualof" }] }),
          sel,
          model: { outcomes: [] },
          setCell: () => {},
          render: () => {},
          getCellRect: () => ({ left: 0, top: 0, width: 120, height: 24 }),
          HEADER_HEIGHT: 24,
          endEdit: () => {},
          moveSelectionForTab: () => {},
          moveSelectionForEnter: () => {},
          document: documentStub,
        });

        const selection = {
          rows: new Set(),
          cols: new Set(),
          colsAll: false,
          horizontalMode: false,
        };

        const navigatorStub = { platform: "Test" };

        let editing = false;
        const beginEdit = () => {
          editing = true;
          palette.openForCurrentCell({
            r: sel.r,
            c: sel.c,
            initialText: "",
            focusEditor: true,
          });
        };
        const endEdit = () => {
          editing = false;
        };

        const dispose = initGridKeys({
          isEditing: () => editing,
          getActiveView: () => "outcomes",
          selection,
          sel,
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit,
          endEdit,
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [{ key: "dualof", kind: "ref" }] }),
          getRowCount: () => 1,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => ({ changed: false }),
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          getCellCommentClipboardPayload: () => null,
          applyCellCommentClipboardPayload: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => palette,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          toggleTagsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        const typeChar = (ch) => {
          const start = typeof editor.selectionStart === "number"
            ? editor.selectionStart
            : editor.value.length;
          const end = typeof editor.selectionEnd === "number"
            ? editor.selectionEnd
            : start;
          const before = editor.value.slice(0, start);
          const after = editor.value.slice(end);
          editor.value = `${before}${ch}${after}`;
          const next = before.length + ch.length;
          editor.selectionStart = next;
          editor.selectionEnd = next;
        };

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          assert.ok(captureListener, "grid keydown listener should be registered");

          const keyEvent = {
            key: "a",
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
            prevented: false,
          };

          captureListener.cb(keyEvent);

          assert.ok(editing, "type-to-edit should begin editing mode");
          assert.ok(palette.isOpen(), "palette should open for palette column");

          typeChar("a");

          await new Promise((resolve) => setTimeout(resolve, 0));

          typeChar("b");

          assert.strictEqual(
            editor.value,
            "ab",
            "subsequent typing should append to palette query",
          );
          assert.strictEqual(
            editor.selectionStart,
            editor.value.length,
            "caret should remain at the end after typing",
          );
          assert.strictEqual(
            editor.selectionEnd,
            editor.value.length,
            "selection should collapse at caret after palette open",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "blank queries show clear option first and Enter/click clear the cell",
      async run(assert) {
        class FakeElement {
          constructor(tag) {
            this.tagName = String(tag || "div").toUpperCase();
            this.children = [];
            this.style = {};
            this.dataset = {};
            this.parentElement = null;
            this.offsetParent = null;
            this.offsetHeight = 0;
            this.scrollHeight = 0;
            this.textContent = "";
            this.id = "";
          }

          appendChild(child) {
            if (!child) return child;
            if (child.isFragment && Array.isArray(child.children)) {
              child.children.forEach((grand) => this.appendChild(grand));
              return child;
            }
            child.parentElement = this;
            child.offsetParent = this;
            this.children.push(child);
            return child;
          }

          contains(target) {
            if (this === target) return true;
            return this.children.some((child) =>
              typeof child.contains === "function" ? child.contains(target) : child === target,
            );
          }

          setAttribute() {}

          removeAttribute() {}

          getBoundingClientRect() {
            return { top: 0, bottom: 400 };
          }
        }

        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const editorListeners = new Map();
        const editorParent = new FakeElement("div");
        const editor = {
          style: { display: "block" },
          value: "",
          selectionStart: 0,
          selectionEnd: 0,
          parentElement: editorParent,
          offsetHeight: 24,
          focus() {},
          addEventListener(type, cb) {
            const arr = editorListeners.get(type) || [];
            arr.push(cb);
            editorListeners.set(type, arr);
          },
          removeEventListener(type, cb) {
            const arr = editorListeners.get(type) || [];
            const idx = arr.indexOf(cb);
            if (idx >= 0) arr.splice(idx, 1);
            editorListeners.set(type, arr);
          },
        };
        editorParent.appendChild(editor);

        const documentStub = {
          activeElement: { tagName: "DIV" },
          querySelector: () => null,
          getElementById: () => null,
          createElement(tag) {
            return new FakeElement(tag);
          },
          createDocumentFragment() {
            return {
              isFragment: true,
              children: [],
              appendChild(child) {
                this.children.push(child);
                return child;
              },
            };
          },
          addEventListener() {},
          removeEventListener() {},
        };

        const sheet = new FakeElement("div");
        sheet.addEventListener = () => {};
        sheet.removeEventListener = () => {};

        const sel = { r: 0, c: 0 };
        const viewColumn = { key: "p0:end" };
        const model = {
          outcomes: [{ id: 7, name: "Win" }],
          actions: [{ id: 1, name: "Close" }],
          modifiers: [],
        };

        let setCellValue = undefined;
        let endEditCalls = 0;

        const palette = initPalette({
          editor,
          sheet,
          getActiveView: () => "interactions",
          viewDef: () => ({ columns: [viewColumn] }),
          sel,
          model,
          setCell: (r, c, v) => {
            setCellValue = v;
          },
          render: () => {},
          getCellRect: () => ({ left: 0, top: 0, width: 120, height: 24 }),
          HEADER_HEIGHT: 24,
          endEdit: () => {
            endEditCalls += 1;
          },
          moveSelectionForTab: () => {},
          moveSelectionForEnter: () => {},
          document: documentStub,
        });

        palette.openForCurrentCell({ r: 0, c: 0, initialText: "", focusEditor: false });

        const paletteRoot = editorParent.children.find((child) => child.id === "universalPalette");
        assert.ok(paletteRoot, "palette root should be attached to editor parent");
        const list = paletteRoot.children[0];
        const firstItem = list?.children?.[0];
        assert.strictEqual(
          firstItem?.children?.[0]?.textContent,
          "Clear value",
          "blank query should prepend clear placeholder label",
        );

        const keyListeners = editorListeners.get("keydown") || [];
        const keydown = keyListeners.find((entry) => typeof entry === "function") ||
          keyListeners.find((entry) => entry && typeof entry.cb === "function")?.cb;
        assert.ok(keydown, "editor keydown listener should be registered");

        const enterEvent = {
          key: "Enter",
          preventDefault() {
            this.prevented = true;
          },
          stopPropagation() {},
          stopImmediatePropagation() {},
          prevented: false,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        };

        keydown(enterEvent);

        assert.strictEqual(setCellValue, null, "Enter should clear the cell value");
        assert.ok(endEditCalls > 0, "clearing via Enter should exit edit mode");

        viewColumn.key = "dualof";
        setCellValue = undefined;
        palette.openForCurrentCell({ r: 0, c: 0, initialText: "", focusEditor: false });

        const outcomeList = editorParent.children.find(
          (child) => child.id === "universalPalette",
        )?.children?.[0];
        const outcomeClear = outcomeList?.children?.[0];
        assert.strictEqual(
          outcomeClear?.children?.[0]?.textContent,
          "Clear value",
          "outcome palette should also prepend clear placeholder label",
        );

        outcomeClear?.onclick?.({ preventDefault() {}, stopPropagation() {} });

        assert.strictEqual(setCellValue, null, "clicking clear option should clear the cell");
        assert.ok(endEditCalls > 1, "clicking clear option should exit edit mode");
      },
    },
    {
      name: "Ctrl+Shift+L toggles comments sidebar",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const navigatorStub = { platform: "Win" };

        const editor = { style: { display: "none" } };

        let toggles = 0;

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection: { rows: new Set(), cols: new Set() },
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {
            toggles += 1;
          },
          toggleTagsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          const bubbleListener = keyListeners.find((entry) => !entry.capture);

          assert.ok(captureListener, "grid keydown listener should exist");
          assert.ok(bubbleListener, "shortcut listener should be registered");

          const captureEvent = {
            key: "L",
            ctrlKey: true,
            shiftKey: true,
            metaKey: false,
            altKey: false,
            preventDefault() {},
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          captureListener.cb(captureEvent);

          const bubbleEvent = {
            key: "L",
            ctrlKey: true,
            shiftKey: true,
            metaKey: false,
            altKey: false,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          bubbleListener.cb(bubbleEvent);

          assert.strictEqual(toggles, 1, "comments toggle should be invoked once");
          assert.strictEqual(
            bubbleEvent.prevented,
            true,
            "shortcut should consume the event",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "Cut handler copies selection and clears cells",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV", isContentEditable: false },
        };

        const navigatorStub = { platform: "Win" };

        const selection = { rows: new Set([0, 1]), cols: new Set([0, 1]), colsAll: false };
        const sel = { r: 0, c: 0 };

        const gridData = [
          ["Name A", "42"],
          ["Name B", "17"],
        ];

        const clipboardStore = {};
        const clipboardTypes = new Set();
        const event = {
          clipboardData: {
            types: clipboardTypes,
            setData(type, value) {
              clipboardStore[type] = value;
              clipboardTypes.add(type);
            },
            getData(type) {
              return clipboardStore[type];
            },
          },
          preventDefault() {
            this.prevented = true;
          },
          stopPropagation() {},
          stopImmediatePropagation() {},
          prevented: false,
        };

        const clearCalls = [];
        const clearCells = (options) => {
          clearCalls.push(options);
          return { cleared: 4, message: null };
        };

        const statusMessages = [];
        const status = {
          set(message) {
            statusMessages.push(message);
          },
        };

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection,
          sel,
          editor: { style: { display: "none" } },
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          moveSelectionForTab: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [{ key: "name" }, { key: "value" }] }),
          getRowCount: () => gridData.length,
          dataArray: () => gridData,
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells,
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: (r, c) => gridData[r][c],
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          getCellCommentClipboardPayload: () => null,
          applyCellCommentClipboardPayload: () => {},
          status,
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => ({ isOpen: () => false }),
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          toggleTagsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const cutListeners = listeners.get("cut") || [];
          const captureListener = cutListeners.find((entry) => entry.capture);
          assert.ok(captureListener, "cut listener should register in capture phase");

          captureListener.cb(event);

          assert.strictEqual(event.prevented, true, "cut handler should prevent default");
          assert.deepStrictEqual(clearCalls, [{ reason: "cut", skipStatus: true }]);

          assert.strictEqual(
            clipboardStore["text/plain"],
            "Name A\t42\nName B\t17",
            "cut should copy plain text grid data",
          );

          const rangePayload = JSON.parse(clipboardStore[MIME_RANGE]);
          assert.strictEqual(rangePayload.cells.length, 2, "cut should encode two rows");
          assert.strictEqual(rangePayload.cells[0].length, 2, "cut should encode two columns");

          assert.deepStrictEqual(
            statusMessages,
            ["Cut 2×2 cells (types: Name, Value)."],
            "status should report cut summary",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "Ctrl+Shift+X toggles tags sidebar",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const navigatorStub = { platform: "Win" };

        const editor = { style: { display: "none" } };

        let toggles = 0;

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection: { rows: new Set(), cols: new Set() },
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          toggleTagsSidebar: () => {
            toggles += 1;
          },
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          const bubbleListener = keyListeners.find((entry) => !entry.capture);

          assert.ok(captureListener, "grid keydown listener should exist");
          assert.ok(bubbleListener, "shortcut listener should be registered");

          const captureEvent = {
            key: "X",
            ctrlKey: true,
            shiftKey: true,
            metaKey: false,
            altKey: false,
            preventDefault() {},
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          captureListener.cb(captureEvent);

          const bubbleEvent = {
            key: "X",
            ctrlKey: true,
            shiftKey: true,
            metaKey: false,
            altKey: false,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          bubbleListener.cb(bubbleEvent);

          assert.strictEqual(toggles, 1, "tags toggle should be invoked once");
          assert.strictEqual(
            bubbleEvent.prevented,
            true,
            "shortcut should consume the event",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "Add row shortcuts trigger the correct actions",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const editor = { style: { display: "none" } };
        const navigatorStub = { platform: "Win" };

        let aboveCalls = 0;
        let belowCalls = 0;

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection: { rows: new Set(), cols: new Set() },
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {
            aboveCalls += 1;
          },
          addRowsBelow: () => {
            belowCalls += 1;
          },
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const bubbleListener = keyListeners.find((entry) => !entry.capture);
          assert.ok(bubbleListener, "shortcut listener should exist");

          const eventAbove = {
            key: "=",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          bubbleListener.cb(eventAbove);

          assert.strictEqual(aboveCalls, 1, "Ctrl+Alt+= should add rows above");
          assert.strictEqual(belowCalls, 0, "Ctrl+Alt+= should not add rows below");
          assert.strictEqual(
            eventAbove.prevented,
            true,
            "Ctrl+Alt+= should consume the event",
          );

          const eventBelow = {
            key: "+",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          bubbleListener.cb(eventBelow);

          assert.strictEqual(aboveCalls, 1, "Ctrl+Alt+Shift+= should not add rows above");
          assert.strictEqual(belowCalls, 1, "Ctrl+Alt+Shift+= should add rows below");
          assert.strictEqual(
            eventBelow.prevented,
            true,
            "Ctrl+Alt+Shift+= should consume the event",
          );
        } finally {
          dispose?.();
        }

        const macListeners = new Map();
        const macWindow = {
          listeners: macListeners,
          addEventListener(type, cb, capture) {
            const arr = macListeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            macListeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = macListeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            macListeners.set(type, arr);
          },
        };

        let macAbove = 0;
        const macNavigator = { platform: "MacIntel" };
        const macDispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection: { rows: new Set(), cols: new Set() },
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [] }),
          getRowCount: () => 0,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {
            macAbove += 1;
          },
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          toggleCommentsSidebar: () => {},
          window: macWindow,
          document: documentStub,
          navigator: macNavigator,
        });

        try {
          const macKeyListeners = macListeners.get("keydown") || [];
          const macBubble = macKeyListeners.find((entry) => !entry.capture);
          assert.ok(macBubble, "Mac shortcut listener should exist");

          const macEvent = {
            key: "=",
            ctrlKey: false,
            metaKey: true,
            shiftKey: false,
            altKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          macBubble.cb(macEvent);

          assert.strictEqual(macAbove, 1, "Cmd+Alt+= should add rows above");
          assert.strictEqual(
            macEvent.prevented,
            true,
            "Cmd+Alt+= should consume the event",
          );
        } finally {
          macDispose?.();
        }
      },
    },
    {
      name: "Ctrl+Shift+Arrow navigates interactions actions",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const navigatorStub = { platform: "Test" };

        const editor = { style: { display: "none" } };
        const selection = { rows: new Set(), cols: new Set() };
        const jumpCalls = [];
        const jumpVariantCalls = [];

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "interactions",
          selection,
          sel: { r: 0, c: 0 },
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel: () => {},
          ensureVisible: () => {},
          viewDef: () => ({ columns: [{ key: "dummy" }] }),
          getRowCount: () => 1,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {},
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: () => "",
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => ({
            isOpen: () => false,
          }),
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: (delta) => {
            jumpCalls.push(delta);
          },
          jumpToInteractionsVariant: (delta) => {
            jumpVariantCalls.push(delta);
          },
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          assert.ok(
            captureListener,
            "grid keydown listener should be registered",
          );

          const downEvent = {
            key: "ArrowDown",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          captureListener.cb(downEvent);

          assert.strictEqual(
            downEvent.prevented,
            true,
            "Ctrl+Shift+ArrowDown should be consumed for interactions navigation",
          );
          assert.deepStrictEqual(
            jumpCalls,
            [1],
            "Ctrl+Shift+ArrowDown should jump to next action",
          );

          const upEvent = {
            key: "ArrowUp",
            ctrlKey: false,
            metaKey: true,
            altKey: false,
            shiftKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          captureListener.cb(upEvent);

          assert.strictEqual(
            upEvent.prevented,
            true,
            "Meta+Shift+ArrowUp should also be consumed",
          );
          assert.deepStrictEqual(
            jumpCalls,
            [1, -1],
            "Meta+Shift+ArrowUp should jump to previous action",
          );

          const downVariantEvent = {
            key: "ArrowDown",
            ctrlKey: true,
            metaKey: false,
            altKey: true,
            shiftKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          captureListener.cb(downVariantEvent);

          assert.strictEqual(
            downVariantEvent.prevented,
            true,
            "Ctrl+Shift+Alt+ArrowDown should be consumed for variant navigation",
          );
          assert.deepStrictEqual(
            jumpVariantCalls,
            [1],
            "Ctrl+Shift+Alt+ArrowDown should jump to next action or variant",
          );

          const upVariantEvent = {
            key: "ArrowUp",
            ctrlKey: false,
            metaKey: true,
            altKey: true,
            shiftKey: true,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };

          captureListener.cb(upVariantEvent);

          assert.strictEqual(
            upVariantEvent.prevented,
            true,
            "Meta+Shift+Alt+ArrowUp should also be consumed",
          );
          assert.deepStrictEqual(
            jumpVariantCalls,
            [1, -1],
            "Meta+Shift+Alt+ArrowUp should jump to previous action or variant",
          );
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "variant navigation can cross actions when moving upward",
      run(assert) {
        class StubElement {
          constructor(tagName = "div") {
            this.tagName = String(tagName).toUpperCase();
            this.children = [];
            this.dataset = {};
            this.attributes = new Map();
            this.className = "";
            this.classList = {
              add() {},
              remove() {},
              contains() {
                return false;
              },
            };
            this.listeners = new Map();
          }
          appendChild(child) {
            if (child && child.isFragment && Array.isArray(child.children)) {
              for (const grand of child.children) {
                this.appendChild(grand);
              }
              return child;
            }
            this.children.push(child);
            return child;
          }
          setAttribute(name, value) {
            this.attributes.set(name, String(value));
          }
          removeAttribute(name) {
            this.attributes.delete(name);
          }
          getAttribute(name) {
            return this.attributes.get(name);
          }
          addEventListener(type, cb) {
            this.listeners.set(type, cb);
          }
          removeEventListener(type) {
            this.listeners.delete(type);
          }
          querySelectorAll(selector) {
            if (selector !== ".sheet-sidebar__button") return [];
            const matches = [];
            const visit = (node) => {
              if (!node) return;
              if (typeof node.className === "string") {
                const parts = node.className.split(/\s+/).filter(Boolean);
                if (parts.includes("sheet-sidebar__button")) matches.push(node);
              }
              if (Array.isArray(node.children)) {
                for (const child of node.children) visit(child);
              }
            };
            for (const child of this.children) visit(child);
            return matches;
          }
          focus() {}
          scrollIntoView() {}
          set textContent(value) {
            this._textContent = value;
          }
          get textContent() {
            return this._textContent || "";
          }
          set innerHTML(value) {
            this._innerHTML = value;
            this.children = [];
          }
          get innerHTML() {
            return this._innerHTML || "";
          }
        }

        class StubFragment {
          constructor() {
            this.children = [];
            this.isFragment = true;
          }
          appendChild(child) {
            this.children.push(child);
            return child;
          }
        }

        const panel = new StubElement("div");
        const listEl = new StubElement("div");
        const emptyEl = new StubElement("div");
        const handle = new StubElement("div");
        const toggleButton = new StubElement("button");
        const closeButton = new StubElement("button");

        panel.querySelector = (selector) => {
          if (selector === '[data-role="list"]') return listEl;
          if (selector === '[data-role="empty"]') return emptyEl;
          return null;
        };
        handle.querySelector = (selector) => {
          if (selector === '[data-action="close"]') return closeButton;
          return null;
        };

        const elementsById = new Map([
          ["interactionsOutline", panel],
          ["interactionsOutlineHandle", handle],
          ["interactionsOutlineToggle", toggleButton],
        ]);

        const hadDocument = Object.prototype.hasOwnProperty.call(global, "document");
        const originalDocument = global.document;
        global.document = {
          getElementById(id) {
            return elementsById.get(id) || null;
          },
          createElement(tag) {
            return new StubElement(tag);
          },
          createDocumentFragment() {
            return new StubFragment();
          },
          activeElement: null,
        };

        const model = {
          interactionsIndex: {
            totalRows: 6,
            groups: [
              {
                actionId: 1,
                rowIndex: 0,
                totalRows: 3,
                variants: [
                  { rowIndex: 0, rowCount: 2, variantSig: "1" },
                  { rowIndex: 2, rowCount: 1, variantSig: "2" },
                ],
              },
              {
                actionId: 2,
                rowIndex: 3,
                totalRows: 3,
                variants: [
                  { rowIndex: 3, rowCount: 1, variantSig: "3" },
                  { rowIndex: 4, rowCount: 2, variantSig: "4" },
                ],
              },
            ],
          },
          actions: [
            { id: 1, name: "Attack 1" },
            { id: 2, name: "Attack 2" },
          ],
          modifiers: [],
        };

        const Selection = { cell: { r: 3, c: 0 } };
        const sel = { r: 3, c: 0 };
        const selectionCalls = [];
        const SelectionCtl = {
          startSingle(row, col) {
            selectionCalls.push({ row, col });
            Selection.cell = { r: row, c: col };
          },
        };

        const outline = createInteractionsOutline({
          model,
          Selection,
          SelectionCtl,
          sel,
          ensureVisible: () => {},
          render: () => {},
          layout: () => {},
          sheet: { focus() {} },
          onSelectionChanged: () => () => {},
        });

        try {
          outline.setActive(true);
          const moved = outline.jumpToVariant(-1);
          assert.strictEqual(moved, true, "jump should succeed");
          assert.strictEqual(sel.r, 2, "selection cursor should move to previous variant row");
          assert.strictEqual(
            Selection.cell.r,
            2,
            "selection state should also reflect previous variant row",
          );
          assert.deepStrictEqual(selectionCalls, [{ row: 2, col: 0 }]);
        } finally {
          if (hadDocument) global.document = originalDocument;
          else delete global.document;
        }
      },
    },
    {
      name: "Shift+Arrow expands and contracts selection box",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const navigatorStub = { platform: "Test" };

        const editor = { style: { display: "none" } };
        const view = {
          columns: Array.from({ length: 6 }, (_, i) => ({ key: `col${i}` })),
        };

        resetSelectionState();
        globalSelection.rows.add(2);
        globalSelection.cols.add(2);
        globalSelection.anchor = 2;
        globalSelection.colAnchor = 2;
        globalSel.r = 2;
        globalSel.c = 2;

        let shiftMode = false;
        const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
        const moveSel = (dr, dc) => {
          const maxC = view.columns.length ? view.columns.length - 1 : 0;
          const nextR = clamp(globalSel.r + dr, 0, 9);
          const nextC = clamp(globalSel.c + dc, 0, maxC);
          if (shiftMode && globalSelectionCtl.extendBoxTo) {
            globalSelectionCtl.extendBoxTo(nextR, nextC);
          } else {
            globalSelectionNS?.setColsAll?.(false);
            globalSelectionCtl.startSingle(nextR, nextC);
          }
          globalSelectionCtl.applyHorizontalMode();
        };

        const rowValues = {
          2: {
            1: "Alpha",
            4: "Omega",
          },
        };

        let cycleInvocations = 0;

        const dispose = initGridKeys({
          isEditing: () => false,
          getActiveView: () => "actions",
          selection: globalSelection,
          sel: globalSel,
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel,
          ensureVisible: () => {},
          viewDef: () => view,
          getRowCount: () => 10,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: () => {
            cycleInvocations += 1;
          },
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: (r, c) => {
            const row = rowValues[r];
            if (!row) return "";
            const value = row[c];
            return value == null ? "" : String(value);
          },
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          assert.ok(captureListener, "grid keydown listener should be registered");

          function dispatch(event) {
            shiftMode = !!event.shiftKey;
            event.preventDefault = event.preventDefault || (() => {});
            event.stopPropagation = event.stopPropagation || (() => {});
            event.stopImmediatePropagation =
              event.stopImmediatePropagation || (() => {});
            captureListener.cb(event);
          }

          dispatch({ key: "ArrowRight", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.cols).sort((a, b) => a - b),
            [2, 3],
            "first shift-right should expand column range",
          );
          assert.strictEqual(globalSel.c, 3, "active column should advance");

          dispatch({ key: "ArrowRight", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.cols).sort((a, b) => a - b),
            [2, 3, 4],
            "second shift-right should keep extending",
          );
          assert.strictEqual(globalSel.c, 4, "active column should continue");

          dispatch({ key: "ArrowLeft", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.cols).sort((a, b) => a - b),
            [2, 3],
            "shift-left should contract horizontal selection",
          );
          assert.strictEqual(globalSel.c, 3, "active column should move left");

          dispatch({ key: "ArrowDown", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.rows).sort((a, b) => a - b),
            [2, 3],
            "shift-down should expand row selection",
          );
          assert.strictEqual(globalSel.r, 3, "active row should advance");

          dispatch({ key: "ArrowDown", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.rows).sort((a, b) => a - b),
            [2, 3, 4],
            "second shift-down should continue expanding",
          );
          assert.strictEqual(globalSel.r, 4, "active row should continue down");

          dispatch({ key: "ArrowUp", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.rows).sort((a, b) => a - b),
            [2, 3],
            "shift-up should contract vertical selection",
          );
          assert.strictEqual(globalSel.r, 3, "active row should move up");

          dispatch({ key: "ArrowUp", shiftKey: true });
          assert.deepStrictEqual(
            Array.from(globalSelection.rows).sort((a, b) => a - b),
            [2],
            "repeated shift-up should collapse back to anchor",
          );
          assert.strictEqual(globalSel.r, 2, "active row should return to anchor");

          shiftMode = false;
          globalSelectionCtl.startSingle(2, 2);
          globalSelectionCtl.applyHorizontalMode();
          cycleInvocations = 0;

          const ctrlRight = {
            key: "ArrowRight",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlRight);
          assert.strictEqual(
            globalSel.c,
            4,
            "Ctrl+Right should jump to the next non-empty cell",
          );
          assert.strictEqual(ctrlRight.prevented, true, "Ctrl+Right should consume the event");
          assert.strictEqual(cycleInvocations, 0, "Ctrl+Arrow should not cycle views");

          const ctrlRightEdge = {
            key: "ArrowRight",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            prevented: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlRightEdge);
          assert.strictEqual(
            globalSel.c,
            5,
            "Ctrl+Right should fall back to the row edge when no more content exists",
          );

          const ctrlLeftToValue = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlLeftToValue);
          assert.strictEqual(
            globalSel.c,
            4,
            "Ctrl+Left should jump back to the previous non-empty cell",
          );

          const ctrlLeftPastContent = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlLeftPastContent);
          assert.strictEqual(
            globalSel.c,
            1,
            "Ctrl+Left should continue past empty cells to earlier content",
          );

          const ctrlLeftEdge = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlLeftEdge);
          assert.strictEqual(
            globalSel.c,
            0,
            "Ctrl+Left should land on the leftmost column when no content remains",
          );

          const ctrlLeftEdgeAgain = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault() {
              this.prevented = true;
            },
            stopPropagation() {},
            stopImmediatePropagation() {},
          };
          dispatch(ctrlLeftEdgeAgain);
          assert.strictEqual(
            globalSel.c,
            0,
            "Ctrl+Left should remain at the boundary when already at the edge",
          );
          assert.strictEqual(
            cycleInvocations,
            0,
            "Ctrl+Arrow navigation should never trigger view changes",
          );
        } finally {
          dispose?.();
          resetSelectionState();
        }
      },
    },
    {
      name: "Ctrl+Shift+Arrow cycles views while Ctrl+Arrow stays within the row",
      run(assert) {
        const listeners = new Map();
        const windowStub = {
          listeners,
          addEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            arr.push({ cb, capture: !!capture });
            listeners.set(type, arr);
          },
          removeEventListener(type, cb, capture) {
            const arr = listeners.get(type) || [];
            const idx = arr.findIndex(
              (entry) => entry.cb === cb && entry.capture === !!capture,
            );
            if (idx >= 0) arr.splice(idx, 1);
            listeners.set(type, arr);
          },
        };

        const documentStub = {
          querySelector: () => null,
          getElementById: () => ({
            getAttribute: () => "false",
            contains: () => false,
          }),
          activeElement: { tagName: "DIV" },
        };

        const navigatorStub = { platform: "Test" };

        const editor = { style: { display: "none" } };
        const view = {
          columns: Array.from({ length: 5 }, (_, i) => ({ key: `col${i}` })),
        };

        let editing = false;

        resetSelectionState();
        globalSelection.rows.add(0);
        globalSelection.cols.add(1);
        globalSelection.anchor = 0;
        globalSelection.colAnchor = 1;
        globalSel.r = 0;
        globalSel.c = 1;

        let shiftMode = false;
        const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
        const moveSel = (dr, dc) => {
          const maxC = view.columns.length ? view.columns.length - 1 : 0;
          const nextR = clamp(globalSel.r + dr, 0, 9);
          const nextC = clamp(globalSel.c + dc, 0, maxC);
          if (shiftMode && globalSelectionCtl.extendBoxTo) {
            globalSelectionCtl.extendBoxTo(nextR, nextC);
          } else {
            globalSelectionNS?.setColsAll?.(false);
            globalSelectionCtl.startSingle(nextR, nextC);
          }
          globalSelectionCtl.applyHorizontalMode();
        };

        const rowValues = {
          0: {
            2: "Filled",
          },
        };

        const cycleEvents = [];

        const dispose = initGridKeys({
          isEditing: () => editing,
          getActiveView: () => "actions",
          selection: globalSelection,
          sel: globalSel,
          editor,
          clearSelection: () => {},
          render: () => {},
          beginEdit: () => {},
          endEdit: () => {},
          moveSel,
          ensureVisible: () => {},
          viewDef: () => view,
          getRowCount: () => 10,
          dataArray: () => [],
          isModColumn: () => false,
          modIdFromKey: () => null,
          setModForSelection: () => {},
          setCell: () => {},
          runModelTransaction: () => {},
          makeUndoConfig: () => ({}),
          cycleView: (delta) => {
            cycleEvents.push(delta);
          },
          saveToDisk: () => {},
          openFromDisk: () => {},
          newProject: () => {},
          doGenerate: () => {},
          runSelfTests: () => {},
          deleteRows: () => {},
          clearCells: () => {},
          addRowsAbove: () => {},
          addRowsBelow: () => {},
          model: {},
          getCellText: (r, c) => {
            const row = rowValues[r];
            if (!row) return "";
            const value = row[c];
            return value == null ? "" : String(value);
          },
          getStructuredCell: () => null,
          applyStructuredCell: () => {},
          status: { set() {} },
          undo: () => {},
          redo: () => {},
          getPaletteAPI: () => null,
          toggleInteractionsOutline: () => {},
          jumpToInteractionsAction: () => {},
          jumpToInteractionsVariant: () => {},
          window: windowStub,
          document: documentStub,
          navigator: navigatorStub,
        });

        try {
          const keyListeners = listeners.get("keydown") || [];
          const captureListener = keyListeners.find((entry) => entry.capture);
          const bubbleListener = keyListeners.find((entry) => !entry.capture);
          assert.ok(captureListener, "grid keydown listener should exist");
          assert.ok(bubbleListener, "shortcut listener should exist");

          function dispatchCapture(event) {
            shiftMode = !!event.shiftKey;
            event.preventDefault =
              event.preventDefault ||
              function () {
                this.prevented = true;
              };
            event.stopPropagation = event.stopPropagation || (() => {});
            event.stopImmediatePropagation =
              event.stopImmediatePropagation || (() => {});
            captureListener.cb(event);
          }

          function dispatchBubble(event) {
            event.preventDefault =
              event.preventDefault ||
              function () {
                this.prevented = true;
              };
            event.stopPropagation = event.stopPropagation || (() => {});
            event.stopImmediatePropagation =
              event.stopImmediatePropagation || (() => {});
            bubbleListener.cb(event);
          }

          const ctrlRight = {
            key: "ArrowRight",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            prevented: false,
          };
          dispatchCapture(ctrlRight);
          assert.strictEqual(
            globalSel.c,
            2,
            "Ctrl+ArrowRight should reach the next populated cell",
          );
          assert.strictEqual(
            cycleEvents.length,
            0,
            "Ctrl+Arrow without Shift should not request a view change",
          );
          dispatchBubble(ctrlRight);
          assert.strictEqual(
            cycleEvents.length,
            0,
            "Ctrl+Arrow without Shift should be ignored by shortcuts",
          );

          editing = false;
          editor.style.display = "none";

          const ctrlShiftRight = {
            key: "ArrowRight",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
            prevented: false,
          };
          dispatchCapture(ctrlShiftRight);
          assert.strictEqual(
            ctrlShiftRight.prevented || false,
            false,
            "Capture handler should allow Ctrl+Shift+Arrow to bubble",
          );
          const prevColumn = globalSel.c;
          dispatchBubble(ctrlShiftRight);
          assert.deepStrictEqual(
            cycleEvents,
            [1],
            "Ctrl+Shift+ArrowRight should cycle forward",
          );
          assert.strictEqual(
            ctrlShiftRight.prevented,
            true,
            "Shortcut handler should consume Ctrl+Shift navigation",
          );
          assert.strictEqual(
            globalSel.c,
            prevColumn,
            "Ctrl+Shift+Arrow should not move the selection",
          );

          const ctrlShiftLeft = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
            prevented: false,
          };
          dispatchCapture(ctrlShiftLeft);
          dispatchBubble(ctrlShiftLeft);
          assert.deepStrictEqual(
            cycleEvents,
            [1, -1],
            "Ctrl+Shift+ArrowLeft should cycle backwards",
          );
          assert.strictEqual(
            ctrlShiftLeft.prevented,
            true,
            "Ctrl+Shift+ArrowLeft should also be consumed",
          );
          assert.strictEqual(
            globalSel.c,
            prevColumn,
            "Ctrl+Shift+ArrowLeft should leave the selection in place",
          );

          cycleEvents.length = 0;
          editor.style.display = "block";
          const ctrlShiftRightVisible = {
            key: "ArrowRight",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
            prevented: false,
          };
          dispatchCapture(ctrlShiftRightVisible);
          dispatchBubble(ctrlShiftRightVisible);
          assert.deepStrictEqual(
            cycleEvents,
            [1],
            "Ctrl+Shift+Arrow should cycle even if the editor is merely visible",
          );
          assert.strictEqual(
            ctrlShiftRightVisible.prevented,
            true,
            "Visible editor without editing should still allow cycling",
          );

          editing = true;
          cycleEvents.length = 0;
          const ctrlShiftLeftWhileEditing = {
            key: "ArrowLeft",
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            altKey: false,
            prevented: false,
          };
          dispatchCapture(ctrlShiftLeftWhileEditing);
          dispatchBubble(ctrlShiftLeftWhileEditing);
          assert.deepStrictEqual(
            cycleEvents,
            [],
            "Ctrl+Shift+Arrow should not cycle while an edit session is active",
          );
          assert.strictEqual(
            ctrlShiftLeftWhileEditing.prevented,
            true,
            "Editing guard should consume the shortcut without cycling",
          );
          editing = false;
        } finally {
          dispose?.();
          resetSelectionState();
        }
      },
    },
  ];
}
