import { computeDestinationIndices, initGridKeys } from "../../../ui/grid-keys.js";
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
        } finally {
          dispose?.();
          resetSelectionState();
        }
      },
    },
  ];
}
