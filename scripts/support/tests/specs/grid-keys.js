import { computeDestinationIndices, initGridKeys } from "../../../ui/grid-keys.js";

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
        } finally {
          dispose?.();
        }
      },
    },
  ];
}
